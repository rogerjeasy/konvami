"""The transcription model: OpenAI's audio transcription endpoint (the verbatim pass, spec §9.4)."""

import io
import math
import wave
from collections.abc import Callable

import httpx

from konvami_api.domain.alignment import WordTiming
from konvami_api.domain.costs import UsageMeter
from konvami_api.domain.speech import TranscriptionError, TranscriptionTask

URL = "https://api.openai.com/v1/audio/transcriptions"
PROVIDER = "openai"
# The audio types the app sends: recordings (WAV), a phone's own recording, a browser's.
_CONTENT_TYPES = {"wav": "audio/wav", "m4a": "audio/mp4", "webm": "audio/webm", "mp3": "audio/mpeg"}
# A turn is seconds of speech; the worker writing a report waits for each in turn.
TIMEOUT_SECONDS = 30.0


def _seconds(audio: bytes) -> float:
    """How long a WAV file plays; 0 for one that cannot be read."""
    try:
        with wave.open(io.BytesIO(audio), "rb") as file:
            return file.getnframes() / file.getframerate()
    except (wave.Error, EOFError, ZeroDivisionError):
        return 0.0


class OpenAiTranscription:
    def __init__(
        self,
        api_key: Callable[[], str],
        http: httpx.Client | None = None,
        meter: UsageMeter | None = None,
    ) -> None:
        self._api_key = api_key
        self._http = http or httpx.Client()
        self._meter = meter

    def transcribe(self, task: TranscriptionTask) -> str:
        answer = self._request(task)
        text = answer.get("text") if isinstance(answer, dict) else None
        if not isinstance(text, str):
            raise TranscriptionError("answer had no text")
        return text.strip()

    def align(self, task: TranscriptionTask) -> tuple[WordTiming, ...]:
        if task.model != "whisper-1":
            raise TranscriptionError("word timestamps require whisper-1")
        answer = self._request(task, timed=True)
        values = answer.get("words") if isinstance(answer, dict) else None
        if not isinstance(values, list):
            raise TranscriptionError("answer had no word timestamps")
        words: list[WordTiming] = []
        for value in values:
            if not isinstance(value, dict):
                raise TranscriptionError("invalid word timestamp")
            word, start, end = value.get("word"), value.get("start"), value.get("end")
            if (
                not isinstance(word, str)
                or not word.strip()
                or not isinstance(start, (int, float))
                or not isinstance(end, (int, float))
                or not math.isfinite(start)
                or not math.isfinite(end)
                or not 0 <= start <= end
            ):
                raise TranscriptionError("invalid word timestamp")
            words.append(WordTiming(word.strip(), round(start * 1000), round(end * 1000)))
        return tuple(words)

    def _request(self, task: TranscriptionTask, *, timed: bool = False) -> object:
        fields = {
            "model": task.model,
            "language": task.language,
            "prompt": task.prompt,
            "response_format": "verbose_json" if timed else "json",
        }
        if timed:
            fields["timestamp_granularities[]"] = "word"
        try:
            response = self._http.post(
                URL,
                headers={"Authorization": f"Bearer {self._api_key()}"},
                data=fields,
                files={
                    "file": (
                        f"turn.{task.format}",
                        task.audio,
                        _CONTENT_TYPES.get(task.format, "application/octet-stream"),
                    )
                },
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            # Not chained: the request it carries holds the Authorization header.
            raise TranscriptionError(type(error).__name__) from None
        if not response.is_success:
            raise TranscriptionError(f"transcription model answered {response.status_code}")
        # Transcription is billed by the minute of audio.
        if self._meter is not None:
            seconds = task.seconds if task.seconds is not None else _seconds(task.audio)
            units = {"audio_seconds": seconds}
            self._meter.record(task.charge, PROVIDER, task.model, units)
        try:
            answer = response.json()
        except ValueError:
            raise TranscriptionError("answer was not JSON") from None
        return answer
