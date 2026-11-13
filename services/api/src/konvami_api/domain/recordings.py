"""Recordings (spec §6.6) and the verbatim pass (spec §9.4).

The call worker stores the audio of each turn of a practice conversation as the call goes
(`keep`). After the call, every learner turn is transcribed a second time from its audio, by a
pass told to keep mistakes as they were said (`transcribe`): the live transcription tidies them
away, and a report can only correct what the text still shows.

The learner decides whether recordings are kept (`configure`). When they are not, the audio is
used for the verbatim pass and deleted right after it.
"""

import io
import json
import wave
from typing import Protocol
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.alignment import WordAligner, WordTiming, matches
from konvami_api.domain.audio_activity import pcm_activity
from konvami_api.domain.conversations import ConversationError, ConversationService
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.errors import ServiceUnavailable
from konvami_api.domain.live_call import AUDIO_RATE, KeepAudio, TurnAudio
from konvami_api.domain.profile import RECORDINGS_KEPT, Change, Origin, ProfileService, Source
from konvami_api.domain.recording_export import (
    CONTENT_TYPES,
    AudioEncoder,
    AudioEncodingError,
    join_recordings,
)
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
        aligner: WordAligner | None = None,
        alignment_model: str = "",
        accounts: AccountDirectory | None = None,
        encoder: AudioEncoder | None = None,
    ) -> None:
        self._profiles = profiles
        self._conversations = conversations
        self._sessions = sessions
        self._repository = repository
        self._files = files
        self._transcriber = transcriber
        # An empty name: no verbatim pass.
        self._model = model
        self._aligner = aligner
        self._alignment_model = alignment_model
        self._accounts = accounts
        self._encoder = encoder

    def keep(self, user_id: UUID, call_id: str, audio: KeepAudio) -> TurnAudio:
        """Stores one turn's audio, while the call goes on."""
        key = f"{_call_folder(user_id, call_id)}{audio.item_id}.wav"
        self._files.save(key, wav(audio.pcm), CONTENT_TYPE)
        milliseconds = len(audio.pcm) * 1000 // (_SAMPLE_BYTES * AUDIO_RATE)
        activity = pcm_activity(audio.pcm, AUDIO_RATE)
        return TurnAudio(key, milliseconds, activity.active_ms, activity.pause_ms, activity.pauses)

    def address(self, audio: TurnAudio) -> str:
        return self._files.address(audio.key, ADDRESS_SECONDS)

    def release(self, user_id: UUID, call_id: str) -> None:
        """Discard transient exam clips after use; never affect another learner's call."""
        session = self._sessions.get(call_id)
        if session is not None and session.user_id == user_id:
            self._forget(user_id, call_id)

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

    def export_formats(self) -> tuple[str, ...]:
        return tuple(CONTENT_TYPES) if self._encoder else ()

    def export_audio(self, user_id: UUID, call_id: str, format: str) -> str:
        transcript = self._conversations.transcript(user_id, call_id)
        if not self._encoder or format not in CONTENT_TYPES:
            raise ServiceUnavailable("unavailable", 30)
        key = f"{_call_folder(user_id, call_id)}export.{format}"
        if not self._files.stat(key):
            clips = [self._files.read(turn.audio.key) for turn in transcript.turns if turn.audio]
            if not clips:
                raise ConversationError("not_found")
            try:
                body = self._encoder.encode(join_recordings(clips), format)
            except (AudioEncodingError, wave.Error, EOFError):
                raise ServiceUnavailable("unavailable", 30) from None
            self._files.save(key, body, CONTENT_TYPES[format])
        return self._files.address(key, ADDRESS_SECONDS)

    def word_timings(
        self, user_id: UUID, call_id: str, index: int
    ) -> tuple[WordTiming, ...] | None:
        """On-demand, opted-in alignment. None means unavailable; () means no exact match."""
        transcript = self._conversations.transcript(user_id, call_id)
        if not 0 <= index < len(transcript.turns):
            raise ConversationError("not_found")
        turn = transcript.turns[index]
        if (
            turn.audio is None
            or not self._aligner
            or not self._alignment_model
            or not self._accounts
        ):
            return None
        try:
            if not self._accounts.get(user_id).voice_consent:
                return None
        except AccountNotFound:
            return None
        key = turn.audio.key + ".timing.json"
        if self._files.stat(key):
            values = json.loads(self._files.read(key))
            return tuple(
                WordTiming(value["word"], value["start_ms"], value["end_ms"]) for value in values
            )
        language = self._profiles.get(user_id).target_language or ""
        if not language:
            return None
        task = TranscriptionTask(
            self._alignment_model,
            self._files.read(turn.audio.key),
            language,
            turn.verbatim or turn.text,
            charge=Charge(user_id, Feature.VERBATIM),
            seconds=turn.audio.milliseconds / 1000,
        )
        try:
            words = self._aligner.align(task)
        except TranscriptionError:
            raise ServiceUnavailable("unavailable", 30) from None
        if not matches(turn.verbatim or turn.text, words, turn.audio.milliseconds):
            words = ()
        self._files.save(
            key,
            json.dumps(
                [
                    {"word": word.word, "start_ms": word.start_ms, "end_ms": word.end_ms}
                    for word in words
                ]
            ).encode(),
            "application/json",
        )
        return words

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
