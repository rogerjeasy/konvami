"""The Learning Director (spec §6.12, §8.2): the learner's week, not just their next call.

From the learner's goals it makes a weekly plan: how many free conversations, role-plays and
review conversations, which grammar topics in which order, and how many cards to review. Every
time Today opens, the rest of the week is worked out again from what was done, and the plan says
why when it changed: days missed, voice minutes running short, the week already done.

The week runs Monday to Sunday, as the voice minutes do, and the plan never asks for more
speaking than the minutes the learner has. Like the Session Planner it is plain code, not a
model: the same week always gives the same plan, it costs nothing and it answers at once.
"""

import datetime as dt
import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any
from uuid import UUID

from konvami_api.domain.cards import CardService
from konvami_api.domain.catalog import STARTING_LEVELS
from konvami_api.domain.conversations import (
    PAGE_MAX,
    Conversation,
    ConversationService,
    DayActivity,
)
from konvami_api.domain.costs import Allowance, week_start
from konvami_api.domain.grammar_map import GrammarMapService, Mastery, TopicState, Trend
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.profile import LEVEL_GOAL, WEEKLY_HABIT, Profile, ProfileService
from konvami_api.domain.scenarios import Scenario

# The shortest piece of practice the plan suggests, and the step its minutes come in.
MINUTES_STEP = 5
# A review conversation needs words to be about: fewer due than this, and none is planned.
MIN_REVIEW_WORDS = 3
# The words one review conversation brings back (the Session Planner's `MAX_REVIEW_WORDS`).
WORDS_PER_REVIEW = 6
# The most cards a week asks to review: twenty a day, more than anyone needs on time.
MAX_WEEK_CARDS = 140
_WEEK_DAYS = 7
_WEEK = dt.timedelta(days=_WEEK_DAYS)


class SessionKind(StrEnum):
    # A review conversation (spec §6.7): built around the due words.
    REVIEW = "review"
    ROLE_PLAY = "role_play"
    FREE = "free"


# Who comes first when two kinds are as far behind: words while they are fresh, then a
# situation, then free talk.
_KIND_ORDER = (SessionKind.REVIEW, SessionKind.ROLE_PLAY, SessionKind.FREE)


class Lean(StrEnum):
    """What the goals make the week lean on."""

    # An exam on a date: role-plays, the nearest the app has to an exam's speaking part.
    EXAM = "exam"
    # Living, working or travelling in the language: real-life situations.
    LIFE = "life"
    GENERAL = "general"


# The share of the conversations (other than reviews) that are role-plays, per lean.
_ROLE_PLAY_SHARE: Mapping[Lean, float] = {Lean.EXAM: 0.5, Lean.LIFE: 1 / 3, Lean.GENERAL: 0.25}


class Reason(StrEnum):
    """Why today's part of the plan is what it is."""

    ON_TRACK = "on_track"
    # Planned days went by without practice, so the days left have a little more.
    MISSED = "missed"
    # The week's voice minutes left are fewer than the plan would ask for.
    SHORT_OF_MINUTES = "short_of_minutes"
    MINUTES_USED_UP = "minutes_used_up"
    TODAY_DONE = "today_done"
    # The week's minutes are done: what is left is a light extra.
    WEEK_DONE = "week_done"


@dataclass(frozen=True)
class Habit:
    days: int
    minutes: int


# A learner who set no habit: four days of ten minutes, which fits the testing allowance with
# room for an extra call.
DEFAULT_HABIT = Habit(days=4, minutes=40)


@dataclass(frozen=True)
class WeekSoFar:
    """What the learner did this week."""

    # The days they practised on, with how long.
    days: tuple[DayActivity, ...]
    free: int
    role_plays: int
    reviews: int
    cards_reviewed: int

    def done(self, kind: SessionKind) -> int:
        return {
            SessionKind.REVIEW: self.reviews,
            SessionKind.ROLE_PLAY: self.role_plays,
            SessionKind.FREE: self.free,
        }[kind]


@dataclass(frozen=True)
class WeekInputs:
    # The learner's date.
    today: dt.date
    habit: Habit
    # The learner's voice minutes this week, as seconds, and how many are left.
    weekly_seconds: int
    remaining_seconds: int
    # The longest practice call.
    call_minutes: int
    lean: Lean
    # The week's grammar topics, in order (`choose_topics`, chosen once a week).
    topics: tuple[str, ...]
    # Word cards due by the end of the week, and cards of every kind due now and by then.
    words_due: int
    cards_due_now: int
    cards_due_by_end: int
    # Whether a role-play fits the learner's level.
    role_plays: bool
    so_far: WeekSoFar
    # The day the learner joined (finished onboarding): in their first week, the planned days
    # before it are not theirs. None when unknown.
    started: dt.date | None = None


