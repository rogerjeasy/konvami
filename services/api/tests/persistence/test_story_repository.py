"""Listening-story contracts on in-memory and real PostgreSQL storage (5.29)."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.stories import (
    Episode,
    StoryAnswer,
    StoryLine,
    StoryQuestion,
    StoryRepository,
)
from konvami_api.domain.vocabulary import VocabularyCounts, VocabularyRepository
from konvami_api.persistence.sql import SqlClient
from konvami_api.persistence.story_repository import SqlStoryRepository
from konvami_api.persistence.vocabulary_repository import SqlVocabularyRepository
from tests.story_fake import InMemoryStoryRepository
from tests.vocabulary_fake import MemoryVocabularyRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("22222222-2222-4222-8222-222222222222")
LENA = UUID("33333333-3333-4333-8333-333333333333")
JONAS = UUID("44444444-4444-4444-8444-444444444444")
NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


def episode(number: int, user: UUID = USER, at: datetime = NOW, **changes: object) -> Episode:
    made = Episode(
        id=UUID(int=number + (1000 if user == OTHER else 0)),
        user_id=user,
        language="de",
        number=number,
        cast=(LENA, JONAS),
        status="pending",
        created_at=at,
    )
    return replace(made, **changes)  # type: ignore[arg-type]


@pytest.fixture(params=["memory", "postgres"])
def stores(request: pytest.FixtureRequest) -> tuple[StoryRepository, VocabularyRepository]:
    if request.param == "memory":
        vocabulary = MemoryVocabularyRepository()
        return InMemoryStoryRepository(vocabulary), vocabulary
    db: SqlClient = request.getfixturevalue("db")
    for user in (USER, OTHER):
        db.execute(
            "INSERT INTO app_user (id) VALUES (CAST(:user AS uuid)) ON CONFLICT DO NOTHING",
            {"user": str(user)},
        )
    return SqlStoryRepository(db), SqlVocabularyRepository(db)


def test_an_episode_is_added_written_and_read_back(
    stores: tuple[StoryRepository, VocabularyRepository],
) -> None:
    repository, _ = stores
    repository.add(episode(1))

    assert repository.claim(episode(1).id, NOW, NOW - timedelta(minutes=5), 3)
    assert not repository.claim(episode(1).id, NOW, NOW - timedelta(minutes=5), 3)
    written = replace(
        episode(1),
        status="ready",
        title="Lenas Wohnung",
        summary="Lena sees a flat.",
        lines=(StoryLine(0, "Hallo, Jonas!", "users/x/0.mp3"), StoryLine(1, "Hallo « Lena »!")),
        questions=(StoryQuestion("Wer?", "Lena"),),
        words=("die Wohnung",),
    )
    repository.finish(written)

    stored = repository.get(episode(1).id)
    assert stored is not None
    assert replace(stored, claimed_at=None) == written
    assert stored.claimed_at == NOW
    assert repository.get(UUID(int=99)) is None


def test_a_series_is_listed_newest_first_per_learner_and_language(
    stores: tuple[StoryRepository, VocabularyRepository],
) -> None:
    repository, _ = stores
    repository.add(episode(1, at=NOW - timedelta(days=2)))
    repository.add(episode(2, at=NOW - timedelta(hours=2)))
    repository.add(episode(1, OTHER))

    assert [e.number for e in repository.listed(USER, "de", 10)] == [2, 1]
    assert [e.number for e in repository.listed(USER, "de", 1)] == [2]
    assert repository.listed(USER, "fr", 10) == []
    assert repository.made_since(USER, NOW - timedelta(days=1)) == 1


def test_a_claim_gives_up_after_its_attempts_and_waits_for_a_stale_one(
    stores: tuple[StoryRepository, VocabularyRepository],
) -> None:
    repository, _ = stores
    repository.add(episode(1))

    assert repository.claim(episode(1).id, NOW, NOW - timedelta(minutes=5), 2)
    later = NOW + timedelta(minutes=10)
    assert repository.claim(episode(1).id, later, later - timedelta(minutes=5), 2)
    latest = later + timedelta(minutes=10)
    assert not repository.claim(episode(1).id, latest, latest - timedelta(minutes=5), 2)


def test_words_heard_to_the_end_count_once_as_heard_vocabulary(
    stores: tuple[StoryRepository, VocabularyRepository],
) -> None:
    repository, vocabulary = stores
    repository.add(episode(1))
    repository.finish(replace(episode(1), status="ready", words=("die Wohnung",)))

    repository.listened(episode(1).id, NOW, [("die wohnung", "die Wohnung")])
    repository.listened(episode(1).id, NOW, [("der termin", "der Termin")])

    stored = repository.get(episode(1).id)
    assert stored is not None
    assert stored.listened_at == NOW
    assert vocabulary.counts(USER, "de") == VocabularyCounts(0, 1)
    assert vocabulary.counts(OTHER, "de") == VocabularyCounts()


def test_the_latest_answer_to_a_question_is_kept(
    stores: tuple[StoryRepository, VocabularyRepository],
) -> None:
    repository, _ = stores
    repository.add(episode(1))

    repository.answered(episode(1).id, StoryAnswer(1, "Keller", True))
    repository.answered(episode(1).id, StoryAnswer(0, "Ich weiß nicht", False))
    repository.answered(episode(1).id, StoryAnswer(0, "Lena", True))

    stored = repository.get(episode(1).id)
    assert stored is not None
    assert stored.answers == (StoryAnswer(0, "Lena", True), StoryAnswer(1, "Keller", True))
