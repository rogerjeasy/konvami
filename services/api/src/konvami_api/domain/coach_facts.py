"""The facts the Coach reads (`coach.CoachInputs`), gathered from the services that already know
them. Nothing is measured here: each number comes from the report, card, grammar map, sound,
level, exam, partner or import that Konvami already keeps (docs/superpowers/specs/
2026-11-20-coach-design.md, "Where each fact comes from")."""

import datetime as dt
from collections.abc import Callable
from uuid import UUID, uuid4

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.cards import CardService
from konvami_api.domain.coach import (
    LAPSES,
    RECENT_REPORTS,
    CoachInputs,
    CoachRepository,
    CoachService,
    CoachStarter,
    ExamFact,
    ImportFact,
    MistakeFact,
    PartnerFact,
    ReportFact,
    SoundFact,
    TopicFact,
    WordingGate,
)
from konvami_api.domain.conversations import ConversationService, zone_of
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.course_import import CourseImportService
from konvami_api.domain.director import DirectorService
from konvami_api.domain.exam_centre import ExamService
from konvami_api.domain.fluency import recording_fluency
from konvami_api.domain.grammar_map import GrammarMapService
from konvami_api.domain.levels import LEVEL_FIELD, LevelService, leaning
from konvami_api.domain.motivation import Streak
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.profile import ProfileService, Source
from konvami_api.domain.pronunciation import PronunciationService
from konvami_api.domain.reports import ReportService
from konvami_api.domain.retries import RetryService
from konvami_api.domain.text import TextModel

_WEEK = dt.timedelta(days=7)
# Cards read to find the oldest due and the ones forgotten again and again.
CARDS_READ = 50
# Recorded conversations whose pace is compared: the newest ones against the ones before.
PACE_CONVERSATIONS = 3
LEVEL_NEWS = dt.timedelta(days=7)


