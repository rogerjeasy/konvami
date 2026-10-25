"""The Learning Director on a whole backend: the week from what the learner set and did."""

from datetime import UTC, datetime, timedelta

from konvami_api.domain.director import Reason, SessionKind
from konvami_api.domain.grammar_topics import GERMAN_MAP
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

    # No cards are due, so no review conversation: three of the five calls are role-plays.
    assert plan.sessions[SessionKind.ROLE_PLAY] == 3
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
