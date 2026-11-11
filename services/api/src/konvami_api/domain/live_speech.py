"""A premium live turn, gated again before each provider request (spec §9.2)."""

from typing import Protocol
from uuid import UUID

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.premium_voices import PremiumVoiceService
from konvami_api.domain.speech import SpeechError, SpeechTask

# Replies are conversational turns, not unbounded narrations.
MAX_TURN_CHARACTERS = 3000


class PcmSpeech(Protocol):
    def speak_pcm(self, task: SpeechTask) -> bytes: ...


class LiveSpeech:
    def __init__(self, premium: PremiumVoiceService, speech: PcmSpeech) -> None:
        self._premium = premium
        self._speech = speech

    def available(self, user_id: UUID) -> bool:
        return self._premium.live_choice_for(user_id) is not None

    def speak(self, user_id: UUID, text: str) -> bytes:
        choice = self._premium.live_choice_for(user_id)
        if choice is None or not text.strip() or len(text) > MAX_TURN_CHARACTERS:
            raise SpeechError("premium live speech unavailable")
        return self._speech.speak_pcm(
            SpeechTask(
                choice.model,
                choice.voice.id,
                text,
                Charge(user_id, Feature.VOICE_PRACTICE),
            )
        )
