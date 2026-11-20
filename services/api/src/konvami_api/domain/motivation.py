"""Motivation that respects the learner (spec §6.15, §14.3, §16.3): a streak life cannot break,
the next level coming into view, three small speaking quests a week, milestones with their dates,
a moment to celebrate each, a Monday recap and a welcome back after a quiet week.

What is left out on purpose: points, leagues, hearts, currencies, a paid repair and anything that
counts a loss. Every number here is worked out from what the learner did (conversations, pen-pal
replies, pronunciation drills, "Say it better" tries); nothing is estimated. The design note is
`docs/superpowers/specs/2026-11-20-motivation-design.md`.

The streak counts the days the learner spoke. A day the plan left free never breaks it, nor does
today while it is still open. A planned day that went by without speaking can be repaired once a
week by speaking within the two days after it; past that, the streak starts again, quietly.
"""

import datetime as dt
from collections.abc import Callable, Iterable, Mapping, Sequence, Set
from dataclasses import dataclass, replace
from enum import StrEnum
from itertools import pairwise
from typing import Literal, Protocol
from uuid import UUID

from konvami_api.domain.catalog import STARTING_LEVELS
from konvami_api.domain.conversations import (
    Conversation,
    ConversationQuery,
    ConversationService,
    zone_of,
)
from konvami_api.domain.levels import AGREEING, EVIDENCE, LevelFit, LevelPoint, leaning
from konvami_api.domain.profile import Source

# How many days after a missed planned day speaking still repairs it, and how often a week.
REPAIR_WINDOW_DAYS = 2
REPAIRS_PER_WEEK = 1
# How far back the streak is worked out: more than a year of practice.
STREAK_HISTORY = dt.timedelta(days=400)
# A conversation this long counts for the "long conversation" quest (a practice call lasts ten).
LONG_CALL_SECONDS = 8 * 60
# A partner not talked to for this long is one to catch up with.
QUIET_PARTNER = dt.timedelta(days=14)
# After this many days without speaking, Today welcomes the learner back.
WELCOME_BACK_DAYS = 7
# The Monday recap stays on Today until Wednesday (or until the learner closes it).
RECAP_LAST_WEEKDAY = 2
# How many kinds of mistake the recap names as improved.
RECAP_IMPROVED = 3
# Reminders can be paused for this long with one tap.
PAUSE_DAYS = 30
# A learner who joined longer ago than this before milestones were dated gets the ones already
# reached written down quietly, with no celebration: they are not new.
BACKFILL_AFTER = dt.timedelta(days=1)
QUESTS_PER_WEEK = 3

_DAY = dt.timedelta(days=1)
_WEEK = dt.timedelta(days=7)
_MINUTE = 60


