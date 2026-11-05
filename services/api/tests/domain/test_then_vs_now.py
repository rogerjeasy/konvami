"""Then vs Now (spec §7): a conversation from the learner's first weeks next to a recent one of
the same kind, both with their voice recorded."""

from datetime import timedelta
from typing import Any

import pytest

from konvami_api.domain.live_call import Turn, TurnAudio
from konvami_api.domain.plan import SessionPlan
from konvami_api.domain.then_vs_now import MAX_OPENED, MIN_GAP, ThenVsNow, ThenVsNowStatus
from tests.world import NOON, OTHER_USER, USER, World

VOICE = TurnAudio("users/u/recordings/c/item.wav", 2_000)


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    return world


def talk(world: World, days: float, *, recorded: bool = True, **kwargs: Any) -> str:
    """A conversation `days` after the first moment, with the learner's voice kept or not."""
    turns = (
        Turn("persona", "Hallo!"),
        Turn("learner", "Ich heiße Amara.", audio=VOICE if recorded else None),
    )
    return world.talk(None, at=NOON + timedelta(days=days), turns=turns, **kwargs)


def compare(world: World) -> ThenVsNow:
    return world.then_vs_now.compare(USER)


def ids(pair: ThenVsNow) -> tuple[str | None, str | None]:
    return (pair.then.id if pair.then else None, pair.now.id if pair.now else None)


def test_a_learner_without_conversations_has_nothing_to_compare_yet(world: World) -> None:
    assert compare(world).status is ThenVsNowStatus.NONE


def test_the_first_and_the_latest_recorded_conversation_are_the_pair(world: World) -> None:
    first = talk(world, 0)
    talk(world, 20)
    latest = talk(world, 60)

    pair = compare(world)

    assert pair.status is ThenVsNowStatus.READY
    assert ids(pair) == (first, latest)
    assert pair.weeks_apart == 8


def test_conversations_without_the_learners_voice_are_passed_over(world: World) -> None:
    talk(world, 0, recorded=False)
    first = talk(world, 3)
    talk(world, 70, recorded=False)
    latest = talk(world, 40)

    assert ids(compare(world)) == (first, latest)


def test_two_conversations_less_than_a_fortnight_apart_are_not_yet_a_pair(world: World) -> None:
    talk(world, 0)
    talk(world, MIN_GAP.days - 1)

    assert compare(world).status is ThenVsNowStatus.NOT_YET


def test_a_pair_is_two_conversations_of_the_same_kind(world: World) -> None:
    talk(world, 0)
    talk(world, 60, scenario="bakery")

    assert compare(world).status is ThenVsNowStatus.NOT_YET


def test_a_role_play_is_compared_with_the_same_role_play(world: World) -> None:
    talk(world, 0)
    then = talk(world, 1, scenario="bakery")
    now = talk(world, 90, scenario="bakery")

    # The first free conversation has no later free one; the role-play pair is found instead.
    assert ids(compare(world)) == (then, now)


def test_a_review_conversation_is_not_part_of_a_pair(world: World) -> None:
    talk(world, 0)
    talk(world, 60, plan=SessionPlan(language="de", review=True))

    assert compare(world).status is ThenVsNowStatus.NOT_YET


def test_a_learner_who_does_not_keep_recordings_is_told_so(world: World) -> None:
    talk(world, 0)
    talk(world, 60)
    world.recordings.configure(USER, kept=False)

    assert compare(world).status is ThenVsNowStatus.OFF


def test_another_learners_conversations_are_never_used(world: World) -> None:
    world.onboard(OTHER_USER)
    talk(world, 0, user=OTHER_USER)
    talk(world, 60, user=OTHER_USER)

    assert compare(world).status is ThenVsNowStatus.NONE


def test_at_most_a_few_conversations_are_opened_at_each_end(world: World) -> None:
    # More conversations without the learner's voice than are ever looked at, then one with it.
    for day in range(MAX_OPENED * 6):
        talk(world, day, recorded=False)
    talk(world, 100)
    talk(world, 200)

    # The recorded ones lie beyond what is looked at from the start, so there is no start.
    assert compare(world).status is ThenVsNowStatus.NONE
