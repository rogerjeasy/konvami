from datetime import date, datetime, timedelta

import pytest

from konvami_api.domain.cards import CardProgress
from konvami_api.domain.conversations import ActivityDays, DayActivity
from konvami_api.domain.live_call import Turn
from konvami_api.domain.onboarding import OnboardingError
from konvami_api.domain.progress import (
    WEEKS_OF_ACTIVITY,
    WEEKS_OF_MISTAKES,
    Milestone,
    MistakeTrend,
    TalkShare,
    WeekActivity,
    longest_streak,
    milestones,
    mistake_trends,
    weekly,
)
from konvami_api.domain.reports import Mistake, Stats, WeekMistakes, Word
from tests.world import LEVELS, NOON, OTHER_USER, USER, World

# A Friday; its week runs from Monday 5 to Sunday 11 October 2026.
FRIDAY = date(2026, 10, 9)
MONDAY = date(2026, 10, 5)
WEEK = timedelta(days=7)


def days(*talked: tuple[date, int]) -> ActivityDays:
    """The days a learner practised on, with the seconds of each, as storage hands them out."""
    newest_first = sorted(talked, reverse=True)
    return ActivityDays(
        FRIDAY, tuple(DayActivity(day, seconds, 1) for day, seconds in newest_first)
    )


# --- Weeks ---------------------------------------------------------------------------------------


def test_practice_is_added_up_per_week_ending_with_this_one() -> None:
    activity = days(
        (FRIDAY, 600),
        (MONDAY, 300),
        # The Sunday before: last week.
        (MONDAY - timedelta(days=1), 900),
        (MONDAY - 2 * WEEK, 120),
        # Longer ago than is shown.
        (MONDAY - 5 * WEEK, 999),
    )

    weeks = weekly(activity, 4)

    assert weeks == (
        WeekActivity(MONDAY - 3 * WEEK, 0, 0),
        WeekActivity(MONDAY - 2 * WEEK, 120, 1),
        WeekActivity(MONDAY - WEEK, 900, 1),
        WeekActivity(MONDAY, 900, 2),
    )


def test_someone_who_never_talked_has_empty_weeks() -> None:
    assert weekly(days(), 2) == (WeekActivity(MONDAY - WEEK, 0, 0), WeekActivity(MONDAY, 0, 0))


def test_the_longest_streak_is_the_longest_run_of_days_ever() -> None:
    run_of_four = [(date(2026, 9, day), 60) for day in (1, 2, 3, 4)]
    run_of_two = [(FRIDAY, 60), (FRIDAY - timedelta(days=1), 60)]

    assert longest_streak(days(*run_of_four, (date(2026, 9, 20), 60), *run_of_two)) == 4
    assert longest_streak(days((FRIDAY, 60))) == 1
    assert longest_streak(days()) == 0


# --- Mistakes ------------------------------------------------------------------------------------

WEEKS = (MONDAY - 2 * WEEK, MONDAY - WEEK, MONDAY)


def test_mistakes_are_shown_per_kind_and_week_the_most_frequent_kind_first() -> None:
    found = [
        WeekMistakes(MONDAY, "case_dative", 2),
        WeekMistakes(MONDAY - 2 * WEEK, "case_dative", 4),
        WeekMistakes(MONDAY - WEEK, "word_order_v2", 1),
        WeekMistakes(MONDAY, "perfekt_auxiliary", 3),
        WeekMistakes(MONDAY - WEEK, "perfekt_auxiliary", 4),
    ]

    trends = mistake_trends(WEEKS, found, top=5)

    assert trends == (
        MistakeTrend("perfekt_auxiliary", (0, 4, 3)),
        MistakeTrend("case_dative", (4, 0, 2)),
        MistakeTrend("word_order_v2", (0, 1, 0)),
    )


def test_only_the_most_frequent_kinds_of_mistake_are_shown() -> None:
    found = [WeekMistakes(MONDAY, f"kind_{n}", n) for n in range(1, 8)]

    trends = mistake_trends(WEEKS, found, top=3)

    assert [trend.category for trend in trends] == ["kind_7", "kind_6", "kind_5"]


def test_mistakes_from_a_week_that_is_not_shown_are_left_out() -> None:
    found = [WeekMistakes(MONDAY - 9 * WEEK, "case_dative", 5), WeekMistakes(MONDAY, "negation", 1)]

    assert mistake_trends(WEEKS, found, top=5) == (MistakeTrend("negation", (0, 0, 1)),)
    assert mistake_trends(WEEKS, [], top=5) == ()


