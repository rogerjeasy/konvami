"""The phrasebook over HTTP (spec §6.7): suggesting, keeping, listing, removing, making a card."""

from typing import Any

from konvami_api.domain.phrasebook import DAILY_LIMIT
from tests.api.conftest import OTHER_USER, Call
from tests.api.test_api import onboarded
from tests.fakes import ScriptedTextModel

SUGGESTIONS: dict[str, Any] = {
    "phrases": [
        {"phrase": "Ich hätte gern einen Termin.", "meaning": "I would like an appointment."},
        {"phrase": "Könnten Sie das wiederholen?", "meaning": "Could you repeat that?"},
    ]
}
KEPT = {"phrase": "Ich hätte gern einen Termin.", "meaning": "I would like an appointment."}
FIRST_ID = "eeeeeeee-eeee-4eee-8eee-000000000001"


def test_suggestions_are_returned_and_not_kept(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    text_model.answers.append(SUGGESTIONS)

    asked = call("POST", "/v1/phrasebook/suggestions", {"situation": "at the doctor"})

    assert asked.status == 200
    assert asked.body == {
        "suggestions": [
            {**SUGGESTIONS["phrases"][0], "saved": False},
            {**SUGGESTIONS["phrases"][1], "saved": False},
        ]
    }
    assert call("GET", "/v1/phrasebook").body == {"phrases": []}


def test_a_kept_phrase_is_listed_and_can_be_removed(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    kept = call("POST", "/v1/phrasebook", {**KEPT, "situation": "at the doctor"})

    assert kept.status == 200
    assert kept.body == {
        "id": FIRST_ID,
        "phrase": KEPT["phrase"],
        "meaning": KEPT["meaning"],
        "situation": "at the doctor",
        "explainedIn": "en",
        "createdAt": "2026-10-09T12:00:00Z",
        "inDeck": False,
    }
    assert call("GET", "/v1/phrasebook").body == {"phrases": [kept.body]}
    assert call("DELETE", f"/v1/phrasebook/{FIRST_ID}").body == {"phrases": []}
    assert call("DELETE", f"/v1/phrasebook/{FIRST_ID}").status == 404


def test_a_kept_phrase_becomes_a_flashcard(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    call("POST", "/v1/phrasebook", KEPT)

    card = call("POST", f"/v1/phrasebook/{FIRST_ID}/card")

    assert card.status == 200
    assert card.body is not None
    assert (card.body["kind"], card.body["front"], card.body["back"]) == (
        "word",
        KEPT["phrase"],
        KEPT["meaning"],
    )
    assert call("GET", "/v1/phrasebook").body["phrases"][0]["inDeck"] is True
    assert call("GET", "/v1/cards").body["total"] == 1


def test_a_blank_phrase_is_refused(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)

    refused = call("POST", "/v1/phrasebook", {"phrase": " ", "meaning": "x"})

    assert refused.status == 422
    assert refused.body == {"error": {"code": "invalid_value", "field": None}}


def test_the_days_suggestions_are_limited(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    for _ in range(DAILY_LIMIT):
        text_model.answers.append(SUGGESTIONS)
        call("POST", "/v1/phrasebook/suggestions", {"situation": "at the doctor"})

    limited = call("POST", "/v1/phrasebook/suggestions", {"situation": "at the doctor"})

    assert limited.status == 429
    assert limited.body == {"error": {"code": "suggestion_limit", "field": None}}


def test_another_learner_cannot_reach_a_phrase(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    call("POST", "/v1/phrasebook", KEPT)

    assert call("GET", "/v1/phrasebook", subject=OTHER_USER).body == {"phrases": []}
    assert call("DELETE", f"/v1/phrasebook/{FIRST_ID}", subject=OTHER_USER).status == 404
    assert call("POST", f"/v1/phrasebook/{FIRST_ID}/card", subject=OTHER_USER).status == 404
    assert len(call("GET", "/v1/phrasebook").body["phrases"]) == 1
