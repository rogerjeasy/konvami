"""How a partner's voice sounds (spec §6.2 B "Preview before saving").

Each voice says one sentence of the language being learned. It is spoken once, by a speech
model, and kept: every later preview, by any learner, reads the stored file (profile design P9).
"""

import hashlib
from uuid import UUID

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.persona_parts import Voice
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.speech import SpeechError, SpeechModel, SpeechTask
from konvami_api.domain.storage import FileStore

SAMPLE_TYPE = "audio/mpeg"
# How long a sample's address works: long enough to listen, try another and come back.
SAMPLE_ADDRESS_SECONDS = 3600
# Characters of the fingerprint in a sample's file name.
_FINGERPRINT_LENGTH = 12


class SampleError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class VoiceSampleService:
    def __init__(
        self, *, profiles: ProfileService, files: FileStore, speech: SpeechModel, model: str
    ) -> None:
        self._profiles = profiles
        self._files = files
        self._speech = speech
        # An empty name: no speech model is configured, so there are no samples.
        self._model = model

    def sample(self, user_id: UUID, voice: Voice) -> str:
        """A short-lived address of the voice's sample in the learner's target language."""
        language = self._profiles.get(user_id).target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        if pack is None or not pack.voice_sample:
            raise SampleError("no_language")
        if not self._model:
            raise SampleError("voice_unavailable")

        # The name changes with the sentence and the model, so a new one is spoken anew.
        spoken = f"{self._model}\n{pack.voice_sample}".encode()
        fingerprint = hashlib.sha256(spoken).hexdigest()[:_FINGERPRINT_LENGTH]
        key = f"voices/{language}/{voice}-{fingerprint}.mp3"
        if self._files.stat(key) is None:
            try:
                task = SpeechTask(
                    self._model, voice, pack.voice_sample, Charge(user_id, Feature.VOICE_SAMPLE)
                )
                audio = self._speech.speak(task)
            except SpeechError as error:
                raise SampleError("voice_unavailable") from error
            self._files.save(key, audio, SAMPLE_TYPE)
        return self._files.address(key, SAMPLE_ADDRESS_SECONDS)
