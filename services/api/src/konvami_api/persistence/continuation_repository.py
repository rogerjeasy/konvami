"""Atomic optimistic transitions for linked practice transports (§6.4)."""

import datetime as dt
import json
from uuid import UUID

from konvami_api.domain.continuation import Conversation, decode, encode
from konvami_api.persistence.sql import SqlClient


class SqlContinuationRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def create(self, conversation: Conversation) -> None:
        self._client.execute(
            "INSERT INTO practice_continuation (root_id, user_id, revision, data) "
            "SELECT call_id, user_id, :revision, CAST(:data AS jsonb) FROM voice_session "
            "WHERE call_id = :root_id AND user_id = CAST(:user_id AS uuid) "
            "ON CONFLICT (root_id) DO NOTHING",
            {
                "root_id": conversation.root_id,
                "user_id": str(conversation.user_id),
                "revision": conversation.revision,
                "data": encode(conversation),
            },
        )

    def get(self, call_id: str) -> Conversation | None:
        rows = self._client.execute(
            "SELECT CAST(data AS text) AS data FROM practice_continuation "
            "WHERE root_id = :call_id OR data -> 'segments' @> CAST(:segment AS jsonb)",
            {"call_id": call_id, "segment": json.dumps([{"call_id": call_id}])},
        )
        return decode(str(rows[0]["data"])) if rows else None

    def save(self, conversation: Conversation, revision: int) -> bool:
        return bool(
            self._client.execute(
                "UPDATE practice_continuation SET revision = :next_revision, "
                "data = CAST(:data AS jsonb) "
                "WHERE root_id = :root_id AND user_id = CAST(:user_id AS uuid) "
                "AND revision = :revision RETURNING root_id",
                {
                    "root_id": conversation.root_id,
                    "user_id": str(conversation.user_id),
                    "revision": revision,
                    "next_revision": conversation.revision,
                    "data": encode(conversation),
                },
            )
        )

    def refund(self, root_id: str, user_id: UUID, week: dt.date, seconds: int) -> None:
        # A lost response may be retried without giving back the same reservation twice.
        self._client.execute(
            "WITH receipt AS (UPDATE practice_continuation SET refunded = true "
            "WHERE root_id = :root_id AND user_id = CAST(:user AS uuid) AND NOT refunded "
            "RETURNING user_id) UPDATE voice_week SET seconds = GREATEST(0, seconds - :seconds) "
            "FROM receipt WHERE voice_week.user_id = receipt.user_id "
            "AND voice_week.week = CAST(:week AS date)",
            {
                "root_id": root_id,
                "user": str(user_id),
                "week": week.isoformat(),
                "seconds": max(0, seconds),
            },
        )
