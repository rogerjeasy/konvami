"""Premium voices (spec §6.21.2 Pro "premium voices (ElevenLabs)", §9.2).

A learner can select a voice for read-aloud features and explicitly opt into using it for
practice calls. LiveSpeech rechecks this service before each live synthesis; the call worker
keeps the realtime conversation and tools while delivering premium speech separately (§9.2).

Three things must all hold before ElevenLabs hears a word:

1. it is configured (a model, voices and a key: `PremiumVoices.offered`),
2. the learner agreed to it on 2.5 or 6.7 (consent record v3, `Account.premium_voice_consent`),
3. the learner may use premium voices (`PremiumVoiceAccess`, the seam for subscriptions).

Otherwise the text is spoken by the standard voice, and a learner who has not agreed is never
sent to ElevenLabs. Only the text to speak is sent, never a learner's audio.
"""

import hashlib
from collections.abc import Collection
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.speech import SpeechError, SpeechModel, SpeechTask
from konvami_api.domain.storage import FileStore

SAMPLE_TYPE = "audio/mpeg"
# How long a sample's address works: long enough to listen, try another and come back.
SAMPLE_ADDRESS_SECONDS = 3600
_FINGERPRINT_LENGTH = 12


@dataclass(frozen=True)
class PremiumVoice:
    # The provider's voice id.
    id: str
    # The name the learner sees (a provider's own name, like the other voices).
    name: str


@dataclass(frozen=True)
class PremiumVoices:
    """The premium voices on offer: ElevenLabs' model and voices come from configuration."""

    model: str
    voices: tuple[PremiumVoice, ...] = ()

    @property
    def offered(self) -> bool:
        return bool(self.model and self.voices)

    def find(self, voice_id: str) -> PremiumVoice | None:
        return next((voice for voice in self.voices if voice.id == voice_id), None)


class PremiumVoiceAccess(Protocol):
    """Who may use premium voices.

    This is the seam for subscriptions (spec §6.21.2: premium voices are a Pro feature): the
    subscription service implements `can_use_premium_voices` and replaces `PilotAccess` where
    the services are built (`main.py`). Nothing else changes.
    """

    def can_use_premium_voices(self, user_id: UUID) -> bool: ...


class PilotAccess:
    """Before there are subscriptions: the owners always, and everyone while the app is in the
    testers' hands (`open_to_testers`, on by default). Turn it off to restrict premium voices to
    the owners."""

    def __init__(self, *, owners: Collection[UUID], open_to_testers: bool) -> None:
        self._owners = frozenset(owners)
        self._open = open_to_testers

    def can_use_premium_voices(self, user_id: UUID) -> bool:
        return self._open or user_id in self._owners


class ChoiceRepository(Protocol):
    def get(self, user_id: UUID) -> str | None:
        """The id of the voice the learner chose, if any."""

    def set(self, user_id: UUID, voice_id: str | None) -> None:
        """Remembers the choice; None goes back to the standard voice."""


class PremiumError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class PremiumStatus:
    # ElevenLabs is configured at all: the consent screens name it only then.
    offered: bool
    # The learner agreed to ElevenLabs (consent record v3).
    consent: bool
    # The learner may use premium voices (Pro, or a tester).
    allowed: bool
    voices: tuple[PremiumVoice, ...]
    chosen: str | None


@dataclass(frozen=True)
class PremiumChoice:
    voice: PremiumVoice
    model: str


class PremiumVoiceService:
    def __init__(
        self,
        *,
        premium: PremiumVoices,
        access: PremiumVoiceAccess,
        accounts: AccountDirectory,
        choices: ChoiceRepository,
        speech: SpeechModel,
        profiles: ProfileService,
        files: FileStore,
    ) -> None:
        self._premium = premium
        self._access = access
        self._accounts = accounts
        self._choices = choices
        self._speech = speech
        self._profiles = profiles
        self._files = files

    @property
    def speech(self) -> SpeechModel:
        return self._speech

    @property
    def offered(self) -> bool:
        return self._premium.offered

    def status(self, user_id: UUID) -> PremiumStatus:
        if not self._premium.offered:
            return PremiumStatus(False, False, False, (), None)
        chosen = self._choices.get(user_id)
        return PremiumStatus(
            offered=True,
            consent=self._consent(user_id),
            allowed=self._access.can_use_premium_voices(user_id),
            voices=self._premium.voices,
            # A voice dropped from the configuration is no longer chosen.
            chosen=chosen if chosen and self._premium.find(chosen) else None,
        )

    def choose(self, user_id: UUID, voice_id: str | None) -> PremiumStatus:
        """Picks a voice, or None for the standard voice. Raises `PremiumError`."""
        if voice_id is not None:
            self._require_use(user_id)
            if self._premium.find(voice_id) is None:
                raise PremiumError("unknown_voice")
        self._choices.set(user_id, voice_id)
        return self.status(user_id)

    def choice_for(self, user_id: UUID) -> PremiumChoice | None:
        """The premium voice to speak with for this learner, or None for the standard voice."""
        if not self._premium.offered:
            return None
        chosen = self._choices.get(user_id)
        voice = self._premium.find(chosen) if chosen else None
        if voice is None or not self._allowed(user_id):
            return None
        return PremiumChoice(voice, self._premium.model)

    def sample(self, user_id: UUID, voice_id: str) -> str:
        """A short-lived address of the voice saying the learner's language's sample sentence.
        Spoken once, then read from the store (as the partners' voices on 6.6). Raises
        `PremiumError`."""
        self._require_use(user_id)
        voice = self._premium.find(voice_id)
        if voice is None:
            raise PremiumError("unknown_voice")
        language = self._profiles.get(user_id).target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        if pack is None or not pack.voice_sample:
            raise PremiumError("no_language")

        spoken = f"{self._premium.model}\n{pack.voice_sample}".encode()
        fingerprint = hashlib.sha256(spoken).hexdigest()[:_FINGERPRINT_LENGTH]
        key = f"voices/premium/{language}/{voice.id}-{fingerprint}.mp3"
        if self._files.stat(key) is None:
            task = SpeechTask(
                self._premium.model,
                voice.id,
                pack.voice_sample,
                Charge(user_id, Feature.VOICE_SAMPLE),
            )
            try:
                audio = self._speech.speak(task)
            except SpeechError as error:
                raise PremiumError("voice_unavailable") from error
            self._files.save(key, audio, SAMPLE_TYPE)
        return self._files.address(key, SAMPLE_ADDRESS_SECONDS)

    def _consent(self, user_id: UUID) -> bool:
        try:
            return self._accounts.get(user_id).premium_voice_consent
        except AccountNotFound:
            return False

    def _allowed(self, user_id: UUID) -> bool:
        return self._consent(user_id) and self._access.can_use_premium_voices(user_id)

    def _require_use(self, user_id: UUID) -> None:
        if not self._premium.offered:
            raise PremiumError("not_offered")
        if not self._consent(user_id):
            raise PremiumError("consent_needed")
        if not self._access.can_use_premium_voices(user_id):
            raise PremiumError("not_allowed")
