"""What the Coach found for a learner each day, its suggestions and the learner's answers
(spec §6.12; `domain/coach.py`, migration 0230)."""

import datetime as dt
import json
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from konvami_api.domain.coach import (
    SHOWN,
    Action,
    Brief,
    Kind,
    Outcome,
    Reason,
    Suggestion,
    SuggestionStatus,
    Wording,
    signal_document,
    signal_from,
)
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros

_ENSURE_USER = """
    owner AS (
        INSERT INTO app_user (id) VALUES (CAST(:user_id AS uuid)) ON CONFLICT (id) DO NOTHING
    )
"""

_KEY = "user_id = CAST(:user_id AS uuid) AND language = :language AND day = CAST(:day AS date)"

_COLUMNS = f"""
    CAST(id AS text) AS id, CAST(day AS text) AS day, rank, kind, key,
    CAST(evidence AS text) AS evidence, CAST(action AS text) AS action, minutes, urgent, status,
    title, why, reason, {epoch_micros("responded_at")} AS responded_at, outcome, acted
"""

# One statement: the brief, the day's unanswered suggestions taken away and the new ones put in
# their place. The answered ones stay as they were.
_SAVE = f"""
    WITH {_ENSURE_USER},
    brief AS (
        INSERT INTO coach_brief
            (user_id, language, day, basis, wording, holding_back, going_well, created_at)
        VALUES (CAST(:user_id AS uuid), :language, CAST(:day AS date), :basis, 'template',
                CAST(:holding_back AS jsonb), CAST(:going_well AS jsonb),
                CAST(:created_at AS timestamptz))
        ON CONFLICT (user_id, language, day) DO UPDATE
            SET basis = EXCLUDED.basis, wording = 'template',
                holding_back = EXCLUDED.holding_back, going_well = EXCLUDED.going_well,
                created_at = EXCLUDED.created_at
    ),
    cleared AS (
        DELETE FROM coach_suggestion WHERE {_KEY} AND status = 'open'
    )
    INSERT INTO coach_suggestion
        (id, user_id, language, day, rank, kind, key, evidence, action, minutes, urgent, status)
    SELECT CAST(x.id AS uuid), CAST(:user_id AS uuid), :language, CAST(:day AS date), x.rank,
           x.kind, x.key, x.evidence, x.action, x.minutes, x.urgent, 'open'
    FROM jsonb_to_recordset(CAST(:items AS jsonb)) AS x(
        id text, rank integer, kind text, key text, evidence jsonb, action jsonb,
        minutes integer, urgent boolean
    )
"""

_BRIEF = f"""
    SELECT CAST(day AS text) AS day, basis, wording, CAST(holding_back AS text) AS holding_back,
           CAST(going_well AS text) AS going_well, {epoch_micros("created_at")} AS created_at
    FROM coach_brief WHERE {_KEY}
"""

_SUGGESTIONS = f"SELECT {_COLUMNS} FROM coach_suggestion WHERE {_KEY} ORDER BY rank, id"

_RESPOND = """
    UPDATE coach_suggestion
    SET status = :status, reason = :reason, responded_at = CAST(:at AS timestamptz)
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
    RETURNING id
"""

_ANSWERED = f"""
    SELECT {_COLUMNS} FROM coach_suggestion
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
      AND day >= CAST(:since AS date) AND status <> 'open'
    ORDER BY day DESC, responded_at DESC
"""

# Shown: among the first three of its day, or answered.
_SHOWN_ROW = "(rank < :shown OR status <> 'open')"

_UNSETTLED = f"""
    SELECT {_COLUMNS} FROM coach_suggestion
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
      AND day < CAST(:before AS date) AND outcome IS NULL AND status <> 'dismissed'
      AND {_SHOWN_ROW}
    ORDER BY day, rank
"""

_SETTLE = """
    UPDATE coach_suggestion
    SET outcome = :outcome, acted = :acted, settled_at = CAST(:at AS timestamptz)
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
"""

_HISTORY = f"""
    SELECT {_COLUMNS} FROM coach_suggestion
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
      AND day < CAST(:before AS date) AND {_SHOWN_ROW}
    ORDER BY day DESC, rank
    LIMIT :limit
"""

_REQUEST_WORDING = f"""
    UPDATE coach_brief
    SET wording = 'pending', requested_at = CAST(:at AS timestamptz), requests = requests + 1
    WHERE {_KEY} AND requests < :max_requests
      AND (
          wording = 'template'
          OR (wording = 'pending' AND requested_at < CAST(:stale_before AS timestamptz))
      )
    RETURNING day
"""

_WORD_SUGGESTIONS = """
    UPDATE coach_suggestion s
    SET rank = x.rank, title = NULLIF(x.title, ''), why = NULLIF(x.why, '')
    FROM jsonb_to_recordset(CAST(:items AS jsonb)) AS x(id text, rank integer, title text, why text)
    WHERE s.id = CAST(x.id AS uuid) AND s.user_id = CAST(:user_id AS uuid) AND s.status = 'open'
"""

_WORDED = f"UPDATE coach_brief SET wording = :wording WHERE {_KEY}"


