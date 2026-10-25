"""The Learning Director on a whole backend: the week from what the learner set and did."""

from datetime import UTC, datetime, timedelta
from typing import Any

from konvami_api.domain.director import ExamPace, Reason, SessionKind, WeakestPart
from konvami_api.domain.grammar_topics import GERMAN_MAP
from konvami_api.domain.live_call import Turn
from konvami_api.domain.plan import SessionPlan
from konvami_api.domain.profile import Change, Origin, Source
from konvami_api.domain.reports import TopicUse, Word
from tests.world import NOON, USER, World

# NOON is Friday 9 October 2026; its week began on Monday the 5th.
MONDAY = datetime(2026, 10, 5, 9, 0, tzinfo=UTC)
DAY = timedelta(days=1)
ZURICH = "Europe/Zurich"


def a_world() -> World:
    """A backend whose learner will have joined two weeks before NOON."""
    return World(NOON - 14 * DAY)


def learner(world: World, **goals: object) -> None:
    world.onboard()
    world.clock.now = NOON
    changes = [Change(field, value) for field, value in goals.items()]
    if changes:
        world.profiles.apply(USER, changes, source=Source.ASKED, origin=Origin.FORM)


def test_a_learner_without_a_habit_gets_four_days_of_ten_minutes() -> None:
    world = a_world()
    learner(world)

    plan = world.director.week(USER, ZURICH)

    assert plan.week == MONDAY.date()
    assert (plan.minutes, plan.days) == (40, 4)


def test_the_habit_is_the_learners_but_never_more_than_their_voice_minutes() -> None:
    world = a_world()
    learner(world, weekly_habit={"days": 5, "minutes": 90})

    plan = world.director.week(USER, ZURICH)

    # The test world's learners have an hour of voice a week.
    assert (plan.minutes, plan.days, plan.capped) == (60, 5, True)


def test_the_weeks_conversations_count_by_kind() -> None:
    world = a_world()
    learner(world, weekly_habit={"days": 2, "minutes": 60})
    lena = world.personas.partners(USER)[0]
    world.talk(lena, at=MONDAY, minutes=10, plan=SessionPlan(language="de", review=True))
    world.talk(lena, at=MONDAY + DAY, minutes=10, scenario="doctor")
    # Last week's does not count.
    world.talk(lena, at=MONDAY - DAY, minutes=10)

    plan = world.director.week(USER, ZURICH)

    assert (plan.done_minutes, plan.done_days) == (20, 2)
    # Two days, both done: what is left goes to today.
    assert sum(s.minutes for s in plan.today) == 40
    assert SessionKind.REVIEW not in {s.kind for s in plan.today}


def test_a_planned_role_play_is_one_not_played_yet_at_the_learners_level() -> None:
    world = a_world()
    learner(world, weekly_habit={"days": 1, "minutes": 30})
    lena = world.personas.partners(USER)[0]
    world.talk(lena, at=MONDAY - 3 * DAY, scenario="doctor")

    plan = world.director.week(USER, ZURICH)

    role_plays = [s for s in plan.today if s.kind is SessionKind.ROLE_PLAY]
    assert [s.scenario for s in role_plays] == ["pharmacy"]
    assert all(s.scenario is None for s in plan.today if s.kind is not SessionKind.ROLE_PLAY)


def test_an_exam_leans_the_week_on_role_plays_and_the_exams_level() -> None:
    world = a_world()
    world.onboard(exam={"type": "goethe", "target_level": "B1", "date": "2027-04-15"})
    world.clock.now = NOON
    world.profiles.apply(
        USER,
        [Change("weekly_habit", {"days": 5, "minutes": 50})],
        source=Source.ASKED,
        origin=Origin.FORM,
    )

    plan = world.director.week(USER, ZURICH)

    # One call is a first simulation; no cards are due, so no review conversation: two of the
    # other four are role-plays.
    assert plan.sessions[SessionKind.EXAM] == 1
    assert plan.sessions[SessionKind.ROLE_PLAY] == 2
    levels = {t.id: t.level for t in GERMAN_MAP}
    assert levels[plan.topics[-1]] == "B1"


def test_the_weeks_topics_stay_as_they_were_on_monday() -> None:
    world = a_world()
    learner(world)
    lena = world.personas.partners(USER)[0]
    before = world.talk(lena, at=MONDAY - 2 * DAY)
    world.reported(before, usage=(TopicUse("dative", 4, 3),))
    topics = world.director.week(USER, ZURICH).topics

    during = world.talk(lena, at=MONDAY + DAY)
    world.reported(during, usage=(TopicUse("perfekt", 4, 3), TopicUse("dative", 6, 0)))

    assert topics[0] == "dative"
    assert world.director.week(USER, ZURICH).topics == topics


def test_each_call_puts_the_next_of_the_weeks_topics_first() -> None:
    world = a_world()
    learner(world)
    lena = world.personas.partners(USER)[0]
    topics = world.director.week(USER, ZURICH).topics

    first = world.director.topic_for_call(USER, NOON.date())
    world.talk(lena, at=MONDAY + DAY)
    second = world.director.topic_for_call(USER, NOON.date())
    world.talk(lena, at=MONDAY + 2 * DAY, plan=SessionPlan(language="de", review=True))
    still_second = world.director.topic_for_call(USER, NOON.date())

    assert (first, second, still_second) == (topics[0], topics[1], topics[1])


