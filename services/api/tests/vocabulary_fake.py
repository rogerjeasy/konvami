"""Vocabulary repository double shared by service and storage contract tests."""

import datetime as dt
from collections.abc import Sequence
from uuid import UUID

from konvami_api.domain.reports import wording
from konvami_api.domain.vocabulary import Evidence, VocabularyCounts


class MemoryVocabularyRepository:
    def __init__(self) -> None:
        self.scans: dict[str, tuple[UUID, dt.datetime, int, bool]] = {}
        self.rows: dict[tuple[UUID, str, str, str], Evidence] = {}

    def claim(self, user_id: UUID, call_id: str, at: dt.datetime, stale: dt.datetime) -> bool:
        previous = self.scans.get(call_id)
        if previous and (
            previous[0] != user_id or previous[3] or previous[1] > stale or previous[2] >= 3
        ):
            return False
        self.scans[call_id] = (user_id, at, previous[2] + 1 if previous else 1, False)
        return True

    def finish(
        self, user_id: UUID, call_id: str, language: str, evidence: Sequence[Evidence]
    ) -> None:
        previous = self.scans.get(call_id)
        if previous is None or previous[0] != user_id or previous[3]:
            return
        for item in evidence:
            key = wording(item.word)
            if key and (item.heard or item.produced):
                self.rows.setdefault((user_id, language, call_id, key), item)
        self.scans[call_id] = (*previous[:3], True)

    def counts(self, user_id: UUID, language: str) -> VocabularyCounts:
        rows = [(key[3], item) for key, item in self.rows.items() if key[:2] == (user_id, language)]
        active = {key for key, item in rows if item.produced}
        heard = {key for key, item in rows if item.heard}
        return VocabularyCounts(len(active), len(heard - active))