def _monday(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


# --- The streak ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class RepairOffer:
    """A planned day that went by without speaking, which speaking today still repairs."""

    missed: dt.date
    # The last day speaking repairs it.
    until: dt.date


@dataclass(frozen=True)
class Streak:
    # The days the learner spoke in the current run; 0 before the first and after a break.
    days: int
    longest: int
    planned_today: bool
    spoke_today: bool
    repair: RepairOffer | None
    # The days a missed planned day was repaired on, the oldest first.
    repaired: tuple[dt.date, ...]


def speaking_streak(
    spoken: Set[dt.date],
    planned_weekdays: Sequence[int],
    today: dt.date,
    started: dt.date | None = None,
) -> Streak:
    """The streak from the days the learner spoke on. `planned_weekdays` are the weekdays
    (Monday 0) of their weekly habit; `started` the day they joined, before which no day was
    planned."""
    planned_today = today.weekday() in planned_weekdays
    days = sorted(day for day in spoken if day <= today)
    if not days:
        return Streak(0, 0, planned_today, False, None, ())
    run = longest = 0
    pending: dt.date | None = None
    # Repairs made per week (its Monday).
    used: dict[dt.date, int] = {}
    repaired: list[dt.date] = []
    day = days[0]
    while day <= today:
        if pending is not None and (day - pending).days > REPAIR_WINDOW_DAYS:
            # The window closed without a repair: the run ends quietly.
            run, pending = 0, None
        planned = day.weekday() in planned_weekdays and (started is None or day >= started)
        if day in spoken:
            if pending is not None and used.get(_monday(day), 0) < REPAIRS_PER_WEEK:
                used[_monday(day)] = used.get(_monday(day), 0) + 1
                repaired.append(day)
                pending = None
            run += 1
            longest = max(longest, run)
        elif day < today and planned and run > 0:
            if pending is not None:
                # A second planned day missed before the first was repaired.
                run, pending = 0, None
            else:
                pending = day
        day += _DAY
    spoke_today = today in spoken
    offer = None
    if (
        pending is not None
        and run > 0
        and not spoke_today
        and used.get(_monday(today), 0) < REPAIRS_PER_WEEK
        and (today - pending).days <= REPAIR_WINDOW_DAYS
    ):
        offer = RepairOffer(pending, pending + dt.timedelta(days=REPAIR_WINDOW_DAYS))
    return Streak(run, longest, planned_today, spoke_today, offer, tuple(repaired))


# --- The next level ------------------------------------------------------------------------------


@dataclass(frozen=True)
class LevelOutlook:
    """How close the next level is: of the last conversations the level engine counted (at most
    `needed`), how many point up. The level moves when `agreeing` of `needed` do and none
    points down (`levels.py`)."""

    level: str
    next: str
    pointing: int
    counted: int
    needed: int = EVIDENCE
    agreeing: int = AGREEING


def level_outlook(level: str, fits_newest_first: Iterable[LevelFit]) -> LevelOutlook | None:
    """The outlook from the level fits since the level was set, the newest first; None at the
    top, or while no conversation points up (a level going down is never announced ahead)."""
    if level not in STARTING_LEVELS or level == STARTING_LEVELS[-1]:
        return None
    leanings = [found for fit in fits_newest_first if (found := leaning(fit)) is not None]
    recent = leanings[:EVIDENCE]
    pointing = recent.count(1)
    if pointing == 0:
        return None
    following = STARTING_LEVELS[STARTING_LEVELS.index(level) + 1]
    return LevelOutlook(level, following, pointing, len(recent))


def level_ups(history: Sequence[LevelPoint]) -> int:
    """How often the level engine moved the level up."""
    return sum(
        1
        for before, after in pairwise(history)
        if after.source is Source.MEASURED
        and STARTING_LEVELS.index(after.level) > STARTING_LEVELS.index(before.level)
    )


# --- Speaking outside conversations ---------------------------------------------------------------


EventKind = Literal["pen_pal_reply", "drill", "retry"]


@dataclass(frozen=True)
class SpeakingEvent:
    kind: EventKind
    at: dt.datetime
    # For a "Say it better" try: whether it was right; True for the other kinds.
    right: bool = True


# --- Quests --------------------------------------------------------------------------------------


class QuestKind(StrEnum):
    # Speak on a number of days this week.
    TALK_DAYS = "talk_days"
    LONG_CALL = "long_call"
    REVIEW_CALL = "review_call"
    ROLE_PLAY_GOAL = "role_play_goal"
    SAY_IT_BETTER = "say_it_better"
    USE_WORD = "use_word"
    PEN_PAL = "pen_pal"
    QUIET_PARTNER = "quiet_partner"
    SOUND_DRILLS = "sound_drills"


# How many of each a quest asks for (`TALK_DAYS` follows the habit).
_TARGET = {
    QuestKind.LONG_CALL: 1,
    QuestKind.REVIEW_CALL: 1,
    QuestKind.ROLE_PLAY_GOAL: 1,
    QuestKind.SAY_IT_BETTER: 2,
    QuestKind.USE_WORD: 1,
    QuestKind.PEN_PAL: 1,
    QuestKind.QUIET_PARTNER: 1,
    QuestKind.SOUND_DRILLS: 3,
}
TALK_DAYS_MAX = 3


@dataclass(frozen=True)
class QuestContext:
    """What a week's quests can be chosen from."""

    habit_days: int
    plan_review: bool
    plan_role_play: bool
    # Confirmed corrections in recent reports, to say better.
    corrections: bool
    # Saved words a conversation's plan can bring.
    words_due: bool
    pen_pal: bool
    # A partner not talked to for two weeks, among two or more.
    quiet_partner: bool


@dataclass(frozen=True)
class QuestPick:
    kind: QuestKind
    target: int


def choose_quests(context: QuestContext, week: dt.date) -> tuple[QuestPick, ...]:
    """The week's three quests: one from the plan, one from the learner's own material, one that
    always fits, each group taking turns week by week; a group with nothing to offer leaves its
    place to the next. The same week always gives the same quests."""
    turn = week.isocalendar().week
    plan = [
        kind
        for kind, fits in (
            (QuestKind.REVIEW_CALL, context.plan_review),
            (QuestKind.ROLE_PLAY_GOAL, context.plan_role_play),
        )
        if fits
    ]
    personal = [
        kind
        for kind, fits in (
            (QuestKind.SAY_IT_BETTER, context.corrections),
            (QuestKind.USE_WORD, context.words_due),
            (QuestKind.PEN_PAL, context.pen_pal),
            (QuestKind.QUIET_PARTNER, context.quiet_partner),
        )
        if fits
    ]
    always = [QuestKind.TALK_DAYS, QuestKind.SOUND_DRILLS, QuestKind.LONG_CALL]
    chosen: list[QuestKind] = []
    for group in (plan, personal, always):
        if group:
            chosen.append(group[turn % len(group)])
    rest = [kind for group in (plan, personal, always) for kind in _turned(group, turn)]
    for kind in rest:
        if len(chosen) >= QUESTS_PER_WEEK:
            break
        if kind not in chosen:
            chosen.append(kind)
    return tuple(QuestPick(kind, _target(kind, context.habit_days)) for kind in chosen)


def _turned(group: Sequence[QuestKind], turn: int) -> list[QuestKind]:
    if not group:
        return []
    start = turn % len(group)
    return [*group[start:], *group[:start]]


def _target(kind: QuestKind, habit_days: int) -> int:
    if kind is QuestKind.TALK_DAYS:
        return max(1, min(habit_days, TALK_DAYS_MAX))
    return _TARGET[kind]


@dataclass(frozen=True)
class WeekFacts:
    """What the learner did in one week, Monday to Sunday on their calendar."""

    conversations: tuple[Conversation, ...]
    speaking_days: frozenset[dt.date]
    events: tuple[SpeakingEvent, ...]
    # Conversations of the week in which the learner used a word their plan brought.
    word_calls: int
    # Conversations of the week with a partner they had not talked to for two weeks.
    quiet_partner_calls: int


def quest_progress(kind: QuestKind, facts: WeekFacts) -> int:
    counted = [c for c in facts.conversations if c.counts]
    match kind:
        case QuestKind.TALK_DAYS:
            return len(facts.speaking_days)
        case QuestKind.LONG_CALL:
            return sum(1 for c in counted if c.seconds >= LONG_CALL_SECONDS)
        case QuestKind.REVIEW_CALL:
            return sum(1 for c in counted if c.review)
        case QuestKind.ROLE_PLAY_GOAL:
            return sum(1 for c in counted if c.scenario and c.goals_reached)
        case QuestKind.SAY_IT_BETTER:
            return sum(1 for e in facts.events if e.kind == "retry" and e.right)
        case QuestKind.USE_WORD:
            return facts.word_calls
        case QuestKind.PEN_PAL:
            return sum(1 for e in facts.events if e.kind == "pen_pal_reply")
        case QuestKind.QUIET_PARTNER:
            return facts.quiet_partner_calls
        case QuestKind.SOUND_DRILLS:
            return sum(1 for e in facts.events if e.kind == "drill")


@dataclass(frozen=True)
class StoredQuest:
    kind: QuestKind
    target: int
    done_at: dt.datetime | None = None
    celebrated_at: dt.datetime | None = None


@dataclass(frozen=True)
class Quest:
    kind: QuestKind
    target: int
    # Never beyond the target.
    progress: int
    done_at: dt.datetime | None

    @property
    def done(self) -> bool:
        return self.done_at is not None


@dataclass(frozen=True)
class QuestWeek:
    week: dt.date
    quests: tuple[Quest, ...]

    @property
    def all_done(self) -> bool:
        return bool(self.quests) and all(quest.done for quest in self.quests)


# --- Milestones ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class MilestoneNumbers:
    conversations: int
    seconds: int
    longest_seconds: int
    longest_streak_days: int
    most_words: int
    cards: int
    reviews: int
    quest_weeks: int = 0
    repairs: int = 0
    level_ups: int = 0


@dataclass(frozen=True)
class Milestone:
    id: str
    # How far the learner is, never beyond the target, in the milestone's own unit.
    current: int
    target: int
    # When it was first reached; None before, and for one reached before milestones were dated.
    reached_at: dt.datetime | None = None

    @property
    def reached(self) -> bool:
        return self.current >= self.target


def milestones(numbers: MilestoneNumbers) -> tuple[Milestone, ...]:
    """The milestones, in the order a learner usually passes them. Light on purpose (spec §6.15):
    each marks something said, kept or come back to, never tapping for its own sake."""
    marks = (
        ("first_conversation", numbers.conversations, 1),
        ("five_conversations", numbers.conversations, 5),
        # Minutes of one conversation; a practice conversation lasts ten at most.
        ("long_conversation", numbers.longest_seconds // _MINUTE, 8),
        ("first_quest_week", numbers.quest_weeks, 1),
        ("hour_of_talking", numbers.seconds // _MINUTE, 60),
        ("week_streak", numbers.longest_streak_days, 7),
        ("streak_repaired", numbers.repairs, 1),
        # Words the learner said in one conversation.
        ("hundred_words", numbers.most_words, 100),
        ("first_card", numbers.cards, 1),
        ("level_up", numbers.level_ups, 1),
        ("fifty_reviews", numbers.reviews, 50),
        ("month_streak", numbers.longest_streak_days, 30),
    )
    return tuple(Milestone(name, min(value, target), target) for name, value, target in marks)


@dataclass(frozen=True)
class Reached:
    at: dt.datetime
    # Written down when milestones were first dated, not reached then: no date, no celebration.
    backfilled: bool
    celebrated_at: dt.datetime | None = None


# --- Celebrations, recap, welcome back -----------------------------------------------------------


@dataclass(frozen=True)
class Celebration:
    kind: Literal["quest", "milestone"]
    # The quest's kind or the milestone's id.
    id: str
    at: dt.datetime


@dataclass(frozen=True)
class Recap:
    """Last week, on Monday (spec §6.15 weekly recap): what the learner did and what got better."""

    week: dt.date
    minutes: int
    conversations: int
    speaking_days: int
    quests_done: int
    quests_total: int
    # Milestones first reached last week.
    milestones: tuple[str, ...]
    # Kinds of mistake that came up less than the week before.
    improved: tuple[str, ...]


@dataclass(frozen=True)
class WelcomeBack:
    days: int
    # The partner talked to last; None without one.
    partner_id: UUID | None
    # What that partner remembers to ask about, in the explanation language (shown in the app
    # only, never in a push); None without one.
    question: str | None = None


def improved_kinds(
    counts: Mapping[str, Mapping[dt.date, int]], last_week: dt.date
) -> tuple[str, ...]:
    """The kinds of mistake that came up less last week than the week before, the biggest drop
    first."""
    before = last_week - _WEEK
    drops = [
        (per_week.get(before, 0) - per_week.get(last_week, 0), kind)
        for kind, per_week in counts.items()
        if per_week.get(before, 0) > per_week.get(last_week, 0)
    ]
    return tuple(kind for _, kind in sorted(drops, key=lambda d: (-d[0], d[1]))[:RECAP_IMPROVED])


@dataclass(frozen=True)
class MotivationView:
    today: dt.date
    streak: Streak
    outlook: LevelOutlook | None
    quests: QuestWeek
    milestones: tuple[Milestone, ...]
    # Moments not celebrated yet, the oldest first: the app shows one at a time.
    celebrations: tuple[Celebration, ...]
    # Monday's fresh start: a new week, a new plan.
    fresh_start: bool
    recap: Recap | None
    welcome_back: WelcomeBack | None
    reminders_paused_until: dt.datetime | None


# --- Storage -------------------------------------------------------------------------------------


class MotivationRepository(Protocol):
    def speaking_events(self, user_id: UUID, since: dt.datetime) -> list[SpeakingEvent]:
        """The learner's pen-pal replies, pronunciation drills and "Say it better" tries since
        `since`, the oldest first."""

    def quests(self, user_id: UUID, week: dt.date) -> list[StoredQuest]: ...

    def choose(
        self, user_id: UUID, week: dt.date, picks: Sequence[QuestPick], at: dt.datetime
    ) -> None:
        """Keeps the week's quests, unless it has some already (two devices at once)."""

    def quest_done(self, user_id: UUID, week: dt.date, kind: str, at: dt.datetime) -> None: ...

    def completed_weeks(self, user_id: UUID) -> int:
        """The weeks all of whose quests were done."""

    def reached(self, user_id: UUID) -> dict[str, Reached]: ...

    def reach(self, user_id: UUID, ids: Sequence[str], at: dt.datetime, backfilled: bool) -> None:
        """Writes down milestones first reached at `at`; one already written stays as it is."""

    def celebrated(self, user_id: UUID, kind: str, key: str, at: dt.datetime) -> bool:
        """Marks a quest of the current week (`key` its kind) or a milestone as celebrated;
        False when there is no such moment."""

    def pause_reminders(self, user_id: UUID, until: dt.datetime | None) -> None: ...

    def reminders_paused_until(self, user_id: UUID) -> dt.datetime | None: ...


class MotivationError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# --- The service ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class Sources:
    """What motivation reads from the rest of the app, as plain functions, so it does not reach
    into services it has no business changing."""

    target_language: Callable[[UUID], str]
    level: Callable[[UUID], str | None]
    level_fits: Callable[[UUID], Sequence[LevelFit]]
    level_history: Callable[[UUID], Sequence[LevelPoint]]
    # The weekdays (Monday 0) of the learner's weekly habit, and the day they joined.
    planned_weekdays: Callable[[UUID], Sequence[int]]
    started: Callable[[UUID], dt.date | None]
    # Whether this week's plan asks for a review conversation and for a role-play.
    plan_kinds: Callable[[UUID, str | None], tuple[bool, bool]]
    words_due: Callable[[UUID], int]
    corrections: Callable[[UUID, str | None, dt.date], bool]
    pen_pal_enabled: Callable[[UUID], bool]
    words_used: Callable[[str], int]
    # (milestone numbers) the parts kept elsewhere: cards, reviews, the most words.
    cards: Callable[[UUID], tuple[int, int]]
    most_words: Callable[[UUID], int]
    mistakes_by_week: Callable[[UUID, str | None, dt.date], Sequence[tuple[dt.date, str, int]]]
    # What a partner remembers to ask the learner about (`motivation_sources.py`).
    follow_up: Callable[[UUID, UUID | None], str | None] = lambda _user, _partner: None


class MotivationService:
    def __init__(
        self,
        *,
        repository: MotivationRepository,
        conversations: ConversationService,
        sources: Sources,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._repository = repository
        self._conversations = conversations
        self._sources = sources
        self._clock = clock

    # The streak is read by Today and Progress as well, so it stands on its own.
    def streak(self, user_id: UUID, timezone: str | None) -> Streak:
        now = self._clock()
        return self._streak(user_id, timezone, now)[0]

    def _streak(
        self, user_id: UUID, timezone: str | None, now: dt.datetime
    ) -> tuple[Streak, set[dt.date], tuple[SpeakingEvent, ...], dt.date]:
        days = self._conversations.days(user_id, timezone, now)
        events = tuple(self._repository.speaking_events(user_id, now - STREAK_HISTORY))
        zone = zone_of(timezone)
        spoken = {day.day for day in days.days}
        spoken |= {event.at.astimezone(zone).date() for event in events}
        streak = speaking_streak(
            spoken,
            self._sources.planned_weekdays(user_id),
            days.today,
            self._sources.started(user_id),
        )
        return streak, spoken, events, days.today

    def view(self, user_id: UUID, timezone: str | None) -> MotivationView:
        now = self._clock()
        streak, spoken, events, today = self._streak(user_id, timezone, now)
        monday = _monday(today)
        quests = self._quest_week(user_id, timezone, monday, spoken, events, now)
        level = self._sources.level(user_id)
        outlook = level_outlook(level, self._sources.level_fits(user_id)) if level else None
        dated = self._date_milestones(user_id, streak, now)
        celebrations = self._celebrations(user_id, quests, dated)
        recap = self._recap(user_id, timezone, today, spoken, events, dated)
        last_spoken = max(spoken, default=None)
        welcome = None
        if last_spoken is not None and (today - last_spoken).days >= WELCOME_BACK_DAYS:
            latest = self._conversations.listed(user_id, limit=1).conversations
            partner = latest[0].persona_id if latest else None
            welcome = WelcomeBack(
                (today - last_spoken).days, partner, self._sources.follow_up(user_id, partner)
            )
        paused = self._repository.reminders_paused_until(user_id)
        return MotivationView(
            today=today,
            streak=streak,
            outlook=outlook,
            quests=quests,
            milestones=dated,
            celebrations=celebrations,
            fresh_start=today.weekday() == 0,
            recap=recap,
            welcome_back=welcome,
            reminders_paused_until=paused if paused and paused > now else None,
        )

    def milestones(self, user_id: UUID, timezone: str | None) -> tuple[Milestone, ...]:
        """The milestones with when each was reached, for Progress."""
        now = self._clock()
        streak = self._streak(user_id, timezone, now)[0]
        return self._date_milestones(user_id, streak, now)

    def celebrate(self, user_id: UUID, kind: str, key: str) -> None:
        """The app showed a moment: it is not shown again. Raises `MotivationError`."""
        if kind not in ("quest", "milestone"):
            raise MotivationError("not_found")
        if not self._repository.celebrated(user_id, kind, key, self._clock()):
            raise MotivationError("not_found")

    def pause_reminders(self, user_id: UUID, days: int | None) -> dt.datetime | None:
        """Pauses the reminders and nudges for `days` (None resumes them). Answers until when."""
        if days is not None and not 1 <= days <= PAUSE_DAYS:
            raise MotivationError("invalid_value")
        until = self._clock() + dt.timedelta(days=days) if days else None
        self._repository.pause_reminders(user_id, until)
        return until

    def has_question(self, user_id: UUID, partner: UUID | None) -> bool:
        """Whether `partner` remembers something to ask the learner about. Only this yes or no
        leaves for a push; the question is shown in the app."""
        return self._sources.follow_up(user_id, partner) is not None

    def reminders_paused(self, user_id: UUID) -> bool:
        until = self._repository.reminders_paused_until(user_id)
        return until is not None and until > self._clock()

    # --- parts -----------------------------------------------------------------------------------

    def _week_facts(
        self,
        user_id: UUID,
        timezone: str | None,
        monday: dt.date,
        spoken: set[dt.date],
        events: Sequence[SpeakingEvent],
    ) -> WeekFacts:
        zone = zone_of(timezone)
        sunday = monday + dt.timedelta(days=6)
        held = tuple(self._conversations.week(user_id, timezone, monday))
        counted = [c for c in held if c.counts]
        quiet = self._quiet_partners(user_id, monday)
        return WeekFacts(
            conversations=held,
            speaking_days=frozenset(day for day in spoken if monday <= day <= sunday),
            events=tuple(e for e in events if monday <= e.at.astimezone(zone).date() <= sunday),
            word_calls=sum(1 for c in counted if self._sources.words_used(c.id) > 0),
            quiet_partner_calls=sum(1 for c in counted if c.persona_id in quiet),
        )

    def _quiet_partners(self, user_id: UUID, monday: dt.date) -> set[UUID]:
        """The partners talked to before, but not in the two weeks before `monday`, among two or
        more: catching up with one is a quest."""
        history = self._conversations.partner_history(user_id)
        if len(history) < 2:
            return set()
        start = dt.datetime.combine(monday, dt.time(), dt.UTC)
        quiet: set[UUID] = set()
        for partner in history:
            before = self._conversations.listed(
                user_id, limit=1, query=ConversationQuery(partner=partner, through=start)
            ).conversations
            if not before or start - before[0].started_at >= QUIET_PARTNER:
                quiet.add(partner)
        return quiet

    def _quest_week(
        self,
        user_id: UUID,
        timezone: str | None,
        monday: dt.date,
        spoken: set[dt.date],
        events: Sequence[SpeakingEvent],
        now: dt.datetime,
    ) -> QuestWeek:
        stored = self._repository.quests(user_id, monday)
        if not stored:
            review, role_play = self._sources.plan_kinds(user_id, timezone)
            context = QuestContext(
                habit_days=len(self._sources.planned_weekdays(user_id)),
                plan_review=review,
                plan_role_play=role_play,
                corrections=self._sources.corrections(user_id, timezone, monday),
                words_due=self._sources.words_due(user_id) > 0,
                pen_pal=self._sources.pen_pal_enabled(user_id),
                quiet_partner=bool(self._quiet_partners(user_id, monday)),
            )
            self._repository.choose(user_id, monday, choose_quests(context, monday), now)
            stored = self._repository.quests(user_id, monday)
        facts = self._week_facts(user_id, timezone, monday, spoken, events)
        quests: list[Quest] = []
        for item in stored:
            progress = min(quest_progress(item.kind, facts), item.target)
            done_at = item.done_at
            if done_at is None and progress >= item.target:
                self._repository.quest_done(user_id, monday, item.kind.value, now)
                done_at = now
            quests.append(Quest(item.kind, item.target, progress, done_at))
        return QuestWeek(monday, tuple(quests))

    def _numbers(self, user_id: UUID, streak: Streak) -> MilestoneNumbers:
        now = self._clock()
        activity = self._conversations.activity(user_id, None, now)
        cards, reviews = self._sources.cards(user_id)
        return MilestoneNumbers(
            conversations=activity.conversations,
            seconds=activity.seconds,
            longest_seconds=self._conversations.longest_seconds(user_id),
            longest_streak_days=streak.longest,
            most_words=self._sources.most_words(user_id),
            cards=cards,
            reviews=reviews,
            quest_weeks=self._repository.completed_weeks(user_id),
            repairs=len(streak.repaired),
            level_ups=level_ups(self._sources.level_history(user_id)),
        )

    def _date_milestones(
        self, user_id: UUID, streak: Streak, now: dt.datetime
    ) -> tuple[Milestone, ...]:
        found = milestones(self._numbers(user_id, streak))
        known = self._repository.reached(user_id)
        new = [m.id for m in found if m.reached and m.id not in known]
        if new:
            started = self._sources.started(user_id)
            # The first time milestones are dated for a learner who joined before: the ones
            # already reached are not news.
            backfill = (
                not known
                and started is not None
                and now - dt.datetime.combine(started, dt.time(), dt.UTC) > BACKFILL_AFTER
            )
            self._repository.reach(user_id, new, now, backfill)
            known = self._repository.reached(user_id)
        return tuple(
            replace(
                m,
                reached_at=None if m.id not in known or known[m.id].backfilled else known[m.id].at,
            )
            for m in found
        )

    def _celebrations(
        self, user_id: UUID, quests: QuestWeek, dated: Sequence[Milestone]
    ) -> tuple[Celebration, ...]:
        stored = {q.kind: q for q in self._repository.quests(user_id, quests.week)}
        moments = [
            Celebration("quest", quest.kind.value, quest.done_at)
            for quest in quests.quests
            if quest.done_at is not None
            and (q := stored.get(quest.kind)) is not None
            and q.celebrated_at is None
        ]
        known = self._repository.reached(user_id)
        moments += [
            Celebration("milestone", m.id, m.reached_at)
            for m in dated
            if m.reached_at is not None
            and (r := known.get(m.id)) is not None
            and r.celebrated_at is None
        ]
        return tuple(sorted(moments, key=lambda c: (c.at, c.kind, c.id)))

    def _recap(
        self,
        user_id: UUID,
        timezone: str | None,
        today: dt.date,
        spoken: set[dt.date],
        events: Sequence[SpeakingEvent],
        dated: Sequence[Milestone],
    ) -> Recap | None:
        if today.weekday() > RECAP_LAST_WEEKDAY:
            return None
        last = _monday(today) - _WEEK
        facts = self._week_facts(user_id, timezone, last, spoken, events)
        counted = [c for c in facts.conversations if c.counts]
        stored = self._repository.quests(user_id, last)
        if not counted and not facts.speaking_days and not stored:
            return None
        zone = zone_of(timezone)
        start, end = last, last + _WEEK
        reached = tuple(
            m.id
            for m in dated
            if m.reached_at is not None and start <= m.reached_at.astimezone(zone).date() < end
        )
        counts: dict[str, dict[dt.date, int]] = {}
        for week, kind, count in self._sources.mistakes_by_week(user_id, timezone, last - _WEEK):
            counts.setdefault(kind, {})[week] = counts.get(kind, {}).get(week, 0) + count
        return Recap(
            week=last,
            minutes=sum(c.seconds for c in counted) // _MINUTE,
            conversations=len(counted),
            speaking_days=len(facts.speaking_days),
            quests_done=sum(1 for q in stored if q.done_at is not None),
            quests_total=len(stored),
            milestones=reached,
            improved=improved_kinds(counts, last),
        )
