"""A text spoken in a voice, outside a live call (a voice's sample in Persona Studio). The
provider sits behind `SpeechModel`.
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
