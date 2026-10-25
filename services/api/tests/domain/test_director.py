import datetime as dt

import pytest

from konvami_api.domain.conversations import DayActivity
from konvami_api.domain.director import (
    ExamInputs,
    ExamPace,
    Habit,
    Lean,
    Reason,
    Session,
    SessionKind,
    WeakestPart,
    WeekInputs,
    WeekSoFar,
    choose_scenario,
    choose_topics,
    plan_week,
)
from konvami_api.domain.grammar_map import Mastery, TopicMastery, TopicState, Trend
from konvami_api.domain.grammar_topics import GERMAN_MAP
from konvami_api.domain.scenarios import GERMAN_SCENARIOS

MONDAY = dt.date(2026, 10, 19)
THURSDAY = MONDAY + dt.timedelta(days=3)
SUNDAY = MONDAY + dt.timedelta(days=6)
TOPICS = ("dative", "perfekt", "modal_verbs")
SATURDAY = MONDAY + dt.timedelta(days=5)
HOUR = 3600


def so_far(*days: tuple[dt.date, int], **counts: int) -> WeekSoFar:
    """Practice this week: (day, minutes) pairs, and the conversations of each kind."""
    return WeekSoFar(
        days=tuple(DayActivity(day, minutes * 60, 1) for day, minutes in days),
        free=counts.get("free", 0),
        role_plays=counts.get("role_plays", 0),
        reviews=counts.get("reviews", 0),
        cards_reviewed=counts.get("cards", 0),
        simulations=counts.get("simulations", 0),
    )


def inputs(**changes: object) -> WeekInputs:
    base = WeekInputs(
        today=MONDAY,
        habit=Habit(days=4, minutes=40),
        weekly_seconds=HOUR,
        remaining_seconds=HOUR,
        call_minutes=10,
        lean=Lean.GENERAL,
        topics=TOPICS,
        words_due=8,
        cards_due_now=5,
        cards_due_by_end=12,
        role_plays=True,
        so_far=so_far(),
        started=None,
    )
    return base.__class__(**{**base.__dict__, **changes})


# --- The week ----------------------------------------------------------------------------------


def test_a_week_is_the_habit_in_calls_of_at_most_ten_minutes() -> None:
    plan = plan_week(inputs())

    assert plan.week == MONDAY
    assert (plan.minutes, plan.days) == (40, 4)
    assert plan.sessions == {
        SessionKind.EXAM: 0,
        SessionKind.REVIEW: 1,
        SessionKind.ROLE_PLAY: 1,
        SessionKind.FREE: 2,
    }
    assert plan.exam is None
    assert plan.topics == TOPICS
    assert plan.cards == 12


def test_the_week_never_plans_more_speaking_than_the_voice_minutes() -> None:
    plan = plan_week(inputs(habit=Habit(days=5, minutes=150)))

    assert plan.minutes == 60
    assert plan.capped
    assert sum(plan.sessions.values()) == 6


def test_without_due_words_there_is_no_review_conversation() -> None:
    plan = plan_week(inputs(words_due=2))

    assert plan.sessions[SessionKind.REVIEW] == 0
    assert sum(plan.sessions.values()) == 4


@pytest.mark.parametrize(
    ("lean", "role_plays"),
    [(Lean.GENERAL, 1), (Lean.LIFE, 1), (Lean.EXAM, 2)],
)
def test_an_exam_goal_leans_on_role_plays(lean: Lean, role_plays: int) -> None:
    plan = plan_week(inputs(lean=lean, habit=Habit(days=5, minutes=50)))

    assert plan.sessions[SessionKind.ROLE_PLAY] == role_plays


def test_no_role_plays_are_planned_when_none_fits_the_level() -> None:
    plan = plan_week(inputs(role_plays=False))

    assert plan.sessions[SessionKind.ROLE_PLAY] == 0
    assert sum(plan.sessions.values()) == 4


def test_a_habit_of_more_days_than_calls_gets_one_short_call_a_day() -> None:
    plan = plan_week(inputs(habit=Habit(days=7, minutes=35)))

    assert sum(plan.sessions.values()) == 7
    assert [s.minutes for s in plan.today] == [5]


def test_a_first_week_starts_on_the_day_the_learner_joined() -> None:
    # Of Monday, Tuesday, Thursday and Saturday, Thursday and Saturday are left.
    plan = plan_week(inputs(today=THURSDAY, started=THURSDAY))

    assert (plan.minutes, plan.days) == (20, 2)
    assert plan.reason is Reason.ON_TRACK
    assert plan.missed == ()
    assert sum(s.minutes for s in plan.today) == 10


