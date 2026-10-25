"""Rich cards (spec §6.7): a word's forms, written once by a text model, and its sound in the
learner's partner's voice."""

import json
from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest

from konvami_api.domain.card_details import CLAIM_FOR
from konvami_api.domain.cards import CardError, WordDetails
from konvami_api.domain.costs import Feature
from konvami_api.domain.reports import Mistake, Word
from konvami_api.domain.speech import SpeechError
from konvami_api.domain.text import TextModelError
from tests.world import NOON, USER, World

TERMIN = Word("der Termin", "le rendez-vous", "Ich habe morgen einen Termin.")
FAHREN = Word("fahren", "aller (en véhicule)", None)
PERFEKT = Mistake(
    1, "habe gefahren", "bin gefahren", "« sein ».", "perfekt_auxiliary", "noticeable", True
)


def saved(world: World, *words: Word) -> list[Any]:
    """A learner who saved `words` from a report as cards."""
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(hours=1))
    world.reported(call_id, words=words or (TERMIN, FAHREN), mistakes=(PERFEKT,))
    return [world.cards.save(USER, call_id, "word", i) for i in range(len(words or (1, 2)))]


def details_of(world: World, card: Any) -> WordDetails | None:
    stored = world.card_store.get(USER, card.id)
    assert stored is not None
    return stored.details


DETAILS = {
    "cards": [
        {
            "id": 0,
            "part": "noun",
            "article": "der",
            "plural": "die Termine",
            "present": None,
            "preterite": None,
            "perfect": None,
            "separable": None,
            "case": None,
            "comparative": None,
            "superlative": None,
        },
        {
            "id": 1,
            "part": "verb",
            "article": None,
            "plural": None,
            "present": "fährt",
            "preterite": "fuhr",
            "perfect": "ist gefahren",
            "separable": False,
            "case": None,
            "comparative": None,
            "superlative": None,
        },
    ]
}


def test_saving_a_word_has_its_forms_written_down_in_the_background() -> None:
    world = World()

    saved(world)

    assert world.card_details_starter.started == [USER, USER]


def test_saving_a_correction_needs_no_forms() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(hours=1))
    world.reported(call_id, mistakes=(PERFEKT,))

    world.cards.save(USER, call_id, "correction", 0)

    assert world.card_details_starter.started == []


def test_a_words_forms_are_written_by_the_text_model_and_kept() -> None:
    world = World()
    termin, fahren = saved(world)
    world.text.answers.append(DETAILS)

    world.card_details.fill_in(USER)

    assert details_of(world, termin) == WordDetails(
        part="noun", article="der", plural="die Termine"
    )
    assert details_of(world, fahren) == WordDetails(
        part="verb", present="fährt", preterite="fuhr", perfect="ist gefahren", separable=False
    )


def test_the_model_reads_each_word_with_the_sentence_it_came_from() -> None:
    world = World()
    saved(world)
    world.text.answers.append(DETAILS)

    world.card_details.fill_in(USER)

    (task,) = world.text.tasks[-1:]
    assert task.model == "gpt-6.1-sol"
    assert "German" in task.instructions
    assert json.loads(task.content)["words"] == [
        {"id": 0, "word": "der Termin", "example": "Ich habe morgen einen Termin."},
        {"id": 1, "word": "fahren", "example": None},
    ]
    assert task.charge is not None
    assert task.charge.feature is Feature.CARD_DETAILS


def test_cards_with_their_forms_are_not_sent_again() -> None:
    world = World()
    saved(world)
    world.text.answers.append(DETAILS)
    world.card_details.fill_in(USER)
    asked = len(world.text.tasks)

    world.card_details.fill_in(USER)

    assert len(world.text.tasks) == asked


def test_an_article_that_is_not_one_is_left_out() -> None:
    world = World()
    (termin,) = saved(world, TERMIN)
    world.text.answers.append({"cards": [{**DETAILS["cards"][0], "article": "the"}]})

    world.card_details.fill_in(USER)

    details = details_of(world, termin)
    assert details is not None
    assert details.article is None


def test_a_word_the_model_skipped_is_not_asked_about_again() -> None:
    world = World()
    _, fahren = saved(world)
    world.text.answers.append({"cards": [DETAILS["cards"][0]]})

    world.card_details.fill_in(USER)

    assert details_of(world, fahren) == WordDetails(part="other")


def test_when_the_model_fails_the_words_are_tried_again_later() -> None:
    world = World()
    (termin,) = saved(world, TERMIN)
    world.text.answers.append(TextModelError("timeout"))
    world.card_details.fill_in(USER)
    world.text.answers.append({"cards": [DETAILS["cards"][0]]})

    # Too soon: the first worker may still be at it.
    world.card_details.fill_in(USER)
    assert details_of(world, termin) is None

    world.clock.now += CLAIM_FOR + timedelta(seconds=1)
    world.card_details.fill_in(USER)

    assert details_of(world, termin) is not None


# --- The sound of a card -------------------------------------------------------------------


def test_a_word_is_heard_with_its_sentence_in_the_partners_voice_and_kept() -> None:
    world = World()
    (termin,) = saved(world, TERMIN)

    first = world.card_details.audio(USER, termin.id)
    second = world.card_details.audio(USER, termin.id)

    (task,) = world.speech.tasks
    assert task.text == "der Termin. Ich habe morgen einen Termin."
    assert task.voice == "marin"
    assert task.charge is not None
    assert task.charge.feature is Feature.CARD_AUDIO
    assert first == second
    (key,) = world.files.keys()
    assert key.startswith(f"users/{USER}/cards/{termin.id}")
    assert first.startswith(f"https://files.test/{key}")


def test_a_removed_card_leaves_no_sound_behind() -> None:
    world = World()
    termin, fahren = saved(world)
    world.card_details.audio(USER, termin.id)
    world.card_details.audio(USER, fahren.id)

    world.card_details.forget(USER, termin.id)

    (key,) = world.files.keys()
    assert str(fahren.id) in key


def test_a_correction_is_heard_as_it_is_right() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(hours=1))
    world.reported(call_id, mistakes=(PERFEKT,))
    card = world.cards.save(USER, call_id, "correction", 0)

    world.card_details.audio(USER, card.id)

    assert world.speech.tasks[0].text == "bin gefahren"


def test_a_card_that_is_not_the_learners_has_no_sound() -> None:
    world = World()
    saved(world, TERMIN)

    with pytest.raises(CardError) as raised:
        world.card_details.audio(USER, uuid4())

    assert raised.value.code == "not_found"


def test_a_sound_that_cannot_be_made_is_unavailable() -> None:
    world = World()
    (termin,) = saved(world, TERMIN)
    world.speech.fail = SpeechError("down")

    with pytest.raises(CardError) as raised:
        world.card_details.audio(USER, termin.id)

    assert raised.value.code == "unavailable"
