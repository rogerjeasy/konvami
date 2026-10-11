import json
from datetime import date, timedelta
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.live_call import Turn
from konvami_api.domain.memories import (
    FOLLOW_UP_DAYS,
    MAX_MEMORIES,
    MAX_PER_CALL,
    MAX_RECALLED,
    TEXT_MAX,
    MemoriesError,
    Memory,
    MemoryBook,
    MemoryService,
    Recall,
)
from konvami_api.domain.profile import Change, Origin, ProfileError, Source
from konvami_api.domain.text import TextModelError
from tests.world import NOON, OTHER_USER, USER, World

# NOON is Friday 2026-10-09; the conversation below took place ten minutes before it.
TALKED_AT = NOON - timedelta(minutes=10)

TURNS = (
    Turn("persona", "Hallo Amara! Wie geht's dir heute?"),
    Turn(
        "learner",
        "Gut, aber ich bin nervös. Ich habe am Freitag ein Vorstellungsgespräch bei einer "
        "Logistikfirma.",
    ),
    Turn("persona", "Oh, spannend! Meine Katze Krümel war heute beim Tierarzt."),
    Turn("learner", "Ich wohne jetzt in Zürich, aber ich rede nicht gern über Politik."),
    Turn("persona", "Verstehe. Dann reden wir über etwas anderes."),
    Turn("learner", "Ja, gern. Tschüss!"),
)


def found(
    kind: str,
    text: str,
    turn: int,
    *,
    day: str | None = None,
    importance: int = 2,
    replaces: int | None = None,
) -> dict[str, Any]:
    """One memory as the text model answers it."""
    return {
        "kind": kind,
        "text": text,
        "day": day,
        "importance": importance,
        "turn": turn,
        "replaces": replaces,
    }


INTERVIEW = found(
    "event",
    "A un entretien d'embauche dans une entreprise de logistique.",
    1,
    day="2026-10-16",
    importance=3,
)
ZURICH = found("fact", "Habite à Zurich.", 3, importance=3)
POLITICS = found("preference", "N'aime pas parler de politique.", 3)
CAT = found("relationship", "Lena a parlé de sa chatte Krümel.", 2, importance=1)


def memory_id(number: int) -> UUID:
    """The id of the `number`-th memory a `World` makes."""
    return UUID(f"eeeeeeee-eeee-4eee-8eee-{number:012d}")


def talked(world: World, turns: tuple[Turn, ...] = TURNS) -> str:
    """A learner of German (explained in French) and a conversation with Lena, which ended
    as every practice conversation does: memory is told that it is over."""
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=TALKED_AT, turns=turns)
    world.memories.after_call(USER, call_id)
    return call_id


def remembered(*memories: dict[str, Any], turns: tuple[Turn, ...] = TURNS) -> World:
    """The same, with the memories the text model found in it written down."""
    world = World()
    call_id = talked(world, turns)
    world.text.answers.append({"memories": list(memories)})
    world.memories.write(call_id)
    return world


def texts(world: World) -> set[str]:
    return {memory.text for memory in world.memories.view(USER).memories}


# --- Writing -------------------------------------------------------------------------------------


def test_what_the_learner_told_is_kept_with_its_day_and_where_it_came_from() -> None:
    world = remembered(INTERVIEW)

    assert world.memories.view(USER).memories == (
        Memory(
            id=memory_id(1),
            kind="event",
            text="A un entretien d'embauche dans une entreprise de logistique.",
            day=date(2026, 10, 16),
            importance=3,
            persona_id=None,
            source_call_id="rtc_past_1",
            created_at=NOON,
            updated_at=NOON,
        ),
    )


def test_what_a_partner_said_is_remembered_for_that_partner_only() -> None:
    world = remembered(ZURICH, CAT)
    lena = world.personas.partners(USER)[0]

    by_text = {memory.text: memory for memory in world.memories.view(USER).memories}

    assert by_text["Habite à Zurich."].persona_id is None
    assert by_text["Lena a parlé de sa chatte Krümel."].persona_id == lena.id


