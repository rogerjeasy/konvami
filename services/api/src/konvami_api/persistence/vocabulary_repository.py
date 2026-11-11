"""Atomic evidence writes and language-scoped vocabulary totals (§6.7)."""

import datetime as dt
import json
from collections.abc import Sequence
from uuid import UUID

from konvami_api.domain.reports import wording
from konvami_api.domain.vocabulary import Evidence, VocabularyCounts
from konvami_api.persistence.sql import SqlClient

# As for reports, a failed worker gets only a small, bounded number of retries.
MAX_ATTEMPTS = 3
_CLAIM = """
    INSERT INTO vocabulary_scan (call_id, user_id, claimed_at)
    SELECT call_id, user_id, CAST(:at AS timestamptz) FROM voice_session
    WHERE call_id = :call_id AND user_id = CAST(:user_id AS uuid)
    ON CONFLICT (call_id) DO UPDATE SET
        claimed_at = EXCLUDED.claimed_at, attempts = vocabulary_scan.attempts + 1
    WHERE NOT vocabulary_scan.complete AND vocabulary_scan.claimed_at <= CAST(:stale AS timestamptz)
        AND vocabulary_scan.attempts < :max_attempts
        AND vocabulary_scan.user_id = EXCLUDED.user_id
    RETURNING call_id
"""
_FINISH = """
    WITH recorded AS (
        INSERT INTO vocabulary_evidence
            (call_id, user_id, language, word_key, word, heard, produced)
        SELECT scan.call_id, scan.user_id, :language,
            item.word_key, item.word, item.heard, item.produced
        FROM vocabulary_scan scan,
            jsonb_to_recordset(CAST(:items AS jsonb)) AS item(
                word_key text, word text, heard text, produced text)
        WHERE scan.call_id = :call_id AND scan.user_id = CAST(:user_id AS uuid)
            AND NOT scan.complete AND (item.heard IS NOT NULL OR item.produced IS NOT NULL)
        ON CONFLICT (call_id, word_key) DO NOTHING
        RETURNING call_id
    )
    UPDATE vocabulary_scan SET complete = true
    WHERE call_id = :call_id AND user_id = CAST(:user_id AS uuid) AND NOT complete
"""
_COUNTS = """
    SELECT count(*) FILTER (WHERE active) AS active,
           count(*) FILTER (WHERE heard AND NOT active) AS passive
    FROM (
        SELECT word_key, bool_or(produced IS NOT NULL) AS active,
               bool_or(heard IS NOT NULL) AS heard
        FROM vocabulary_evidence
        WHERE user_id = CAST(:user_id AS uuid) AND language = :language
        GROUP BY word_key
    ) words
"""


class SqlVocabularyRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def claim(self, user_id: UUID, call_id: str, at: dt.datetime, stale: dt.datetime) -> bool:
        return bool(
            self._client.execute(
                _CLAIM,
                {
                    "user_id": str(user_id),
                    "call_id": call_id,
                    "at": at.isoformat(),
                    "stale": stale.isoformat(),
                    "max_attempts": MAX_ATTEMPTS,
                },
            )
        )

    def finish(
        self, user_id: UUID, call_id: str, language: str, evidence: Sequence[Evidence]
    ) -> None:
        # One row per word and call; a retry must not inflate the vocabulary count.
        unique = {wording(item.word): item for item in evidence if wording(item.word)}
        self._client.execute(
            _FINISH,
            {
                "user_id": str(user_id),
                "call_id": call_id,
                "language": language,
                "items": json.dumps(
                    [
                        {
                            "word_key": key,
                            "word": item.word,
                            "heard": item.heard,
                            "produced": item.produced,
                        }
                        for key, item in unique.items()
                    ],
                    ensure_ascii=False,
                ),
            },
        )

    def counts(self, user_id: UUID, language: str) -> VocabularyCounts:
        rows = self._client.execute(_COUNTS, {"user_id": str(user_id), "language": language})
        return VocabularyCounts(int(rows[0]["active"]), int(rows[0]["passive"]))
