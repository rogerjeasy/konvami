"""Role-play over HTTP (spec §6.3): the scenarios a language offers, a call that rehearses one,
and the goals reached, read with the conversation."""

from datetime import timedelta

from konvami_api.domain.live_call import Turn
from konvami_api.domain.voice import FinishedCall
from tests.api.conftest import Call
from tests.api.test_api import NOON, onboarded
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel


def test_the_catalog_lists_each_languages_role_plays(call: Call) -> None:
    german = call("GET", "/v1/catalog").body["languages"][0]

    bakery = next(s for s in german["scenarios"] if s["id"] == "bakery")
    assert bakery == {"id": "bakery", "level": "A1", "goals": ["order", "price", "pay"]}


def test_a_practice_call_can_rehearse_a_role_play(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, _ = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"], "scenario": "bakery"},
    )

    assert response.status == 200
    call_id = response.body["callId"]
    assert calls.sessions[call_id].scenario == "bakery"


def test_a_role_play_the_language_does_not_offer_is_refused(
    call: Call, text_model: ScriptedTextModel
) -> None:
    lena, _ = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"], "scenario": "moon"},
    )

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


def test_a_conversation_says_which_role_play_it_was_and_the_goals_reached(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, _ = onboarded(call, text_model)
    call_id = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"], "scenario": "bakery"},
    ).body["callId"]
    calls.finish(
        call_id,
        FinishedCall(NOON + timedelta(minutes=4), "closed", {}, (Turn("learner", "Zwei, bitte."),)),
    )
    calls.goals_reached(call_id, ("order",))

    conversation = call("GET", f"/v1/conversations/{call_id}").body["conversation"]

    assert (conversation["scenario"], conversation["goalsReached"]) == ("bakery", ["order"])
