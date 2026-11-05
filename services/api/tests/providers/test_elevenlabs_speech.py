import json

import httpx
import pytest

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.speech import SpeechError, SpeechTask
from konvami_api.providers.elevenlabs_speech import ElevenLabsSpeech
from tests.world import USER

KEY = "xi-test-key"
TASK = SpeechTask(
    model="eleven_multilingual_v2", voice="Maya123", text="Hallo! Schön, dich zu sehen."
)
MP3 = b"ID3\x04\x00" + b"\x00" * 32


class RecordingMeter:
    def __init__(self) -> None:
        self.records: list[tuple[object, str, str, dict[str, float]]] = []

    def record(self, charge: object, provider: str, model: str, units: object) -> None:
        self.records.append((charge, provider, model, dict(units)))  # type: ignore[call-overload]


def model(respond: object, meter: RecordingMeter | None = None) -> ElevenLabsSpeech:
    return ElevenLabsSpeech(
        lambda: KEY,
        httpx.Client(transport=httpx.MockTransport(respond)),  # type: ignore[arg-type]
        meter,
    )


def test_a_text_is_spoken_in_the_voice_and_comes_back_as_mp3() -> None:
    seen: dict[str, httpx.Request] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, content=MP3, headers={"content-type": "audio/mpeg"})

    audio = model(respond).speak(TASK)

    assert audio == MP3
    request = seen["request"]
    assert request.url.path == "/v1/text-to-speech/Maya123"
    assert request.url.params["output_format"] == "mp3_44100_128"
    # The key travels in ElevenLabs' own header, and only the text and the model are sent.
    assert request.headers["xi-api-key"] == KEY
    assert json.loads(request.content) == {
        "text": "Hallo! Schön, dich zu sehen.",
        "model_id": "eleven_multilingual_v2",
    }


def test_the_characters_spoken_are_metered_against_the_learner() -> None:
    meter = RecordingMeter()
    task = SpeechTask(
        "eleven_multilingual_v2", "Maya123", "Hallo!", Charge(USER, Feature.CARD_AUDIO)
    )

    model(lambda _: httpx.Response(200, content=MP3), meter).speak(task)

    assert meter.records == [
        (task.charge, "elevenlabs", "eleven_multilingual_v2", {"characters": 6})
    ]


@pytest.mark.parametrize("voice", ["", "../voices", "a/b", "voice id", "x" * 65])
def test_a_voice_id_that_would_change_the_address_is_refused(voice: str) -> None:
    def respond(_: httpx.Request) -> httpx.Response:
        raise AssertionError("nothing may be sent")

    with pytest.raises(SpeechError):
        model(respond).speak(SpeechTask("eleven_multilingual_v2", voice, "Hallo"))


@pytest.mark.parametrize("status", [400, 401, 429, 500])
def test_a_refusal_is_reported_without_the_providers_words(status: int) -> None:
    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": {"message": f"key {KEY} is wrong"}})

    with pytest.raises(SpeechError) as error:
        model(respond).speak(TASK)

    assert KEY not in str(error.value)


def test_a_provider_that_cannot_be_reached_is_reported_without_the_key() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    with pytest.raises(SpeechError) as error:
        model(respond).speak(TASK)

    assert KEY not in str(error.value)
    assert error.value.__cause__ is None


def test_an_answer_without_audio_is_a_failure_and_is_not_metered() -> None:
    meter = RecordingMeter()

    with pytest.raises(SpeechError):
        model(lambda _: httpx.Response(200, content=b""), meter).speak(TASK)

    assert meter.records == []
