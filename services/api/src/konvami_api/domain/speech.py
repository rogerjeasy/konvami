"""Speech outside a live call: a text spoken in a voice (a voice's sample in Persona Studio), and
a recording written down (the verbatim pass, spec §9.4). The providers sit behind `SpeechModel`
and `Transcriber`.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SpeechTask:
    model: str
    voice: str
    text: str


class SpeechError(Exception):
    """The speech model could not be reached or did not answer with audio."""


class SpeechModel(Protocol):
    def speak(self, task: SpeechTask) -> bytes:
        """The text as MP3 audio. Raises `SpeechError`."""


@dataclass(frozen=True)
class TranscriptionTask:
    model: str
    # A WAV file.
    audio: bytes
    # The language spoken, as an ISO 639-1 code.
    language: str
    # What the transcription is for and how to write it.
    prompt: str


class TranscriptionError(Exception):
    """The transcription model could not be reached or did not answer with text."""


class Transcriber(Protocol):
    def transcribe(self, task: TranscriptionTask) -> str:
        """What was said in the audio. Raises `TranscriptionError`."""
