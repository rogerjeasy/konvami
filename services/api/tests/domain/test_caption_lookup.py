"""Exact contextual caption lookup and explicit card saving (spec §6.4)."""

import json

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.caption_lookup import CaptionLookupError, CaptionLookupService
from tests.world import USER, World


@pytest.fixture
def world() -> World:
    found = World()
    found.onboard()
    found.text.tasks.clear()
    return found


def service(world: World) -> CaptionLookupService:
    return CaptionLookupService(
        profiles=world.profiles,
        accounts=world.accounts,
        cards=world.cards,
        limit=world.tutor_store,
        text_model=world.text,
        model="gpt-6.1-sol",
        clock=world.clock,
    )


def answer(world: World, **changes: object) -> None:
    world.text.answers.append(
        {
            "meaning": "rendez-vous",
            "article": "der",
            "plural": "Termine",
            "unsure": False,
            **changes,
        }
    )


def test_lookup_explains_exact_word_without_saving(world: World) -> None:
    answer(world)
    found = service(world).lookup(USER, "de", "Termin", "Ich habe einen Termin.")
    assert found.word == "Termin"
    assert found.meaning == "rendez-vous"
    assert found.article == "der"
    assert found.plural == "Termine"
    assert not found.saved
    assert world.cards.deck(USER).total == 0
    content = json.loads(world.text.tasks[-1].content)
    assert content["word"] == "Termin"
    assert content["caption"] == "Ich habe einen Termin."
    assert "French" in world.text.tasks[-1].instructions


@pytest.mark.parametrize(
    ("word", "caption"),
    [
        ("Term", "Termin"),
        ("", "Termin"),
        ("Termin", "Es regnet."),
        ("Termin", "x" * 1201),
        ("two words", "two words"),
    ],
)
def test_invalid_selection_never_reaches_provider(world: World, word: str, caption: str) -> None:
    with pytest.raises(CaptionLookupError, match="invalid_value"):
        service(world).lookup(USER, "de", word, caption)
    assert not world.text.tasks


def test_language_switch_cannot_save_into_wrong_deck(world: World) -> None:
    with pytest.raises(CaptionLookupError, match="language_changed"):
        service(world).lookup(USER, "fr", "Termin", "Termin")
    with pytest.raises(CaptionLookupError, match="language_changed"):
        service(world).save(USER, "fr", "Termin", "rendez-vous")
    assert world.cards.deck(USER).total == 0


def test_lookup_requires_current_consent(world: World) -> None:
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)
    with pytest.raises(CaptionLookupError, match="consent_required"):
        service(world).lookup(USER, "de", "Termin", "Termin")
    assert not world.text.tasks


def test_lookup_shares_tutor_daily_quota(world: World) -> None:
    for _ in range(40):
        assert world.tutor_store.reserve(USER, world.clock().date(), 40)
    with pytest.raises(CaptionLookupError, match="question_limit"):
        service(world).lookup(USER, "de", "Termin", "Termin")
    assert not world.text.tasks


def test_save_is_explicit_idempotent_and_marks_subsequent_lookup(world: World) -> None:
    lookup = service(world)
    card = lookup.save(USER, "de", "Termin", "rendez-vous")
    assert lookup.save(USER, "de", "Termin", "rendez-vous").id == card.id
    assert card.front == "Termin"
    assert card.back == "rendez-vous"
    assert card.explained_in == "fr"
    answer(world)
    assert lookup.lookup(USER, "de", "Termin", "Termin").saved


def test_unrelated_article_is_discarded_and_uncertainty_preserved(world: World) -> None:
    answer(world, article="the", unsure=True)
    found = service(world).lookup(USER, "de", "Termin", "Termin")
    assert found.article is None
    assert found.unsure


@pytest.mark.parametrize("meaning", ["", " " * 3, "x" * 501])
def test_invalid_provider_meaning_is_not_teachable(world: World, meaning: str) -> None:
    answer(world, meaning=meaning)
    with pytest.raises(CaptionLookupError, match="unavailable"):
        service(world).lookup(USER, "de", "Termin", "Termin")
