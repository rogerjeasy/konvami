""" "Say it better" (spec §6.5): the learner says a corrected sentence again and hears whether it
is right now.

The attempt is heard by the `Listener`, which keeps mistakes, and is right when the corrected
words are in it and the wrong ones are gone. Only corrections the report's second check
confirmed can be practised: drilling a doubtful correction could teach a mistake. Each attempt
is remembered with whether it was right.
"""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from konvami_api.domain.costs import Feature
from konvami_api.domain.reports import ReportService
from konvami_api.domain.spoken import Listener, SpokenError, is_right

# Each attempt is a request to a paid model; a learner practising hard still stays far below.
MAX_RETRIES_PER_DAY = 100


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


class RetryService:
    def __init__(
        self,
        *,
        reports: ReportService,
        repository: RetryRepository,
        listener: Listener,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._reports = reports
        self._repository = repository
        self._listener = listener
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
        the recording plays, as the app measured it (a hint for metering). Raises
        `ConversationError` for a conversation that is not the learner's, and `RetryError`."""
        state = self._reports.view(user_id, call_id)
        mistakes = state.report.mistakes if state.report else ()
        if not 0 <= index < len(mistakes):
            raise RetryError("not_found")
        mistake = mistakes[index]
        if not mistake.certain:
            raise RetryError("unsure")
        try:
            self._listener.ready(user_id, audio, audio_format)
            now = self._clock()
            if not self._repository.reserve(user_id, now.date(), MAX_RETRIES_PER_DAY):
                raise RetryError("retry_limit")
            language = state.report.target if state.report else ""
            heard = self._listener.hear(
                user_id, language, audio, audio_format, seconds, Feature.RETRY
            )
        except SpokenError as error:
            raise RetryError(error.code) from error
        right = is_right(heard, mistake.original, mistake.corrected)
        self._repository.attempted(user_id, call_id, index, now, right)
        return Retried(heard, right, mistake.original, mistake.corrected)

    def of_conversation(self, user_id: UUID, call_id: str) -> dict[int, bool]:
        """The corrections of a conversation's report the learner practised. Raises
        `ConversationError` for a conversation that is not theirs."""
        self._reports.view(user_id, call_id)
        return self._repository.of_conversation(user_id, call_id)
