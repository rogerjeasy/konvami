"""Missing articles are diagnosed in the actual target language (§13)."""

from datetime import UTC, datetime
from uuid import UUID

import pytest

from konvami_api.domain.cards import Card
from konvami_api.domain.voice_review import outcome_of


@pytest.mark.parametrize(
    ("language", "word", "heard"),
    [
        ("en", "the station", "station"),
        ("fr", "la maison", "maison"),
        ("fr", "l'école", "école"),
        ("it", "lo studente", "studente"),
        ("it", "l'amico", "amico"),
    ],
)
def test_missing_article_is_almost_right(language: str, word: str, heard: str) -> None:
    now = datetime(2026, 11, 11, tzinfo=UTC)
    card = Card(UUID(int=1), "word", word, "meaning", None, "en", None, now, now, None, None, 0, 0)
    assert outcome_of(card, heard, language) == "article"
    assert outcome_of(card, word, language) == "right"
    assert outcome_of(card, "xyz", language) == "wrong"