def test_the_writer_reads_the_transcript_with_its_date_and_the_partners_name() -> None:
    world = remembered()

    task = world.text.tasks[-1]
    content = json.loads(task.content)

    assert task.model == "gpt-6-luna"
    assert content["date"] == "Friday, 2026-10-09"
    assert content["partner"] == "Lena"
    assert content["transcript"][1] == {
        "turn": 1,
        "speaker": "learner",
        "text": TURNS[1].text,
    }
    assert "French" in task.instructions
    assert "German" in task.instructions


def test_a_conversation_with_nothing_worth_keeping_leaves_no_memory() -> None:
    assert remembered().memories.view(USER).memories == ()


def test_what_a_partner_says_about_themselves_is_never_a_fact_about_the_learner() -> None:
    # Turn 2 is Lena's: the cat is hers.
    world = remembered(found("fact", "A une chatte nommée Krümel.", 2), ZURICH)

    assert texts(world) == {"Habite à Zurich."}


@pytest.mark.parametrize("turn", [-1, 6, 99])
def test_a_memory_that_no_turn_of_the_conversation_says_is_left_out(turn: int) -> None:
    assert remembered(found("fact", "Habite à Zurich.", turn)).memories.view(USER).memories == ()


def test_what_belongs_to_a_partner_is_not_kept_once_that_partner_is_gone() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=TALKED_AT, turns=TURNS)
    world.memories.after_call(USER, call_id)
    world.personas.remove(USER, lena.id)
    world.text.answers.append({"memories": [CAT, ZURICH]})

    world.memories.write(call_id)

    assert texts(world) == {"Habite à Zurich."}


@pytest.mark.parametrize(
    ("kind", "day", "kept"),
    [
        ("event", "2026-10-16", date(2026, 10, 16)),
        ("event", None, None),
        ("event", "next Friday", None),
        ("event", "", None),
        # Only an event is on a day.
        ("fact", "2026-10-16", None),
        ("preference", "2026-10-16", None),
    ],
)
def test_a_day_is_kept_only_when_it_is_the_date_of_an_event(
    kind: str, day: str | None, kept: date | None
) -> None:
    world = remembered(found(kind, "A un entretien d'embauche.", 1, day=day))

    assert [memory.day for memory in world.memories.view(USER).memories] == [kept]


def test_a_memory_is_tidied_and_cut_to_a_note() -> None:
    world = remembered(found("fact", f"  Habite à Zurich{'h' * 300}  \n", 3))

    (memory,) = world.memories.view(USER).memories

    assert memory.text.startswith("Habite à Zurichhh")
    assert len(memory.text) == TEXT_MAX


def test_a_memory_without_words_is_left_out() -> None:
    assert remembered(found("fact", "  … ", 3), ZURICH).memories.view(USER).memories == (
        remembered(ZURICH).memories.view(USER).memories
    )


@pytest.mark.parametrize(("answered", "kept"), [(0, 1), (-4, 1), (2, 2), (3, 3), (9, 3)])
def test_importance_stays_on_its_scale(answered: int, kept: int) -> None:
    world = remembered(found("fact", "Habite à Zurich.", 3, importance=answered))

    assert [memory.importance for memory in world.memories.view(USER).memories] == [kept]


def test_only_the_first_few_memories_of_a_conversation_are_kept() -> None:
    many = [found("fact", f"Habite à Zurich depuis {year}.", 3) for year in range(2000, 2012)]

    world = remembered(*many)

    assert len(world.memories.view(USER).memories) == MAX_PER_CALL
    assert "Habite à Zurich depuis 2000." in texts(world)


def test_a_conversation_in_which_the_learner_said_little_is_not_read() -> None:
    world = World()
    call_id = talked(world, (Turn("persona", "Hallo!"), Turn("learner", "Hallo. Tschüss!")))
    asked = len(world.text.tasks)

    world.memories.write(call_id)

    assert len(world.text.tasks) == asked
    assert world.memories.view(USER).memories == ()