def test_joining_after_the_last_planned_day_still_gives_today_one_days_share() -> None:
    plan = plan_week(inputs(today=SUNDAY, started=SUNDAY))

    assert (plan.minutes, plan.days) == (10, 1)
    assert sum(s.minutes for s in plan.today) == 10


def test_days_before_the_learner_joined_are_never_missed() -> None:
    tuesday = MONDAY + dt.timedelta(days=1)

    plan = plan_week(inputs(today=SATURDAY, started=tuesday))

    # Tuesday and Thursday were planned after they joined; Monday was not theirs.
    assert plan.missed == (tuesday, THURSDAY)


# --- Today -------------------------------------------------------------------------------------


def test_today_on_a_new_week_is_the_first_call_with_the_first_topic() -> None:
    plan = plan_week(inputs())

    assert plan.reason is Reason.ON_TRACK
    assert [(s.kind, s.minutes, s.topic) for s in plan.today] == [(SessionKind.REVIEW, 10, None)]
    assert plan.today_cards == 5


def test_a_day_of_more_than_one_call_starts_with_the_short_one() -> None:
    plan = plan_week(inputs(habit=Habit(days=2, minutes=30)))

    assert [(s.kind, s.minutes) for s in plan.today] == [
        (SessionKind.REVIEW, 5),
        (SessionKind.ROLE_PLAY, 10),
    ]
    assert plan.today[1].topic == "dative"


def test_what_was_done_moves_the_plan_on() -> None:
    plan = plan_week(
        inputs(today=MONDAY + dt.timedelta(days=1), so_far=so_far((MONDAY, 10), reviews=1))
    )

    assert [(s.kind, s.topic) for s in plan.today] == [(SessionKind.ROLE_PLAY, "dative")]
    assert plan.done_minutes == 10


def test_topics_take_turns_across_the_week() -> None:
    plan = plan_week(
        inputs(
            today=THURSDAY,
            so_far=so_far((MONDAY, 10), (MONDAY + dt.timedelta(days=1), 10), reviews=1, free=1),
        )
    )

    # One conversation with a topic so far: the next one takes the second.
    assert [(s.kind, s.topic) for s in plan.today] == [(SessionKind.ROLE_PLAY, "perfekt")]


def test_missed_days_give_the_rest_of_the_week_a_little_more_and_say_why() -> None:
    # Four days a week are Monday, Tuesday, Thursday and Saturday; only Monday was practised.
    plan = plan_week(inputs(today=THURSDAY, so_far=so_far((MONDAY, 10), reviews=1)))

    assert plan.reason is Reason.MISSED
    assert plan.missed == (MONDAY + dt.timedelta(days=1),)
    # 30 minutes over Thursday and Saturday: 15 today.
    assert [s.minutes for s in plan.today] == [5, 10]


def test_missed_days_never_ask_for_more_than_the_minutes_left() -> None:
    plan = plan_week(
        inputs(today=SUNDAY, remaining_seconds=12 * 60, so_far=so_far((MONDAY, 10), reviews=1))
    )

    # Ten minutes is no more than a usual day: the missed days are not what shaped it.
    assert sum(s.minutes for s in plan.today) == 10
    assert plan.reason is Reason.SHORT_OF_MINUTES


def test_the_voice_minutes_left_can_cut_the_day_short() -> None:
    plan = plan_week(inputs(habit=Habit(days=2, minutes=40), remaining_seconds=13 * 60))

    # Twenty minutes are planned for today, but only ten voice minutes are left.
    assert sum(s.minutes for s in plan.today) == 10
    assert plan.reason is Reason.SHORT_OF_MINUTES


def test_without_voice_minutes_today_is_cards_only() -> None:
    plan = plan_week(inputs(remaining_seconds=50))

    assert plan.today == ()
    assert plan.reason is Reason.MINUTES_USED_UP
    assert plan.today_cards == 5


def test_once_todays_share_is_done_the_day_is_done() -> None:
    plan = plan_week(inputs(so_far=so_far((MONDAY, 10), reviews=1)))

    assert plan.today == ()
    assert plan.reason is Reason.TODAY_DONE


def test_part_of_todays_share_leaves_the_rest_of_it() -> None:
    plan = plan_week(
        inputs(habit=Habit(days=2, minutes=40), so_far=so_far((MONDAY, 10), reviews=1))
    )

    assert [(s.kind, s.minutes) for s in plan.today] == [(SessionKind.ROLE_PLAY, 10)]
    assert plan.reason is Reason.ON_TRACK


