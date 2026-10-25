"""The weekly report (spec §6.12 "weekly check-in", §6.15 "weekly report"): how the learner's
last week went against its plan, in numbers, and in a few sentences from their partner that
they can read or listen to.

The numbers are counted from what the learner did, like everything on Progress. The sentences
are written once, by the small text model, in the worker, when the learner first opens the app
in the new week: there is no nightly job. The model is given the numbers and the names of the
topics, never the learner's words.
"""

import datetime as dt
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.cards import CardService
from konvami_api.domain.conversations import ConversationService, DayActivity
from konvami_api.domain.costs import Allowance, Charge, Feature
from konvami_api.domain.director import DirectorService, habit_of, week_target
from konvami_api.domain.grammar_map import GrammarMapService, Mastery
from konvami_api.domain.host import GUIDE_NAME
from konvami_api.domain.levels import LevelPoint, LevelService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import ReportService
from konvami_api.domain.sounds import Sounds
from konvami_api.domain.speech import SpeechError
from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_object

# A report that keeps failing can be asked for this many times in all (each is a paid request).
MAX_REQUESTS = 3
# A report pending for longer than this was lost with its worker and may be asked for again.
STALE_AFTER = dt.timedelta(minutes=5)
# A few spoken sentences: about half a minute.
TEXT_MAX = 700
# Who speaks for a learner who has no partner: the guide, in their voice.
DEFAULT_PARTNER = GUIDE_NAME
DEFAULT_VOICE = "marin"

Status = Literal["none", "pending", "ready", "failed"]

_WEEK = dt.timedelta(days=7)
_STATES = tuple(Mastery)


@dataclass(frozen=True)
class TopicMove:
    """One of the week's topics, as it stood when the week began and when it ended."""

    topic: str
    before: Mastery
    after: Mastery

    @property
    def moved(self) -> bool:
        return _STATES.index(self.after) > _STATES.index(self.before)


@dataclass(frozen=True)
class WeekNumbers:
    # The week's Monday, on the learner's calendar.
    week: dt.date
    minutes: int
    planned_minutes: int
    previous_minutes: int
    days: int
    planned_days: int
    # Conversations, and of them the role-plays and review conversations.
    conversations: int
    role_plays: int
    reviews: int
    cards_reviewed: int
    topics: tuple[TopicMove, ...]
    # Confirmed mistakes in the week's reports, and in the week before's.
    mistakes: int
    previous_mistakes: int
    # The level when the week began and when it ended; None before there was one.
    level_before: str | None
    level_after: str | None

    def document(self) -> dict[str, Any]:
        return {
            "week": self.week.isoformat(),
            "minutes": self.minutes,
            "planned_minutes": self.planned_minutes,
            "previous_minutes": self.previous_minutes,
            "days": self.days,
            "planned_days": self.planned_days,
            "conversations": self.conversations,
            "role_plays": self.role_plays,
            "reviews": self.reviews,
            "cards_reviewed": self.cards_reviewed,
            "topics": [
                {"topic": move.topic, "before": move.before.value, "after": move.after.value}
                for move in self.topics
            ],
            "mistakes": self.mistakes,
            "previous_mistakes": self.previous_mistakes,
            "level_before": self.level_before,
            "level_after": self.level_after,
        }

    @classmethod
    def from_document(cls, document: dict[str, Any]) -> "WeekNumbers":
        return cls(
            **{
                **document,
                "week": dt.date.fromisoformat(document["week"]),
                "topics": tuple(
                    TopicMove(move["topic"], Mastery(move["before"]), Mastery(move["after"]))
                    for move in document["topics"]
                ),
            }
        )


@dataclass(frozen=True)
class StoredReview:
    status: Status
    # The numbers the text was written from.
    numbers: WeekNumbers
    text: str | None
    requested_at: dt.datetime
    # The partner who speaks it: the one the learner talked to last.
    partner: str
    voice: str


@dataclass(frozen=True)
class WeekReview:
    numbers: WeekNumbers
    status: Status
    text: str | None


class WeekReviewError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class WeekReviewRepository(Protocol):
    def request(
        self,
        user_id: UUID,
        language: str,
        review: StoredReview,
        *,
        stale_before: dt.datetime,
        max_requests: int,
    ) -> bool:
        """Stores a review as pending and says whether this caller is to start its writing: when
        the week has none yet, when its writing failed, or when it has been pending since before
        `stale_before`; never more than `max_requests` times for one week. One step: of
        several callers at once, one is told True."""

    def written(
        self, user_id: UUID, language: str, week: dt.date, status: Status, text: str | None
    ) -> None: ...

    def load(self, user_id: UUID, language: str, week: dt.date) -> StoredReview | None: ...


