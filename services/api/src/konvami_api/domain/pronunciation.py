"""The pronunciation lab (spec §6.14, basic): drills for the sounds a language's learners find
hard, a place to hear a word before saying it, and a list of the learner's own problem words.

What it can and cannot tell. A recording is written down by the verbatim pass (`Listener`, spec
§9.4) and compared with the words that were to be said, word by word. That shows words that were
not heard as asked, which is often a sound that was off, but it is an approximation: it gives no
phoneme scores or marks for stress and rhythm (spec §9.5 names scoring as later work), and a
word can be missed because of the microphone or the recogniser. The app says so wherever it
shows a result, and a missed word is never a failure: it joins the learner's problem words until
they have said it right twice in a row.

Hearing is the other half: the learner plays a word in their first partner's voice (made once and
kept, like a card's sound), and for pairs that differ in a sound they pick which one they heard.
Every drill is remembered, so Progress can chart it later (the tables hold what it needs).
"""

import datetime as dt
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from konvami_api.domain.card_details import DEFAULT_VOICE
from konvami_api.domain.catalog import LanguagePack
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.pronunciation_assessment import (
    AssessmentError,
    PronunciationAssessment,
    PronunciationAssessor,
)
from konvami_api.domain.pronunciation_sounds import ProblemSound
from konvami_api.domain.reports import words_in
from konvami_api.domain.sounds import Sounds
from konvami_api.domain.speech import SpeechError
from konvami_api.domain.spoken import Listener, SpokenError, matched_words
from konvami_api.domain.voice import VoiceSessionRepository

# Each drill is a short request to a paid model: a long session of drills stays far below this.
MAX_ATTEMPTS_PER_DAY = 200
# The most problem words the list shows.
MAX_PROBLEM_WORDS = 30
# The longest text a drill may name (the longest sentence is far shorter).
TARGET_MAX = 200
# A problem word leaves the list once it was said right this many times in a row.
CLEARED_AFTER = 2
# A pedagogical review suggestion on a 0-100 provider scale, never a CEFR or exam cutoff.
ACOUSTIC_REVIEW_BELOW = 70

# `word`: one or two words said (a word, a pair, a problem word). `shadow`: a sentence said right
# after hearing it. (Picking which word was heard is `pick`, not an attempt with a recording.)
Drill = Literal["word", "shadow"]


class PronunciationError(Exception):
    """`not_found`, `invalid_value`, `consent_required`, `drill_limit` or `unavailable`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class WordMark:
    word: str
    # Whether the word was heard where it was to be said.
    ok: bool


@dataclass(frozen=True)
class Attempt:
    # What the recording was written down as.
    heard: str
    right: bool
    words: tuple[WordMark, ...]
    assessment: PronunciationAssessment | None = None


@dataclass(frozen=True)
class SoundSummary:
    id: str
    title: str
    tip: str
    # Whether the pairs can be listened to (two different sounds) or only said.
    listening: bool
    pairs: int
    # Drills made on this sound, and how many were right.
    tries: int
    right: int


@dataclass(frozen=True)
class SoundDetail:
    summary: SoundSummary
    pairs: tuple[tuple[str, str], ...]
    words: tuple[str, ...]
    sentences: tuple[str, ...]


@dataclass(frozen=True)
class ProblemWord:
    word: str
    # The sound it was practised with, when it was practised in one.
    sound_id: str | None
    misses: int


class PronunciationRepository(Protocol):
    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one more drill on `day` and returns True, unless the learner reached `limit`.
        One step: requests arriving together cannot both take the last place."""

    def record(
        self,
        user_id: UUID,
        language: str,
        at: dt.datetime,
        *,
        drill: str,
        sound_id: str | None,
        target: str,
        heard: str,
        right: bool,
        marks: Sequence[tuple[str, bool]],
    ) -> None:
        """One drill, and per word of it whether it was heard. The words' tallies change with it:
        a miss counts, a hit extends the run of hits."""

    def progress(self, user_id: UUID, language: str) -> dict[str, tuple[int, int]]:
        """Per sound, the drills made and how many were right."""

    def problems(self, user_id: UUID, language: str, limit: int) -> list[ProblemWord]:
        """The words missed that have not been said right `CLEARED_AFTER` times in a row since,
        the most missed first."""


def target_words(target: str) -> list[str]:
    """The words of a drill's text as it is shown (capitals kept)."""
    return re.findall(r"\w+", target)


