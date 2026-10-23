import dataclasses
from datetime import datetime, timedelta

import pytest

from konvami_api.domain.levels import (
    AGREEING,
    EVIDENCE,
    Leaning,
    LevelFit,
    LevelStep,
    leaning,
    next_level,
)
from konvami_api.domain.profile import Change, Origin, Source
from konvami_api.domain.reports import Report, Stats
from tests.world import NOON, OTHER_USER, USER, World

UP: Leaning = 1
DOWN: Leaning = -1
LEVEL: Leaning = 0

ABOVE = LevelFit(grammar="above", vocabulary="above", speaking="at")
AT = LevelFit(grammar="at", vocabulary="at", speaking="at")
BELOW = LevelFit(grammar="below", vocabulary="at", speaking="below")


# --- Which way one conversation points -----------------------------------------------------------


@pytest.mark.parametrize(
    ("fit", "expected"),
    [
        (LevelFit("above", "above", "above"), UP),
        (LevelFit("above", "above", "at"), UP),
        (LevelFit("above", "unclear", "above"), UP),
        (LevelFit("above", "at", "at"), LEVEL),
        (LevelFit("above", "above", "below"), LEVEL),
        (LevelFit("below", "below", "at"), DOWN),
        (LevelFit("below", "unclear", "below"), DOWN),
        (LevelFit("below", "above", "below"), LEVEL),
        (LevelFit("at", "at", "at"), LEVEL),
    ],
)
def test_a_conversation_points_up_or_down_when_two_skills_agree_and_none_disagrees(
    fit: LevelFit, expected: int
) -> None:
    assert leaning(fit) == expected


def test_a_conversation_that_shows_too_little_does_not_count() -> None:
    assert leaning(LevelFit("above", "unclear", "unclear")) is None
    assert leaning(LevelFit("unclear", "unclear", "unclear")) is None


# --- When the level moves ------------------------------------------------------------------------


def test_the_level_rises_after_five_conversations_of_which_four_point_up() -> None:
    assert (EVIDENCE, AGREEING) == (5, 4)
    assert next_level("B1", [UP, UP, LEVEL, UP, UP]) == "B2"


def test_four_conversations_are_not_enough() -> None:
    assert next_level("B1", [UP, UP, UP, UP]) is None


def test_only_the_five_newest_conversations_count() -> None:
    assert next_level("B1", [LEVEL, LEVEL, UP, UP, UP, UP, UP]) is None


def test_one_conversation_the_other_way_holds_the_level() -> None:
    assert next_level("B1", [UP, UP, UP, UP, DOWN]) is None
    assert next_level("B1", [DOWN, DOWN, UP, DOWN, DOWN]) is None


def test_the_level_falls_one_step_on_four_conversations_pointing_down() -> None:
    assert next_level("B1", [DOWN, DOWN, DOWN, LEVEL, DOWN]) == "A2"


def test_the_level_never_leaves_the_scale() -> None:
    assert next_level("C2", [UP] * 5) is None
    assert next_level("A0", [DOWN] * 5) is None
    assert next_level("A0", [UP] * 5) == "A1"


# --- After each conversation ---------------------------------------------------------------------


def _fitting(world: World, fit: LevelFit, *, at: datetime) -> str:
    """A practice conversation at `at` whose report found `fit`."""
    call_id = world.talk(None, at=at)
    now = world.clock()
    world.report_store.request(call_id, now, stale_before=now, max_requests=3)
    world.report_store.written(
        call_id,
        "ready",
        Report(
            target="de",
            language="fr",
            summary="Vous avez parlé de votre week-end.",
            mistakes=(),
            rewrites=(),
            words=(),
            wins=(),
            next_steps=(),
            stats=Stats(60, 50, 6, 15),
            level_fit=fit,
        ),
    )
    return call_id


