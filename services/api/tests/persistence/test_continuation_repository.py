"""The production ledger serializes retries and disappears with its owner (§6.4)."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.continuation import (
    ContinuationRepository,
    Continuations,
    Conversation,
    Segment,
)
from konvami_api.persistence.continuation_repository import SqlContinuationRepository
from konvami_api.persistence.sql import SqlClient
from tests.continuations import MemoryContinuations

USER = UUID(int=1)
NOW = datetime(2026, 11, 13, tzinfo=UTC)


@pytest.fixture(params=["memory", "postgres"])
def repository(request: pytest.FixtureRequest) -> ContinuationRepository:
    if request.param == "memory":
        return MemoryContinuations()
    db: SqlClient = request.getfixturevalue("db")
    seed(db)
    return SqlContinuationRepository(db)


def seed(db: SqlClient) -> None:
    db.execute("INSERT INTO app_user (id) VALUES (CAST(:user AS uuid))", {"user": str(USER)})
    db.execute(
        "INSERT INTO voice_session (call_id,user_id,purpose,model,started_at) "
        "VALUES ('root',CAST(:user AS uuid),'practice','test',CAST(:at AS timestamptz))",
        {"user": str(USER), "at": NOW.isoformat()},
    )


def test_only_one_revision_wins_and_children_resolve_to_owner(
    repository: ContinuationRepository,
) -> None:
    original = Conversation(
        "root",
        USER,
        "de",
        {"model": "original"},
        NOW + timedelta(seconds=300),
        [Segment("root", "root", 0, NOW, 300)],
    )
    repository.create(original)
    first, concurrent = repository.get("root"), repository.get("root")
    assert first is not None
    assert concurrent is not None
    first.segments.append(Segment("child", "root", 1, NOW, 200))
    first.revision = 1
    assert repository.save(first, 0)
    concurrent.revision = 1
    concurrent.ending = True
    assert not repository.save(concurrent, 0)
    child = repository.get("child")
    assert child is not None
    assert child.root_id == "root"
    assert child.user_id == USER
    assert child.ending is False
    repository.create(original)
    assert repository.get("child") == child


def test_deleting_owner_cascades_continuation_transcript_and_answers(db: SqlClient) -> None:
    seed(db)
    repository = SqlContinuationRepository(db)
    ledger = Continuations(repository)
    ledger.register("root", USER, "de", {"model": "voice"}, NOW, 300)
    db.execute("DELETE FROM app_user WHERE id = CAST(:user AS uuid)", {"user": str(USER)})
    assert repository.get("root") is None


def test_refund_and_receipt_commit_together_and_cannot_be_repeated(db: SqlClient) -> None:
    seed(db)
    repository = SqlContinuationRepository(db)
    ledger = Continuations(repository)
    ledger.register("root", USER, "de", {}, NOW, 300)
    db.execute(
        "INSERT INTO voice_week (user_id, week, seconds, last_grant) "
        "VALUES (CAST(:user AS uuid), CAST(:week AS date), 300, 300)",
        {"user": str(USER), "week": NOW.date().isoformat()},
    )
    repository.refund("root", UUID(int=2), NOW.date(), 280)
    repository.refund("root", USER, NOW.date(), 280)
    repository.refund("root", USER, NOW.date(), 280)
    assert db.execute("SELECT seconds FROM voice_week")[0]["seconds"] == 20
    assert db.execute("SELECT refunded FROM practice_continuation")[0]["refunded"]
