"""Reads everything stored for one learner (6.19), table by table.

Every table belongs either to `EXPORTED` or to `NOT_EXPORTED`, with the reason. A test lists the
tables of the real schema and fails for one that is in neither, so a feature that adds a table
has to decide whether its rows are part of a learner's copy of their data. (Deleting an account
needs no list: every table refers to `app_user` with ON DELETE CASCADE.)
"""

import datetime as dt
import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from konvami_api.persistence.sql import SqlClient

# Rows read per statement. The Data API answers at most 1 MiB at a time; a row of any table is a
# few hundred bytes (a turn of speech is the longest), so a page stays far below that.
PAGE_SIZE = 200
USER = "CAST(:user_id AS uuid)"
# The rows of a conversation belong to the learner through the conversation.
OF_CALL = f"JOIN voice_session s ON s.call_id = t.call_id WHERE s.user_id = {USER}"


@dataclass(frozen=True)
class ExportedTable:
    name: str
    # What follows "FROM <name> t": a WHERE (or a JOIN and a WHERE) that keeps the learner's rows.
    where: str
    # The row as JSON; a column left out is named here.
    document: str = "to_jsonb(t)"


EXPORTED: tuple[ExportedTable, ...] = (
    ExportedTable("app_user", f"WHERE t.id = {USER}"),
    *(
        ExportedTable(name, f"WHERE t.user_id = {USER}")
        for name in (
            "card",
            "content_flag",
            "course_import",
            "data_export",
            "entitlement",
            "exam_simulation",
            "feedback",
            "memory",
            "minute_pack",
            "minute_pack_purchase",
            "minute_pack_week",
            "moderation_refusal",
            "onboarding",
            "penpal_note",
            "penpal_settings",
            "persona",
            "persona_draft_day",
            "phrase",
            "premium_voice_choice",
            "placement_result",
            "profile_change",
            "profile_field",
            "profile_question",
            "pronunciation_day",
            "pronunciation_drill",
            "pronunciation_word",
            "retry_attempt",
            "retry_day",
            "tutor_day",
            "tutor_question",
            "usage_charge",
            "voice_answer_day",
            "voice_session",
            "voice_week",
            "week_review",
        )
    ),
    # A push token is the address Expo delivers notifications to: anyone who holds it can send
    # to the phone, so the copy says which devices are registered but not their tokens.
    ExportedTable("push_device", f"WHERE t.user_id = {USER}", document="to_jsonb(t) - 'token'"),
    ExportedTable("card_review", f"JOIN card c ON c.id = t.card_id WHERE c.user_id = {USER}"),
    *(
        ExportedTable(name, OF_CALL)
        for name in ("level_step", "memory_extraction", "session_report", "voice_turn")
    ),
)

# Tables that are not a learner's data, and why.
NOT_EXPORTED: Mapping[str, str] = {
    "deleted_user": "A note that an account was deleted; a learner who asks has no such note.",
    "schema_migration": "Which database migrations were applied.",
    "spend_alert": "The owner's budget alerts; they are about Konvami's bill, not a learner.",
}


class SqlExportRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def rows(self, user_id: UUID) -> dict[str, list[dict[str, Any]]]:
        return {table.name: self._read(table, user_id) for table in EXPORTED}

    def _read(self, table: ExportedTable, user_id: UUID) -> list[dict[str, Any]]:
        # `ORDER BY 1` orders by the row's own text, which is the same on every read, so the
        # pages never overlap and need no knowledge of the table's key.
        # Only the constants of `EXPORTED` are put into the text; the learner's id is a parameter.
        sql = (
            f"SELECT CAST({table.document} AS text) AS doc FROM {table.name} t {table.where} "  # noqa: S608
            "ORDER BY 1 LIMIT :limit OFFSET :offset"
        )
        found: list[dict[str, Any]] = []
        while True:
            page = self._client.execute(
                sql, {"user_id": str(user_id), "limit": PAGE_SIZE, "offset": len(found)}
            )
            found.extend(json.loads(row["doc"]) for row in page)
            if len(page) < PAGE_SIZE:
                return found

    def made_since(self, user_id: UUID, since: dt.datetime) -> int:
        rows = self._client.execute(
            "SELECT count(*) AS made FROM data_export "
            "WHERE user_id = CAST(:user_id AS uuid) AND created_at >= CAST(:since AS timestamptz)",
            {"user_id": str(user_id), "since": since.isoformat()},
        )
        return int(rows[0]["made"])

    def record(self, export_id: UUID, user_id: UUID, at: dt.datetime) -> None:
        # The learner's row first, in the same statement: a learner who never stored anything
        # has none yet, and the archive row refers to it.
        self._client.execute(
            "WITH learner AS ("
            " INSERT INTO app_user (id) VALUES (CAST(:user_id AS uuid)) ON CONFLICT (id) DO NOTHING"
            ") INSERT INTO data_export (id, user_id, created_at) "
            "VALUES (CAST(:id AS uuid), CAST(:user_id AS uuid), CAST(:at AS timestamptz))",
            {"id": str(export_id), "user_id": str(user_id), "at": at.isoformat()},
        )
