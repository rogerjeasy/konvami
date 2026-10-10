import json

import httpx
import pytest

from konvami_api.domain.speech import SpeechError, SpeechTask
from konvami_api.providers.openai_speech import OpenAiSpeech

KEY = "sk-test-key"
TASK = SpeechTask(model="gpt-4o-mini-tts", voice="coral", text="Hallo! Schön, dich zu sehen.")
MP3 = b"ID3\x04\x00" + b"\x00" * 32


def model(respond: object) -> OpenAiSpeech:
    return OpenAiSpeech(lambda: KEY, httpx.Client(transport=httpx.MockTransport(respond)))  # type: ignore[arg-type]


def test_a_text_is_spoken_in_the_voice_and_comes_back_as_mp3() -> None:
    seen: dict[str, httpx.Request] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, content=MP3, headers={"content-type": "audio/mpeg"})

    audio = model(respond).speak(TASK)

    assert audio == MP3
    request = seen["request"]
    assert str(request.url) == "https://api.openai.com/v1/audio/speech"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert json.loads(request.content) == {
        "model": "gpt-4o-mini-tts",
        "voice": "coral",
        "input": "Hallo! Schön, dich zu sehen.",
        "response_format": "mp3",
    }


@pytest.mark.parametrize("status", [400, 401, 429, 500])
def test_a_refusal_is_reported_without_the_providers_words(status: int) -> None:
    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": f"key {KEY} is wrong"}})

    with pytest.raises(SpeechError) as error:
        model(respond).speak(TASK)

    assert KEY not in str(error.value)


def test_a_provider_that_cannot_be_reached_is_reported_without_the_key() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    with pytest.raises(SpeechError) as error:
        model(respond).speak(TASK)

    assert error.value.__cause__ is None
    assert KEY not in str(error.value)


def test_an_answer_without_audio_is_reported() -> None:
    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"")

    with pytest.raises(SpeechError):
        model(respond).speak(TASK)