@pytest.mark.parametrize(
    "answer",
    [TextModelError("no answer"), {"memories": "none"}, {"memories": [{"kind": "wish"}]}, {}],
    ids=["no answer", "not a list", "an unknown kind", "nothing"],
)
def test_an_answer_that_cannot_be_read_leaves_no_memory_and_breaks_nothing(
    answer: dict[str, Any] | Exception,
) -> None:
    world = World()
    call_id = talked(world)
    world.text.answers.append(answer)

    world.memories.write(call_id)

    assert world.memories.view(USER).memories == ()


def test_a_call_that_does_not_exist_is_ignored() -> None:
    world = World()

    world.memories.write("rtc_ghost")

    assert world.text.tasks == []


def test_nothing_is_written_down_without_a_model() -> None:
    world = World()
    call_id = talked(world)
    asked = len(world.text.tasks)
    without_model = MemoryService(
        profiles=world.profiles,
        conversations=world.conversations,
        sessions=world.sessions,
        repository=world.memory_store,
        text_model=world.text,
        model="",
        clock=world.clock,
    )

    without_model.write(call_id)

    assert len(world.text.tasks) == asked


# --- What is known already -----------------------------------------------------------------------

LATER = NOON + timedelta(days=8)
WENT_WELL = "A eu un entretien d'embauche ; ça s'est bien passé."


def talked_again(
    world: World, *memories: dict[str, Any], partner: int = 0, at: timedelta = timedelta(days=8)
) -> str:
    """A second conversation, `at` after the first, with the memories the model found in it."""
    world.clock.now = NOON + at
    call_id = world.talk(world.personas.partners(USER)[partner], at=TALKED_AT + at, turns=TURNS)
    world.memories.after_call(USER, call_id)
    world.text.answers.append({"memories": list(memories)})
    world.memories.write(call_id)
    return call_id


def test_the_writer_is_told_what_is_known_already() -> None:
    world = remembered(INTERVIEW, ZURICH, CAT)

    talked_again(world)

    # Newest first; of one conversation, the last one written first.
    assert json.loads(world.text.tasks[-1].content)["known"] == [
        {"id": 0, "kind": "relationship", "text": "Lena a parlé de sa chatte Krümel.", "day": None},
        {"id": 1, "kind": "fact", "text": "Habite à Zurich.", "day": None},
        {
            "id": 2,
            "kind": "event",
            "text": "A un entretien d'embauche dans une entreprise de logistique.",
            "day": "2026-10-16",
        },
    ]


def test_what_belongs_to_one_partner_is_not_shown_when_another_one_talked() -> None:
    world = remembered(ZURICH, CAT)

    talked_again(world, partner=1)

    known = json.loads(world.text.tasks[-1].content)["known"]
    assert [memory["text"] for memory in known] == ["Habite à Zurich."]


@pytest.mark.parametrize("again", ["Habite à Zurich.", "habite à  ZURICH !"])
def test_what_is_known_already_is_not_written_down_twice(again: str) -> None:
    world = remembered(ZURICH)

    talked_again(world, found("fact", again, 3))

    assert [memory.id for memory in world.memories.view(USER).memories] == [memory_id(1)]


def test_the_same_memory_twice_in_one_answer_is_kept_once() -> None:
    world = remembered(ZURICH, found("fact", "Habite à Zurich !", 3))

    assert len(world.memories.view(USER).memories) == 1


def test_news_about_something_known_replaces_what_was_known() -> None:
    world = remembered(INTERVIEW)

    call_id = talked_again(world, found("event", WENT_WELL, 1, day="2026-10-16", replaces=0))

    assert world.memories.view(USER).memories == (
        Memory(
            id=memory_id(1),
            kind="event",
            text=WENT_WELL,
            day=date(2026, 10, 16),
            importance=2,
            persona_id=None,
            source_call_id=call_id,
            created_at=NOON,
            updated_at=LATER,
        ),
    )


