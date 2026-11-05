"""The phrasebook (spec §6.7): phrases for a learner's situations, kept with their meaning, and
turned into flashcards on request."""

import json
from datetime import timedelta
from typing import Any

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.phrasebook import (
    DAILY_LIMIT,
    MAX_SUGGESTIONS,
    PhrasebookError,
    Suggestion,
)
from konvami_api.domain.text import TextModelError
from tests.world import NOON, OTHER_USER, USER, World

ANSWER: dict[str, Any] = {
    "phrases": [
        {"phrase": "Ich hätte gern einen Termin.", "meaning": "Je voudrais un rendez-vous."},
        {
            "phrase": "Könnten Sie das bitte wiederholen ?",
            "meaning": "Pourriez-vous répéter, s'il vous plaît ?",
        },
    ]
}


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    # Onboarding asked the text model for partners: only the phrasebook's requests count below.
    world.text.tasks.clear()
    return world


def suggested(world: World, situation: str = "chez le médecin", answer: Any = ANSWER) -> Any:
    world.text.answers.append(answer)
    return world.phrasebook.suggest(USER, situation)


def test_phrases_are_suggested_for_a_situation(world: World) -> None:
    assert suggested(world) == [
        Suggestion("Ich hätte gern einen Termin.", "Je voudrais un rendez-vous."),
        Suggestion(
            "Könnten Sie das bitte wiederholen ?", "Pourriez-vous répéter, s'il vous plaît ?"
        ),
    ]


def test_a_suggestion_is_not_kept_until_the_learner_keeps_it(world: World) -> None:
    suggested(world)

    assert world.phrasebook.phrases(USER) == []


def test_the_request_names_the_languages_the_level_and_the_need_and_is_charged(
    world: World,
) -> None:
    suggested(world)

    task = world.text.tasks[-1]
    content = json.loads(task.content)
    assert task.model == "gpt-6.1-sol"
    assert "German" in task.instructions
    assert "French" in task.instructions
    assert content == {"level": "A2", "need": "chez le médecin"}
    assert task.charge == Charge(USER, Feature.PHRASEBOOK)
    assert task.max_seconds is not None


def test_a_learner_who_wants_no_explanations_in_their_language_gets_them_in_german() -> None:
    world = World()
    world.onboard(usage="never")

    suggested(world)

    assert "written in German" in world.text.tasks[-1].instructions


def test_repeated_blank_and_surplus_suggestions_are_dropped(world: World) -> None:
    phrases = [
        {"phrase": "Guten Tag.", "meaning": "Bonjour."},
        {"phrase": "guten tag", "meaning": "Bonjour (encore)."},
        {"phrase": "  ", "meaning": "rien"},
        {"phrase": "Danke.", "meaning": ""},
        *({"phrase": f"Satz {n}.", "meaning": f"Phrase {n}."} for n in range(10)),
    ]

    found = suggested(world, answer={"phrases": phrases})

    assert [s.phrase for s in found][:2] == ["Guten Tag.", "Satz 0."]
    assert len(found) <= MAX_SUGGESTIONS


def test_a_phrase_that_is_kept_already_is_marked_in_the_suggestions(world: World) -> None:
    world.phrasebook.save(USER, "ich hätte gern einen termin", "Je voudrais un rendez-vous.")

    found = suggested(world)

    assert [s.saved for s in found] == [True, False]


@pytest.mark.parametrize("situation", ["", "   ", "x" * 201])
def test_a_blank_or_long_situation_is_refused(world: World, situation: str) -> None:
    with pytest.raises(PhrasebookError) as refused:
        world.phrasebook.suggest(USER, situation)

    assert refused.value.code == "invalid_value"
    assert world.text.tasks == []


def test_without_consent_nothing_is_sent_to_the_model(world: World) -> None:
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    with pytest.raises(PhrasebookError) as refused:
        world.phrasebook.suggest(USER, "chez le médecin")

    assert refused.value.code == "consent_required"
    assert world.text.tasks == []


