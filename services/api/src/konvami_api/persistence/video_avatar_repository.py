"""The vendor faces learners picked for their partners, and their agreement to the vendor
(spec §6.20 P2; `domain/video_avatars.py`)."""

import datetime as dt
from collections.abc import Callable, Mapping
from uuid import UUID

from konvami_api.persistence.sql import SqlClient


class SqlVideoAvatarRepository:
    def __init__(self, client: SqlClient, clock: Callable[[], dt.datetime]) -> None:
        self._client = client
        self._clock = clock

    def faces(self, user_id: UUID) -> Mapping[UUID, str]:
        rows = self._client.execute(
            "SELECT CAST(persona_id AS text) AS persona_id, face_id FROM video_avatar_choice "
            "WHERE user_id = CAST(:user_id AS uuid)",
            {"user_id": str(user_id)},
        )
        return {UUID(row["persona_id"]): row["face_id"] for row in rows}

    def set(self, user_id: UUID, persona_id: UUID, face_id: str | None) -> bool:
        ids = {"user_id": str(user_id), "persona_id": str(persona_id)}
        owned = self._client.execute(
            "SELECT 1 AS one FROM persona "
            "WHERE id = CAST(:persona_id AS uuid) AND user_id = CAST(:user_id AS uuid)",
            ids,
        )
        if not owned:
            return False
        if face_id is None:
            self._client.execute(
                "DELETE FROM video_avatar_choice WHERE persona_id = CAST(:persona_id AS uuid) "
                "AND user_id = CAST(:user_id AS uuid)",
                ids,
            )
            return True
        self._client.execute(
            """INSERT INTO video_avatar_choice (persona_id, user_id, face_id, chosen_at)
            VALUES (CAST(:persona_id AS uuid), CAST(:user_id AS uuid), :face_id,
                CAST(:at AS timestamptz))
            ON CONFLICT (persona_id) DO UPDATE
            SET face_id = EXCLUDED.face_id, chosen_at = EXCLUDED.chosen_at""",
            {**ids, "face_id": face_id, "at": self._clock().isoformat()},
        )
        return True

    def consent(self, user_id: UUID) -> str | None:
        rows = self._client.execute(
            "SELECT vendor FROM video_avatar_consent WHERE user_id = CAST(:user_id AS uuid)",
            {"user_id": str(user_id)},
        )
        return rows[0]["vendor"] if rows else None

    def agree(self, user_id: UUID, vendor: str) -> None:
        self._client.execute(
            """INSERT INTO video_avatar_consent (user_id, vendor, agreed_at)
            VALUES (CAST(:user_id AS uuid), :vendor, CAST(:at AS timestamptz))
            ON CONFLICT (user_id) DO UPDATE
            SET vendor = EXCLUDED.vendor, agreed_at = EXCLUDED.agreed_at""",
            {"user_id": str(user_id), "vendor": vendor, "at": self._clock().isoformat()},
        )