def test_a_week_done_offers_a_light_extra() -> None:
    plan = plan_week(
        inputs(
            today=THURSDAY,
            so_far=so_far(
                (MONDAY, 20), (MONDAY + dt.timedelta(days=1), 20), reviews=1, free=2, role_plays=1
            ),
        )
    )

    assert plan.reason is Reason.WEEK_DONE
    assert [(s.kind, s.minutes) for s in plan.today] == [(SessionKind.REVIEW, 5)]


def test_more_conversations_than_planned_are_free_ones() -> None:
    plan = plan_week(
        inputs(
            habit=Habit(days=1, minutes=40),
            today=THURSDAY,
            so_far=so_far((MONDAY, 10), reviews=1, role_plays=3, free=2),
        )
    )

    assert {s.kind for s in plan.today} == {SessionKind.FREE}


# --- Topics and role-plays ----------------------------------------------------------------------


def state(
    topic_id: str, mastery: Mastery, accuracy: float = 0.0, trend: Trend | None = None
) -> TopicState:
    topic = next(t for t in GERMAN_MAP if t.id == topic_id)
    return TopicState(topic, TopicMastery(mastery, 10, 5, 3, accuracy, trend, None))


def everything(mastery: Mastery = Mastery.MASTERED) -> dict[str, TopicState]:
    return {topic.id: state(topic.id, mastery) for topic in GERMAN_MAP}


def test_topics_are_the_weakest_at_the_learners_level_first() -> None:
    states = everything()
    states["dative"] = state("dative", Mastery.PRACTISING, accuracy=0.5)
    states["perfekt"] = state("perfekt", Mastery.PRACTISING, accuracy=0.3)
    states["articles_gender"] = state("articles_gender", Mastery.INTRODUCED)

    topics = choose_topics(tuple(states.values()), level="A2", target=None, count=3)

    assert topics == ("perfekt", "dative", "articles_gender")


def test_topics_above_the_learners_level_wait_for_a_goal() -> None:
    states = everything(Mastery.NOT_STARTED)

    plain = choose_topics(tuple(states.values()), level="A1", target=None, count=3)
    aimed = choose_topics(tuple(states.values()), level="A1", target="A2", count=3)

    levels = {topic.id: topic.level for topic in GERMAN_MAP}
    assert {levels[t] for t in plain} == {"A1"}
    assert [levels[t] for t in aimed][-1] == "A2"


def test_a_learner_without_evidence_works_on_their_own_levels_topics() -> None:
    # Topics below the learner's level count as known until a report shows otherwise.
    states = everything(Mastery.NOT_STARTED)

    topics = choose_topics(tuple(states.values()), level="A2", target=None, count=3)

    assert topics == ("perfekt", "dative", "two_way_prepositions")


def test_a_slipping_topic_comes_back() -> None:
    states = everything()
    states["dative"] = state("dative", Mastery.MOSTLY_CORRECT, 0.8, Trend.SLIPPING)

    assert choose_topics(tuple(states.values()), level="B1", target=None, count=2)[0] == "dative"


def test_a_learner_who_has_mastered_everything_gets_no_topics() -> None:
    assert choose_topics(tuple(everything().values()), level="A2", target=None, count=3) == ()


def test_a_role_play_is_one_not_played_yet_at_the_learners_level() -> None:
    assert choose_scenario(GERMAN_SCENARIOS, level="A2", played=()) == "doctor"
    assert choose_scenario(GERMAN_SCENARIOS, level="A2", played=("doctor",)) == "pharmacy"


def test_once_every_role_play_was_played_the_longest_ago_comes_back() -> None:
    played = ("train_ticket", "pharmacy", "doctor", "bakery")

    assert choose_scenario(GERMAN_SCENARIOS, level="A2", played=played) == "bakery"


def test_a_beginner_has_no_role_play() -> None:
    assert choose_scenario(GERMAN_SCENARIOS, level="A0", played=()) is None


def test_the_planned_days_ahead_run_into_next_week() -> None:
    # Monday, Tuesday, Thursday and Saturday: from Thursday, the next seven days hold Thursday,
    # Saturday, and next week's Monday and Tuesday.
    plan = plan_week(inputs(today=THURSDAY))

    next_monday = MONDAY + dt.timedelta(days=7)
    assert plan.upcoming == (
        THURSDAY,
        SATURDAY,
        next_monday,
        next_monday + dt.timedelta(days=1),
    )


# --- Exam simulations ----------------------------------------------------------------------------


def preparing(**changes: object) -> ExamInputs:
    """A learner five weeks from the Goethe B1, with one simulation behind them."""
    base = ExamInputs(
        test="goethe_b1",
        name="Goethe-Zertifikat B1",
        date=MONDAY + dt.timedelta(weeks=5),
        before=1,
        last_week=0,
        weakest=None,
    )
    return base.__class__(**{**base.__dict__, **changes})