# --- Milestones ----------------------------------------------------------------------------------


def reached(**numbers: int) -> dict[str, tuple[int, int, bool]]:
    figures = {
        "conversations": 0,
        "seconds": 0,
        "longest_seconds": 0,
        "longest_streak_days": 0,
        "most_words": 0,
        "cards": 0,
        "reviews": 0,
        **numbers,
    }
    return {m.id: (m.current, m.target, m.reached) for m in milestones(**figures)}


def test_a_new_learner_has_every_milestone_ahead() -> None:
    assert reached() == {
        "first_conversation": (0, 1, False),
        "five_conversations": (0, 5, False),
        "long_conversation": (0, 8, False),
        "hour_of_talking": (0, 60, False),
        "week_streak": (0, 7, False),
        "hundred_words": (0, 100, False),
        "first_card": (0, 1, False),
        "fifty_reviews": (0, 50, False),
    }


def test_a_milestone_is_reached_at_its_target_and_never_shows_more() -> None:
    marks = reached(
        conversations=7,
        seconds=45 * 60 + 59,
        longest_seconds=8 * 60,
        longest_streak_days=3,
        most_words=260,
        cards=1,
        reviews=49,
    )

    assert marks["first_conversation"] == (1, 1, True)
    assert marks["five_conversations"] == (5, 5, True)
    # Whole minutes: eight minutes is eight minutes.
    assert marks["long_conversation"] == (8, 8, True)
    assert marks["hour_of_talking"] == (45, 60, False)
    assert marks["week_streak"] == (3, 7, False)
    assert marks["hundred_words"] == (100, 100, True)
    assert marks["first_card"] == (1, 1, True)
    assert marks["fifty_reviews"] == (49, 50, False)


def test_a_milestone_knows_whether_it_is_reached() -> None:
    assert Milestone("week_streak", 7, 7).reached is True
    assert Milestone("week_streak", 6, 7).reached is False


# --- The screen ----------------------------------------------------------------------------------

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)


def mistake(category: str, *, certain: bool = True, original: str = "mit der Bus") -> Mistake:
    return Mistake(1, original, "mit dem Bus", "…", category, "minor", certain)


def test_a_learner_who_has_not_talked_yet_has_nothing_charted() -> None:
    world = World()
    world.onboard()

    progress = world.progress.view(USER, None)

    assert progress.language == "de"
    assert progress.level is not None
    assert (progress.level.level, progress.level.skills) == ("A2", None)
    assert (progress.activity.conversations, progress.longest_streak_days) == (0, 0)
    assert len(progress.weeks) == WEEKS_OF_ACTIVITY
    assert progress.weeks[-1] == WeekActivity(MONDAY, 0, 0)
    assert progress.talk is None
    assert len(progress.mistake_weeks) == WEEKS_OF_MISTAKES
    assert progress.mistakes == ()
    assert progress.cards == CardProgress(0, 0, 0, 0, 0, 0)
    assert not [m for m in progress.milestones if m.reached]


def test_progress_shows_the_measured_level_per_skill() -> None:
    world = World()
    world.onboard(measured=True)

    level = world.progress.view(USER, None).level

    assert level is not None
    assert level.skills == LEVELS


def test_practice_is_charted_per_week_with_the_streaks_and_the_milestones_it_reached() -> None:
    world = World()
    lena, jonas = world.onboard()
    world.onboard(OTHER_USER)
    world.talk(lena, at=NOON - 12 * DAY, minutes=9)
    world.talk(lena, at=NOON - 11 * DAY, minutes=4)
    world.talk(lena, at=NOON - 10 * DAY, minutes=4)
    world.talk(jonas, at=NOON - DAY, minutes=5)
    world.talk(jonas, at=NOON - HOUR, minutes=6)
    world.talk(lena, at=NOON - HOUR, minutes=10, user=OTHER_USER)

    progress = world.progress.view(USER, None)

    assert [(week.start, week.seconds, week.conversations) for week in progress.weeks[-3:]] == [
        # The Sunday of the first run belongs to the week before the other two days.
        (MONDAY - 2 * WEEK, 9 * 60, 1),
        (MONDAY - WEEK, 8 * 60, 2),
        (MONDAY, 11 * 60, 2),
    ]
    assert (progress.activity.streak_days, progress.longest_streak_days) == (2, 3)
    assert (progress.activity.conversations, progress.activity.seconds) == (5, 28 * 60)
    marks = {m.id: (m.current, m.reached) for m in progress.milestones}
    assert marks["first_conversation"] == (1, True)
    assert marks["five_conversations"] == (5, True)
    assert marks["long_conversation"] == (8, True)
    assert marks["hour_of_talking"] == (28, False)
    assert marks["week_streak"] == (3, False)


