import io
import wave

import httpx
import pytest

from konvami_api.domain.speech import TranscriptionError, TranscriptionTask
from konvami_api.providers.openai_transcription import OpenAiTranscription

KEY = "sk-test-key"
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt "
TASK = TranscriptionTask(
    model="gpt-transcribe", audio=WAV, language="de", prompt="Keep every mistake."
)


def model(respond: object) -> OpenAiTranscription:
    return OpenAiTranscription(
        lambda: KEY,
        httpx.Client(transport=httpx.MockTransport(respond)),  # type: ignore[arg-type]
    )


def test_a_recording_is_sent_as_a_wav_file_with_its_language_and_prompt() -> None:
    seen: dict[str, httpx.Request] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, json={"text": " Ich habe nach Berlin gefahren. "})

    assert model(respond).transcribe(TASK) == "Ich habe nach Berlin gefahren."
    request = seen["request"]
    assert str(request.url) == "https://api.openai.com/v1/audio/transcriptions"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert request.headers["content-type"].startswith("multipart/form-data")
    body = request.content
    for field, value in [
        (b"model", b"gpt-transcribe"),
        (b"language", b"de"),
        (b"prompt", b"Keep every mistake."),
        (b"response_format", b"json"),
    ]:
        assert b'name="' + field + b'"\r\n\r\n' + value + b"\r\n" in body
    assert b'name="file"; filename="turn.wav"' in body
    assert b"Content-Type: audio/wav" in body
    assert WAV in body


@pytest.mark.parametrize("status", [400, 401, 429, 500])
def test_a_refusal_is_reported_without_the_providers_words(status: int) -> None:
    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": f"key {KEY} is wrong"}})

    with pytest.raises(TranscriptionError) as error:
        model(respond).transcribe(TASK)

    assert KEY not in str(error.value)


def test_a_provider_that_cannot_be_reached_is_reported_without_the_key() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    with pytest.raises(TranscriptionError) as error:
        model(respond).transcribe(TASK)

    assert error.value.__cause__ is None
    assert KEY not in str(error.value)


@pytest.mark.parametrize("answer", [{}, {"text": 7}, []])
def test_an_answer_without_text_is_reported(answer: object) -> None:
    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=answer)

    with pytest.raises(TranscriptionError):
        model(respond).transcribe(TASK)


def wav(seconds: float, rate: int = 24_000) -> bytes:
    """Silence as the call worker keeps it: 16-bit mono PCM."""
    out = io.BytesIO()
    with wave.open(out, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes(b"\x00\x00" * int(seconds * rate))
    return out.getvalue()


def test_a_transcription_is_metered_by_the_seconds_of_audio() -> None:
    recorded: list[tuple[object, str, str, dict[str, float]]] = []

    class Meter:
        def record(self, charge: object, provider: str, model: str, units: object) -> None:
            recorded.append((charge, provider, model, dict(units)))  # type: ignore[call-overload]

    respond = lambda _: httpx.Response(200, json={"text": "Hallo"})  # noqa: E731
    transcriber = OpenAiTranscription(
        lambda: KEY,
        httpx.Client(transport=httpx.MockTransport(respond)),
        meter=Meter(),
    )

    transcriber.transcribe(TranscriptionTask("gpt-transcribe", wav(2.5), "de", "Keep it."))
    transcriber.transcribe(TASK)

    assert recorded == [
        (None, "openai", "gpt-transcribe", {"audio_seconds": 2.5}),
        # A file that cannot be read as WAV counts as no audio.
        (None, "openai", "gpt-transcribe", {"audio_seconds": 0.0}),
    ]