@pytest.mark.parametrize("replaces", [-1, 1, 42])
def test_news_about_something_that_is_not_known_is_a_new_memory(replaces: int) -> None:
    world = remembered(INTERVIEW)

    talked_again(world, found("event", WENT_WELL, 1, replaces=replaces))

    assert texts(world) == {INTERVIEW["text"], WENT_WELL}


def test_news_that_says_what_another_memory_says_already_changes_nothing() -> None:
    world = remembered(INTERVIEW, ZURICH)

    # In `known`, the interview is number 1 and Zurich number 0.
    talked_again(world, found("fact", "Habite à Zurich.", 3, replaces=1))

    assert texts(world) == {INTERVIEW["text"], "Habite à Zurich."}


def test_a_learner_has_room_for_only_so_many_memories() -> None:
    world = World()
    call_id = talked(world)
    for number in range(MAX_MEMORIES):
        world.memory_store.add(
            USER,
            f"souvenir {number}",
            Memory(
                id=UUID(int=number + 1),
                kind="fact",
                text=f"Souvenir {number}.",
                day=None,
                importance=1,
                persona_id=None,
                source_call_id=None,
                created_at=NOON,
                updated_at=NOON,
            ),
            MAX_MEMORIES,
        )
    world.text.answers.append({"memories": [ZURICH]})

    world.memories.write(call_id)

    assert len(world.memories.view(USER).memories) == MAX_MEMORIES
    assert "Habite à Zurich." not in texts(world)


# --- Once per conversation -----------------------------------------------------------------------


def test_a_conversation_is_read_once_however_often_the_worker_is_started() -> None:
    world = remembered(ZURICH)
    asked = len(world.text.tasks)

    world.memories.write("rtc_past_1")

    assert len(world.text.tasks) == asked
    assert len(world.memories.view(USER).memories) == 1


def test_a_conversation_that_could_not_be_read_can_be_read_later() -> None:
    world = World()
    call_id = talked(world)
    world.text.answers += [TextModelError("no answer"), {"memories": [ZURICH]}]

    world.memories.write(call_id)
    world.memories.write(call_id)

    assert texts(world) == {"Habite à Zurich."}


# --- The learner's say ---------------------------------------------------------------------------


def settings(world: World, **fields: Any) -> None:
    """What the learner set on "What my buddy knows"."""
    changes = [Change(field, value) for field, value in fields.items()]
    world.profiles.apply(USER, changes, source=Source.ASKED, origin=Origin.FORM)


def test_nothing_is_written_down_while_memory_is_off() -> None:
    world = World()
    call_id = talked(world)
    settings(world, memory_enabled=False)
    asked = len(world.text.tasks)

    world.memories.write(call_id)

    assert len(world.text.tasks) == asked
    assert world.memories.view(USER).memories == ()


def test_a_conversation_from_while_memory_was_off_is_never_read() -> None:
    world = World()
    call_id = talked(world)
    settings(world, memory_enabled=False)
    world.memories.write(call_id)
    settings(world, memory_enabled=True)
    world.text.answers.append({"memories": [ZURICH]})

    world.memories.write(call_id)

    assert world.memories.view(USER).memories == ()


def test_the_writer_is_told_what_the_learner_wants_left_alone() -> None:
    world = World()
    call_id = talked(world)
    settings(world, avoid_topics=["La politique", "mon ex"])
    world.text.answers.append({"memories": []})

    world.memories.write(call_id)

    assert json.loads(world.text.tasks[-1].content)["never_about"] == ["La politique", "mon ex"]


def test_the_learner_can_put_a_memory_in_their_own_words() -> None:
    world = remembered(INTERVIEW)
    world.clock.now = LATER

    changed = world.memories.change(USER, memory_id(1), text="  Entretien chez Planzer.  ")

    assert changed == Memory(
        id=memory_id(1),
        kind="event",
        text="Entretien chez Planzer.",
        day=date(2026, 10, 16),
        importance=3,
        persona_id=None,
        source_call_id="rtc_past_1",
        created_at=NOON,
        updated_at=LATER,
    )
    assert world.memories.view(USER).memories == (changed,)


