"""A call's second voice, spoken through the existing voice-consented speech provider: an exam's
other candidate (§6.13) and the second partner of a two-partner conversation (5.24)."""

from collections.abc import Callable
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.live_speech import PcmSpeech
from konvami_api.domain.speech import SpeechError, SpeechTask
from konvami_api.domain.tools import CANDIDATE_TEXT_MAX


class SecondVoice:
    """Speaks one line of a call's second voice, consent checked again before each one."""

    def __init__(self, accounts: AccountDirectory, speech: PcmSpeech, model: str) -> None:
        self._accounts = accounts
        self._speech = speech
        # An empty name: no speech model is configured, so there is no second voice.
        self._model = model

    @property
    def available(self) -> bool:
        return bool(self._model)

    def speak(self, user_id: UUID, text: str, voice: str, feature: Feature, longest: int) -> bytes:
        try:
            agreed = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            agreed = False
        if not agreed or not self._model or not 0 < len(text.strip()) <= longest:
            raise SpeechError("second voice unavailable")
        return self._speech.speak_pcm(
            SpeechTask(self._model, voice, text, Charge(user_id, feature))
        )


class CandidateSpeech:
    def __init__(
        self,
        accounts: AccountDirectory,
        speech: PcmSpeech,
        model: str,
        voice: Callable[[UUID], str],
    ) -> None:
        self._second = SecondVoice(accounts, speech, model)
        self._voice = voice

    def speak(self, user_id: UUID, text: str) -> bytes:
        return self._second.speak(
            user_id, text, self._voice(user_id), Feature.VOICE_EXAM, CANDIDATE_TEXT_MAX
        )
