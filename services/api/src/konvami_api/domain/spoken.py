"""What the learner says on purpose outside a call, to be checked: a correction said again ("Say
it better", spec §6.5) or a card's answer (voice review, spec §6.7).

Each recording is written down by the verbatim pass (spec §9.4), told to keep mistakes, so that a
mistake said again is not tidied away, and compared word for word: plain words, no model's
opinion. The recording itself is not kept.
"""

from collections.abc import Sequence
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import within, words_in
from konvami_api.domain.speech import (
    Transcriber,
    TranscriptionError,
    TranscriptionTask,
    verbatim_prompt,
)

# The audio types the app records in, and the transcription model takes.
FORMATS = frozenset({"m4a", "webm", "wav", "mp3"})
# The fewest bits per second a recording of the app has. A recording is metered at least as long
# as its size at this rate: the length the app reports is a hint, and a modified app must not be
# able to make recordings look free and slip past the spending limits.
LOWEST_BITS_PER_SECOND = 32_000


class SpokenError(Exception):
    """`invalid_value` (not a recording), `consent_required` or `unavailable`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def is_right(heard: str, said: str, better: str) -> bool:
    """Whether `heard` says a correction: its words are there, and the wrong ones are not."""
    words = words_in(heard)
    wrong = set(words_in(said)) - set(words_in(better))
    return within(words_in(better), words) and not wrong & set(words)


def says(heard: str, expected: Sequence[str]) -> bool:
    """Whether `heard` has the words `expected` (from `words_in`) together, in order."""
    return bool(expected) and within(tuple(expected), words_in(heard))


class Listener:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        accounts: AccountDirectory,
        transcriber: Transcriber,
        model: str,
    ) -> None:
        self._profiles = profiles
        self._accounts = accounts
        self._transcriber = transcriber
        # An empty name: nothing can be heard.
        self._model = model

    def ready(self, user_id: UUID, audio: bytes, audio_format: str) -> None:
        """Checks that a recording can be heard before anything is counted. Raises
        `SpokenError`."""
        if audio_format not in FORMATS or not audio:
            raise SpokenError("invalid_value")
        if not self._model:
            raise SpokenError("unavailable")
        # The recording goes to the transcription model's provider, which the learner must have
        # agreed to; they may have withdrawn since.
        try:
            consented = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            consented = False
        if not consented:
            raise SpokenError("consent_required")

    def hear(
        self,
        user_id: UUID,
        language: str,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
        feature: Feature,
    ) -> str:
        """What the recording says, mistakes kept; `seconds` is how long it plays, as the app
        measured it. Raises `SpokenError` (`unavailable`)."""
        task = TranscriptionTask(
            model=self._model,
            audio=audio,
            language=language,
            prompt=verbatim_prompt(self._profiles.catalog.english_name(language)),
            charge=Charge(user_id, feature),
            format=audio_format,
            seconds=max(seconds or 0.0, len(audio) * 8 / LOWEST_BITS_PER_SECOND),
        )
        try:
            return self._transcriber.transcribe(task).strip()
        except TranscriptionError as error:
            raise SpokenError("unavailable") from error