def _monday(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


class CoachFacts:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        onboarding: OnboardingService,
        conversations: ConversationService,
        reports: ReportService,
        retries: RetryService,
        cards: CardService,
        grammar: GrammarMapService,
        pronunciation: PronunciationService,
        levels: LevelService,
        exams: ExamService,
        personas: PersonaService,
        imports: CourseImportService,
        director: DirectorService,
        # The learner's streak, from motivation (`motivation.py`), which owns it for every screen.
        streak: Callable[[UUID, str | None], Streak],
    ) -> None:
        self._streak = streak
        self._profiles = profiles
        self._onboarding = onboarding
        self._conversations = conversations
        self._reports = reports
        self._retries = retries
        self._cards = cards
        self._grammar = grammar
        self._pronunciation = pronunciation
        self._levels = levels
        self._exams = exams
        self._personas = personas
        self._imports = imports
        self._director = director

    def today(self, user_id: UUID, timezone: str | None, now: dt.datetime) -> dt.date:
        """The learner's date now, on their calendar."""
        return now.astimezone(zone_of(timezone)).date()

    def read(self, user_id: UUID, timezone: str | None, now: dt.datetime) -> CoachInputs:
        """Raises `OnboardingError("wrong_stage")` before the learner entered the app."""
        if self._onboarding.status(user_id).stage is not Stage.DONE:
            raise OnboardingError("wrong_stage")
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        days = self._conversations.days(user_id, timezone, now)
        today = days.today
        activity = self._conversations.activity(user_id, timezone, now)
        streak = self._streak(user_id, timezone)
        practised = [day.day for day in days.days if day.seconds > 0]
        partners = self._partners(user_id, now)
        met = [p for p in partners if p.days_since is not None]
        partner = (
            min(met, key=lambda p: p.days_since or 0).id
            if met
            else partners[0].id
            if partners
            else None
        )
        this_monday = _monday(today)
        by_week = self._reports.mistakes_by_week(user_id, timezone, this_monday - _WEEK)
        queue = self._cards.queue(user_id, limit=CARDS_READ)
        week_cards = self._cards.progress(user_id, now - _WEEK)
        level = profile.level(language)
        up, down, counted = self._leanings(user_id, language)
        topics_of = (
            {category: topic.id for topic in pack.grammar_map for category in topic.categories}
            if pack
            else {}
        )
        return CoachInputs(
            today=today,
            hour=now.astimezone(zone_of(timezone)).hour,
            conversations=activity.conversations,
            reports=self._report_facts(user_id, topics_of),
            mistakes_this_week={
                item.category: item.count for item in by_week if item.week == this_monday
            },
            mistakes_last_week={
                item.category: item.count for item in by_week if item.week == this_monday - _WEEK
            },
            topics=self._topic_facts(user_id, now),
            cards_due=queue.due,
            oldest_due_days=max(((now - item.card.due_at).days for item in queue.cards), default=0),
            lapsing=tuple(
                item.card.front
                for item in queue.cards
                if item.card.kind == "word" and item.card.lapses >= LAPSES
            ),
            words_due=sum(1 for item in queue.cards if item.card.kind == "word"),
            reviews_7_days=week_cards.reviews,
            remembered_7_days=week_cards.remembered,
            sounds=self._sound_facts(user_id),
            **self._pace(user_id),
            streak=streak.days,
            best_streak=streak.longest,
            planned_today=streak.planned_today,
            practised_today=activity.practised_today or streak.spoke_today,
            days_since_practice=(today - max(practised)).days if practised else None,
            level=level,
            level_up=up,
            level_down=down,
            level_counted=counted,
            level_raised_to=self._raised(user_id, language, now),
            exam=self._exam(user_id, today, now),
            partners=partners,
            partner=partner,
            imports=tuple(
                ImportFact(item.id, item.title, (now - item.created_at).days)
                for item in self._imports.imports(user_id)
            ),
            plan_missed=len(self._director.week(user_id, timezone).missed),
        )

    def practised_since(self, user_id: UUID, day: dt.date) -> bool:
        """Whether the learner practised on `day` or later (in UTC days, near enough)."""
        since = dt.datetime(day.year, day.month, day.day, tzinfo=dt.UTC)
        held = self._conversations.listed(user_id, limit=1).conversations
        return bool(held and held[0].started_at >= since) or (
            self._cards.reviews_since(user_id, since) > 0
        )

    def _report_facts(self, user_id: UUID, topics_of: dict[str, str]) -> tuple[ReportFact, ...]:
        found = []
        for entry in self._reports.history(user_id, RECENT_REPORTS):
            mistakes = tuple(
                MistakeFact(
                    m.category, topics_of.get(m.category), m.severity, m.original, m.corrected
                )
                for m in entry.report.mistakes
                if m.certain
            )
            retried = self._retries.of_conversation(user_id, entry.call_id)
            found.append(ReportFact(entry.call_id, mistakes, len(retried)))
        return tuple(found)

    def _topic_facts(self, user_id: UUID, now: dt.datetime) -> tuple[TopicFact, ...]:
        before = {
            state.topic.id: state.mastery.state.value
            for state in self._grammar.states(user_id, before=now - _WEEK)
        }
        return tuple(
            TopicFact(
                id=state.topic.id,
                state=state.mastery.state.value,
                accuracy=state.mastery.accuracy,
                uses=state.mastery.uses,
                trend=state.mastery.trend.value if state.mastery.trend else None,
                last_used_days=(now - state.mastery.last_used_at).days
                if state.mastery.last_used_at
                else None,
                state_week_ago=before.get(state.topic.id, "not_started"),
            )
            for state in self._grammar.states(user_id)
        )

    def _sound_facts(self, user_id: UUID) -> tuple[SoundFact, ...]:
        words: dict[str, list[str]] = {}
        for problem in self._pronunciation.problem_words(user_id):
            if problem.sound_id:
                words.setdefault(problem.sound_id, []).append(problem.word)
        return tuple(
            SoundFact(
                sound.id,
                sound.title,
                sound.tries,
                sound.right,
                sound.score,
                tuple(words.get(sound.id, ())),
            )
            for sound in self._pronunciation.sounds(user_id)
        )

    def _pace(self, user_id: UUID) -> dict[str, float | None]:
        """Words per minute of the newest recorded conversations and of the ones before."""
        recorded: list[float] = []
        for call in self._conversations.listed(user_id, limit=4 * PACE_CONVERSATIONS).conversations:
            fluency = recording_fluency(self._conversations.transcript(user_id, call.id).turns)
            if fluency is not None:
                recorded.append(fluency.words_per_minute)
            if len(recorded) == 2 * PACE_CONVERSATIONS:
                break
        if len(recorded) < 2 * PACE_CONVERSATIONS:
            return {"pace_before": None, "pace_after": None}
        after = recorded[:PACE_CONVERSATIONS]
        before = recorded[PACE_CONVERSATIONS:]
        return {"pace_before": sum(before) / len(before), "pace_after": sum(after) / len(after)}

    def _leanings(self, user_id: UUID, language: str) -> tuple[int, int, int]:
        """Since the level was last set: the conversations whose evidence pointed up and down,
        and those that counted."""
        stored = self._profiles.get(user_id).fields.get((language, LEVEL_FIELD))
        if stored is None:
            return 0, 0, 0
        fits = self._reports.level_fits(user_id, language, stored.updated_at)
        leanings = [found for fit in fits if (found := leaning(fit)) is not None]
        return leanings.count(1), leanings.count(-1), len(leanings)

    def _raised(self, user_id: UUID, language: str, now: dt.datetime) -> str | None:
        """The level the engine raised the learner to in the last week."""
        history = self._levels.history(user_id, language)
        if len(history) < 2:
            return None
        last, before = history[-1], history[-2]
        order = ("A0", "A1", "A2", "B1", "B2", "C1", "C2")
        if (
            last.source is Source.MEASURED
            and now - last.at <= LEVEL_NEWS
            and last.level in order
            and before.level in order
            and order.index(last.level) > order.index(before.level)
        ):
            return last.level
        return None

    def _exam(self, user_id: UUID, today: dt.date, now: dt.datetime) -> ExamFact | None:
        preparation = self._exams.preparation(user_id)
        if preparation is None or (preparation.date is not None and preparation.date < today):
            return None
        ended = [held.ended_at for held in preparation.held]
        return ExamFact(
            test=preparation.exam.id,
            name=preparation.exam.name,
            days_left=(preparation.date - today).days if preparation.date else None,
            simulations_7_days=sum(1 for at in ended if now - at <= _WEEK),
            simulations_14_days=sum(1 for at in ended if now - at <= 2 * _WEEK),
            last_days=min(((now - at).days for at in ended), default=None),
        )

    def _partners(self, user_id: UUID, now: dt.datetime) -> tuple[PartnerFact, ...]:
        history = self._conversations.partner_history(user_id)
        return tuple(
            PartnerFact(
                persona.id,
                persona.name,
                met.conversations if met else 0,
                (now - met.last_at).days if met else None,
            )
            for persona in self._personas.partners(user_id)
            for met in [history.get(persona.id)]
        )