def test_voice_minutes_used_elsewhere_cut_today_short() -> None:
    world = a_world()
    learner(world, weekly_habit={"days": 1, "minutes": 60})
    # A placement test used 55 minutes of the hour.
    world.sessions.reserve_seconds(USER, MONDAY.date(), 3600, 60, 55 * 60)

    plan = world.director.week(USER, ZURICH)

    assert sum(s.minutes for s in plan.today) == 5
    assert plan.reason is Reason.SHORT_OF_MINUTES


def test_cards_due_set_the_weeks_review_target_and_a_review_conversation() -> None:
    world = a_world()
    learner(world)
    lena = world.personas.partners(USER)[0]
    call_id = world.talk(lena, at=MONDAY - DAY)
    words = tuple(Word(f"das Wort{n}", f"le mot {n}", None) for n in range(4))
    world.reported(call_id, words=words)
    for index in range(4):
        world.cards.save(USER, call_id, "word", index)

    plan = world.director.week(USER, ZURICH)

    assert (plan.cards, plan.today_cards) == (4, 4)
    assert plan.sessions[SessionKind.REVIEW] == 1
    assert plan.today[0].kind is SessionKind.REVIEW


def test_a_learner_who_joined_on_friday_has_a_short_first_week() -> None:
    world = World()
    world.onboard()

    plan = world.director.week(USER, ZURICH)

    # Of Monday, Tuesday, Thursday and Saturday, only Saturday was left; today counts too.
    assert (plan.minutes, plan.days) == (10, 1)
    assert plan.missed == ()


# --- Exam simulations ----------------------------------------------------------------------------

GOETHE_B1 = {"type": "goethe", "target_level": "B1", "date": "2027-04-15"}


def preparing(world: World, exam: dict[str, Any] = GOETHE_B1) -> None:
    world.onboard(exam=exam)
    world.clock.now = NOON


def scores(*shares: int) -> dict[str, Any]:
    """A score of the Goethe B1's three parts, each with the same mark on every criterion."""
    return {
        "parts": [
            {
                "part": part,
                "marks": {"task": mark, "coherence": mark, "vocabulary": mark, "grammar": mark},
                "feedback": "Bien.",
                "model_answer": "Ich schlage vor …",
            }
            for part, mark in zip(("teil_1", "teil_2", "teil_3"), shares, strict=True)
        ],
        "summary": "Continue.",
    }


def test_an_exam_plans_a_first_simulation_of_its_speaking_test() -> None:
    world = a_world()
    preparing(world)

    plan = world.director.week(USER, ZURICH)

    assert plan.exam is not None
    assert (plan.exam.test, plan.exam.name) == ("goethe_b1", "Goethe-Zertifikat B1")
    assert (plan.exam.pace, plan.exam.simulations, plan.exam.done) == (ExamPace.FIRST, 1, 0)
    simulations = [s for s in plan.today if s.kind is SessionKind.EXAM]
    assert [(s.minutes, s.exam) for s in simulations] == [(10, "goethe_b1")]


def test_a_simulation_this_week_counts_with_its_minutes_and_day() -> None:
    world = a_world()
    preparing(world)
    world.simulate(at=MONDAY + DAY, minutes=8)
    # One with almost nothing said is not scored, and is not one.
    short = world.simulate(
        (Turn("persona", "Guten Tag."), Turn("learner", "Hallo.")), at=MONDAY + 2 * DAY
    )
    world.exams.score(short)
    world.clock.now = NOON

    plan = world.director.week(USER, ZURICH)

    assert plan.exam is not None
    assert plan.exam.done == 1
    assert (plan.done_minutes, plan.done_days) == (8, 1)
    assert SessionKind.EXAM not in {s.kind for s in plan.today}


def test_far_from_the_exam_a_week_after_a_simulation_has_none() -> None:
    world = a_world()
    preparing(world)
    world.simulate(at=MONDAY - 3 * DAY)
    world.clock.now = NOON

    plan = world.director.week(USER, ZURICH)

    assert plan.exam is not None
    assert (plan.exam.pace, plan.exam.simulations) == (ExamPace.FORTNIGHTLY, 0)
    assert plan.sessions[SessionKind.EXAM] == 0


def test_the_weakest_part_of_the_scored_simulations_is_named() -> None:
    world = a_world()
    preparing(world)
    call_id = world.simulate(at=MONDAY - 10 * DAY)
    world.text.answers.append(scores(3, 1, 3))
    world.exams.score(call_id)
    world.clock.now = NOON

    plan = world.director.week(USER, ZURICH)

    assert plan.exam is not None
    assert plan.exam.weakest == WeakestPart(number=2, kind="present_topic")


def test_an_exam_without_a_speaking_test_or_already_over_plans_no_simulation() -> None:
    testdaf = a_world()
    preparing(testdaf, {"type": "testdaf", "target_level": "B2", "date": "2027-04-15"})
    over = a_world()
    preparing(over, {**GOETHE_B1, "date": "2026-10-01"})

    for world in (testdaf, over):
        plan = world.director.week(USER, ZURICH)
        assert plan.exam is None
        assert plan.sessions[SessionKind.EXAM] == 0