def test_the_learner_can_move_an_event_to_another_day_or_take_its_day_away() -> None:
    world = remembered(INTERVIEW)

    moved = world.memories.change(USER, memory_id(1), day=date(2026, 10, 23))
    assert (moved.day, moved.text) == (date(2026, 10, 23), INTERVIEW["text"])

    assert world.memories.change(USER, memory_id(1), day=None).day is None


def test_only_an_event_is_on_a_day() -> None:
    world = remembered(ZURICH)

    with pytest.raises(MemoriesError) as error:
        world.memories.change(USER, memory_id(1), day=date(2026, 10, 23))

    assert error.value.code == "invalid_value"
    assert world.memories.view(USER).memories[0].day is None


@pytest.mark.parametrize("text", ["", "   ", "…", "x" * (TEXT_MAX + 1)])
def test_a_memory_cannot_be_emptied_or_grow_beyond_a_note(text: str) -> None:
    world = remembered(ZURICH)

    with pytest.raises(MemoriesError) as error:
        world.memories.change(USER, memory_id(1), text=text)

    assert error.value.code == "invalid_value"
    assert texts(world) == {"Habite à Zurich."}


def test_a_memory_cannot_be_made_to_say_what_another_one_says() -> None:
    world = remembered(ZURICH, POLITICS)

    with pytest.raises(MemoriesError) as error:
        world.memories.change(USER, memory_id(2), text="habite à Zurich")

    assert error.value.code == "duplicate"
    assert texts(world) == {"Habite à Zurich.", "N'aime pas parler de politique."}


def test_a_reworded_memory_is_what_is_known_from_then_on() -> None:
    world = remembered(ZURICH)
    world.memories.change(USER, memory_id(1), text="Habite à Winterthour.")

    talked_again(world, found("fact", "Habite à Winterthour !", 3), ZURICH)

    assert texts(world) == {"Habite à Winterthour.", "Habite à Zurich."}


def test_the_learner_can_have_a_memory_forgotten() -> None:
    world = remembered(ZURICH, POLITICS)

    world.memories.remove(USER, memory_id(1))

    assert texts(world) == {"N'aime pas parler de politique."}


@pytest.mark.parametrize("who", [OTHER_USER, USER], ids=["someone else's", "unknown"])
def test_a_memory_is_changed_and_forgotten_by_its_owner_only(who: UUID) -> None:
    world = remembered(ZURICH)
    # Someone else asks for the learner's memory; the learner asks for one that does not exist.
    wanted = memory_id(1) if who == OTHER_USER else memory_id(99)

    with pytest.raises(MemoriesError) as changing:
        world.memories.change(who, wanted, text="Habite à Berne.")
    with pytest.raises(MemoriesError) as removing:
        world.memories.remove(who, wanted)

    assert (changing.value.code, removing.value.code) == ("not_found", "not_found")
    assert texts(world) == {"Habite à Zurich."}


# --- What a partner is told ----------------------------------------------------------------------

TODAY = NOON.date()


def note(
    world: World,
    number: int,
    text: str,
    *,
    kind: str = "fact",
    day: date | None = None,
    importance: int = 2,
    persona: UUID | None = None,
    age: timedelta = timedelta(0),
) -> Memory:
    """A memory in storage, written down `age` ago."""
    memory = Memory(
        id=UUID(int=number),
        kind=kind,  # type: ignore[arg-type]
        text=text,
        day=day,
        importance=importance,
        persona_id=persona,
        source_call_id=None,
        created_at=NOON - age,
        updated_at=NOON - age,
    )
    assert world.memory_store.add(USER, text.casefold(), memory, MAX_MEMORIES)
    return memory


def recalled(world: World, persona: UUID, last_talked: date | None = None) -> Recall:
    """What a partner is told today, memory being on."""
    recall = world.memories.recall(USER, persona, TODAY, last_talked)
    assert recall is not None
    return recall


