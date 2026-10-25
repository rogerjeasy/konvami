""" "Say it better" (spec §6.5): the learner says a corrected sentence again and hears whether it
is right now.

The attempt is written down by the verbatim pass (spec §9.4), told to keep mistakes, so that a
mistake said again is not tidied away. It is right when the corrected words are in it and the
wrong ones are gone: plain words compared, no model's opinion. Only corrections the report's
second check confirmed can be practised: drilling a doubtful correction could teach a mistake.
The recording itself is not kept; each attempt is remembered with whether it was right.
"""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import ReportService, within, words_in
from konvami_api.domain.speech import (
    Transcriber,
    TranscriptionError,
    TranscriptionTask,
    verbatim_prompt,
)

# Each attempt is a request to a paid model; a learner practising hard still stays far below.
MAX_RETRIES_PER_DAY = 100
# The audio types the app records in, and the transcription model takes.
FORMATS = frozenset({"m4a", "webm", "wav", "mp3"})


@dataclass(frozen=True)
class Retried:
    # What the attempt was heard as.
    heard: str
    right: bool
    # The correction practised: the learner's words, and the same words put right.
    said: str
    better: str


class RetryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class RetryRepository(Protocol):
    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one attempt on `day`, unless the learner made `limit` already: then False."""

    def attempted(
        self, user_id: UUID, call_id: str, index: int, at: dt.datetime, right: bool
    ) -> None:
        """One attempt at correction `index` of a call's report, and whether it was right."""

    def of_conversation(self, user_id: UUID, call_id: str) -> dict[int, bool]:
        """Each correction of a call's report the learner tried, and whether an attempt was
        right."""


def is_right(heard: str, said: str, better: str) -> bool:
    """Whether an attempt says the correction: its words are there, and the wrong ones are not."""
    words = words_in(heard)
    wrong = set(words_in(said)) - set(words_in(better))
    return within(words_in(better), words) and not wrong & set(words)


class RetryService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        reports: ReportService,
        accounts: AccountDirectory,
        repository: RetryRepository,
        transcriber: Transcriber,
        model: str,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._reports = reports
        self._accounts = accounts
        self._repository = repository
        self._transcriber = transcriber
        # An empty name: retries are unavailable.
        self._model = model
        self._clock = clock

    def retry(
        self,
        user_id: UUID,
        call_id: str,
        index: int,
        audio: bytes,
        audio_format: str,
        seconds: float | None = None,
    ) -> Retried:
        """One attempt at correction `index` of a conversation's report; `seconds` is how long
        the recording plays (for metering). Raises `ConversationError` for a conversation that is
        not the learner's, and `RetryError`."""
        state = self._reports.view(user_id, call_id)
        mistakes = state.report.mistakes if state.report else ()
        if not 0 <= index < len(mistakes):
            raise RetryError("not_found")
        mistake = mistakes[index]
        if not mistake.certain:
            raise RetryError("unsure")
        if audio_format not in FORMATS or not audio:
            raise RetryError("invalid_value")
        if not self._model:
            raise RetryError("unavailable")
        # The recording goes to the transcription model's provider, which the learner must have
        # agreed to; they may have withdrawn since the conversation.
        try:
            consented = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            consented = False
        if not consented:
            raise RetryError("consent_required")
        now = self._clock()
        if not self._repository.reserve(user_id, now.date(), MAX_RETRIES_PER_DAY):
            raise RetryError("retry_limit")
        language = state.report.target if state.report else ""
        task = TranscriptionTask(
            model=self._model,
            audio=audio,
            language=language,
            prompt=verbatim_prompt(self._profiles.catalog.english_name(language)),
            charge=Charge(user_id, Feature.RETRY),
            format=audio_format,
            seconds=seconds,
        )
        try:
            heard = self._transcriber.transcribe(task).strip()
        except TranscriptionError as error:
            raise RetryError("unavailable") from error
        right = is_right(heard, mistake.original, mistake.corrected)
        self._repository.attempted(user_id, call_id, index, now, right)
        return Retried(heard, right, mistake.original, mistake.corrected)

    def of_conversation(self, user_id: UUID, call_id: str) -> dict[int, bool]:
        """The corrections of a conversation's report the learner practised. Raises
        `ConversationError` for a conversation that is not theirs."""
        self._reports.view(user_id, call_id)
        return self._repository.of_conversation(user_id, call_id)