def latest_report(reports: ReportService) -> Callable[[UUID], str]:
    """The id of the learner's latest ready report ("" before one): a new one finds again."""

    def read(user_id: UUID) -> str:
        entries = reports.history(user_id, 1)
        return entries[0].call_id if entries else ""

    return read


def coach_service(
    *,
    profiles: ProfileService,
    facts: CoachFacts,
    reports: ReportService,
    accounts: AccountDirectory,
    repository: CoachRepository,
    starter: CoachStarter,
    text_model: TextModel,
    model: str,
    affordable: Callable[[], bool],
    clock: Callable[[], dt.datetime],
    new_id: Callable[[], UUID] = uuid4,
) -> CoachService:
    """The Coach, wired to the services its facts come from."""

    def language(user_id: UUID) -> str:
        return profiles.get(user_id).target_language or ""

    def explanation(user_id: UUID, target: str) -> str:
        explained = profiles.get(user_id).value(target, "explanation_language")
        return explained if isinstance(explained, str) else "en"

    def consented(user_id: UUID) -> bool:
        # The facts go to the text model's provider, which the learner must have agreed to.
        try:
            return accounts.get(user_id).voice_consent
        except AccountNotFound:
            return False

    def titles(target: str) -> dict[str, str]:
        pack = profiles.catalog.available_pack(target)
        return {topic.id: topic.title for topic in pack.grammar_map} if pack else {}

    return CoachService(
        language=language,
        explanation=explanation,
        language_name=profiles.catalog.english_name,
        latest_report=latest_report(reports),
        inputs=facts.read,
        topic_titles=titles,
        practised_since=facts.practised_since,
        repository=repository,
        starter=starter,
        text_model=text_model,
        gate=WordingGate(model=model, consented=consented, affordable=affordable),
        charge=lambda user_id: Charge(user_id, Feature.COACH),
        clock=clock,
        today=facts.today,
        new_id=new_id,
    )