@dataclass(frozen=True)
class Session:
    kind: SessionKind
    minutes: int
    # The grammar topic it puts first; None for a review conversation, which practises words.
    topic: str | None
    # A role-play's situation (a scenario id); None for the other kinds.
    scenario: str | None = None


@dataclass(frozen=True)
class WeekPlan:
    # The week's Monday.
    week: dt.date
    # The speaking the week sets out to do, and on how many days.
    minutes: int
    days: int
    # True when the voice minutes made the week shorter than the habit.
    capped: bool
    sessions: Mapping[SessionKind, int]
    topics: tuple[str, ...]
    # Card reviews to aim for: every card that comes due this week.
    cards: int
    done_minutes: int
    done_days: int
    # What is left for today, the shortest first; empty when nothing is.
    today: tuple[Session, ...]
    today_cards: int
    reason: Reason
    # The planned days that went by without practice, when they shaped today.
    missed: tuple[dt.date, ...]


def _steps_down(minutes: int) -> int:
    return minutes // MINUTES_STEP * MINUTES_STEP


def _steps_up(minutes: float) -> int:
    return math.ceil(minutes / MINUTES_STEP) * MINUTES_STEP


def _half_up(value: float) -> int:
    return math.floor(value + 0.5)


def planned_weekdays(days: int) -> tuple[int, ...]:
    """The weekdays (Monday 0) a habit of `days` days falls on, spread over the week:
    four days are Monday, Tuesday, Thursday and Saturday."""
    return tuple(i * _WEEK_DAYS // days for i in range(days))


def _mix(calls: int, lean: Lean, words_due: int, role_plays: bool) -> dict[SessionKind, int]:
    reviews = (
        min(max(1, calls // 4), math.ceil(words_due / WORDS_PER_REVIEW))
        if words_due >= MIN_REVIEW_WORDS and calls >= 2
        else 0
    )
    rest = calls - reviews
    played = _half_up(rest * _ROLE_PLAY_SHARE[lean]) if role_plays else 0
    return {
        SessionKind.REVIEW: reviews,
        SessionKind.ROLE_PLAY: played,
        SessionKind.FREE: rest - played,
    }


def _next_kinds(
    targets: Mapping[SessionKind, int], so_far: WeekSoFar, count: int
) -> list[SessionKind]:
    """The next `count` kinds of conversation: each time the one furthest behind its target.
    Once every target is met, free conversation."""
    left = {kind: max(0, targets[kind] - so_far.done(kind)) for kind in _KIND_ORDER}
    kinds: list[SessionKind] = []
    for _ in range(count):
        behind = [kind for kind in _KIND_ORDER if left[kind] > 0]
        if not behind:
            kinds.append(SessionKind.FREE)
            continue
        kind = max(behind, key=lambda k: (left[k] / targets[k], -_KIND_ORDER.index(k)))
        left[kind] -= 1
        kinds.append(kind)
    return kinds


def _pieces(minutes: int, call_minutes: int) -> list[int]:
    """A day's minutes as calls of at most `call_minutes`, the shortest first."""
    calls = math.ceil(minutes / call_minutes)
    return sorted([call_minutes] * (calls - 1) + [minutes - call_minutes * (calls - 1)])


def _sessions(
    inputs: WeekInputs, targets: Mapping[SessionKind, int], minutes: int
) -> tuple[Session, ...]:
    pieces = _pieces(minutes, inputs.call_minutes)
    kinds = _next_kinds(targets, inputs.so_far, len(pieces))
    # Topics take turns across the week's conversations, in their order.
    turn = inputs.so_far.free + inputs.so_far.role_plays
    sessions = []
    for kind, piece in zip(kinds, pieces, strict=True):
        topic = None
        if kind is not SessionKind.REVIEW and inputs.topics:
            topic = inputs.topics[turn % len(inputs.topics)]
            turn += 1
        sessions.append(Session(kind, piece, topic))
    return tuple(sessions)


def _missed(
    inputs: WeekInputs, weekdays: Sequence[int], practised: set[dt.date]
) -> tuple[dt.date, ...]:
    """The planned days before today without practice, as many as practice on other days
    did not make up for, the latest of them."""
    monday = inputs.today - dt.timedelta(days=inputs.today.weekday())
    planned = [
        monday + dt.timedelta(days=weekday)
        for weekday in weekdays
        if weekday < inputs.today.weekday()
    ]
    short = len(planned) - len([day for day in practised if day < inputs.today])
    if short <= 0:
        return ()
    return tuple([day for day in planned if day not in practised][-short:])


@dataclass(frozen=True)
class WeekTarget:
    # The planned weekdays (Monday 0), how many days and minutes the week asks for, and
    # whether the voice minutes made it less than the habit.
    weekdays: tuple[int, ...]
    days: int
    minutes: int
    capped: bool


def week_target(
    habit: Habit, weekly_seconds: int, monday: dt.date, started: dt.date | None
) -> WeekTarget:
    """What the week from `monday` asks for: the habit, never more than the voice minutes. In
    the week the learner joined, only the planned days from that day on, with their share of
    the minutes, and at least one day."""
    first = started.weekday() if started and monday <= started < monday + _WEEK else 0
    weekdays = tuple(day for day in planned_weekdays(habit.days) if day >= first)
    days = max(1, len(weekdays))
    wanted = min(_steps_up(habit.minutes * days / habit.days), habit.minutes)
    minutes = min(wanted, _steps_down(weekly_seconds // 60))
    return WeekTarget(weekdays, days, minutes, minutes < wanted)


def plan_week(inputs: WeekInputs) -> WeekPlan:
    today = inputs.today
    monday = today - dt.timedelta(days=today.weekday())
    habit = inputs.habit
    target = week_target(habit, inputs.weekly_seconds, monday, inputs.started)
    weekdays, week_days, week_minutes = target.weekdays, target.days, target.minutes
    calls = max(
        math.ceil(week_minutes / inputs.call_minutes),
        min(week_days, week_minutes // MINUTES_STEP),
    )
    targets = _mix(calls, inputs.lean, inputs.words_due, inputs.role_plays)

    practised = {day.day: day.seconds for day in inputs.so_far.days}
    done_minutes = sum(practised.values()) // 60
    today_done = practised.get(today, 0) // 60
    left = max(0, week_minutes - done_minutes)
    voice_left = _steps_down(inputs.remaining_seconds // 60)

    # Today and the planned days after it share what is left of the week. The share is
    # worked out as it stood this morning, so practising today does not move it.
    days_to_share = 1 + len([d for d in weekdays if d > today.weekday()])
    share = min(_steps_up((left + today_done) / days_to_share), left + today_done)
    wanted = max(0, share - today_done)
    granted = min(wanted, voice_left)

    missed: tuple[dt.date, ...] = ()
    today_sessions: tuple[Session, ...] = ()
    if inputs.remaining_seconds < 60:
        reason = Reason.MINUTES_USED_UP
    elif left == 0:
        reason = Reason.WEEK_DONE
        extra = SessionKind.REVIEW if inputs.words_due >= MIN_REVIEW_WORDS else SessionKind.FREE
        topic = None if extra is SessionKind.REVIEW or not inputs.topics else inputs.topics[0]
        if voice_left >= MINUTES_STEP:
            today_sessions = (Session(extra, MINUTES_STEP, topic),)
    elif granted < MINUTES_STEP and wanted < MINUTES_STEP:
        reason = Reason.TODAY_DONE
    else:
        if granted >= MINUTES_STEP:
            today_sessions = _sessions(inputs, targets, granted)
        usual = _steps_up(week_minutes / week_days)
        if granted > usual:
            missed = _missed(inputs, weekdays, set(practised))
        reason = (
            Reason.MISSED
            if missed
            else Reason.SHORT_OF_MINUTES
            if granted < wanted
            else Reason.ON_TRACK
        )

    return WeekPlan(
        week=monday,
        minutes=week_minutes,
        days=week_days,
        capped=target.capped,
        sessions=targets,
        topics=inputs.topics,
        cards=min(inputs.cards_due_by_end, MAX_WEEK_CARDS),
        done_minutes=done_minutes,
        done_days=len(practised),
        today=today_sessions,
        today_cards=inputs.cards_due_now,
        reason=reason,
        missed=missed,
    )


# --- What the week works on ----------------------------------------------------------------------


def _rank(level: str) -> int:
    return STARTING_LEVELS.index(level) if level in STARTING_LEVELS else 0


def choose_topics(
    states: Sequence[TopicState], *, level: str, target: str | None, count: int
) -> tuple[str, ...]:
    """The week's grammar topics, in order: the weakest at the learner's level first (those
    they get wrong, then those barely used, then one slipping back), then the ones of their
    level not used yet. Topics below their level count as known until a report shows
    otherwise. With a goal above their level (a level or an exam), the last place goes to a
    topic of the goal's level, so the week moves towards it."""
    # A beginner's topics are the first level's.
    own = max(_rank(level), _rank("A1"))
    aim = max(own, _rank(target)) if target else own

    def key(state: TopicState) -> tuple[int, float]:
        mastery = state.mastery
        if mastery.state is Mastery.PRACTISING:
            return (0, mastery.accuracy)
        if mastery.state is Mastery.INTRODUCED:
            return (1, 0.0)
        if mastery.state is Mastery.MOSTLY_CORRECT and mastery.trend is Trend.SLIPPING:
            return (2, mastery.accuracy)
        if mastery.state is Mastery.NOT_STARTED:
            return (3, 0.0) if _rank(state.topic.level) == own else (5, 0.0)
        return (4, mastery.accuracy)

    open_topics = [s for s in states if s.mastery.state is not Mastery.MASTERED]
    # Sorting is stable: of two as weak, the map's order (the more basic first).
    mine = sorted((s for s in open_topics if _rank(s.topic.level) <= own), key=key)
    ahead = [s for s in open_topics if own < _rank(s.topic.level) <= aim]
    chosen = [s.topic.id for s in mine[:count]]
    if ahead and not any(_rank(s.topic.level) > own for s in mine[:count]):
        chosen = [*chosen[: count - 1], ahead[0].topic.id]
    return tuple(chosen)


def choose_scenario(
    scenarios: Sequence[Scenario], *, level: str, played: Sequence[str]
) -> str | None:
    """The role-play to plan: one not played yet, at the learner's level before easier ones;
    once all were played, the one played longest ago. `played` is newest first. None when
    none fits the level."""
    own = _rank(level)
    fitting = [s for s in scenarios if _rank(s.level) <= own]
    fresh = [s for s in fitting if s.id not in played]
    if fresh:
        return min(fresh, key=lambda s: own - _rank(s.level)).id
    if not fitting:
        return None
    ids = {s.id for s in fitting}
    return next(scenario for scenario in reversed(played) if scenario in ids)


# --- The service -------------------------------------------------------------------------------

# A week's topics: three when there is time for them, two in a short week.
TOPICS = 3
SHORT_WEEK_TOPICS = 2
SHORT_WEEK_MINUTES = 30
# The reasons for learning that make real-life situations the point.
_LIFE_REASONS = frozenset({"living_abroad", "work", "travel", "study"})


def habit_of(profile: Profile, language: str) -> Habit:
    """The learner's weekly habit, or the default one when they set none."""
    stored: dict[str, Any] | None = profile.value(language, WEEKLY_HABIT)
    return Habit(stored["days"], stored["minutes"]) if stored else DEFAULT_HABIT


def upcoming_exam(profile: Profile, language: str, today: dt.date) -> dict[str, Any] | None:
    """The exam the learner named, unless its date has passed."""
    exam: dict[str, Any] | None = profile.value(language, "exam")
    if exam is None or (exam.get("date") and dt.date.fromisoformat(exam["date"]) < today):
        return None
    return exam


def lean_of(profile: Profile, language: str, today: dt.date) -> Lean:
    if upcoming_exam(profile, language, today):
        return Lean.EXAM
    goals: dict[str, Any] | None = profile.value(language, "goals")
    reasons = set(goals["reasons"]) if goals else set()
    return Lean.LIFE if reasons & _LIFE_REASONS else Lean.GENERAL


def target_level(profile: Profile, language: str, today: dt.date) -> str | None:
    """The level the goals aim at: the exam's, or else the level goal's."""
    exam = upcoming_exam(profile, language, today)
    if exam and exam.get("target_level"):
        level: str = exam["target_level"]
        return level
    goal: dict[str, Any] | None = profile.value(language, LEVEL_GOAL)
    return goal["level"] if goal else None


def _monday(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


def _so_far(
    days: Sequence[DayActivity], held: Sequence[Conversation], monday: dt.date, reviewed: int
) -> WeekSoFar:
    role_plays = sum(1 for c in held if c.scenario)
    reviews = sum(1 for c in held if c.review and not c.scenario)
    return WeekSoFar(
        days=tuple(day for day in days if monday <= day.day < monday + _WEEK),
        free=len(held) - role_plays - reviews,
        role_plays=role_plays,
        reviews=reviews,
        cards_reviewed=reviewed,
    )


class DirectorService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        onboarding: OnboardingService,
        conversations: ConversationService,
        cards: CardService,
        grammar: GrammarMapService,
        allowance: Callable[[UUID], Allowance],
        call_seconds: int,
        clock: Callable[[], dt.datetime],
    ) -> None:
        """`allowance` reads a learner's voice minutes this week; `call_seconds` is the longest
        practice call."""
        self._profiles = profiles
        self._onboarding = onboarding
        self._conversations = conversations
        self._cards = cards
        self._grammar = grammar
        self._allowance = allowance
        self._call_minutes = max(MINUTES_STEP, call_seconds // 60)
        self._clock = clock

    def week(self, user_id: UUID, timezone: str | None) -> WeekPlan:
        """This week's plan as it stands now. `timezone` is the device's: the week and its days
        follow the learner's calendar."""
        now = self._clock()
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        days = self._conversations.days(user_id, timezone, now)
        today = days.today
        monday = _monday(today)
        level = profile.level(language) or "A0"
        # Cards come due and are reviewed by the moment, so their week is the voice minutes'.
        voice_week = week_start(now)
        due = self._cards.due_ahead(user_id, voice_week + _WEEK)
        allowance = self._allowance(user_id)
        scenarios = pack.scenarios if pack else ()
        played = [
            c.scenario
            for c in self._conversations.listed(user_id, limit=PAGE_MAX).conversations
            if c.scenario
        ]
        plan = plan_week(
            WeekInputs(
                today=today,
                habit=habit_of(profile, language),
                weekly_seconds=allowance.weekly_seconds,
                remaining_seconds=allowance.remaining_seconds,
                call_minutes=self._call_minutes,
                lean=lean_of(profile, language, today),
                topics=self._topics(user_id, profile, language, monday),
                words_due=due.words_by_then,
                cards_due_now=due.now,
                cards_due_by_end=due.by_then,
                role_plays=choose_scenario(scenarios, level=level, played=played) is not None,
                so_far=_so_far(
                    days.days,
                    self._conversations.week(user_id, timezone, monday),
                    monday,
                    self._cards.reviews_since(user_id, voice_week),
                ),
                started=self.started(user_id),
            )
        )
        return replace(plan, today=_with_scenarios(plan.today, scenarios, level, played))

    def topic_for_call(self, user_id: UUID, today: dt.date) -> str | None:
        """The topic of the week a call puts first: the topics take turns, in their order, over
        the week's conversations (review conversations practise words instead). `today` is the
        learner's date; the week's conversations are counted by UTC days, near enough to tell
        whose turn it is."""
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        monday = _monday(today)
        topics = self._topics(user_id, profile, language, monday)
        if not topics:
            return None
        held = self._conversations.week(user_id, None, monday)
        return topics[sum(1 for c in held if c.scenario or not c.review) % len(topics)]

    def started(self, user_id: UUID) -> dt.date | None:
        """The day the learner entered the app (in UTC, near enough for a week's first day)."""
        completed = self._onboarding.completed_at(user_id)
        return completed.date() if completed else None

    def topics(self, user_id: UUID, monday: dt.date) -> tuple[str, ...]:
        """The topics of the week from `monday`."""
        profile = self._profiles.get(user_id)
        return self._topics(user_id, profile, profile.target_language or "", monday)

    def _topics(
        self, user_id: UUID, profile: Profile, language: str, monday: dt.date
    ) -> tuple[str, ...]:
        """The week's topics, from the grammar map as it stood when the week began (in UTC):
        reports that come in during the week do not change them."""
        began = dt.datetime(monday.year, monday.month, monday.day, tzinfo=dt.UTC)
        habit = habit_of(profile, language)
        return choose_topics(
            self._grammar.states(user_id, before=began),
            level=profile.level(language) or "A0",
            target=target_level(profile, language, monday),
            count=SHORT_WEEK_TOPICS if habit.minutes < SHORT_WEEK_MINUTES else TOPICS,
        )


def _with_scenarios(
    sessions: tuple[Session, ...], scenarios: Sequence[Scenario], level: str, played: list[str]
) -> tuple[Session, ...]:
    """Today's role-plays, each with its situation: two in a day are two different ones."""
    chosen: list[Session] = []
    for session in sessions:
        if session.kind is SessionKind.ROLE_PLAY:
            scenario = choose_scenario(scenarios, level=level, played=played)
            if scenario is not None:
                played = [scenario, *played]
            session = replace(session, scenario=scenario)
        chosen.append(session)
    return tuple(chosen)
