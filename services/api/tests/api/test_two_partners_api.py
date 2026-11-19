"""Two partners in one conversation over HTTP (5.24): starting one, and reading it back."""

from datetime import timedelta

from konvami_api.domain.live_call import Turn
from konvami_api.domain.voice import FinishedCall
from tests.api.conftest import Call
from tests.api.test_api import NOON, onboarded
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel


def test_a_practice_call_can_bring_a_second_partner(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, jonas = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {
            "purpose": "practice",
            "sdp": "v=0 offer",
            "personaId": lena["id"],
            "guestPersonaId": jonas["id"],
        },
    )

    assert response.status == 200
    session = calls.sessions[response.body["callId"]]
    assert str(session.guest_persona_id) == jonas["id"]


def test_the_same_partner_twice_is_refused(call: Call, text_model: ScriptedTextModel) -> None:
    lena, _ = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {
            "purpose": "practice",
            "sdp": "v=0 offer",
            "personaId": lena["id"],
            "guestPersonaId": lena["id"],
        },
    )

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


def test_the_transcript_names_the_second_partner_and_their_lines(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, jonas = onboarded(call, text_model)
    call_id = call(
        "POST",
        "/v1/voice/calls",
        {
            "purpose": "practice",
            "sdp": "v=0 offer",
            "personaId": lena["id"],
            "guestPersonaId": jonas["id"],
        },
    ).body["callId"]
    calls.finish(
        call_id,
        FinishedCall(
            NOON + timedelta(minutes=4),
            "closed",
            {},
            (
                Turn("persona", "Hallo!"),
                Turn("persona", "Servus!", guest=True),
                Turn("learner", "Hallo ihr zwei!"),
            ),
        ),
    )

    body = call("GET", f"/v1/conversations/{call_id}").body

    assert body["conversation"]["partner"]["id"] == lena["id"]
    assert body["conversation"]["guest"]["id"] == jonas["id"]
    assert [turn["guest"] for turn in body["turns"]] == [False, True, False]
    listed = call("GET", "/v1/conversations").body["conversations"][0]
    assert listed["guest"]["name"] == jonas["name"]
