"""Speech outside a live call: a text spoken in a voice (a voice's sample in Persona Studio), and
a recording written down (the verbatim pass, spec §9.4). The providers sit behind `SpeechModel`
and `Transcriber`.
"""

from dataclasses import dataclass
from typing import Protocol

from konvami_api.domain.costs import Charge


@dataclass(frozen=True)
class SpeechTask:
    model: str
    voice: str
    text: str
    # Who the request is for and why, for metering; None: not metered.
    charge: Charge | None = None


class SpeechError(Exception):
    """The speech model could not be reached or did not answer with audio."""


class SpeechModel(Protocol):
    def speak(self, task: SpeechTask) -> bytes:
        """The text as MP3 audio. Raises `SpeechError`."""


@dataclass(frozen=True)
class TranscriptionTask:
    model: str
    # An audio file in `format`.
    audio: bytes
    # The language spoken, as an ISO 639-1 code.
    language: str
    # What the transcription is for and how to write it.
    prompt: str
    charge: Charge | None = None
    # The audio's file type: "wav" (the recordings), "m4a" (a phone's own recording) or "webm"
    # (a browser's).
    format: str = "wav"
    # How long the audio plays, when the file cannot say (a compressed recording); None to read
    # it from a WAV file.
    seconds: float | None = None


class TranscriptionError(Exception):
    """The transcription model could not be reached or did not answer with text."""


class Transcriber(Protocol):
    def transcribe(self, task: TranscriptionTask) -> str:
        """What was said in the audio. Raises `TranscriptionError`."""


def verbatim_prompt(target: str) -> str:
    """How a learner's speech is to be written down: word for word, mistakes kept (spec §9.4)."""
    return (
        f"A learner of {target} speaking {target}. Write down exactly what they say, word for "
        "word, as they say it. Keep every mistake: wrong endings, articles, word order, verb "
        "forms and wrong words. Do not correct anything and do not complete what they leave "
        "unfinished. Keep repeated words and false starts."
    )