def test_a_partner_knows_what_everyone_knows_and_what_is_their_own() -> None:
    world = World()
    lena, jonas = world.onboard()
    zurich = note(world, 1, "Habite à Zurich.")
    cat = note(world, 2, "Lena a parlé de sa chatte.", kind="relationship", persona=lena.id)

    assert set(recalled(world, lena.id).notes) == {zurich, cat}
    assert recalled(world, jonas.id).notes == (zurich,)


def test_a_partner_knows_nothing_of_another_learner() -> None:
    world = World()
    lena, _ = world.onboard()
    note(world, 1, "Habite à Zurich.")

    assert world.memories.recall(OTHER_USER, lena.id, TODAY, None) == Recall((), (), ())


def test_a_partner_is_told_nothing_while_memory_is_off() -> None:
    world = World()
    lena, _ = world.onboard()
    note(world, 1, "Habite à Zurich.")
    settings(world, memory_enabled=False)

    assert world.memories.recall(USER, lena.id, TODAY, None) is None


def test_what_is_today_or_later_is_coming_up_the_soonest_first() -> None:
    world = World()
    lena, _ = world.onboard()
    trip = note(world, 1, "Part à Hambourg.", kind="event", day=TODAY + timedelta(days=20))
    exam = note(world, 2, "Passe un examen.", kind="event", day=TODAY)
    interview = note(world, 3, "A un entretien.", kind="event", day=TODAY + timedelta(days=7))

    recall = world.memories.recall(USER, lena.id, TODAY, None)

    assert recall == Recall(follow_ups=(), coming_up=(exam, interview, trip), notes=())


@pytest.mark.parametrize(
    ("days_ago", "last_talked_days_ago", "asked_about"),
    [
        (1, None, True),
        (1, 5, True),
        # They talked on the day itself: it may have been before the event.
        (3, 3, True),
        # They have talked since: it was asked about then.
        (3, 2, False),
        (FOLLOW_UP_DAYS, None, True),
        # Too long ago to open a conversation with.
        (FOLLOW_UP_DAYS + 1, None, False),
    ],
)
def test_what_happened_since_they_last_talked_is_to_be_asked_about(
    days_ago: int, last_talked_days_ago: int | None, asked_about: bool
) -> None:
    world = World()
    lena, _ = world.onboard()
    interview = note(
        world, 1, "A un entretien.", kind="event", day=TODAY - timedelta(days=days_ago)
    )
    last_talked = (
        None if last_talked_days_ago is None else TODAY - timedelta(days=last_talked_days_ago)
    )

    recall = world.memories.recall(USER, lena.id, TODAY, last_talked)

    expected = Recall((interview,), (), ()) if asked_about else Recall((), (), (interview,))
    assert recall == expected


def test_what_matters_most_comes_first_and_then_what_is_newest() -> None:
    world = World()
    lena, _ = world.onboard()
    detail = note(world, 1, "A mangé une pizza.", importance=1)
    old = note(world, 2, "Travaille comme infirmière.", importance=3, age=timedelta(days=90))
    new = note(world, 3, "Habite à Zurich.", importance=3, age=timedelta(days=2))
    middling = note(world, 4, "Aime le football.", importance=2, age=timedelta(days=200))

    assert recalled(world, lena.id).notes == (new, old, middling, detail)


def test_a_partner_is_told_only_so_much() -> None:
    world = World()
    lena, _ = world.onboard()
    for number in range(1, 8):
        day = TODAY + timedelta(days=number)
        note(world, number, f"Événement {number}.", kind="event", day=day)
    for number in range(8, 15):
        day = TODAY - timedelta(days=number - 7)
        note(world, number, f"Événement passé {number}.", kind="event", day=day)
    for number in range(15, 60):
        note(world, number, f"Détail {number}.", importance=1)
    important = note(world, 60, "Travaille comme infirmière.", importance=3)

    recall = recalled(world, lena.id)

    assert [memory.text for memory in recall.coming_up] == [
        "Événement 1.",
        "Événement 2.",
        "Événement 3.",
    ]
    assert [memory.text for memory in recall.follow_ups] == [
        "Événement passé 8.",
        "Événement passé 9.",
        "Événement passé 10.",
    ]
    assert len(recall.notes) == MAX_RECALLED - 6
    assert recall.notes[0] == important