def _conversations(world: World, *fits: LevelFit) -> list[str]:
    """One conversation an hour after the last, for each fit, each followed by the engine."""
    calls = []
    for fit in fits:
        world.clock.now += timedelta(hours=1)
        # The report, and the engine after it, run once the conversation is over.
        call_id = _fitting(world, fit, at=world.clock() - timedelta(minutes=10))
        world.levels.after_report(call_id)
        calls.append(call_id)
    return calls


def _level(world: World) -> str | None:
    return world.profiles.get(USER).level("de")


def test_five_conversations_above_the_level_raise_it_and_say_so_on_the_last_report() -> None:
    world = World()
    world.onboard(level="A2")

    calls = _conversations(world, ABOVE, ABOVE, AT, ABOVE, ABOVE)

    assert _level(world) == "B1"
    step = world.levels.step(USER, calls[-1])
    assert step == LevelStep(calls[-1], "de", "A2", "B1", world.clock())
    assert step.rose
    assert all(world.levels.step(USER, call) is None for call in calls[:-1])


def test_the_new_level_is_measured_and_logged_as_the_systems_change() -> None:
    world = World()
    world.onboard(level="A2")

    _conversations(world, *[ABOVE] * 5)

    stored = world.profiles.get(USER).fields[("de", "starting_level")]
    assert (stored.value, stored.source) == ("B1", Source.MEASURED)


def test_the_count_starts_again_after_a_step() -> None:
    world = World()
    world.onboard(level="A2")

    _conversations(world, *[ABOVE] * 9)

    assert _level(world) == "B1"
    _conversations(world, ABOVE)
    assert _level(world) == "B2"


def test_conversations_below_the_level_lower_it() -> None:
    world = World()
    world.onboard(level="B1")

    calls = _conversations(world, BELOW, BELOW, BELOW, BELOW, AT)

    assert _level(world) == "A2"
    step = world.levels.step(USER, calls[-1])
    assert step is not None
    assert not step.rose


def test_setting_the_level_oneself_starts_the_count_again() -> None:
    world = World()
    world.onboard(level="A2")
    _conversations(world, *[ABOVE] * 4)

    world.clock.now += timedelta(minutes=5)
    world.profiles.apply(
        USER, [Change("starting_level", "B1")], source=Source.ASKED, origin=Origin.FORM
    )
    _conversations(world, ABOVE)

    assert _level(world) == "B1"


def test_a_report_without_a_level_fit_is_no_evidence() -> None:
    world = World()
    world.onboard(level="A2")
    for _ in range(5):
        world.clock.now += timedelta(hours=1)
        call_id = world.talk(None, at=world.clock())
        world.reported(call_id)
        world.levels.after_report(call_id)

    assert _level(world) == "A2"


def test_a_conversation_in_another_language_is_no_evidence_for_this_one() -> None:
    world = World()
    world.onboard(level="A2")
    calls = _conversations(world, *[ABOVE] * 4)
    report = world.report_store.reports[calls[0]].report
    assert report is not None
    world.report_store.written(calls[0], "ready", dataclasses.replace(report, target="fr"))

    _conversations(world, ABOVE)

    assert _level(world) == "A2"


def test_a_call_that_is_not_known_changes_nothing() -> None:
    world = World()
    world.onboard(level="A2")

    world.levels.after_report("rtc_unknown")

    assert _level(world) == "A2"


def test_another_learners_step_is_not_shown() -> None:
    world = World()
    world.onboard(level="A2")
    calls = _conversations(world, *[ABOVE] * 5)

    assert world.levels.step(USER, calls[-1]) is not None
    assert world.levels.step(OTHER_USER, calls[-1]) is None


def test_the_level_over_time_starts_where_onboarding_put_it() -> None:
    world = World()
    world.onboard(level="A2")
    _conversations(world, *[ABOVE] * 5)

    history = world.levels.history(USER, "de")

    assert [(point.level, point.source) for point in history] == [
        ("A2", Source.ASKED),
        ("B1", Source.MEASURED),
    ]
    assert history[0].at == NOON
    assert history[-1].at == world.clock()
