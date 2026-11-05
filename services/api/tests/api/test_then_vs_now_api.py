"""Then vs Now over HTTP (spec §7): the pair of conversations to hear side by side."""

from dataclasses import replace
from datetime import timedelta
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.live_call import KeepAudio
from tests.api.conftest import USER, Call
from tests.api.test_api import NOON, onboarded, talked
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel


def test_without_a_recorded_conversation_there_is_nothing_to_hear_yet(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    body = call("GET", "/v1/then-vs-now").body

    assert body == {"status": "none", "then": None, "now": None, "weeksApart": 0}


def test_two_recorded_conversations_weeks_apart_are_a_pair(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    lena, _ = onboarded(call, text_model)
    for index, weeks in enumerate((6, 0), start=1):
        call_id = f"rtc_{index}"
        talked(calls, call_id, lena, at=NOON - timedelta(weeks=weeks, hours=1))
        audio = services.recordings.keep(
            UUID(USER), call_id, KeepAudio("item_2", "learner", b"\x01\x00" * 4_800)
        )
        finished = calls.finished[call_id]
        first, second = finished.turns
        calls.finished[call_id] = replace(finished, turns=(first, replace(second, audio=audio)))

    body = call("GET", "/v1/then-vs-now").body

    assert body["status"] == "ready"
    assert (body["then"]["id"], body["now"]["id"]) == ("rtc_1", "rtc_2")
    assert body["weeksApart"] == 6


def test_a_learner_who_keeps_no_recordings_is_told_so(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)
    call("PATCH", "/v1/recordings", {"kept": False})

    assert call("GET", "/v1/then-vs-now").body["status"] == "off"