def test_a_model_that_fails_or_answers_nothing_is_unavailable(world: World) -> None:
    answers: list[Any] = [TextModelError(), {"phrases": []}, {"nonsense": 1}]
    for answer in answers:
        world.text.answers.append(answer)
        with pytest.raises(PhrasebookError) as refused:
            world.phrasebook.suggest(USER, "chez le médecin")
        assert refused.value.code == "unavailable"


def test_suggestions_share_the_days_limit_with_the_tutor(world: World) -> None:
    for _ in range(DAILY_LIMIT):
        suggested(world)

    with pytest.raises(PhrasebookError) as refused:
        world.phrasebook.suggest(USER, "chez le médecin")

    assert refused.value.code == "suggestion_limit"

    world.clock.now = NOON + timedelta(days=1)
    assert suggested(world)


def test_a_phrase_is_kept_with_its_meaning_and_listed_newest_first(world: World) -> None:
    first = world.phrasebook.save(USER, "Guten Tag.", "Bonjour.", "saluer")
    world.clock.now = NOON + timedelta(minutes=2)
    second = world.phrasebook.save(USER, "Danke schön.", "Merci beaucoup.")

    assert first.situation == "saluer"
    assert first.explained_in == "fr"
    assert second.situation is None
    assert [entry.phrase for entry in world.phrasebook.phrases(USER)] == [second, first]


def test_keeping_a_kept_phrase_answers_with_it(world: World) -> None:
    first = world.phrasebook.save(USER, "Guten Tag.", "Bonjour.")

    again = world.phrasebook.save(USER, "guten tag", "Salut !")

    assert again == first
    assert len(world.phrasebook.phrases(USER)) == 1


@pytest.mark.parametrize(
    ("phrase", "meaning"), [("", "x"), ("x", ""), ("  ", "x"), ("?!", "x"), ("x" * 201, "x")]
)
def test_a_phrase_needs_words_and_a_meaning(world: World, phrase: str, meaning: str) -> None:
    with pytest.raises(PhrasebookError) as refused:
        world.phrasebook.save(USER, phrase, meaning)

    assert refused.value.code == "invalid_value"


def test_another_learner_does_not_see_the_phrases(world: World) -> None:
    world.phrasebook.save(USER, "Guten Tag.", "Bonjour.")
    world.onboard(OTHER_USER)

    assert world.phrasebook.phrases(OTHER_USER) == []


def test_a_phrase_can_be_removed_once(world: World) -> None:
    kept = world.phrasebook.save(USER, "Guten Tag.", "Bonjour.")

    world.phrasebook.remove(USER, kept.id)

    assert world.phrasebook.phrases(USER) == []
    with pytest.raises(PhrasebookError) as gone:
        world.phrasebook.remove(USER, kept.id)
    assert gone.value.code == "not_found"


def test_a_phrase_becomes_a_flashcard_once(world: World) -> None:
    kept = world.phrasebook.save(USER, "Guten Tag.", "Bonjour.")
    assert [e.in_deck for e in world.phrasebook.phrases(USER)] == [False]

    card = world.phrasebook.make_card(USER, kept.id)

    assert (card.kind, card.front, card.back, card.note) == ("word", "Guten Tag.", "Bonjour.", None)
    assert card.explained_in == "fr"
    assert card.source_call_id is None
    assert world.phrasebook.make_card(USER, kept.id) == card
    assert world.cards.deck(USER).total == 1
    assert [e.in_deck for e in world.phrasebook.phrases(USER)] == [True]


def test_making_a_card_of_a_phrase_that_is_not_kept_fails(world: World) -> None:
    kept = world.phrasebook.save(USER, "Guten Tag.", "Bonjour.")
    world.phrasebook.remove(USER, kept.id)

    with pytest.raises(PhrasebookError) as gone:
        world.phrasebook.make_card(USER, kept.id)

    assert gone.value.code == "not_found"
