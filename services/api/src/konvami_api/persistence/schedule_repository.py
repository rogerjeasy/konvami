"""A learner's own card schedule on PostgreSQL (spec §6.7; `domain/card_schedule.py`)."""

import datetime as dt
import json
from typing import Any
from uuid import UUID

from konvami_api.domain.card_schedule import FitState
from konvami_api.domain.fsrs import WEIGHT_COUNT, Rating, Weights
from konvami_api.domain.fsrs_fit import FitOutcome
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros

_WEIGHTS = """
    SELECT CAST(weights AS text) AS weights FROM card_schedule
    WHERE user_id = CAST(:user_id AS uuid) AND weights IS NOT NULL
"""

_FIT_STATE = f"""
    SELECT CAST((
               SELECT count(*) FROM card_review v JOIN card c ON c.id = v.card_id
               WHERE c.user_id = CAST(:user_id AS uuid)
           ) AS integer) AS reviews,
           (SELECT {epoch_micros("attempted_at")} FROM card_schedule
            WHERE user_id = CAST(:user_id AS uuid)) AS attempted_at
"""

# Only a learner with reviews is claimed for, so their row of app_user exists already.
_CLAIM = """
    INSERT INTO card_schedule (user_id, attempted_at)
    VALUES (CAST(:user_id AS uuid), CAST(:at AS timestamptz))
    ON CONFLICT (user_id) DO UPDATE SET attempted_at = EXCLUDED.attempted_at
        WHERE card_schedule.attempted_at <= CAST(:retry_before AS timestamptz)
    RETURNING user_id
"""

# One row per card, its reviews as a compact JSON array, so a long log stays a small answer.
_REVIEW_LOG = f"""
    SELECT CAST(c.id AS text) AS id, {epoch_micros("c.created_at")} AS created_at,
           CAST(jsonb_agg(
               jsonb_build_array({epoch_micros("v.reviewed_at")}, v.rating)
               ORDER BY v.position
           ) AS text) AS reviews
    FROM card c JOIN card_review v ON v.card_id = c.id
    WHERE c.user_id = CAST(:user_id AS uuid)
    GROUP BY c.id, c.created_at
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT :limit
"""

_STORE = """
    INSERT INTO card_schedule
        (user_id, weights, attempted_at, fitted_at, reviews, default_loss, fitted_loss)
    VALUES (CAST(:user_id AS uuid), CAST(:weights AS jsonb), CAST(:at AS timestamptz),
            CAST(:at AS timestamptz), :reviews, :default_loss, :fitted_loss)
    ON CONFLICT (user_id) DO UPDATE
        SET weights = EXCLUDED.weights, fitted_at = EXCLUDED.fitted_at,
            reviews = EXCLUDED.reviews, default_loss = EXCLUDED.default_loss,
            fitted_loss = EXCLUDED.fitted_loss
"""


def _weights(text: str | None) -> Weights | None:
    if not text:
        return None
    values = json.loads(text)
    # A row written for another version of the scheduler is not used.
    if not isinstance(values, list) or len(values) != WEIGHT_COUNT:
        return None
    return tuple(float(v) for v in values)


def _reviews(row: dict[str, Any]) -> list[tuple[dt.datetime, Rating]]:
    return [(from_epoch_micros(micros), rating) for micros, rating in json.loads(row["reviews"])]


class SqlScheduleRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def weights(self, user_id: UUID) -> Weights | None:
        rows = self._client.execute(_WEIGHTS, {"user_id": str(user_id)})
        return _weights(rows[0]["weights"]) if rows else None

    def fit_state(self, user_id: UUID) -> FitState:
        row = self._client.execute(_FIT_STATE, {"user_id": str(user_id)})[0]
        attempted = row["attempted_at"]
        return FitState(row["reviews"], from_epoch_micros(attempted) if attempted else None)

    def claim(self, user_id: UUID, at: dt.datetime, retry_before: dt.datetime) -> bool:
        rows = self._client.execute(
            _CLAIM,
            {
                "user_id": str(user_id),
                "at": at.isoformat(),
                "retry_before": retry_before.isoformat(),
            },
        )
        return bool(rows)

    def review_log(self, user_id: UUID, max_cards: int) -> list[list[tuple[dt.datetime, Rating]]]:
        rows = self._client.execute(_REVIEW_LOG, {"user_id": str(user_id), "limit": max_cards})
        rows = sorted(rows, key=lambda row: (row["created_at"], row["id"]))
        return [_reviews(row) for row in rows]

    def store(self, user_id: UUID, outcome: FitOutcome, at: dt.datetime) -> None:
        self._client.execute(
            _STORE,
            {
                "user_id": str(user_id),
                "weights": json.dumps(list(outcome.weights)) if outcome.weights else None,
                "at": at.isoformat(),
                "reviews": outcome.reviews,
                "default_loss": outcome.default_loss,
                "fitted_loss": outcome.fitted_loss,
            },
        )
