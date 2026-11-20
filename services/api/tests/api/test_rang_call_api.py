"""A partner's ring the learner accepted, over HTTP (5.28)."""

from konvami_api.domain.voice import RANG_CALL_SECONDS
from tests.api.conftest import Call
from tests.api.test_api import onboarded
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel


def test_an_accepted_ring_starts_a_short_practice_call(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, _ = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"], "rang": True},
    )

    assert response.status == 200
    assert response.body["maxSeconds"] == RANG_CALL_SECONDS
    assert calls.sessions[response.body["callId"]].rang


def test_a_ring_does_not_open_a_role_play(call: Call, text_model: ScriptedTextModel) -> None:
    lena, _ = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {
            "purpose": "practice",
            "sdp": "v=0 offer",
            "personaId": lena["id"],
            "scenario": "bakery",
            "rang": True,
        },
    )

    assert response.status == 503
    assert response.body == {"error": {"code": "voice_unavailable", "field": None}}
