"""Recordings (spec §6.6) and the verbatim pass (spec §9.4).

The call worker stores the audio of each turn of a practice conversation as the call goes
(`keep`). After the call, every learner turn is transcribed a second time from its audio, by a
pass told to keep mistakes as they were said (`transcribe`): the live transcription tidies them
away, and a report can only correct what the text still shows.

The learner decides whether recordings are kept (`configure`). When they are not, the audio is
used for the verbatim pass and deleted right after it.
"""

import io
import wave
from typing import Protocol
from uuid import UUID

from konvami_api.domain.conversations import ConversationError, ConversationService
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.live_call import AUDIO_RATE, KeepAudio, TurnAudio
from konvami_api.domain.profile import RECORDINGS_KEPT, Change, Origin, ProfileService, Source
from konvami_api.domain.speech import (
    Transcriber,
    TranscriptionError,
    TranscriptionTask,
    verbatim_prompt,
)
from konvami_api.domain.storage import FileStore
from konvami_api.domain.voice import VoiceSessionRepository

# How long the app may read a recording through one address (like a photo's).
ADDRESS_SECONDS = 15 * 60
CONTENT_TYPE = "audio/wav"
_SAMPLE_BYTES = 2


def _folder(user_id: UUID) -> str:
    return f"users/{user_id}/recordings/"


def _call_folder(user_id: UUID, call_id: str) -> str:
    return f"{_folder(user_id)}{call_id}/"


def wav(pcm: bytes) -> bytes:
    """Audio from the voice provider as a WAV file."""
    body = io.BytesIO()
    with wave.open(body, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(_SAMPLE_BYTES)
        file.setframerate(AUDIO_RATE)
        file.writeframes(pcm)
    return body.getvalue()


class RecordingRepository(Protocol):
    def set_verbatim(self, call_id: str, key: str, text: str) -> None:
        """The verbatim text of the turn whose audio is stored under `key`."""

    def forget(self, call_id: str) -> None:
        """No turn of the call has audio any more."""

    def forget_all(self, user_id: UUID) -> None:
        """No turn of any of the learner's calls has audio any more."""


class RecordingService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        conversations: ConversationService,
        sessions: VoiceSessionRepository,
        repository: RecordingRepository,
        files: FileStore,
        transcriber: Transcriber,
        model: str,
    ) -> None:
        self._profiles = profiles
        self._conversations = conversations
        self._sessions = sessions
        self._repository = repository
        self._files = files
        self._transcriber = transcriber
        # An empty name: no verbatim pass.
        self._model = model

    def keep(self, user_id: UUID, call_id: str, audio: KeepAudio) -> TurnAudio:
        """Stores one turn's audio, while the call goes on."""
        key = f"{_call_folder(user_id, call_id)}{audio.item_id}.wav"
        self._files.save(key, wav(audio.pcm), CONTENT_TYPE)
        milliseconds = len(audio.pcm) * 1000 // (_SAMPLE_BYTES * AUDIO_RATE)
        return TurnAudio(key, milliseconds)

    def address(self, audio: TurnAudio) -> str:
        return self._files.address(audio.key, ADDRESS_SECONDS)

    def after_call(self, user_id: UUID, call_id: str) -> None:
        """A practice conversation has ended. One that does not count (the learner said
        nothing) is never shown or reported on, so its audio goes at once."""
        try:
            counts = self._conversations.get(user_id, call_id).counts
        except ConversationError:
            return
        if not counts:
            self._forget(user_id, call_id)

    def transcribe(self, call_id: str) -> None:
        """The verbatim pass: every learner turn with audio and no verbatim text yet is
        transcribed again. A turn that fails keeps its live text. Then, unless the learner
        keeps recordings, the audio is deleted."""
        session = self._sessions.get(call_id)
        if session is None:
            return
        user_id = session.user_id
        profile = self._profiles.get(user_id)
        try:
            self._verbatim(user_id, call_id, profile.target_language or "")
        finally:
            # Whatever broke off the pass, audio the learner does not keep must not stay.
            if not profile.recordings_kept:
                self._forget(user_id, call_id)

    def _verbatim(self, user_id: UUID, call_id: str, language: str) -> None:
        if not self._model or not language:
            return
        target = self._profiles.catalog.english_name(language)
        for turn in self._conversations.transcript(user_id, call_id).turns:
            if turn.speaker != "learner" or turn.audio is None or turn.verbatim is not None:
                continue
            task = TranscriptionTask(
                model=self._model,
                audio=self._files.read(turn.audio.key),
                language=language,
                prompt=verbatim_prompt(target),
                charge=Charge(user_id, Feature.VERBATIM),
            )
            try:
                text = self._transcriber.transcribe(task).strip()
            except TranscriptionError:
                continue
            if text:
                self._repository.set_verbatim(call_id, turn.audio.key, text)

    def kept(self, user_id: UUID) -> bool:
        return self._profiles.get(user_id).recordings_kept

    def configure(self, user_id: UUID, *, kept: bool) -> bool:
        """The learner chooses whether recordings are kept. Choosing not to deletes every
        recording kept so far. Raises `ProfileError`, and then changes nothing."""
        self._profiles.apply(
            user_id, [Change(RECORDINGS_KEPT, kept)], source=Source.ASKED, origin=Origin.FORM
        )
        if not kept:
            # The files first: should that fail, the turns still say where the audio is, and
            # turning recordings off again finishes the job.
            self._files.remove_all(_folder(user_id))
            self._repository.forget_all(user_id)
        return self.kept(user_id)

    def _forget(self, user_id: UUID, call_id: str) -> None:
        self._files.remove_all(_call_folder(user_id, call_id))
        self._repository.forget(call_id)
