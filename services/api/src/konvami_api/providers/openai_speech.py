"""The speech model: OpenAI's audio speech endpoint, answering with MP3."""

from collections.abc import Callable

import httpx

from konvami_api.domain.costs import UsageMeter
from konvami_api.domain.speech import SpeechError, SpeechTask

URL = "https://api.openai.com/v1/audio/speech"
PROVIDER = "openai"
# A sentence takes a few seconds to speak; the caller is an API request with 29 in all.
TIMEOUT_SECONDS = 20.0


class OpenAiSpeech:
    def __init__(
        self,
        api_key: Callable[[], str],
        http: httpx.Client | None = None,
        meter: UsageMeter | None = None,
    ) -> None:
        self._api_key = api_key
        self._http = http or httpx.Client()
        self._meter = meter

    def speak(self, task: SpeechTask) -> bytes:
        body = {
            "model": task.model,
            "voice": task.voice,
            "input": task.text,
            "response_format": "mp3",
        }
        try:
            response = self._http.post(
                URL,
                headers={"Authorization": f"Bearer {self._api_key()}"},
                json=body,
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            # Not chained: the request it carries holds the Authorization header.
            raise SpeechError(type(error).__name__) from None
        if not response.is_success:
            raise SpeechError(f"speech model answered {response.status_code}")
        if not response.content:
            raise SpeechError("answer had no audio")
        # The answer is the audio alone, with no usage: the text's length stands in for it.
        if self._meter is not None:
            self._meter.record(task.charge, PROVIDER, task.model, {"characters": len(task.text)})
        return response.content
