"""Progressive profiling (spec §6.1.2): the question that is due at the moment a setting becomes
relevant, and what answering or dismissing it does."""

from datetime import timedelta
from uuid import UUID

import pytest

from konvami_api.domain.memories import Memory
from konvami_api.domain.profile import Change, Origin, Source
from konvami_api.domain.profile_questions import (
    HABIT,
    MAX_DISMISSALS,
    MEMORY,
    MIN_GAP,
    RECORDINGS,
    SNOOZE,
    QuestionError,
)
from tests.world import NOON, USER, World


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    return world


def talked(world: World, times: int = 1) -> None:
    lena = world.personas.partners(USER)[0]
    for number in range(times):
        world.talk(lena, at=NOON - timedelta(days=10 - number))


def asked(world: World) -> str | None:
    question = world.questions.next(USER)
    return question.id if question else None


def test_nothing_is_asked_before_the_learner_has_talked(world: World) -> None:
    assert asked(world) is None


def test_after_the_first_conversation_the_audio_is_asked_about(world: World) -> None:
    talked(world)

    question = world.questions.next(USER)

    assert question is not None
    assert (question.id, question.options) == (RECORDINGS, ("keep", "stop"))


def test_the_weekly_habit_waits_for_the_second_conversation(world: World) -> None:
    talked(world)
    world.questions.answer(USER, RECORDINGS, "keep")
    world.clock.now += MIN_GAP

    assert asked(world) is None

    talked(world, 2)
    assert asked(world) == HABIT


def test_memory_is_asked_once_a_partner_has_written_something_down(world: World) -> None:
    talked(world)
    world.questions.answer(USER, RECORDINGS, "keep")
    world.clock.now += MIN_GAP
    world.memory_store.add(
        USER,
        "has a job interview",
        Memory(
            id=UUID("eeeeeeee-eeee-4eee-8eee-000000000001"),
            kind="fact",
            text="Has a job interview",
            day=None,
            importance=2,
            persona_id=None,
            source_call_id=None,
            created_at=NOON,
            updated_at=NOON,
        ),
        300,
    )

    assert asked(world) == MEMORY


def test_at_most_one_question_is_asked_a_day(world: World) -> None:
    talked(world, 2)
    world.questions.answer(USER, RECORDINGS, "keep")

    assert asked(world) is None

    world.clock.now += MIN_GAP
    assert asked(world) == HABIT


def test_a_setting_the_learner_already_chose_is_not_asked_about(world: World) -> None:
    talked(world)
    world.profiles.apply(
        USER, [Change("recordings_kept", True)], source=Source.ASKED, origin=Origin.FORM
    )

    assert asked(world) is None


def test_answering_the_audio_question_applies_it(world: World) -> None:
    talked(world)

    world.questions.answer(USER, RECORDINGS, "stop")

    assert not world.profiles.get(USER).recordings_kept
    assert asked(world) is None


def test_answering_the_memory_question_applies_it(world: World) -> None:
    world.questions.answer(USER, MEMORY, "forget")

    assert not world.profiles.get(USER).memory_enabled


def test_answering_the_habit_question_sets_the_weekly_habit(world: World) -> None:
    world.questions.answer(USER, HABIT, "steady")

    assert world.profiles.get(USER).value("de", "weekly_habit") == {"days": 3, "minutes": 20}


def test_an_answer_that_is_not_offered_is_refused(world: World) -> None:
    with pytest.raises(QuestionError) as refused:
        world.questions.answer(USER, HABIT, "hourly")

    assert refused.value.code == "invalid_option"
    assert world.profiles.get(USER).value("de", "weekly_habit") is None


def test_a_question_that_does_not_exist_is_refused(world: World) -> None:
    with pytest.raises(QuestionError) as refused:
        world.questions.dismiss(USER, "favourite_colour")

    assert refused.value.code == "not_found"


def test_a_dismissed_question_returns_after_a_week_and_then_never(world: World) -> None:
    talked(world)
    world.questions.dismiss(USER, RECORDINGS)

    world.clock.now += SNOOZE - timedelta(hours=1)
    assert asked(world) is None

    world.clock.now += timedelta(hours=2)
    assert asked(world) == RECORDINGS

    for _ in range(MAX_DISMISSALS - 1):
        world.questions.dismiss(USER, RECORDINGS)
    world.clock.now += 30 * timedelta(days=1)
    assert asked(world) is None