class WeekReviewStarter(Protocol):
    def start(self, user_id: UUID, week: dt.date) -> None:
        """Has the review of the learner's `week` written, in the background."""


class _Written(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=TEXT_MAX)


_SCHEMA = answer_object({"text": {"type": "string"}})


def _instructions(partner: str, target: str, explanation: str) -> str:
    return f"""You are {partner}, the learner's {target} conversation partner. Write their weekly
check-in: what you would say to them about last week, three to five short sentences in
{explanation}, spoken aloud, to the learner as "you".

The content is last week's numbers. Use only them and never invent any: say how long they
spoke, against the week's plan and the week before; name one thing that went well (a topic that
moved on, fewer mistakes, cards reviewed, a level reached); name one thing to keep at. A quiet
week is fine: say so kindly and never make them feel guilty. Last, ask whether this week's plan
suits them, and say they can change their weekly goal in their profile.
Plain sentences only: no lists, headings or emoji. Grammar topics go by the names given."""


def _monday(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


def _utc(day: dt.date) -> dt.datetime:
    return dt.datetime(day.year, day.month, day.day, tzinfo=dt.UTC)


def _minutes(days: Sequence[DayActivity], monday: dt.date) -> tuple[int, int]:
    """The minutes and the days practised in the week from `monday`."""
    week = [day for day in days if monday <= day.day < monday + _WEEK]
    return sum(day.seconds for day in week) // 60, len(week)


class WeekReviewService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        accounts: AccountDirectory,
        personas: PersonaService,
        conversations: ConversationService,
        reports: ReportService,
        cards: CardService,
        grammar: GrammarMapService,
        levels: LevelService,
        director: DirectorService,
        allowance: Callable[[UUID], Allowance],
        repository: WeekReviewRepository,
        starter: WeekReviewStarter,
        text_model: TextModel,
        model: str,
        sounds: Sounds,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._accounts = accounts
        self._personas = personas
        self._conversations = conversations
        self._reports = reports
        self._cards = cards
        self._grammar = grammar
        self._levels = levels
        self._director = director
        self._allowance = allowance
        self._repository = repository
        self._starter = starter
        self._text_model = text_model
        # An empty name: no reviews are written.
        self._model = model
        self._sounds = sounds
        self._clock = clock

    def last_week(self, user_id: UUID, timezone: str | None) -> WeekReview | None:
        """Last week's review: as it was asked for, or else its numbers now. None when the
        learner did not practise last week."""
        language, week, numbers = self._last_week(user_id, timezone)
        stored = self._repository.load(user_id, language, week)
        if stored is not None:
            return WeekReview(stored.numbers, stored.status, stored.text)
        if numbers is None:
            return None
        return WeekReview(numbers, "none", None)

    def request(self, user_id: UUID, timezone: str | None, week: dt.date) -> WeekReview:
        """Has last week's review written, once. Raises `WeekReviewError` (`not_found` for
        another week, `nothing_to_report`, `consent_required`, `unavailable`)."""
        language, last, numbers = self._last_week(user_id, timezone)
        if week != last:
            raise WeekReviewError("not_found")
        stored = self._repository.load(user_id, language, week)
        if stored is not None and stored.status == "ready":
            return WeekReview(stored.numbers, stored.status, stored.text)
        if numbers is None:
            raise WeekReviewError("nothing_to_report")
        if not self._model:
            raise WeekReviewError("unavailable")
        # The numbers go to the text model's provider, which the learner must have agreed to.
        try:
            consented = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            consented = False
        if not consented:
            raise WeekReviewError("consent_required")
        now = self._clock()
        partner, voice = self._speaker(user_id)
        asked = StoredReview("pending", numbers, None, now, partner, voice)
        if self._repository.request(
            user_id, language, asked, stale_before=now - STALE_AFTER, max_requests=MAX_REQUESTS
        ):
            self._starter.start(user_id, week)
        current = self._repository.load(user_id, language, week) or asked
        return WeekReview(current.numbers, current.status, current.text)

    def write(self, user_id: UUID, week: dt.date) -> None:
        """Writes a pending review (the worker's job)."""
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        stored = self._repository.load(user_id, language, week)
        if stored is None or stored.status != "pending":
            return
        catalog = self._profiles.catalog
        explanation = profile.value(language, "explanation_language") or "en"
        pack = catalog.available_pack(language)
        titles = {topic.id: topic.title for topic in pack.grammar_map} if pack else {}
        content = stored.numbers.document()
        for move in content["topics"]:
            move["topic"] = titles.get(move["topic"], move["topic"])
        task = TextTask(
            model=self._model,
            instructions=_instructions(
                stored.partner,
                catalog.english_name(language),
                catalog.english_name(explanation),
            ),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="weekly_check_in",
            answer_schema=_SCHEMA,
            charge=Charge(user_id, Feature.WEEK_REVIEW),
        )
        try:
            written = _Written.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            self._repository.written(user_id, language, week, "failed", None)
            return
        self._repository.written(user_id, language, week, "ready", " ".join(written.text.split()))

    def audio(self, user_id: UUID, week: dt.date) -> str:
        """A short-lived address of the review spoken by the partner who wrote it, made the
        first time. Raises `WeekReviewError` (`not_found` until it is written, `unavailable`)."""
        language = self._profiles.get(user_id).target_language or ""
        stored = self._repository.load(user_id, language, week)
        if stored is None or stored.text is None:
            raise WeekReviewError("not_found")
        if not self._sounds.available:
            raise WeekReviewError("unavailable")
        try:
            return self._sounds.address(
                f"users/{user_id}/weeks/{language}-{week.isoformat()}-",
                stored.voice,
                stored.text,
                Charge(user_id, Feature.WEEK_AUDIO),
            )
        except SpeechError as error:
            raise WeekReviewError("unavailable") from error

    def _speaker(self, user_id: UUID) -> tuple[str, str]:
        """The name and voice of the partner the learner talked to last, or of their first."""
        partners = self._personas.partners(user_id)
        history = self._conversations.partner_history(user_id)
        met = [(history[p.id].last_at, p) for p in partners if p.id in history]
        if met:
            partner = max(met, key=lambda seen: seen[0])[1]
        elif partners:
            partner = partners[0]
        else:
            return DEFAULT_PARTNER, DEFAULT_VOICE
        return partner.name, partner.voice

    def _last_week(
        self, user_id: UUID, timezone: str | None
    ) -> tuple[str, dt.date, WeekNumbers | None]:
        now = self._clock()
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        days = self._conversations.days(user_id, timezone, now)
        this_monday = _monday(days.today)
        week = this_monday - _WEEK
        minutes, practised = _minutes(days.days, week)
        # Cards are reviewed at a moment: their week is counted in UTC, as voice minutes are.
        reviewed = self._cards.reviews_since(user_id, _utc(week)) - self._cards.reviews_since(
            user_id, _utc(this_monday)
        )
        if minutes == 0 and reviewed == 0:
            return language, week, None
        held = self._conversations.week(user_id, timezone, week)
        target = week_target(
            habit_of(profile, language),
            self._allowance(user_id).weekly_seconds,
            week,
            self._director.started(user_id),
        )
        found = self._reports.mistakes_by_week(user_id, timezone, week - _WEEK)
        mistakes = {
            monday: sum(item.count for item in found if item.week == monday)
            for monday in (week - _WEEK, week)
        }
        before = {s.topic.id: s.mastery.state for s in self._grammar.states(user_id, _utc(week))}
        after = {
            s.topic.id: s.mastery.state for s in self._grammar.states(user_id, _utc(this_monday))
        }
        history = self._levels.history(user_id, language)
        return (
            language,
            week,
            WeekNumbers(
                week=week,
                minutes=minutes,
                planned_minutes=target.minutes,
                previous_minutes=_minutes(days.days, week - _WEEK)[0],
                days=practised,
                planned_days=target.days,
                conversations=len(held),
                role_plays=sum(1 for c in held if c.scenario),
                reviews=sum(1 for c in held if c.review and not c.scenario),
                cards_reviewed=reviewed,
                topics=tuple(
                    TopicMove(topic, before[topic], after[topic])
                    for topic in self._director.topics(user_id, week)
                    if topic in before and topic in after
                ),
                mistakes=mistakes[week],
                previous_mistakes=mistakes[week - _WEEK],
                level_before=_level_at(history, _utc(week)),
                level_after=_level_at(history, _utc(this_monday)),
            ),
        )


def _level_at(history: Sequence[LevelPoint], moment: dt.datetime) -> str | None:
    """The level at `moment`: the last one set before it."""
    level: str | None = None
    for point in history:
        if point.at < moment:
            level = point.level
    return level
