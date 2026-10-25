"""In-memory stand-ins for the persistence layer, checked against the same contract tests as SQL."""

from collections.abc import Sequence
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import DELETION_MEMORY, Account, AccountNotFound
from konvami_api.domain.cards import Card, CardTotals, WordDetails
from konvami_api.domain.conversations import (
    ActivityDays,
    Conversation,
    DayActivity,
    PartnerHistory,
    zone_of,
)
from konvami_api.domain.costs import (
    ChargeRecord,
    DaySpend,
    LearnerSpend,
    Level,
    Share,
    Spending,
)
from konvami_api.domain.exam_centre import Simulation, SimulationResult
from konvami_api.domain.exam_centre import Status as ExamStatus
from konvami_api.domain.levels import LevelFit, LevelStep
from konvami_api.domain.live_call import Turn
from konvami_api.domain.memories import Memory
from konvami_api.domain.onboarding import OnboardingState
from konvami_api.domain.personas import Persona
from konvami_api.domain.placement import PlacementResult
from konvami_api.domain.profile import ChangeRecord, FieldValue, Profile
from konvami_api.domain.reports import (
    Report,
    ReportEntry,
    ReportTotals,
    Status,
    StoredReport,
    WeekMistakes,
)
from konvami_api.domain.speech import SpeechTask, TranscriptionTask
from konvami_api.domain.storage import StoredFile, UploadForm
from konvami_api.domain.text import TextTask
from konvami_api.domain.tutor import TutorQuestion
from konvami_api.domain.voice import (
    CallPurpose,
    CreatedCall,
    FinishedCall,
    VoiceProviderError,
    VoiceSession,
)
from konvami_api.domain.week_review import Status as WeekStatus
from konvami_api.domain.week_review import StoredReview


