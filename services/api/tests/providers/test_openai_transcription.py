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
