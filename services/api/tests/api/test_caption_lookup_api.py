"""Caption explanations and explicit card saves over HTTP (spec §6.4)."""

from tests.api.conftest import OTHER_USER, Call
from tests.api.test_api import onboarded
from tests.fakes import ScriptedTextModel


def test_caption_lookup_then_explicit_card_save(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    text_model.answers.append(
        {"meaning": "appointment", "article": "der", "plural": "Termine", "unsure": False}
    )
    found = call(
        "POST",
        "/v1/captions/lookup",
        {"language": "de", "word": "Termin", "caption": "Ich habe einen Termin."},
    )
    assert found.status == 200
    assert found.body["word"] == "Termin"
    assert found.body["saved"] is False
    kept = call(
        "POST",
        "/v1/captions/card",
        {"language": "de", "word": "Termin", "meaning": found.body["meaning"]},
    )
    assert kept.status == 200
    assert kept.body["front"] == "Termin"
    assert call("GET", "/v1/cards", subject=OTHER_USER).body["total"] == 0


def test_invalid_caption_returns_validation_code(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    found = call(
        "POST", "/v1/captions/lookup", {"language": "de", "word": "Term", "caption": "Termin"}
    )
    assert found.status == 422
