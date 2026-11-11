"""The premium speech model: ElevenLabs' text-to-speech endpoint, answering with MP3.

Only the text to speak is sent, never a learner's audio (spec §6.19 consent, 2.5 and 6.7). The
key is read at the moment of the request, so it is never held longer than needed.
"""

import re
from collections.abc import Callable

import httpx

from konvami_api.domain.costs import UsageMeter
from konvami_api.domain.speech import SpeechError, SpeechTask

URL = "https://api.elevenlabs.io/v1/text-to-speech"
PROVIDER = "elevenlabs"
# MP3 at 44.1 kHz, 128 kbit/s: the same file type the other speech models answer with.
OUTPUT_FORMAT = "mp3_44100_128"
# A sentence takes a few seconds to speak; the caller is an API request with 29 in all.
TIMEOUT_SECONDS = 20.0
# A voice id is letters and digits; anything else would change the address it is put into.
_VOICE_ID = re.compile(r"[A-Za-z0-9]{1,64}")


class ElevenLabsSpeech:
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
        return self._speak(task, OUTPUT_FORMAT)

    def speak_pcm(self, task: SpeechTask) -> bytes:
        """Mono 16-bit PCM at the live recording rate, with no lossy duration estimate."""
        audio = self._speak(task, "pcm_24000")
        if len(audio) % 2:
            raise SpeechError("incomplete PCM sample")
        return audio

    def _speak(self, task: SpeechTask, output_format: str) -> bytes:
        if not _VOICE_ID.fullmatch(task.voice):
            raise SpeechError("not a voice id")
        try:
            response = self._http.post(
                f"{URL}/{task.voice}",
                params={"output_format": output_format},
                headers={"xi-api-key": self._api_key()},
                json={"text": task.text, "model_id": task.model},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            # Not chained: the request it carries holds the key.
            raise SpeechError(type(error).__name__) from None
        if not response.is_success:
            raise SpeechError(f"speech model answered {response.status_code}")
        if not response.content:
            raise SpeechError("answer had no audio")
        # ElevenLabs bills by characters, which the answer does not report: the text's length.
        if self._meter is not None:
            self._meter.record(task.charge, PROVIDER, task.model, {"characters": len(task.text)})
        return response.content
