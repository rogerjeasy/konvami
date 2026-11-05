"""Texts spoken once and kept: what plays when a learner listens to a card or to their weekly
check-in. A text is spoken in a voice the first time it is played and stored under a name made
from what was said and how, so a new voice or a new text is spoken anew and an old sound is
never played for it.
"""

import hashlib
from typing import TYPE_CHECKING

from konvami_api.domain.costs import Charge
from konvami_api.domain.speech import SpeechError, SpeechModel, SpeechTask
from konvami_api.domain.storage import FileStore

if TYPE_CHECKING:
    from konvami_api.domain.premium_voices import PremiumVoiceService

SOUND_TYPE = "audio/mpeg"
# How long the app may play a sound through one address.
SOUND_ADDRESS_SECONDS = 15 * 60
_FINGERPRINT_LENGTH = 16


class Sounds:
    def __init__(
        self,
        *,
        speech: SpeechModel,
        model: str,
        files: FileStore,
        premium: "PremiumVoiceService | None" = None,
    ) -> None:
        """An empty `model` name: nothing is spoken. With `premium`, a learner who chose a
        premium voice (and agreed to its provider) hears that one."""
        self._speech = speech
        self._model = model
        self._files = files
        self._premium = premium

    @property
    def available(self) -> bool:
        return bool(self._model)

    def address(self, prefix: str, voice: str, text: str, charge: Charge) -> str:
        """A short-lived address of `text` spoken in `voice` (the learner's premium voice, if they
        chose one), kept under a key that starts with `prefix`. Raises `SpeechError`."""
        choice = self._premium.choice_for(charge.user_id) if self._premium else None
        if choice is not None and self._premium is not None:
            # The provider and voice are part of the name, so a switch of voice is spoken anew.
            key = self._key(prefix, f"elevenlabs\n{choice.model}\n{choice.voice.id}\n{text}")
            if self._files.stat(key) is None:
                try:
                    task = SpeechTask(choice.model, choice.voice.id, text, charge)
                    sound = self._premium.speech.speak(task)
                except SpeechError:
                    # The premium voice is a bonus: when it fails, the standard voice reads.
                    return self._standard(prefix, voice, text, charge)
                self._files.save(key, sound, SOUND_TYPE)
            return self._files.address(key, SOUND_ADDRESS_SECONDS)
        return self._standard(prefix, voice, text, charge)

    def _standard(self, prefix: str, voice: str, text: str, charge: Charge) -> str:
        key = self._key(prefix, f"{self._model}\n{voice}\n{text}")
        if self._files.stat(key) is None:
            sound = self._speech.speak(SpeechTask(self._model, voice, text, charge))
            self._files.save(key, sound, SOUND_TYPE)
        return self._files.address(key, SOUND_ADDRESS_SECONDS)

    @staticmethod
    def _key(prefix: str, spoken: str) -> str:
        fingerprint = hashlib.sha256(spoken.encode()).hexdigest()[:_FINGERPRINT_LENGTH]
        return f"{prefix}{fingerprint}.mp3"