class FixedClock:
    """A clock that tests move by hand."""

    def __init__(self, now: datetime = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class InMemoryProfileRepository:
    def __init__(self) -> None:
        self._fields: dict[UUID, dict[tuple[str, str], FieldValue]] = {}
        self._history: dict[UUID, list[ChangeRecord]] = {}

    def load(self, user_id: UUID) -> Profile:
        return Profile(dict(self._fields.get(user_id, {})))

    def save(self, user_id: UUID, changes: Sequence[ChangeRecord]) -> None:
        fields = self._fields.setdefault(user_id, {})
        for change in changes:
            fields[(change.scope, change.field)] = FieldValue(
                value=change.new_value,
                source=change.source,
                # PostgreSQL hands every time back in UTC.
                updated_at=change.changed_at.astimezone(UTC),
            )
        self._history.setdefault(user_id, []).extend(changes)

    def history(self, user_id: UUID) -> list[ChangeRecord]:
        return list(self._history.get(user_id, []))

    def changes(self, user_id: UUID, scope: str, field: str) -> list[ChangeRecord]:
        return [
            replace(change, changed_at=change.changed_at.astimezone(UTC))
            for change in self._history.get(user_id, [])
            if (change.scope, change.field) == (scope, field)
        ]


class InMemoryOnboardingRepository:
    def __init__(self) -> None:
        self._states: dict[UUID, OnboardingState] = {}

    def load(self, user_id: UUID) -> OnboardingState:
        return self._states.get(user_id, OnboardingState())

    def save(self, user_id: UUID, state: OnboardingState) -> None:
        self._states[user_id] = state


class InMemoryVoiceSessionRepository:
    def __init__(self) -> None:
        self.sessions: dict[str, VoiceSession] = {}
        self.finished: dict[str, FinishedCall] = {}
        self.goals: dict[str, tuple[str, ...]] = {}
        # The voice seconds used per learner and week.
        self.weeks: dict[tuple[UUID, date], int] = {}

    def started(self, session: VoiceSession) -> None:
        self.sessions[session.call_id] = session

    def get(self, call_id: str) -> VoiceSession | None:
        return self.sessions.get(call_id)

    def reserve_seconds(self, user_id: UUID, week: date, weekly: int, least: int, most: int) -> int:
        left = weekly - self.weeks.get((user_id, week), 0)
        if left < least:
            return 0
        granted = min(most, left)
        self.weeks[(user_id, week)] = self.weeks.get((user_id, week), 0) + granted
        return granted

    def release_seconds(self, user_id: UUID, week: date, seconds: int) -> None:
        if (user_id, week) in self.weeks:
            self.weeks[(user_id, week)] = max(0, self.weeks[(user_id, week)] - seconds)

    def seconds_used(self, user_id: UUID, week: date) -> int:
        return self.weeks.get((user_id, week), 0)

    def finish(self, call_id: str, result: FinishedCall) -> bool:
        if call_id not in self.sessions or call_id in self.finished:
            return False
        self.finished[call_id] = result
        return True

    def goals_reached(self, call_id: str, goals: tuple[str, ...]) -> None:
        if call_id in self.sessions:
            self.goals[call_id] = goals


class FakeAccountDirectory:
    def __init__(self, accounts: dict[UUID, Account] | None = None) -> None:
        self.accounts = accounts or {}
        # True: deleting fails and changes nothing. "after": the account is deleted, but the
        # answer is lost on the way, so the caller sees a failure all the same.
        self.fail_delete: bool | str = False
        self.fail_get = False

    def get(self, user_id: UUID) -> Account:
        if self.fail_get:
            raise RuntimeError("the identity provider did not answer")
        if user_id not in self.accounts:
            raise AccountNotFound
        return self.accounts[user_id]

    def delete(self, user_id: UUID) -> None:
        if self.fail_delete == "after":
            self.accounts.pop(user_id, None)
        if self.fail_delete:
            raise RuntimeError("the identity provider did not answer")
        self.accounts.pop(user_id, None)


class InMemoryAccountRepository:
    def __init__(self) -> None:
        self.pictures: dict[UUID, str] = {}
        self.deleted: list[UUID] = []
        self.deleted_at: dict[UUID, datetime] = {}
        self.fail_delete = False

    def picture_key(self, user_id: UUID) -> str | None:
        return self.pictures.get(user_id)

    def set_picture_key(self, user_id: UUID, key: str | None) -> None:
        if key is None:
            self.pictures.pop(user_id, None)
        else:
            self.pictures[user_id] = key

    def delete(self, user_id: UUID, at: datetime) -> None:
        if self.fail_delete:
            raise RuntimeError("the database did not answer")
        self.pictures.pop(user_id, None)
        self.deleted.append(user_id)
        self.deleted_at = {
            user: moment
            for user, moment in self.deleted_at.items()
            if moment >= at - DELETION_MEMORY
        }
        self.deleted_at[user_id] = at

    def is_deleted(self, user_id: UUID) -> bool:
        return user_id in self.deleted_at

    def restore(self, user_id: UUID) -> None:
        self.deleted_at.pop(user_id, None)


class InMemoryFileStore:
    """Files in a dict. `save` also stands in for the app sending a file with an upload form."""

    def __init__(self) -> None:
        self.files: dict[str, tuple[bytes, str]] = {}
        # Every upload form handed out, as the arguments it was asked with.
        self.forms: list[dict[str, Any]] = []

    def keys(self) -> list[str]:
        return sorted(self.files)

    def upload_form(
        self, key: str, *, content_type: str, max_bytes: int, expires_seconds: int
    ) -> UploadForm:
        self.forms.append(
            {
                "key": key,
                "content_type": content_type,
                "max_bytes": max_bytes,
                "expires_seconds": expires_seconds,
            }
        )
        return UploadForm("https://files.test/", {"key": key, "Content-Type": content_type})

    def stat(self, key: str) -> StoredFile | None:
        stored = self.files.get(key)
        return StoredFile(size=len(stored[0]), content_type=stored[1]) if stored else None

    def read_start(self, key: str, count: int) -> bytes:
        return self.files[key][0][:count]

    def read(self, key: str) -> bytes:
        return self.files[key][0]

    def save(self, key: str, body: bytes, content_type: str) -> None:
        self.files[key] = (body, content_type)

    def move(self, source: str, destination: str) -> None:
        self.files[destination] = self.files.pop(source)

    def address(self, key: str, expires_seconds: int) -> str:
        return f"https://files.test/{key}?expires={expires_seconds}"

    def remove(self, key: str) -> None:
        self.files.pop(key, None)

    def remove_all(self, prefix: str) -> None:
        for key in [key for key in self.files if key.startswith(prefix)]:
            del self.files[key]


class FakeVoiceProvider:
    """Answers call creation like the provider does and records what it was asked."""

    name = "openai"

    def __init__(self) -> None:
        self.created: list[tuple[str, dict[str, Any], str]] = []
        self.hung_up: list[str] = []
        self.fail = False

    def create_call(
        self, sdp_offer: str, session: dict[str, Any], safety_identifier: str
    ) -> CreatedCall:
        if self.fail:
            raise VoiceProviderError
        self.created.append((sdp_offer, session, safety_identifier))
        return CreatedCall(call_id=f"rtc_{len(self.created)}", sdp_answer="v=0 answer")

    def hang_up(self, call_id: str) -> None:
        self.hung_up.append(call_id)


class RecordingCallStarter:
    def __init__(self) -> None:
        self.started: list[tuple[str, UUID, str]] = []
        self.fail = False

    def start(self, call_id: str, user_id: UUID, purpose: CallPurpose) -> None:
        if self.fail:
            raise RuntimeError("could not start the worker")
        self.started.append((call_id, user_id, purpose.value))


class InMemoryPlacementRepository:
    def __init__(self) -> None:
        self.results: dict[tuple[UUID, str], PlacementResult] = {}

    def save(self, user_id: UUID, language: str, result: PlacementResult) -> None:
        self.results[(user_id, language)] = result

    def load(self, user_id: UUID, language: str) -> PlacementResult | None:
        return self.results.get((user_id, language))


class ScriptedTextModel:
    """Answers each task from a queue (a dict, or an error to raise) and records the tasks."""

    def __init__(self, *answers: dict[str, Any] | Exception) -> None:
        self.answers = list(answers)
        self.tasks: list[TextTask] = []

    def answer(self, task: TextTask) -> dict[str, Any]:
        self.tasks.append(task)
        if not self.answers:
            raise AssertionError("the text model was asked more often than the test expected")
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


class InMemoryPersonaRepository:
    def __init__(self) -> None:
        self.personas: dict[UUID, tuple[UUID, str, Persona]] = {}

    def add(self, user_id: UUID, language: str, personas: Sequence[Persona]) -> None:
        for persona in personas:
            self.personas[persona.id] = (user_id, language, persona)

    def for_learner(self, user_id: UUID, language: str) -> list[Persona]:
        return [
            persona
            for owner, spoken, persona in self.personas.values()
            if owner == user_id and spoken == language
        ]

    def update(self, user_id: UUID, persona: Persona) -> bool:
        stored = self.personas.get(persona.id)
        if stored is None or stored[0] != user_id:
            return False
        self.personas[persona.id] = (user_id, stored[1], persona)
        return True

    def remove(self, user_id: UUID, persona_id: UUID) -> bool:
        stored = self.personas.get(persona_id)
        if stored is None or stored[0] != user_id:
            return False
        del self.personas[persona_id]
        return True


class InMemoryConversationRepository:
    """Reads the calls of an `InMemoryVoiceSessionRepository`, as the SQL one reads the tables."""

    def __init__(self, calls: InMemoryVoiceSessionRepository) -> None:
        self._calls = calls

    def _practice(self, user_id: UUID) -> list[Conversation]:
        conversations = []
        for session in self._calls.sessions.values():
            if session.user_id != user_id or session.purpose is not CallPurpose.PRACTICE:
                continue
            finished = self._calls.finished.get(session.call_id)
            conversations.append(
                Conversation(
                    id=session.call_id,
                    persona_id=session.persona_id,
                    started_at=session.started_at,
                    ended_at=finished.ended_at if finished else None,
                    seconds=int((finished.ended_at - session.started_at).total_seconds())
                    if finished
                    else 0,
                    learner_turns=sum(1 for turn in finished.turns if turn.speaker == "learner")
                    if finished
                    else 0,
                    scenario=session.scenario,
                    goals_reached=self._calls.goals.get(session.call_id, ()),
                    review=session.plan.review if session.plan else False,
                )
            )
        return sorted(conversations, key=lambda c: c.started_at, reverse=True)

    def _counted(self, user_id: UUID) -> list[Conversation]:
        return [c for c in self._practice(user_id) if c.counts]

    def listed(self, user_id: UUID, limit: int, before: datetime | None) -> list[Conversation]:
        counted = self._counted(user_id)
        return [c for c in counted if before is None or c.started_at < before][:limit]

    def get(self, user_id: UUID, call_id: str) -> Conversation | None:
        return next((c for c in self._practice(user_id) if c.id == call_id), None)

    def turns(self, call_id: str) -> list[Turn]:
        finished = self._calls.finished.get(call_id)
        return list(finished.turns) if finished else []

    def partner_history(self, user_id: UUID) -> dict[UUID, PartnerHistory]:
        history: dict[UUID, PartnerHistory] = {}
        # Newest first, so the first one seen per partner is the last time they talked.
        for conversation in self._counted(user_id):
            if conversation.persona_id is None:
                continue
            known = history.get(conversation.persona_id)
            history[conversation.persona_id] = PartnerHistory(
                conversations=(known.conversations if known else 0) + 1,
                last_at=known.last_at if known else conversation.started_at,
            )
        return history

    def longest(self, user_id: UUID) -> int:
        return max((c.seconds for c in self._counted(user_id)), default=0)

    def week(self, user_id: UUID, timezone: str | None, monday: date) -> list[Conversation]:
        zone = zone_of(timezone)
        return [
            c
            for c in self._counted(user_id)
            if 0 <= (c.started_at.astimezone(zone).date() - monday).days < 7
        ]

    def days(self, user_id: UUID, timezone: str | None, now: datetime) -> ActivityDays:
        zone = zone_of(timezone)
        days: dict[Any, DayActivity] = {}
        for conversation in self._counted(user_id):
            day = conversation.started_at.astimezone(zone).date()
            known = days.get(day, DayActivity(day, 0, 0))
            days[day] = DayActivity(
                day, known.seconds + conversation.seconds, known.conversations + 1
            )
        newest_first = sorted(days.values(), key=lambda d: d.day, reverse=True)
        return ActivityDays(now.astimezone(zone).date(), tuple(newest_first))


class InMemoryDraftLog:
    def __init__(self) -> None:
        self.drafts: dict[tuple[UUID, date], int] = {}

    def reserve(self, user_id: UUID, day: date, limit: int) -> bool:
        used = self.drafts.get((user_id, day), 0)
        if used >= limit:
            return False
        self.drafts[(user_id, day)] = used + 1
        return True


class FakeSpeechModel:
    """Answers with bytes that name the voice, and records what it was asked to say."""

    def __init__(self) -> None:
        self.tasks: list[SpeechTask] = []
        self.fail: Exception | None = None

    def speak(self, task: SpeechTask) -> bytes:
        if self.fail:
            raise self.fail
        self.tasks.append(task)
        return f"mp3:{task.voice}".encode()


class FakeTranscriber:
    """Answers with the text set for an audio file's key (by the bytes stored under it), and
    records what it was asked."""

    def __init__(self, files: "InMemoryFileStore") -> None:
        self._files = files
        self.answers: dict[str, str] = {}
        self.tasks: list[TranscriptionTask] = []
        self.fail: Exception | None = None

    def transcribe(self, task: TranscriptionTask) -> str:
        if self.fail:
            raise self.fail
        self.tasks.append(task)
        key = next(key for key, (body, _) in self._files.files.items() if body == task.audio)
        return self.answers.get(key, "")


class InMemoryRecordingRepository:
    """Changes the turns kept by an `InMemoryVoiceSessionRepository`, as SQL changes the rows."""

    def __init__(self, calls: InMemoryVoiceSessionRepository) -> None:
        self._calls = calls

    def _change(self, call_id: str, change: Any) -> None:
        finished = self._calls.finished.get(call_id)
        if finished:
            turns = tuple(change(turn) for turn in finished.turns)
            self._calls.finished[call_id] = replace(finished, turns=turns)

    def set_verbatim(self, call_id: str, key: str, text: str) -> None:
        self._change(
            call_id,
            lambda turn: (
                replace(turn, verbatim=text) if turn.audio and turn.audio.key == key else turn
            ),
        )

    def forget(self, call_id: str) -> None:
        self._change(call_id, lambda turn: replace(turn, audio=None))

    def forget_all(self, user_id: UUID) -> None:
        for session in self._calls.sessions.values():
            if session.user_id == user_id:
                self.forget(session.call_id)


class InMemoryTutorRepository:
    def __init__(self) -> None:
        self.days: dict[tuple[UUID, date], int] = {}
        self.questions: dict[UUID, list[TutorQuestion]] = {}

    def reserve(self, user_id: UUID, day: date, limit: int) -> bool:
        used = self.days.get((user_id, day), 0)
        if used >= limit:
            return False
        self.days[(user_id, day)] = used + 1
        return True

    def save(self, user_id: UUID, question: TutorQuestion) -> None:
        self.questions.setdefault(user_id, []).append(question)

    def listed(self, user_id: UUID, limit: int) -> list[TutorQuestion]:
        newest = sorted(self.questions.get(user_id, []), key=lambda q: q.asked_at, reverse=True)
        return newest[:limit]


class InMemoryLevelRepository:
    """Keeps level steps for the calls of an `InMemoryVoiceSessionRepository`."""

    def __init__(self, calls: InMemoryVoiceSessionRepository) -> None:
        self._calls = calls
        self.steps: dict[str, LevelStep] = {}

    def stepped(self, user_id: UUID, step: LevelStep) -> None:
        self.steps[step.call_id] = replace(step, at=step.at.astimezone(UTC))

    def step(self, user_id: UUID, call_id: str) -> LevelStep | None:
        session = self._calls.sessions.get(call_id)
        if session is None or session.user_id != user_id:
            return None
        return self.steps.get(call_id)


class InMemoryReportRepository:
    """Keeps reports for the calls of an `InMemoryVoiceSessionRepository`."""

    def __init__(self, calls: InMemoryVoiceSessionRepository) -> None:
        self._calls = calls
        self.reports: dict[str, StoredReport] = {}
        self._requests: dict[str, int] = {}
        self._claimed: set[str] = set()

    def request(
        self, call_id: str, at: datetime, *, stale_before: datetime, max_requests: int
    ) -> bool:
        if call_id not in self._calls.sessions:
            return False
        stored = self.reports.get(call_id)
        if stored is not None:
            lost = stored.status == "pending" and stored.requested_at < stale_before
            again = stored.status == "failed" or lost
            if not again or self._requests[call_id] >= max_requests:
                return False
        self._requests[call_id] = self._requests.get(call_id, 0) + 1
        self._claimed.discard(call_id)
        self.reports[call_id] = StoredReport("pending", at.astimezone(UTC), None)
        return True

    def claim(self, call_id: str, at: datetime) -> bool:
        stored = self.reports.get(call_id)
        if stored is None or stored.status != "pending" or call_id in self._claimed:
            return False
        self._claimed.add(call_id)
        return True

    def written(self, call_id: str, status: Status, report: Report | None) -> None:
        stored = self.reports.get(call_id)
        if stored is not None:
            self.reports[call_id] = StoredReport(status, stored.requested_at, report)

    def load(self, call_id: str) -> StoredReport | None:
        return self.reports.get(call_id)

    def _ready(self, user_id: UUID) -> list[tuple[datetime, Report]]:
        """The learner's ready reports, each with when its conversation started."""
        return [
            (self._calls.sessions[call_id].started_at, stored.report)
            for call_id, stored in self.reports.items()
            if stored.report is not None and self._calls.sessions[call_id].user_id == user_id
        ]

    def latest(self, user_id: UUID) -> Report | None:
        ready = self._ready(user_id)
        return max(ready, key=lambda found: found[0])[1] if ready else None

    def history(self, user_id: UUID, language: str, limit: int) -> list[ReportEntry]:
        ready = [
            ReportEntry(call_id, self._calls.sessions[call_id].started_at, stored.report)
            for call_id, stored in self.reports.items()
            if stored.report is not None
            and stored.report.target == language
            and self._calls.sessions[call_id].user_id == user_id
        ]
        return sorted(ready, key=lambda entry: entry.started_at, reverse=True)[:limit]

    def mistakes_by_week(
        self, user_id: UUID, language: str, timezone: str | None, since: date
    ) -> list[WeekMistakes]:
        zone = zone_of(timezone)
        counts: dict[tuple[date, str], int] = {}
        for started_at, report in self._ready(user_id):
            day = started_at.astimezone(zone).date()
            week = day - timedelta(days=day.weekday())
            if report.target != language or week < since:
                continue
            for mistake in report.mistakes:
                if mistake.certain:
                    key = (week, mistake.category)
                    counts[key] = counts.get(key, 0) + 1
        return [WeekMistakes(week, category, count) for (week, category), count in counts.items()]

    def level_fits(self, user_id: UUID, language: str, since: datetime) -> list[LevelFit]:
        found = [
            (started_at, report.level_fit)
            for started_at, report in self._ready(user_id)
            if report.target == language and started_at >= since and report.level_fit
        ]
        return [fit for _, fit in sorted(found, key=lambda pair: pair[0], reverse=True)]

    def totals(self, user_id: UUID, language: str, since: datetime) -> ReportTotals:
        ready = [found for found in self._ready(user_id) if found[1].target == language]
        recent = [report.stats for started_at, report in ready if started_at >= since]
        return ReportTotals(
            learner_words=sum(stats.learner_words for stats in recent),
            partner_words=sum(stats.partner_words for stats in recent),
            most_words=max((report.stats.learner_words for _, report in ready), default=0),
        )


class RecordingReportStarter:
    def __init__(self) -> None:
        self.started: list[str] = []
        self.fail = False

    def start(self, call_id: str) -> None:
        if self.fail:
            raise RuntimeError("could not start the worker")
        self.started.append(call_id)


class RecordingDetailsStarter:
    def __init__(self) -> None:
        self.started: list[UUID] = []

    def start(self, user_id: UUID) -> None:
        self.started.append(user_id)


class InMemoryCardRepository:
    def __init__(self) -> None:
        # When each card was last claimed to be filled in with its forms.
        self.claimed: dict[UUID, datetime] = {}
        # Per card: its owner, its language and what makes it the same card as another.
        self.cards: dict[UUID, tuple[UUID, str, str, Card]] = {}
        # (card, rating, when) of every review, in order.
        self.reviews: list[tuple[UUID, str, datetime]] = []

    def _of(self, user_id: UUID, language: str) -> list[tuple[str, Card]]:
        return [
            (key, card)
            for owner, spoken, key, card in self.cards.values()
            if owner == user_id and spoken == language
        ]

    def add(self, user_id: UUID, language: str, key: str, card: Card, limit: int) -> bool:
        deck = self._of(user_id, language)
        same = any(known == key and other.kind == card.kind for known, other in deck)
        if same or len(deck) >= limit:
            return False
        self.cards[card.id] = (user_id, language, key, card)
        return True

    def by_key(self, user_id: UUID, language: str, kind: str, key: str) -> Card | None:
        return next(
            (
                card
                for known, card in self._of(user_id, language)
                if (card.kind, known) == (kind, key)
            ),
            None,
        )

    def get(self, user_id: UUID, card_id: UUID) -> Card | None:
        stored = self.cards.get(card_id)
        return stored[3] if stored and stored[0] == user_id else None

    def listed(
        self, user_id: UUID, language: str, limit: int, before: datetime | None
    ) -> list[Card]:
        cards = [card for _, card in self._of(user_id, language)]
        newest_first = sorted(cards, key=lambda c: (c.created_at, str(c.id)), reverse=True)
        return [c for c in newest_first if before is None or c.created_at < before][:limit]

    def due(self, user_id: UUID, language: str, now: datetime, limit: int) -> list[Card]:
        waiting = [card for _, card in self._of(user_id, language) if card.due_at <= now]
        return sorted(waiting, key=lambda c: (c.due_at, c.created_at, str(c.id)))[:limit]

    def counts(self, user_id: UUID, language: str, now: datetime) -> tuple[int, int]:
        cards = [card for _, card in self._of(user_id, language)]
        return len(cards), sum(1 for card in cards if card.due_at <= now)

    def reviewed(self, user_id: UUID, card: Card, rating: str, reviews_before: int) -> bool:
        stored = self.cards.get(card.id)
        if stored is None or stored[0] != user_id or stored[3].reviews != reviews_before:
            return False
        self.cards[card.id] = (*stored[:3], card)
        assert card.reviewed_at is not None
        self.reviews.append((card.id, rating, card.reviewed_at))
        return True

    def remove(self, user_id: UUID, card_id: UUID) -> bool:
        stored = self.cards.get(card_id)
        if stored is None or stored[0] != user_id:
            return False
        del self.cards[card_id]
        return True

    def known(
        self, user_id: UUID, language: str, keys: Sequence[tuple[str, str]]
    ) -> set[tuple[str, str]]:
        have: set[tuple[str, str]] = {(card.kind, key) for key, card in self._of(user_id, language)}
        return have & set(keys)

    def claim_for_details(
        self, user_id: UUID, language: str, at: datetime, stale_before: datetime, limit: int
    ) -> list[Card]:
        waiting = [
            card
            for _, card in self._of(user_id, language)
            if card.kind == "word"
            and card.details is None
            and self.claimed.get(card.id, stale_before) <= stale_before
        ]
        chosen = sorted(waiting, key=lambda c: (c.created_at, str(c.id)))[:limit]
        for card in chosen:
            self.claimed[card.id] = at
        return chosen

    def set_details(self, user_id: UUID, card_id: UUID, details: WordDetails) -> None:
        stored = self.cards.get(card_id)
        if stored and stored[0] == user_id:
            owner, language, key, card = stored
            self.cards[card_id] = (owner, language, key, replace(card, details=details))

    def totals(self, user_id: UUID, language: str, since: datetime) -> CardTotals:
        mine = {card.id for _, card in self._of(user_id, language)}
        # A removed card takes its reviews with it, as in the database.
        reviews = [(rating, at) for card_id, rating, at in self.reviews if card_id in mine]
        recent = [rating for rating, at in reviews if at >= since]
        return CardTotals(
            learned=sum(1 for _, card in self._of(user_id, language) if card.reviews > 0),
            reviews=len(recent),
            remembered=sum(1 for rating in recent if rating != "again"),
            reviews_ever=len(reviews),
        )


class InMemoryMemoryRepository:
    """Keeps memories, and which calls of an `InMemoryVoiceSessionRepository` were read."""

    def __init__(self, calls: InMemoryVoiceSessionRepository) -> None:
        self._calls = calls
        # The calls that may be read, and those of them a worker has taken.
        self._allowed: set[str] = set()
        self._read: set[str] = set()
        # Per memory: its owner, what makes it the same memory as another, and the memory.
        self.memories: dict[UUID, tuple[UUID, str, Memory]] = {}

    def allow(self, call_id: str, at: datetime) -> None:
        if call_id in self._calls.sessions:
            self._allowed.add(call_id)

    def claim(self, call_id: str, at: datetime) -> bool:
        if call_id not in self._allowed or call_id in self._read:
            return False
        self._read.add(call_id)
        return True

    def release(self, call_id: str) -> None:
        self._read.discard(call_id)

    def _same(self, user_id: UUID, key: str, memory: Memory) -> bool:
        return any(
            (owner, known, other.persona_id) == (user_id, key, memory.persona_id)
            and other.id != memory.id
            for owner, known, other in self.memories.values()
        )

    def add(self, user_id: UUID, key: str, memory: Memory, limit: int) -> bool:
        if self._same(user_id, key, memory) or len(self.listed(user_id)) >= limit:
            return False
        self.memories[memory.id] = (user_id, key, memory)
        return True

    def replace(self, user_id: UUID, key: str, memory: Memory) -> bool:
        stored = self.memories.get(memory.id)
        if stored is None or stored[0] != user_id or self._same(user_id, key, memory):
            return False
        self.memories[memory.id] = (user_id, key, memory)
        return True

    def listed(self, user_id: UUID) -> list[Memory]:
        mine = [memory for owner, _, memory in self.memories.values() if owner == user_id]
        return sorted(mine, key=lambda m: (m.created_at, str(m.id)), reverse=True)

    def get(self, user_id: UUID, memory_id: UUID) -> Memory | None:
        stored = self.memories.get(memory_id)
        return stored[2] if stored and stored[0] == user_id else None

    def remove(self, user_id: UUID, memory_id: UUID) -> bool:
        if self.get(user_id, memory_id) is None:
            return False
        del self.memories[memory_id]
        return True


class InMemoryChargeRepository:
    def __init__(self) -> None:
        self.records: list[ChargeRecord] = []
        self.deleted: set[UUID] = set()
        # True: every call fails, as a database that cannot be reached.
        self.broken = False

    def add(self, record: ChargeRecord) -> None:
        if self.broken:
            raise RuntimeError("the database did not answer")
        user_id = None if record.user_id in self.deleted else record.user_id
        self.records.append(replace(record, user_id=user_id, at=record.at.astimezone(UTC)))

    def _within(self, since: datetime, until: datetime) -> list[ChargeRecord]:
        if self.broken:
            raise RuntimeError("the database did not answer")
        return [record for record in self.records if since <= record.at < until]

    def total(self, since: datetime, until: datetime) -> float:
        return sum(record.usd for record in self._within(since, until))

    def spending(self, since: datetime, until: datetime, top: int) -> Spending:
        records = self._within(since, until)

        def shares(key: Any) -> tuple[Share, ...]:
            grouped: dict[str, list[ChargeRecord]] = {}
            for record in records:
                grouped.setdefault(key(record), []).append(record)
            found = [
                Share(name, sum(r.usd for r in group), len(group))
                for name, group in grouped.items()
            ]
            return tuple(sorted(found, key=lambda share: (-share.usd, share.key)))

        days: dict[date, float] = {}
        learners: dict[UUID | None, list[ChargeRecord]] = {}
        for record in records:
            day = record.at.date()
            days[day] = days.get(day, 0.0) + record.usd
            learners.setdefault(record.user_id, []).append(record)
        spenders = [
            LearnerSpend(
                user_id,
                sum(r.usd for r in group),
                len(group),
                int(sum(r.units.get("call_seconds", 0) for r in group)),
            )
            for user_id, group in learners.items()
            if user_id is not None
        ]
        spenders.sort(key=lambda learner: (-learner.usd, str(learner.user_id)))
        return Spending(
            total_usd=sum(record.usd for record in records),
            unpriced=sum(1 for record in records if not record.priced),
            days=tuple(DaySpend(day, usd) for day, usd in sorted(days.items())),
            features=shares(lambda record: record.feature.value),
            providers=shares(lambda record: record.provider),
            learners=tuple(spenders[:top]),
        )

    def forget_learner(self, user_id: UUID) -> None:
        """What account deletion does: the spending stays, without the learner."""
        self.deleted.add(user_id)
        self.records = [
            replace(record, user_id=None) if record.user_id == user_id else record
            for record in self.records
        ]


class InMemoryAlertLog:
    def __init__(self) -> None:
        self.sent: set[tuple[date, Level]] = set()

    def first(self, month: date, level: Level) -> bool:
        if (month, level) in self.sent:
            return False
        self.sent.add((month, level))
        return True

    def forget(self, month: date, level: Level) -> None:
        self.sent.discard((month, level))


class RecordingNotifier:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.broken = False

    def notify(self, subject: str, message: str) -> None:
        if self.broken:
            raise RuntimeError("the email service did not answer")
        self.sent.append((subject, message))


class ScriptedTranscriber:
    """Answers each transcription from a queue (a text, or an error to raise) and records the
    tasks."""

    def __init__(self, *answers: str | Exception) -> None:
        self.answers = list(answers)
        self.tasks: list[TranscriptionTask] = []

    def transcribe(self, task: TranscriptionTask) -> str:
        self.tasks.append(task)
        if not self.answers:
            raise AssertionError("the transcriber was asked more often than the test expected")
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


class InMemoryDailyAllowance:
    def __init__(self) -> None:
        self.days: dict[tuple[UUID, date], int] = {}

    def reserve(self, user_id: UUID, day: date, limit: int) -> bool:
        used = self.days.get((user_id, day), 0)
        if used >= limit:
            return False
        self.days[(user_id, day)] = used + 1
        return True


class InMemoryRetryRepository:
    def __init__(self) -> None:
        self.days: dict[tuple[UUID, date], int] = {}
        self.attempts: list[tuple[UUID, str, int, datetime, bool]] = []

    def reserve(self, user_id: UUID, day: date, limit: int) -> bool:
        used = self.days.get((user_id, day), 0)
        if used >= limit:
            return False
        self.days[(user_id, day)] = used + 1
        return True

    def attempted(self, user_id: UUID, call_id: str, index: int, at: datetime, right: bool) -> None:
        self.attempts.append((user_id, call_id, index, at, right))

    def of_conversation(self, user_id: UUID, call_id: str) -> dict[int, bool]:
        tried: dict[int, bool] = {}
        for owner, call, index, _, right in self.attempts:
            if (owner, call) == (user_id, call_id):
                tried[index] = tried.get(index, False) or right
        return tried


class InMemoryWeekReviewRepository:
    def __init__(self) -> None:
        self.reviews: dict[tuple[UUID, str, date], StoredReview] = {}
        self._requests: dict[tuple[UUID, str, date], int] = {}

    def request(
        self,
        user_id: UUID,
        language: str,
        review: StoredReview,
        *,
        stale_before: datetime,
        max_requests: int,
    ) -> bool:
        key = (user_id, language, review.numbers.week)
        stored = self.reviews.get(key)
        if stored is not None:
            lost = stored.status == "pending" and stored.requested_at < stale_before
            if not (stored.status == "failed" or lost) or self._requests[key] >= max_requests:
                return False
        self._requests[key] = self._requests.get(key, 0) + 1
        self.reviews[key] = review
        return True

    def written(
        self, user_id: UUID, language: str, week: date, status: WeekStatus, text: str | None
    ) -> None:
        key = (user_id, language, week)
        if key in self.reviews:
            self.reviews[key] = replace(self.reviews[key], status=status, text=text)

    def load(self, user_id: UUID, language: str, week: date) -> StoredReview | None:
        return self.reviews.get((user_id, language, week))


class RecordingWeekStarter:
    def __init__(self) -> None:
        self.started: list[tuple[UUID, date]] = []

    def start(self, user_id: UUID, week: date) -> None:
        self.started.append((user_id, week))


class InMemoryExamRepository:
    def __init__(self) -> None:
        self.simulations: dict[str, tuple[UUID, str, Simulation]] = {}
        self._requests: dict[str, int] = {}

    def started(self, user_id: UUID, language: str, simulation: Simulation) -> None:
        self.simulations[simulation.call_id] = (user_id, language, simulation)
        self._requests[simulation.call_id] = 1

    def request(
        self, call_id: str, at: datetime, *, stale_before: datetime, max_requests: int
    ) -> bool:
        if call_id not in self.simulations:
            return False
        user_id, language, simulation = self.simulations[call_id]
        lost = simulation.status == "pending" and simulation.requested_at < stale_before
        if not (simulation.status == "failed" or lost) or self._requests[call_id] >= max_requests:
            return False
        self._requests[call_id] += 1
        self.simulations[call_id] = (
            user_id,
            language,
            replace(simulation, status="pending", requested_at=at, result=None),
        )
        return True

    def written(self, call_id: str, status: ExamStatus, result: SimulationResult | None) -> None:
        user_id, language, simulation = self.simulations[call_id]
        self.simulations[call_id] = (
            user_id,
            language,
            replace(simulation, status=status, result=result),
        )

    def load(self, user_id: UUID, call_id: str) -> Simulation | None:
        found = self.simulations.get(call_id)
        return found[2] if found and found[0] == user_id else None

    def listed(self, user_id: UUID, language: str, limit: int) -> list[Simulation]:
        mine = [s for u, lang, s in self.simulations.values() if u == user_id and lang == language]
        return sorted(mine, key=lambda s: s.started_at, reverse=True)[:limit]

    def count(self, user_id: UUID, exam: str) -> int:
        return sum(1 for u, _, s in self.simulations.values() if u == user_id and s.exam == exam)


class RecordingExamStarter:
    def __init__(self) -> None:
        self.started: list[str] = []

    def start(self, call_id: str) -> None:
        self.started.append(call_id)
