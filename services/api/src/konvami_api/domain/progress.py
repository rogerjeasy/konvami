"""What the Progress screen shows (spec §6.15): how much a learner practised, where their level
stands, which mistakes keep coming up, how their cards are going, and the milestones they
passed. Every number is worked out from what they did in the app: their conversations, the
reports on them and their flashcards. Nothing is estimated, and a part with nothing behind it
is empty rather than filled in.
"""

import datetime as dt
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from uuid import UUID

from konvami_api.domain.cards import CardProgress, CardService
from konvami_api.domain.conversations import (
    Activity,
    ActivityDays,
    ConversationService,
    summarise,
)
from konvami_api.domain.home import LevelView, level_view
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import ReportService, WeekMistakes

# How many weeks of practice the chart shows, and how many weeks of mistakes.
WEEKS_OF_ACTIVITY = 8
WEEKS_OF_MISTAKES = 6
# How many kinds of mistake are shown: the ones that came up most.
TOP_MISTAKES = 6
# "Lately", for the share of the talking and for how many cards were remembered.
RECENT = dt.timedelta(days=30)

_WEEK = dt.timedelta(days=7)
_DAY = dt.timedelta(days=1)
_MINUTE = 60


@dataclass(frozen=True)
class WeekActivity:
    # The week's Monday, on the learner's calendar.
    start: dt.date
    seconds: int
    conversations: int


@dataclass(frozen=True)
class MistakeTrend:
    category: str
    # How often it came up in each of the weeks shown, the oldest first.
    counts: tuple[int, ...]


@dataclass(frozen=True)
class Milestone:
    id: str
    # How far the learner is, never beyond the target, in the milestone's own unit.
    current: int
    target: int

    @property
    def reached(self) -> bool:
        return self.current >= self.target


@dataclass(frozen=True)
class TalkShare:
    """Words said in the learner's recent conversations, by them and by their partners."""

    learner_words: int
    partner_words: int


@dataclass(frozen=True)
class ProgressView:
    language: str
    level: LevelView | None
    activity: Activity
    # The last `WEEKS_OF_ACTIVITY` weeks, the oldest first.
    weeks: tuple[WeekActivity, ...]
    longest_streak_days: int
    # None until a recent conversation has a report.
    talk: TalkShare | None
    # The Mondays of the weeks the mistakes are counted in, the oldest first.
    mistake_weeks: tuple[dt.date, ...]
    mistakes: tuple[MistakeTrend, ...]
    cards: CardProgress
    milestones: tuple[Milestone, ...]


def _monday(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


def week_starts(today: dt.date, weeks: int) -> tuple[dt.date, ...]:
    """The Mondays of the last `weeks` weeks, the oldest first, ending with this week's."""
    this_week = _monday(today)
    return tuple(this_week - _WEEK * back for back in reversed(range(weeks)))


def weekly(activity: ActivityDays, weeks: int) -> tuple[WeekActivity, ...]:
    """Practice per week, Monday to Sunday, for the last `weeks` weeks, the oldest first."""
    totals: dict[dt.date, tuple[int, int]] = {}
    for day in activity.days:
        seconds, conversations = totals.get(_monday(day.day), (0, 0))
        totals[_monday(day.day)] = (seconds + day.seconds, conversations + day.conversations)
    return tuple(
        WeekActivity(start, *totals.get(start, (0, 0)))
        for start in week_starts(activity.today, weeks)
    )


def longest_streak(activity: ActivityDays) -> int:
    """The most days in a row the learner ever practised."""
    practised = {day.day for day in activity.days}
    longest = 0
    for day in practised:
        # Count each run once, from its first day.
        if day - _DAY in practised:
            continue
        length = 1
        while day + _DAY * length in practised:
            length += 1
        longest = max(longest, length)
    return longest


def mistake_trends(
    weeks: Sequence[dt.date], found: Sequence[WeekMistakes], *, top: int
) -> tuple[MistakeTrend, ...]:
    """The kinds of mistake that came up most in the weeks shown, the most frequent first, each
    with how often per week."""
    place = {week: index for index, week in enumerate(weeks)}
    counts: dict[str, list[int]] = {}
    for item in found:
        if item.week in place:
            counts.setdefault(item.category, [0] * len(weeks))[place[item.week]] += item.count
    # Most frequent first; kinds that came up equally often by name, so the order is stable.
    ranked = sorted(counts.items(), key=lambda kind: (-sum(kind[1]), kind[0]))
    return tuple(MistakeTrend(category, tuple(per_week)) for category, per_week in ranked[:top])


def milestones(
    *,
    conversations: int,
    seconds: int,
    longest_seconds: int,
    longest_streak_days: int,
    most_words: int,
    cards: int,
    reviews: int,
) -> tuple[Milestone, ...]:
    """The milestones, in the order a learner usually passes them. Light on purpose (spec §6.15):
    each marks something said, kept or come back to, never tapping for its own sake."""
    marks = (
        ("first_conversation", conversations, 1),
        ("five_conversations", conversations, 5),
        # Minutes of one conversation; a practice conversation lasts ten at most.
        ("long_conversation", longest_seconds // _MINUTE, 8),
        # Minutes of talking in all.
        ("hour_of_talking", seconds // _MINUTE, 60),
        ("week_streak", longest_streak_days, 7),
        # Words the learner said in one conversation.
        ("hundred_words", most_words, 100),
        ("first_card", cards, 1),
        ("fifty_reviews", reviews, 50),
    )
    return tuple(Milestone(name, min(value, target), target) for name, value, target in marks)


class ProgressService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        onboarding: OnboardingService,
        placement: PlacementService,
        conversations: ConversationService,
        reports: ReportService,
        cards: CardService,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._onboarding = onboarding
        self._placement = placement
        self._conversations = conversations
        self._reports = reports
        self._cards = cards
        self._clock = clock

    def view(self, user_id: UUID, timezone: str | None) -> ProgressView:
        """`timezone` is the device's: days and weeks follow the learner's calendar."""
        if self._onboarding.status(user_id).stage is not Stage.DONE:
            raise OnboardingError("wrong_stage")
        now = self._clock()
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        result = self._placement.view(user_id).result
        days = self._conversations.days(user_id, timezone, now)
        activity = summarise(days)
        streak = longest_streak(days)
        mistake_weeks = week_starts(days.today, WEEKS_OF_MISTAKES)
        found = self._reports.mistakes_by_week(user_id, timezone, mistake_weeks[0])
        words = self._reports.totals(user_id, now - RECENT)
        cards = self._cards.progress(user_id, now - RECENT)
        said = words.learner_words + words.partner_words
        return ProgressView(
            language=language,
            level=level_view(profile, language, result.levels if result else None),
            activity=activity,
            weeks=weekly(days, WEEKS_OF_ACTIVITY),
            longest_streak_days=streak,
            talk=TalkShare(words.learner_words, words.partner_words) if said else None,
            mistake_weeks=mistake_weeks,
            mistakes=mistake_trends(mistake_weeks, found, top=TOP_MISTAKES),
            cards=cards,
            milestones=milestones(
                conversations=activity.conversations,
                seconds=activity.seconds,
                longest_seconds=self._conversations.longest_seconds(user_id),
                longest_streak_days=streak,
                most_words=words.most_words,
                cards=cards.total,
                reviews=cards.reviews_ever,
            ),
        )
