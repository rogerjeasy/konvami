"""What the phone's reminders need from the server (spec §6.18): the questions partners ask
after the learner's events, and a word of the day."""

from datetime import date, timedelta
from itertools import pairwise
from uuid import uuid4

import pytest

from konvami_api.domain.cards import CardError
from konvami_api.domain.memories import Memory
from konvami_api.domain.reminders import FollowUp
from konvami_api.domain.reports import Word
from tests.world import NOON, OTHER_USER, USER, World

# NOON is Friday 9 October 2026.
TODAY = NOON.date()
ZURICH = "Europe/Zurich"


def event(world: World, day: date | None, ask: str | None, number: int = 1) -> None:
    """An event the learner told about, with what its partner asks the day after it."""
    world.memory_store.add(
        USER,
        f"event {number}",
        Memory(
            id=uuid4(),
            kind="event",
            text=f"Event {number}.",
            day=day,
            importance=2,
            persona_id=None,
            source_call_id=None,
            created_at=NOON,
            updated_at=NOON,
            ask=ask,
        ),
        100,
    )


def learner() -> World:
    world = World()
    world.onboard()
    return world


def test_an_event_ahead_is_asked_about_the_day_after_it() -> None:
    world = learner()
    event(world, TODAY + timedelta(days=2), "Alors, cet entretien ?")

    notes = world.reminders.notes(USER, ZURICH)

    assert notes.follow_ups == (
        FollowUp(day=TODAY + timedelta(days=3), text="Alors, cet entretien ?"),
    )


@pytest.mark.parametrize(
    "day",
    [
        # Asked yesterday already, or the day after is more than a week away.
        TODAY - timedelta(days=2),
        TODAY + timedelta(days=7),
        None,
    ],
)
def test_only_the_next_seven_days_are_asked_about(day: date | None) -> None:
    world = learner()
    event(world, day, "Alors ?")

    assert world.reminders.notes(USER, ZURICH).follow_ups == ()


def test_an_event_without_a_question_or_with_memory_off_is_not_asked_about() -> None:
    world = learner()
    event(world, TODAY + timedelta(days=1), None, 1)
    event(world, TODAY + timedelta(days=2), "Alors ?", 2)
    world.memories.configure(USER, enabled=False)

    assert world.reminders.notes(USER, ZURICH).follow_ups == ()


def saved_words(world: World, *words: str) -> None:
    lena = world.personas.partners(USER)[0]
    call_id = world.talk(lena, at=NOON - timedelta(hours=1))
    world.reported(call_id, words=tuple(Word(text, f"sens de {text}", None) for text in words))
    for index in range(len(words)):
        world.cards.save(USER, call_id, "word", index)


def test_each_of_the_next_seven_days_has_one_of_the_learners_words() -> None:
    world = learner()
    saved_words(world, "das Wochenende", "umsteigen", "die Feier")

    words = world.reminders.notes(USER, ZURICH).words

    assert [word.day for word in words] == [TODAY + timedelta(days=n) for n in range(7)]
    texts = [word.card.front for word in words]
    # They take turns, so the same week does not show one word twice in a row.
    assert set(texts) == {"das Wochenende", "umsteigen", "die Feier"}
    assert all(a != b for a, b in pairwise(texts))
    # The same day always has the same word.
    assert world.reminders.notes(USER, ZURICH).words == words


def test_a_learner_without_saved_words_has_no_word_of_the_day() -> None:
    assert learner().reminders.notes(USER, ZURICH).words == ()


def test_a_card_is_read_by_its_owner_only() -> None:
    world = learner()
    saved_words(world, "umsteigen")
    card = world.reminders.notes(USER, ZURICH).words[0].card

    assert world.cards.card(USER, card.id) == card
    with pytest.raises(CardError):
        world.cards.card(OTHER_USER, card.id)
