"""The transcription model: OpenAI's audio transcription endpoint (the verbatim pass, spec §9.4)."""

from collections.abc import Callable

import httpx

from konvami_api.domain.speech import TranscriptionError, TranscriptionTask

URL = "https://api.openai.com/v1/audio/transcriptions"
# A turn is seconds of speech; the worker writing a report waits for each in turn.
TIMEOUT_SECONDS = 30.0


class OpenAiTranscription:
    def __init__(self, api_key: Callable[[], str], http: httpx.Client | None = None) -> None:
        self._api_key = api_key
        self._http = http or httpx.Client()

    def transcribe(self, task: TranscriptionTask) -> str:
        fields = {
            "model": task.model,
            "language": task.language,
            "prompt": task.prompt,
            "response_format": "json",
        }
        try:
            response = self._http.post(
                URL,
                headers={"Authorization": f"Bearer {self._api_key()}"},
                data=fields,
                files={"file": ("turn.wav", task.audio, "audio/wav")},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            # Not chained: the request it carries holds the Authorization header.
            raise TranscriptionError(type(error).__name__) from None
        if not response.is_success:
            raise TranscriptionError(f"transcription model answered {response.status_code}")
        try:
            answer = response.json()
        except ValueError:
            raise TranscriptionError("answer was not JSON") from None
        text = answer.get("text") if isinstance(answer, dict) else None
        if not isinstance(text, str):
            raise TranscriptionError("answer had no text")
        return text.strip()
