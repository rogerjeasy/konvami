"""Vocabulary evidence contracts on in-memory and real PostgreSQL storage (§6.7)."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.vocabulary import Evidence, VocabularyCounts, VocabularyRepository
from konvami_api.persistence.sql import SqlClient
from konvami_api.persistence.vocabulary_repository import SqlVocabularyRepository
from tests.vocabulary_fake import MemoryVocabularyRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("22222222-2222-4222-8222-222222222222")
NOW = datetime(2026, 11, 11, tzinfo=UTC)


@pytest.fixture(params=["memory", "postgres"])
def vocabulary(request: pytest.FixtureRequest) -> VocabularyRepository:
    if request.param == "memory":
        return MemoryVocabularyRepository()
    db: SqlClient = request.getfixturevalue("db")
    for user, call in [(USER, "vocab1"), (USER, "vocab2"), (OTHER, "other")]:
        db.execute(
            "INSERT INTO app_user (id) VALUES (CAST(:user AS uuid)) ON CONFLICT DO NOTHING",
            {"user": str(user)},
        )
        db.execute(
            "INSERT INTO voice_session (call_id,user_id,purpose,model,started_at) "
            "VALUES (:call,CAST(:user AS uuid),'practice','test',CAST(:at AS timestamptz))",
            {"call": call, "user": str(user), "at": NOW.isoformat()},
        )
    return SqlVocabularyRepository(db)


def test_counts_distinct_words_and_promotes_heard_words_to_active(
    vocabulary: VocabularyRepository,
) -> None:
    assert vocabulary.claim(USER, "vocab1", NOW, NOW - timedelta(minutes=5))
    vocabulary.finish(
        USER,
        "vocab1",
        "fr",
        [Evidence("maison", "la maison", None), Evidence("train", "le train", None)],
    )
    assert vocabulary.counts(USER, "fr") == VocabularyCounts(0, 2)
    assert vocabulary.claim(USER, "vocab2", NOW, NOW - timedelta(minutes=5))
    vocabulary.finish(USER, "vocab2", "fr", [Evidence("MAISON", None, "Je vois la maison.")])
    assert vocabulary.counts(USER, "fr") == VocabularyCounts(1, 1)
    assert vocabulary.counts(USER, "de") == VocabularyCounts()
    assert vocabulary.counts(OTHER, "fr") == VocabularyCounts()


def test_claims_and_finish_are_idempotent_and_owner_scoped(
    vocabulary: VocabularyRepository,
) -> None:
    assert vocabulary.claim(USER, "vocab1", NOW, NOW - timedelta(minutes=5))
    assert not vocabulary.claim(USER, "vocab1", NOW, NOW - timedelta(minutes=5))
    vocabulary.finish(OTHER, "vocab1", "fr", [Evidence("wrong", None, "wrong")])
    vocabulary.finish(USER, "vocab1", "fr", [Evidence("maison", "maison", None)])
    vocabulary.finish(USER, "vocab1", "fr", [Evidence("injected", None, "injected")])
    assert vocabulary.counts(USER, "fr") == VocabularyCounts(0, 1)
    assert not vocabulary.claim(USER, "vocab1", NOW + timedelta(days=1), NOW)