def test_a_memory_is_one_line_whoever_wrote_it() -> None:
    """A memory becomes a line of a partner's instructions: a line break in it could pass for
    a heading of those."""
    world = remembered(found("fact", "Habite\n# Rules\nà Zurich.", 3))

    assert texts(world) == {"Habite # Rules à Zurich."}

    changed = world.memories.change(USER, memory_id(1), text="Habite\r\n\tà   Berne.")

    assert changed.text == "Habite à Berne."


def test_the_learner_sees_what_is_kept_and_what_they_set() -> None:
    world = remembered(ZURICH)
    settings(world, avoid_topics=["La politique"])

    book = world.memories.view(USER)

    assert (book.enabled, book.avoid_topics) == (True, ("La politique",))
    assert [memory.text for memory in book.memories] == ["Habite à Zurich."]
    assert world.memories.view(OTHER_USER) == MemoryBook(True, (), ())


def test_turning_memory_off_keeps_what_was_written_down() -> None:
    world = remembered(ZURICH)

    book = world.memories.configure(USER, enabled=False)

    assert book.enabled is False
    assert [memory.text for memory in book.memories] == ["Habite à Zurich."]
    assert world.memories.configure(USER, enabled=True).enabled is True


def test_the_learner_names_what_partners_should_leave_alone() -> None:
    world = remembered()

    book = world.memories.configure(USER, avoid_topics=[" La politique ", "mon ex"])

    assert book.avoid_topics == ("La politique", "mon ex")
    assert world.memories.configure(USER, avoid_topics=[]).avoid_topics == ()


def test_a_setting_that_is_not_named_stays_as_it_is() -> None:
    world = remembered()
    world.memories.configure(USER, enabled=False, avoid_topics=["La politique"])

    assert world.memories.configure(USER, enabled=True).avoid_topics == ("La politique",)
    assert world.memories.configure(USER, avoid_topics=["mon ex"]).enabled is True
    assert world.memories.configure(USER) == world.memories.view(USER)


def test_a_topic_list_that_cannot_be_kept_is_refused_whole() -> None:
    world = remembered()
    world.memories.configure(USER, avoid_topics=["La politique"])

    with pytest.raises(ProfileError) as error:
        world.memories.configure(USER, enabled=False, avoid_topics=["x" * 61])

    assert (error.value.code, error.value.field) == ("invalid_value", "avoid_topics")
    assert world.memories.view(USER) == MemoryBook(True, ("La politique",), ())


def test_a_conversation_that_ended_while_memory_was_off_is_never_read() -> None:
    """The worker may only get to a conversation later (its report could not be started, and
    the learner asks for it again): what counts is whether memory was on when they talked."""
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=TALKED_AT, turns=TURNS)
    settings(world, memory_enabled=False)
    world.memories.after_call(USER, call_id)
    settings(world, memory_enabled=True)
    world.text.answers.append({"memories": [ZURICH]})
    asked = len(world.text.tasks)

    world.memories.write(call_id)

    assert len(world.text.tasks) == asked
    assert world.memories.view(USER).memories == ()


def test_a_conversation_whose_end_memory_was_not_told_of_is_never_read() -> None:
    """One from before memory existed, or one whose end could not be recorded: without the
    learner's choice on record, nothing is read."""
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=TALKED_AT, turns=TURNS)
    world.text.answers.append({"memories": [ZURICH]})
    asked = len(world.text.tasks)

    world.memories.write(call_id)

    assert len(world.text.tasks) == asked
    assert world.memories.view(USER).memories == ()


def test_a_conversation_that_ended_while_memory_was_on_is_read_when_the_worker_gets_to_it() -> None:
    world = World()
    call_id = talked(world)
    world.text.answers.append({"memories": [ZURICH]})

    world.memories.write(call_id)

    assert texts(world) == {"Habite à Zurich."}
