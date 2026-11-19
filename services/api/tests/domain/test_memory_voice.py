"""Forgetting by voice (spec §6.11 "forget that"): the partner's `forget_memory` tool, undoing it
while the call goes on, the deletion when the call ends, and keeping what was said about it out
of the call's memories."""

import json
from datetime import timedelta
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.live_call import Turn
from konvami_api.domain.memories import (
    FORGET_KEEP,
    FORGET_SETTLE,
    MAX_MEMORIES,
    MemoriesError,
    Memory,
    memory_ref,
)
from konvami_api.domain.memory_voice import FORGET_MEMORY
from tests.world import NOON, OTHER_USER, USER, World

TODAY = NOON.date()


def remember(world: World, number: int, text: str, user: UUID = USER) -> Memory:
    memory = Memory(
        id=UUID(int=number),
        kind="fact",
        text=text,
        day=None,
        importance=2,
        persona_id=None,
        source_call_id=None,
        created_at=NOON,
        updated_at=NOON,
    )
    assert world.memory_store.add(user, text.casefold(), memory, MAX_MEMORIES)
    return memory


def forget(world: World, **arguments: Any) -> dict[str, Any]:
    """What the partner is told back when it calls the tool."""
    arguments.setdefault("confirmed", True)
    arguments.setdefault("notes", [])
    arguments.setdefault("about", "")
    return world.practice.tools(USER).run(FORGET_MEMORY, arguments).output


def texts(world: World, user: UUID = USER) -> set[str]:
    return {memory.text for memory in world.memories.view(user).memories}


def told(world: World) -> str:
    lena = world.personas.partners(USER)[0]
    return world.practice.prepare(USER, world.accounts.get(USER), TODAY, lena.id).instructions


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    return world


def test_a_partner_can_forget_by_voice(world: World) -> None:
    names = [d["name"] for d in world.practice.tools(USER).definitions()]

    assert FORGET_MEMORY in names


def test_the_partner_sees_each_note_with_the_ref_that_forgets_it(world: World) -> None:
    zurich = remember(world, 1, "Habite à Zurich.")

    instructions = told(world)

    assert f"- Habite à Zurich. [{memory_ref(zurich)}]" in instructions
    forgetting = instructions.split("# Forgetting\n", 1)[1].split("\n# ", 1)[0]
    assert "clearly say yes" in forgetting
    assert FORGET_MEMORY in forgetting


def test_a_confirmed_forget_hides_the_note_at_once(world: World) -> None:
    zurich = remember(world, 1, "Habite à Zurich.")
    remember(world, 2, "Aime le vélo.")

    result = forget(world, notes=[memory_ref(zurich)], about="où j'habite")

    assert result["forgot"] is True
    assert result["notes"] == 1
    assert "Do not bring it up again" in result["from_now_on"]
    assert texts(world) == {"Aime le vélo."}
    # The partner of the next call is not told it either.
    assert "Habite à Zurich" not in told(world)


def test_nothing_is_forgotten_before_the_learner_said_yes(world: World) -> None:
    zurich = remember(world, 1, "Habite à Zurich.")

    result = forget(world, notes=[memory_ref(zurich)], about="Zurich", confirmed=False)

    assert result == {"forgot": False, "reason": "not_confirmed"}
    assert texts(world) == {"Habite à Zurich."}


def test_a_forget_must_name_something(world: World) -> None:
    assert forget(world, notes=["nothing0"], about="  ") == {
        "forgot": False,
        "reason": "invalid_value",
    }
    assert forget(world, notes="all", about="x") == {
        "forgot": False,
        "reason": "invalid_arguments",
    }


def test_a_ref_never_reaches_another_learners_memories(world: World) -> None:
    theirs = remember(world, 1, "Habite à Berne.", user=OTHER_USER)

    result = forget(world, notes=[memory_ref(theirs)], about="Berne")

    assert result["notes"] == 0
    assert texts(world, OTHER_USER) == {"Habite à Berne."}


def test_a_forget_can_be_undone_while_the_call_goes_on(world: World) -> None:
    zurich = remember(world, 1, "Habite à Zurich.")
    result = forget(world, notes=[memory_ref(zurich)], about="Zurich")

    world.memories.undo_forget(USER, UUID(result["forget"]))

    assert texts(world) == {"Habite à Zurich."}


def test_when_the_call_ends_the_forget_is_final(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    zurich = remember(world, 1, "Habite à Zurich.")
    result = forget(world, notes=[memory_ref(zurich)], about="Zurich")

    world.memories.after_call(USER, world.talk(lena, at=NOON))

    assert world.memory_store.memories == {}
    with pytest.raises(MemoriesError, match="not_found"):
        world.memories.undo_forget(USER, UUID(result["forget"]))


def test_a_call_that_never_said_it_ended_is_settled_later(world: World) -> None:
    zurich = remember(world, 1, "Habite à Zurich.")
    forget(world, notes=[memory_ref(zurich)], about="Zurich")

    world.clock.now = NOON + FORGET_SETTLE + timedelta(minutes=1)
    told(world)

    assert world.memory_store.memories == {}


def test_what_was_said_in_the_call_is_kept_out_of_its_memories(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    turns = (
        Turn("persona", "Hallo! Wie geht's?"),
        Turn("learner", "Gut. Ich lasse mich scheiden, aber bitte vergiss das wieder sofort."),
        Turn("persona", "Natürlich, das ist vergessen."),
        Turn("learner", "Danke. Ich wohne jetzt in Zürich und fahre gern Fahrrad."),
    )
    call_id = world.talk(lena, at=NOON - timedelta(minutes=10), turns=turns)
    world.clock.now = NOON - timedelta(minutes=5)
    forget(world, about="die Scheidung")
    world.clock.now = NOON
    world.memories.after_call(USER, call_id)
    world.text.answers.append({"memories": []})

    world.memories.write(call_id)

    [task] = [task for task in world.text.tasks if task.answer_name == "memories"]
    assert json.loads(task.content)["forget_now"] == ["die Scheidung"]
    assert "`forget_now`" in task.instructions
    # Read once, the learner's words are gone.
    assert world.memory_store.forgotten == {}


def test_a_forget_from_another_call_is_not_in_this_ones_reading(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    forget(world, about="die Scheidung")
    later = NOON + FORGET_SETTLE + timedelta(minutes=1)
    world.clock.now = later
    call_id = world.talk(
        lena,
        at=later,
        turns=(
            Turn("persona", "Hallo!"),
            Turn("learner", "Ich wohne jetzt in Zürich und fahre jeden Tag gern mit dem Rad."),
        ),
    )
    world.memories.after_call(USER, call_id)
    world.text.answers.append({"memories": []})

    world.memories.write(call_id)

    [task] = [task for task in world.text.tasks if task.answer_name == "memories"]
    assert json.loads(task.content)["forget_now"] == []


def test_the_words_of_a_forget_whose_call_was_never_read_go_after_two_days(world: World) -> None:
    forget(world, about="die Scheidung")

    world.clock.now = NOON + FORGET_KEEP + timedelta(minutes=1)
    told(world)

    assert world.memory_store.forgotten == {}