class PronunciationService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        personas: PersonaService,
        listener: Listener,
        repository: PronunciationRepository,
        sounds: Sounds,
        clock: Callable[[], dt.datetime],
        assessor: PronunciationAssessor | None = None,
        conversations: ConversationService | None = None,
        sessions: VoiceSessionRepository | None = None,
    ) -> None:
        self._profiles = profiles
        self._personas = personas
        self._listener = listener
        self._repository = repository
        self._sounds = sounds
        self._clock = clock
        self._assessor = assessor
        self._conversations = conversations
        self._sessions = sessions

    def assessment_provider(self, user_id: UUID) -> str | None:
        language, _ = self._pack(user_id)
        return (
            self._assessor.provider
            if self._assessor and self._assessor.supports(language, "wav")
            else None
        )

    def _pack(self, user_id: UUID) -> tuple[str, LanguagePack | None]:
        language = self._profiles.get(user_id).target_language or ""
        return language, self._profiles.catalog.available_pack(language)

    def _explained_in(self, user_id: UUID, language: str) -> str:
        profile = self._profiles.get(user_id)
        if profile.value(language, "explanation_usage") == "never":
            return language
        explained = profile.value(language, "explanation_language")
        return explained if isinstance(explained, str) else "en"

    def _summary(
        self, sound: ProblemSound, explained_in: str, progress: dict[str, tuple[int, int]]
    ) -> SoundSummary:
        text = sound.text(explained_in)
        tries, right = progress.get(sound.id, (0, 0))
        return SoundSummary(
            id=sound.id,
            title=text.title,
            tip=text.tip,
            listening=sound.listening,
            pairs=len(sound.pairs),
            tries=tries,
            right=right,
        )

    def sounds(self, user_id: UUID) -> list[SoundSummary]:
        """The problem sounds of the language the learner learns, easiest first, with what they
        did on each; empty when the language has none yet."""
        language, pack = self._pack(user_id)
        if pack is None:
            return []
        explained = self._explained_in(user_id, language)
        progress = self._repository.progress(user_id, language)
        return [self._summary(sound, explained, progress) for sound in pack.pronunciation]

    def sound(self, user_id: UUID, sound_id: str) -> SoundDetail:
        """One sound with the words that practise it. Raises `PronunciationError`
        (`not_found`)."""
        language, pack = self._pack(user_id)
        sound = pack.sound(sound_id) if pack else None
        if sound is None:
            raise PronunciationError("not_found")
        summary = self._summary(
            sound,
            self._explained_in(user_id, language),
            self._repository.progress(user_id, language),
        )
        return SoundDetail(summary, sound.pairs, sound.words, sound.sentences)

    def problem_words(self, user_id: UUID) -> list[ProblemWord]:
        language, _ = self._pack(user_id)
        return self._repository.problems(user_id, language, MAX_PROBLEM_WORDS)

    def audio(self, user_id: UUID, text: str) -> str:
        """A short-lived address of a word or sentence of the lab, spoken in the voice of the
        learner's first partner (made the first time). Only the lab's own texts and the learner's
        problem words can be played, so this is no way to have anything spoken. Raises
        `PronunciationError` (`not_found`, `unavailable`)."""
        language, pack = self._pack(user_id)
        text = text.strip()
        allowed = any(text in sound.spoken() for sound in pack.pronunciation) if pack else False
        if not allowed:
            allowed = any(word.word == text for word in self.problem_words(user_id))
        if not allowed:
            raise PronunciationError("not_found")
        if not self._sounds.available:
            raise PronunciationError("unavailable")
        partners = self._personas.partners(user_id)
        voice = partners[0].voice if partners else DEFAULT_VOICE
        try:
            return self._sounds.address(
                f"pronunciation/{language}/",
                voice,
                text,
                Charge(user_id, Feature.PRONUNCIATION_AUDIO),
            )
        except SpeechError as error:
            raise PronunciationError("unavailable") from error

    def pick(self, user_id: UUID, sound_id: str, played: str, chosen: str) -> bool:
        """Remembers which word of a pair the learner said they heard; right when it was the one
        played. Raises `PronunciationError` (`not_found`, `invalid_value`)."""
        language, pack = self._pack(user_id)
        sound = pack.sound(sound_id) if pack else None
        if sound is None or not sound.listening:
            raise PronunciationError("not_found")
        if not any({played, chosen} <= set(pair) for pair in sound.pairs):
            raise PronunciationError("invalid_value")
        right = played == chosen
        self._repository.record(
            user_id,
            language,
            self._clock(),
            drill="listen",
            sound_id=sound_id,
            target=played,
            heard=chosen,
            right=right,
            marks=[],
        )
        return right

    def attempt(
        self,
        user_id: UUID,
        drill: Drill,
        sound_id: str | None,
        target: str,
        audio: bytes,
        audio_format: str,
        seconds: float | None = None,
        *,
        assessment_consent: bool = False,
    ) -> Attempt:
        """Hears the learner say `target` (a word, two words of a pair, a sentence of the sound
        `sound_id`; or one of their problem words, with no sound). `seconds` is how long the
        recording plays, as the app measured it. Raises `PronunciationError`."""
        language, pack = self._pack(user_id)
        target = target.strip()
        self._check_target(user_id, pack, drill, sound_id, target)
        return self._attempt(
            user_id,
            language,
            drill,
            sound_id,
            target,
            audio,
            audio_format,
            seconds,
            assessment_consent=assessment_consent,
        )

    def conversation_attempt(
        self,
        user_id: UUID,
        call_id: str,
        turn_index: int,
        audio: bytes,
        audio_format: str,
        seconds: float | None = None,
        *,
        assessment_consent: bool = False,
    ) -> Attempt:
        """Assess a saved learner turn after per-recording consent; reuse the lab's word review."""
        if not self._sessions or not self._conversations:
            raise PronunciationError("unavailable")
        session = self._sessions.get(call_id)
        if session is None or session.user_id != user_id:
            raise PronunciationError("not_found")
        transcript = self._conversations.transcript(user_id, call_id)
        if turn_index < 0 or turn_index >= len(transcript.turns):
            raise PronunciationError("not_found")
        turn = transcript.turns[turn_index]
        if turn.speaker != "learner" or turn.audio is None or not turn.said.strip():
            raise PronunciationError("not_found")
        if not assessment_consent:
            raise PronunciationError("consent_required")
        # Never assess a historic German recording as the account's newly selected French.
        language = session.plan.language if session.plan else ""
        if not language:
            raise PronunciationError("unavailable")
        return self._attempt(
            user_id,
            language,
            "conversation",
            None,
            turn.said,
            audio,
            audio_format,
            seconds,
            assessment_consent=True,
            acoustic_words=True,
        )

    def _attempt(
        self,
        user_id: UUID,
        language: str,
        drill: str,
        sound_id: str | None,
        target: str,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
        *,
        assessment_consent: bool,
        acoustic_words: bool = False,
    ) -> Attempt:
        if assessment_consent and (
            self._assessor is None or not self._assessor.supports(language, audio_format)
        ):
            raise PronunciationError("unavailable")
        assessed = None
        try:
            self._listener.ready(user_id, audio, audio_format)
            now = self._clock()
            if not self._repository.reserve(user_id, now.date(), MAX_ATTEMPTS_PER_DAY):
                raise PronunciationError("drill_limit")
            if assessment_consent and self._assessor is not None:
                assessed = self._assessor.assess(
                    language,
                    target,
                    audio,
                    audio_format,
                    charge=Charge(user_id, Feature.PRONUNCIATION),
                )
                heard = assessed.heard
            else:
                heard = self._listener.hear(
                    user_id, language, audio, audio_format, seconds, Feature.PRONUNCIATION
                )
        except AssessmentError as error:
            raise PronunciationError("unavailable") from error
        except SpokenError as error:
            raise PronunciationError(error.code) from error
        shown = target_words(target)
        found = matched_words([word.casefold() for word in shown], words_in(heard))
        marks = tuple(WordMark(word, ok) for word, ok in zip(shown, found, strict=True))
        right = bool(marks) and all(mark.ok for mark in marks)
        self._repository.record(
            user_id,
            language,
            now,
            drill=drill,
            sound_id=sound_id,
            target=target,
            heard=heard,
            right=right,
            marks=(
                _per_word(
                    [
                        WordMark(word.word, word.accuracy >= ACOUSTIC_REVIEW_BELOW)
                        for word in assessed.words
                        if len(target_words(word.word)) == 1
                        and word.word.casefold() in {token.casefold() for token in shown}
                    ]
                )
                if acoustic_words and assessed is not None
                else _per_word(marks)
            ),
        )
        return Attempt(heard, right, marks, assessed)

    def _check_target(
        self,
        user_id: UUID,
        pack: LanguagePack | None,
        drill: Drill,
        sound_id: str | None,
        target: str,
    ) -> None:
        if not target or len(target) > TARGET_MAX:
            raise PronunciationError("invalid_value")
        if sound_id is None:
            # Only a single word of the learner's own list is drilled without a sound.
            if drill != "word" or target not in {w.word for w in self.problem_words(user_id)}:
                raise PronunciationError("not_found")
            return
        sound = pack.sound(sound_id) if pack else None
        if sound is None:
            raise PronunciationError("not_found")
        sentence = target in sound.sentences
        if target not in sound.targets() or sentence != (drill == "shadow"):
            raise PronunciationError("invalid_value")


def _per_word(marks: Sequence[WordMark]) -> list[tuple[str, bool]]:
    """A word said twice in a text counts once, and as right only if every time was."""
    merged: dict[str, tuple[str, bool]] = {}
    for mark in marks:
        key = mark.word.casefold()
        shown, previous = merged.get(key, (mark.word, True))
        merged[key] = (shown, previous and mark.ok)
    return list(merged.values())