def _suggestion(row: Mapping[str, Any]) -> Suggestion:
    return Suggestion(
        id=UUID(row["id"]),
        day=dt.date.fromisoformat(row["day"]),
        rank=row["rank"],
        kind=Kind(row["kind"]),
        key=row["key"],
        evidence=json.loads(row["evidence"]),
        action=Action.from_document(json.loads(row["action"])),
        minutes=row["minutes"],
        urgent=bool(row["urgent"]),
        status=row["status"],
        title=row["title"],
        why=row["why"],
        reason=row["reason"],
        responded_at=from_epoch_micros(row["responded_at"])
        if row["responded_at"] is not None
        else None,
        outcome=row["outcome"],
        acted=row["acted"],
    )


class SqlCoachRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    @staticmethod
    def _key(user_id: UUID, language: str, day: dt.date) -> dict[str, Any]:
        return {"user_id": str(user_id), "language": language, "day": day.isoformat()}

    def brief(self, user_id: UUID, language: str, day: dt.date) -> Brief | None:
        rows = self._client.execute(_BRIEF, self._key(user_id, language, day))
        if not rows:
            return None
        row = rows[0]
        return Brief(
            day=dt.date.fromisoformat(row["day"]),
            basis=row["basis"],
            wording=row["wording"],
            holding_back=tuple(signal_from(d) for d in json.loads(row["holding_back"])),
            going_well=tuple(signal_from(d) for d in json.loads(row["going_well"])),
            created_at=from_epoch_micros(row["created_at"]),
        )

    def save(
        self, user_id: UUID, language: str, brief: Brief, suggestions: Sequence[Suggestion]
    ) -> None:
        items = [
            {
                "id": str(s.id),
                "rank": s.rank,
                "kind": s.kind.value,
                "key": s.key,
                "evidence": dict(s.evidence),
                "action": s.action.document(),
                "minutes": s.minutes,
                "urgent": s.urgent,
            }
            for s in suggestions
        ]
        self._client.execute(
            _SAVE,
            {
                **self._key(user_id, language, brief.day),
                "basis": brief.basis,
                "holding_back": json.dumps([signal_document(s) for s in brief.holding_back]),
                "going_well": json.dumps([signal_document(s) for s in brief.going_well]),
                "created_at": brief.created_at.isoformat(),
                "items": json.dumps(items),
            },
        )

    def suggestions(self, user_id: UUID, language: str, day: dt.date) -> list[Suggestion]:
        return [
            _suggestion(row)
            for row in self._client.execute(_SUGGESTIONS, self._key(user_id, language, day))
        ]

    def respond(
        self,
        user_id: UUID,
        suggestion_id: UUID,
        status: SuggestionStatus,
        reason: Reason | None,
        at: dt.datetime,
    ) -> bool:
        rows = self._client.execute(
            _RESPOND,
            {
                "id": str(suggestion_id),
                "user_id": str(user_id),
                "status": status,
                "reason": reason,
                "at": at.isoformat(),
            },
        )
        return bool(rows)

    def answered(self, user_id: UUID, language: str, since: dt.date) -> list[Suggestion]:
        rows = self._client.execute(
            _ANSWERED,
            {"user_id": str(user_id), "language": language, "since": since.isoformat()},
        )
        return [_suggestion(row) for row in rows]

    def unsettled(self, user_id: UUID, language: str, before: dt.date) -> list[Suggestion]:
        rows = self._client.execute(
            _UNSETTLED,
            {
                "user_id": str(user_id),
                "language": language,
                "before": before.isoformat(),
                "shown": SHOWN,
            },
        )
        return [_suggestion(row) for row in rows]

    def settle(
        self, user_id: UUID, suggestion_id: UUID, outcome: Outcome, acted: bool, at: dt.datetime
    ) -> None:
        self._client.execute(
            _SETTLE,
            {
                "id": str(suggestion_id),
                "user_id": str(user_id),
                "outcome": outcome,
                "acted": acted,
                "at": at.isoformat(),
            },
        )

    def history(
        self, user_id: UUID, language: str, before: dt.date, limit: int
    ) -> list[Suggestion]:
        rows = self._client.execute(
            _HISTORY,
            {
                "user_id": str(user_id),
                "language": language,
                "before": before.isoformat(),
                "shown": SHOWN,
                "limit": limit,
            },
        )
        return [_suggestion(row) for row in rows]

    def request_wording(
        self,
        user_id: UUID,
        language: str,
        day: dt.date,
        *,
        at: dt.datetime,
        stale_before: dt.datetime,
        max_requests: int,
    ) -> bool:
        rows = self._client.execute(
            _REQUEST_WORDING,
            {
                **self._key(user_id, language, day),
                "at": at.isoformat(),
                "stale_before": stale_before.isoformat(),
                "max_requests": max_requests,
            },
        )
        return bool(rows)

    def worded(
        self,
        user_id: UUID,
        language: str,
        day: dt.date,
        wording: Wording,
        words: Mapping[UUID, tuple[int, str, str]],
    ) -> None:
        if words:
            self._client.execute(
                _WORD_SUGGESTIONS,
                {
                    "user_id": str(user_id),
                    "items": json.dumps(
                        [
                            {"id": str(sid), "rank": rank, "title": title, "why": why}
                            for sid, (rank, title, why) in words.items()
                        ]
                    ),
                },
            )
        self._client.execute(_WORDED, {**self._key(user_id, language, day), "wording": wording})
