from datetime import date, datetime, timedelta

import pytest

from konvami_api.domain.onboarding import OnboardingError
from konvami_api.domain.profile import Change, Origin, Source
from tests.world import LEVELS, NOON, USER, World

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
EXAM = {"type": "goethe", "target_level": "B1", "date": "2026-12-01"}


def test_home_shows_the_level_practice_starts_at_and_where_it_came_from() -> None:
    world = World()
    world.onboard(level="A2")

    home = world.home.view(USER, None)

    assert home.language == "de"
    assert home.level is not None
    assert (home.level.level, home.level.source, home.level.skills) == ("A2", Source.ASKED, None)
    assert home.focus == ()


def test_after_a_placement_test_home_shows_each_skill_and_what_to_work_on() -> None:
    world = World()
    world.onboard(measured=True)

    home = world.home.view(USER, None)

    assert home.level is not None
    assert home.level.skills == LEVELS
    assert home.focus == ("Le datif après « mit »", "L'ordre des mots")


def test_partners_are_listed_with_when_the_learner_last_talked_to_them() -> None:
    world = World()
    _, jonas = world.onboard()
    world.talk(jonas, at=NOON - DAY)

    partners = world.home.view(USER, None).partners

    assert [(p.persona.name, p.conversations, p.last_talked_at) for p in partners] == [
        ("Lena", 0, None),
        ("Jonas", 1, NOON - DAY),
    ]


def test_a_new_learner_is_suggested_their_first_partner() -> None:
    world = World()
    lena, _ = world.onboard()

    assert world.home.view(USER, None).suggested_partner_id == lena.id


def test_home_suggests_the_partner_the_learner_talked_to_last() -> None:
    world = World()
    lena, jonas = world.onboard()
    world.talk(lena, at=NOON - 2 * DAY)
    world.talk(jonas, at=NOON - DAY)

    assert world.home.view(USER, None).suggested_partner_id == jonas.id


def test_an_exam_is_counted_down_in_days() -> None:
    world = World()
    world.onboard(exam=EXAM)

    exam = world.home.view(USER, None).exam

    assert exam is not None
    assert (exam.type, exam.name, exam.target_level) == ("goethe", "Goethe-Zertifikat", "B1")
    assert (exam.date, exam.days_left) == (date(2026, 12, 1), 53)


def test_the_countdown_follows_the_learners_own_calendar() -> None:
    world = World(datetime(2026, 10, 9, 23, 30, tzinfo=NOON.tzinfo))
    world.onboard(exam=EXAM)

    exam = world.home.view(USER, "Europe/Zurich").exam

    assert exam is not None
    assert exam.days_left == 52


def test_an_exam_without_a_date_has_no_countdown() -> None:
    world = World()
    world.onboard(exam={"type": "other", "target_level": None, "date": None})

    exam = world.home.view(USER, None).exam

    assert exam is not None
    assert (exam.type, exam.name, exam.date, exam.days_left) == ("other", None, None, None)


def test_an_exam_that_has_passed_is_no_longer_shown() -> None:
    world = World()
    world.onboard(exam=EXAM)
    world.clock.now = datetime(2026, 12, 2, 9, 0, tzinfo=NOON.tzinfo)

    assert world.home.view(USER, None).exam is None


def test_on_the_exam_day_itself_the_countdown_is_zero() -> None:
    world = World()
    world.onboard(exam=EXAM)
    world.clock.now = datetime(2026, 12, 1, 9, 0, tzinfo=NOON.tzinfo)

    exam = world.home.view(USER, None).exam

    assert exam is not None
    assert exam.days_left == 0


def test_no_exam_means_no_exam_on_home() -> None:
    world = World()
    world.onboard()

    assert world.home.view(USER, None).exam is None


def test_home_shows_the_streak_the_week_and_the_last_three_conversations() -> None:
    world = World()
    lena, jonas = world.onboard()
    ids = [
        world.talk(lena, at=NOON - 3 * DAY, minutes=4),
        world.talk(lena, at=NOON - 2 * DAY, minutes=6),
        world.talk(jonas, at=NOON - DAY, minutes=5),
        world.talk(lena, at=NOON - HOUR, minutes=10),
    ]

    home = world.home.view(USER, None)

    assert home.activity.streak_days == 4
    assert (home.activity.today_seconds, home.activity.week_seconds) == (600, 1500)
    assert [c.id for c in home.recent] == [ids[3], ids[2], ids[1]]


def test_there_is_no_home_before_onboarding_is_finished() -> None:
    world = World()
    world.profiles.apply(
        USER, [Change("target_language", "de")], source=Source.ASKED, origin=Origin.FORM
    )

    with pytest.raises(OnboardingError) as error:
        world.home.view(USER, None)

    assert error.value.code == "wrong_stage"