def test_the_mistakes_that_keep_coming_up_are_counted_per_week() -> None:
    world = World()
    lena, _ = world.onboard()
    world.onboard(OTHER_USER)
    last_week = world.talk(lena, at=NOON - 7 * DAY)
    monday = world.talk(lena, at=NOON - 4 * DAY)
    today = world.talk(lena, at=NOON - HOUR)
    long_ago = world.talk(lena, at=NOON - 70 * DAY)
    theirs = world.talk(lena, at=NOON - HOUR, user=OTHER_USER)
    world.reported(last_week, mistakes=(mistake("case_dative"), mistake("case_dative")))
    world.reported(
        monday,
        mistakes=(
            mistake("case_dative"),
            mistake("word_order_v2"),
            # The second check could not confirm it: not counted.
            mistake("negation", certain=False),
        ),
    )
    world.reported(today, mistakes=(mistake("word_order_v2"), mistake("word_order_v2")))
    world.reported(long_ago, mistakes=(mistake("plural_form"),))
    world.reported(theirs, mistakes=(mistake("conjugation"),))

    progress = world.progress.view(USER, None)

    assert progress.mistake_weeks[-2:] == (MONDAY - WEEK, MONDAY)
    assert [(trend.category, trend.counts[-2:]) for trend in progress.mistakes] == [
        ("case_dative", (2, 1)),
        ("word_order_v2", (0, 3)),
    ]


def test_weeks_follow_the_learners_calendar() -> None:
    world = World()
    lena, _ = world.onboard()
    # Sunday 4 October, 23:30 in UTC: already Monday in Zurich.
    call_id = world.talk(lena, at=datetime(2026, 10, 4, 23, 30, tzinfo=NOON.tzinfo))
    world.reported(call_id, mistakes=(mistake("case_dative"),))

    zurich = world.progress.view(USER, "Europe/Zurich")
    utc = world.progress.view(USER, None)

    assert (zurich.weeks[-1].conversations, zurich.weeks[-2].conversations) == (1, 0)
    assert (utc.weeks[-1].conversations, utc.weeks[-2].conversations) == (0, 1)
    assert zurich.mistakes[0].counts[-2:] == (0, 1)
    assert utc.mistakes[0].counts[-2:] == (1, 0)


def test_the_share_of_the_talking_is_that_of_the_last_month() -> None:
    world = World()
    lena, _ = world.onboard()
    old = world.talk(lena, at=NOON - 40 * DAY)
    recent = world.talk(lena, at=NOON - 3 * DAY)
    today = world.talk(lena, at=NOON - HOUR)
    world.reported(old, stats=Stats(400, 10, 20, 150))
    world.reported(recent, stats=Stats(60, 40, 6, 20))
    world.reported(today, stats=Stats(90, 60, 8, 30))

    progress = world.progress.view(USER, None)

    assert progress.talk == TalkShare(learner_words=150, partner_words=100)
    # The most words in one conversation is counted over all time.
    marks = {m.id: m.current for m in progress.milestones}
    assert marks["hundred_words"] == 100


def test_cards_are_counted_with_how_many_were_remembered_lately() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - 50 * DAY, turns=(Turn("learner", "Hallo!"),))
    words = tuple(Word(f"das Wort{number}", "un mot", None) for number in range(4))
    world.reported(call_id, words=words)
    world.clock.now = NOON - 45 * DAY
    cards = [world.cards.save(USER, call_id, "word", index) for index in range(4)]
    # A review long ago, then three in the last month, one of them forgotten.
    world.cards.review(USER, cards[0].id, "good")
    world.clock.now = NOON - 5 * DAY
    world.cards.review(USER, cards[0].id, "good")
    world.cards.review(USER, cards[1].id, "again")
    world.clock.now = NOON
    world.cards.review(USER, cards[2].id, "easy")

    progress = world.progress.view(USER, None)

    assert progress.cards == CardProgress(
        total=4, due=2, learned=3, reviews=3, remembered=2, reviews_ever=4
    )
    marks = {m.id: (m.current, m.reached) for m in progress.milestones}
    assert marks["first_card"] == (1, True)
    assert marks["fifty_reviews"] == (4, False)


def test_there_is_no_progress_before_onboarding_is_finished() -> None:
    world = World()

    with pytest.raises(OnboardingError):
        world.progress.view(USER, None)
