"""The second exam candidate speaks through the existing voice-consented provider (§6.13)."""

from collections.abc import Callable
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.live_speech import PcmSpeech
from konvami_api.domain.speech import SpeechError, SpeechTask
from konvami_api.domain.tools import CANDIDATE_TEXT_MAX


class CandidateSpeech:
    def __init__(
        self,
        accounts: AccountDirectory,
        speech: PcmSpeech,
        model: str,
        voice: Callable[[UUID], str],
    ) -> None:
        self._accounts = accounts
        self._speech = speech
        self._model = model
        self._voice = voice

    def speak(self, user_id: UUID, text: str) -> bytes:
        try:
            agreed = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            agreed = False
        if not agreed or not self._model or not 0 < len(text.strip()) <= CANDIDATE_TEXT_MAX:
            raise SpeechError("candidate speech unavailable")
        return self._speech.speak_pcm(
            SpeechTask(self._model, self._voice(user_id), text, Charge(user_id, Feature.VOICE_EXAM))
        )
