"""Texts spoken once and kept: what plays when a learner listens to a card or to their weekly
check-in. A text is spoken in a voice the first time it is played and stored under a name made
from what was said and how, so a new voice or a new text is spoken anew and an old sound is
never played for it.
"""

import hashlib

from konvami_api.domain.costs import Charge
from konvami_api.domain.speech import SpeechModel, SpeechTask
from konvami_api.domain.storage import FileStore

SOUND_TYPE = "audio/mpeg"
# How long the app may play a sound through one address.
SOUND_ADDRESS_SECONDS = 15 * 60
_FINGERPRINT_LENGTH = 16


class Sounds:
    def __init__(self, *, speech: SpeechModel, model: str, files: FileStore) -> None:
        """An empty `model` name: nothing is spoken."""
        self._speech = speech
        self._model = model
        self._files = files

    @property
    def available(self) -> bool:
        return bool(self._model)

    def address(self, prefix: str, voice: str, text: str, charge: Charge) -> str:
        """A short-lived address of `text` spoken in `voice`, kept under a key that starts with
        `prefix`. Raises `SpeechError`."""
        spoken = f"{self._model}\n{voice}\n{text}".encode()
        fingerprint = hashlib.sha256(spoken).hexdigest()[:_FINGERPRINT_LENGTH]
        key = f"{prefix}{fingerprint}.mp3"
        if self._files.stat(key) is None:
            sound = self._speech.speak(SpeechTask(self._model, voice, text, charge))
            self._files.save(key, sound, SOUND_TYPE)
        return self._files.address(key, SOUND_ADDRESS_SECONDS)
