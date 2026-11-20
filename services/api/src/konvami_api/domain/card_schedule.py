"""A learner's own card schedule (spec §6.7; 5.11): the FSRS parameters fitted to their reviews.

Once a learner has logged `MIN_REVIEWS` reviews, opening a review session has their log fitted
(`fsrs_fit.py`) by the worker function, at most once every `REFIT_AFTER`. The fitted parameters
are kept only when they predict the learner's held-back cards better than the defaults; until
then, and whenever a fit is not kept, every card is scheduled with the published defaults.
Nothing here costs a paid request: the fit is arithmetic on the learner's own log.
"""

import contextlib
import datetime as dt
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from konvami_api.domain.fsrs import Rating, Weights
from konvami_api.domain.fsrs_fit import (
    MAX_CARDS,
    MIN_REVIEWS,
    FitOutcome,
    History,
    fit_learner,
    histories_from_log,
)

# A learner's log changes little in a week; a fit is tried at most this often.
REFIT_AFTER = dt.timedelta(days=7)


@dataclass(frozen=True)
class FitState:
    # Every review the learner has logged, in every language.
    reviews: int
    # When a fit was last started; None when never.
    attempted_at: dt.datetime | None


class ScheduleRepository(Protocol):
    def weights(self, user_id: UUID) -> Weights | None:
        """The learner's fitted parameters; None while they keep the defaults."""

    def fit_state(self, user_id: UUID) -> FitState: ...

    def claim(self, user_id: UUID, at: dt.datetime, retry_before: dt.datetime) -> bool:
        """Marks a fit as started at `at`, unless one was started after `retry_before`: of two
        requests at once, one claims it."""

    def review_log(self, user_id: UUID, max_cards: int) -> list[list[tuple[dt.datetime, Rating]]]:
        """The reviews of the learner's newest `max_cards` reviewed cards, each card's oldest
        first, the cards in the order they were made."""

    def store(self, user_id: UUID, outcome: FitOutcome, at: dt.datetime) -> None:
        """Keeps a fit's outcome: its parameters (None keeps the defaults) and its losses."""


class FitStarter(Protocol):
    def start(self, user_id: UUID) -> None:
        """Has the learner's log fitted apart from the request (`CardScheduleService.fit`)."""


class CardScheduleService:
    def __init__(
        self,
        *,
        repository: ScheduleRepository,
        clock: Callable[[], dt.datetime],
        starter: FitStarter | None = None,
        fit: Callable[[Sequence[History]], FitOutcome] = fit_learner,
    ) -> None:
        """Without `starter`, logs are never fitted and everyone keeps the defaults."""
        self._repository = repository
        self._clock = clock
        self._starter = starter
        self._fit = fit

    def weights(self, user_id: UUID) -> Weights | None:
        return self._repository.weights(user_id)

    def maybe_fit(self, user_id: UUID) -> bool:
        """Starts a fit of the learner's log when it is long enough and none was started in
        the last `REFIT_AFTER`. Whether one was started."""
        if self._starter is None:
            return False
        state = self._repository.fit_state(user_id)
        now = self._clock()
        if state.reviews < MIN_REVIEWS:
            return False
        if state.attempted_at is not None and state.attempted_at > now - REFIT_AFTER:
            return False
        if not self._repository.claim(user_id, now, now - REFIT_AFTER):
            return False
        # A worker that does not start is tried again after `REFIT_AFTER`; reviewing goes on.
        with contextlib.suppress(Exception):
            self._starter.start(user_id)
        return True

    def fit(self, user_id: UUID) -> FitOutcome:
        """Fits the learner's log and keeps the outcome. Run by the worker."""
        histories = histories_from_log(self._repository.review_log(user_id, MAX_CARDS))
        outcome = self._fit(histories)
        self._repository.store(user_id, outcome, self._clock())
        return outcome
