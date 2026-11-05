"""The pronunciation lab's drills and word tallies on PostgreSQL (spec §6.14)."""

import datetime as dt
import json
from collections.abc import Sequence
from uuid import UUID

from konvami_api.domain.pronunciation import CLEARED_AFTER, ProblemWord
from konvami_api.persistence.sql import SqlClient

_ENSURE_USER = """
    owner AS (
        INSERT INTO app_user (id) VALUES (CAST(:user_id AS uuid)) ON CONFLICT (id) DO NOTHING
    )
"""

_RESERVE_DRILL = f"""
    WITH {_ENSURE_USER}
    INSERT INTO pronunciation_day (user_id, day, drills)
    VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
    ON CONFLICT (user_id, day) DO UPDATE SET drills = pronunciation_day.drills + 1
        WHERE pronunciation_day.drills < :limit
    RETURNING drills
"""

_RECORD_DRILL = f"""
    WITH {_ENSURE_USER}
    INSERT INTO pronunciation_drill
        (user_id, language, drilled_at, drill, sound_id, target, heard, was_right)
    VALUES (CAST(:user_id AS uuid), :language, CAST(:at AS timestamptz), :drill, :sound_id,
            :target, :heard, :right)
"""

# A miss is a row (or one more miss); a hit extends the run only for a word that was missed once.
_RECORD_WORDS = """
    INSERT INTO pronunciation_word
        (user_id, language, word_key, word, sound_id, misses, streak, last_drilled)
    SELECT CAST(:user_id AS uuid), :language, lower(w.word), w.word, :sound_id,
           CASE WHEN w.ok THEN 0 ELSE 1 END, CASE WHEN w.ok THEN 1 ELSE 0 END,
           CAST(:at AS timestamptz)
    FROM jsonb_to_recordset(CAST(:words AS jsonb)) AS w(word text, ok boolean)
    WHERE NOT w.ok OR EXISTS (
        SELECT 1 FROM pronunciation_word known
        WHERE known.user_id = CAST(:user_id AS uuid) AND known.language = :language
            AND known.word_key = lower(w.word)
    )
    ON CONFLICT (user_id, language, word_key) DO UPDATE SET
        misses = pronunciation_word.misses + CASE WHEN EXCLUDED.streak = 0 THEN 1 ELSE 0 END,
        streak = CASE WHEN EXCLUDED.streak = 1 THEN pronunciation_word.streak + 1 ELSE 0 END,
        sound_id = COALESCE(pronunciation_word.sound_id, EXCLUDED.sound_id),
        last_drilled = EXCLUDED.last_drilled
"""

_PROGRESS = """
    SELECT sound_id, count(*) AS tries, count(*) FILTER (WHERE was_right) AS rights
    FROM pronunciation_drill
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language AND sound_id IS NOT NULL
    GROUP BY sound_id
"""

_PROBLEMS = """
    SELECT word, sound_id, misses
    FROM pronunciation_word
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
        AND misses > 0 AND streak < :cleared
    ORDER BY misses DESC, last_drilled DESC, word_key
    LIMIT :limit
"""


class SqlPronunciationRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        rows = self._client.execute(
            _RESERVE_DRILL, {"user_id": str(user_id), "day": day.isoformat(), "limit": limit}
        )
        return bool(rows)

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
        self._client.execute(
            _RECORD_DRILL,
            {
                "user_id": str(user_id),
                "language": language,
                "at": at.isoformat(),
                "drill": drill,
                "sound_id": sound_id,
                "target": target,
                "heard": heard,
                "right": right,
            },
        )
        if not marks:
            return
        self._client.execute(
            _RECORD_WORDS,
            {
                "user_id": str(user_id),
                "language": language,
                "at": at.isoformat(),
                "sound_id": sound_id,
                "words": json.dumps([{"word": word, "ok": ok} for word, ok in marks]),
            },
        )

    def progress(self, user_id: UUID, language: str) -> dict[str, tuple[int, int]]:
        rows = self._client.execute(_PROGRESS, {"user_id": str(user_id), "language": language})
        return {str(row["sound_id"]): (int(row["tries"]), int(row["rights"])) for row in rows}

    def problems(self, user_id: UUID, language: str, limit: int) -> list[ProblemWord]:
        rows = self._client.execute(
            _PROBLEMS,
            {
                "user_id": str(user_id),
                "language": language,
                "cleared": CLEARED_AFTER,
                "limit": limit,
            },
        )
        return [
            ProblemWord(
                word=str(row["word"]),
                sound_id=str(row["sound_id"]) if row["sound_id"] is not None else None,
                misses=int(row["misses"]),
            )
            for row in rows
        ]
