"""Recordings over HTTP (spec §6.6): a transcript's audio, and whether recordings are kept."""

from dataclasses import replace
from datetime import timedelta
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.live_call import KeepAudio
from tests.api.conftest import USER, Call
from tests.api.test_api import NOON, onboarded, talked
from tests.fakes import InMemoryFileStore, InMemoryVoiceSessionRepository, ScriptedTextModel


def recorded(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> str:
    """A conversation whose learner turn was recorded and written down a second time."""
    lena, _ = onboarded(call, text_model)
    talked(calls, "rtc_1", lena, at=NOON - timedelta(hours=1))
    pcm = b"\x01\x00" * 4_800
    audio = services.recordings.keep(UUID(USER), "rtc_1", KeepAudio("item_2", "learner", pcm))
    finished = calls.finished["rtc_1"]
    first, second = finished.turns
    calls.finished["rtc_1"] = replace(
        finished,
        turns=(first, replace(second, audio=audio, verbatim="Gut, dank.")),
    )
    return audio.key


def test_a_recorded_turn_comes_with_a_short_lived_address_and_its_verbatim_text(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    key = recorded(call, text_model, calls, services)

    turns = call("GET", "/v1/conversations/rtc_1").body["turns"]

    assert turns[0]["audio"] is None
    assert turns[1] == {
        "speaker": "learner",
        "text": "Gut, danke!",
        "verbatim": "Gut, dank.",
        "audio": {"url": f"https://files.test/{key}?expires=900", "milliseconds": 200},
    }


def test_recordings_are_kept_until_the_learner_says_otherwise(call: Call) -> None:
    assert call("GET", "/v1/recordings").body == {"kept": True}


def test_keeping_no_recordings_deletes_the_ones_there_are(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    files: InMemoryFileStore,
) -> None:
    recorded(call, text_model, calls, services)

    response = call("PATCH", "/v1/recordings", {"kept": False})

    assert (response.status, response.body) == (200, {"kept": False})
    assert call("GET", "/v1/recordings").body == {"kept": False}
    assert files.keys() == []
    assert call("GET", "/v1/conversations/rtc_1").body["turns"][1]["audio"] is None


def test_only_a_yes_or_no_is_a_choice(call: Call) -> None:
    assert call("PATCH", "/v1/recordings", {"kept": "no"}).status == 422
    assert call("PATCH", "/v1/recordings", {}).status == 422


def test_recordings_are_the_signed_in_learners_own(call: Call) -> None:
    assert call("GET", "/v1/recordings", subject=None).status == 401
    assert call("PATCH", "/v1/recordings", {"kept": False}, subject=None).status == 401