def for_exam(exam: ExamInputs, **changes: object) -> WeekInputs:
    return inputs(lean=Lean.EXAM, exam=exam, **changes)


@pytest.mark.parametrize(
    ("exam", "pace", "simulations"),
    [
        # No simulation yet: a first one, however far the exam.
        (preparing(before=0, date=MONDAY + dt.timedelta(weeks=20)), ExamPace.FIRST, 1),
        # More than eight weeks away, or no date: one every second week.
        (preparing(date=MONDAY + dt.timedelta(weeks=20)), ExamPace.FORTNIGHTLY, 1),
        (preparing(date=MONDAY + dt.timedelta(weeks=20), last_week=1), ExamPace.FORTNIGHTLY, 0),
        (preparing(date=None, last_week=1), ExamPace.FORTNIGHTLY, 0),
        # The last eight weeks: one a week.
        (preparing(), ExamPace.WEEKLY, 1),
        (preparing(date=MONDAY + dt.timedelta(weeks=8, days=-1)), ExamPace.WEEKLY, 1),
        # The last two weeks: two, also before any simulation.
        (preparing(date=MONDAY + dt.timedelta(days=13), before=0), ExamPace.FINAL, 2),
    ],
)
def test_simulations_come_more_often_as_the_exam_comes_closer(
    exam: ExamInputs, pace: ExamPace, simulations: int
) -> None:
    plan = plan_week(for_exam(exam))

    assert plan.exam is not None
    assert (plan.exam.pace, plan.exam.simulations) == (pace, simulations)
    assert plan.sessions[SessionKind.EXAM] == simulations
    # The other calls share what is left.
    assert sum(plan.sessions.values()) == 4


def test_simulations_take_at_most_half_the_weeks_speaking() -> None:
    close = preparing(date=MONDAY + dt.timedelta(days=10))

    twenty = plan_week(for_exam(close, habit=Habit(days=2, minutes=20)))
    ten = plan_week(for_exam(close, habit=Habit(days=1, minutes=10)))

    assert twenty.exam is not None
    assert ten.exam is not None
    assert (twenty.exam.wanted, twenty.exam.simulations) == (2, 1)
    # A simulation takes a whole call: a ten-minute week has no room for one.
    assert (ten.exam.wanted, ten.exam.simulations) == (2, 0)
    assert ten.exam.minutes == 10
    assert ten.sessions[SessionKind.EXAM] == 0


def test_the_weeks_simulation_comes_first_and_takes_a_whole_call() -> None:
    plan = plan_week(for_exam(preparing()))

    assert plan.today == (Session(SessionKind.EXAM, 10, None, exam="goethe_b1"),)


def test_a_short_day_is_made_as_long_as_a_simulation() -> None:
    # Five minutes a day, every day: the simulation's day has ten, the days after a little less.
    plan = plan_week(for_exam(preparing(), habit=Habit(days=7, minutes=35)))

    assert plan.today == (Session(SessionKind.EXAM, 10, None, exam="goethe_b1"),)
    assert plan.reason is Reason.ON_TRACK


def test_a_simulation_done_moves_the_week_on() -> None:
    tuesday = MONDAY + dt.timedelta(days=1)
    plan = plan_week(
        for_exam(
            preparing(),
            today=tuesday,
            so_far=so_far((MONDAY, 10), simulations=1),
        )
    )

    assert plan.exam is not None
    assert plan.exam.done == 1
    assert [session.kind for session in plan.today] != [SessionKind.EXAM]
    assert all(session.exam is None for session in plan.today)


def test_a_day_of_two_calls_gives_the_simulation_the_whole_one() -> None:
    plan = plan_week(for_exam(preparing(), habit=Habit(days=4, minutes=60)))

    assert [(s.kind, s.minutes) for s in plan.today] == [
        (SessionKind.REVIEW, 5),
        (SessionKind.EXAM, 10),
    ]


def test_there_is_no_simulation_on_the_exams_own_day() -> None:
    plan = plan_week(
        for_exam(
            preparing(date=THURSDAY), today=THURSDAY, so_far=so_far((MONDAY, 10), simulations=1)
        )
    )

    assert plan.exam is not None
    assert plan.exam.simulations == 1
    assert all(session.kind is not SessionKind.EXAM for session in plan.today)


def test_the_weakest_part_is_carried_to_today() -> None:
    weakest = WeakestPart(number=2, kind="present_topic")

    plan = plan_week(for_exam(preparing(weakest=weakest)))

    assert plan.exam is not None
    assert plan.exam.weakest == weakest
    assert plan.exam.name == "Goethe-Zertifikat B1"
