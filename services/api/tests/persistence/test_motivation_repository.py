"""Motivation's storage, against the in-memory fake and PostgreSQL alike."""

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

from konvami_api.domain.motivation import QuestKind, QuestPick, SpeakingEvent
from konvami_api.persistence.motivation_repository import SqlMotivationRepository
from konvami_api.persistence.sql import SqlClient
from tests.fakes import InMemoryMotivationRepository

USER = uuid4()
OTHER = uuid4()
MON = date(2026, 11, 16)
NOON = datetime(2026, 11, 18, 12, tzinfo=UTC)

type Repository = InMemoryMotivationRepository | SqlMotivationRepository


@pytest.fixture(params=["memory", "postgres"])
def repo(request: pytest.FixtureRequest) -> Repository:
    if request.param == "memory":
        return InMemoryMotivationRepository()
    db: SqlClient = request.getfixturevalue("db")
    return SqlMotivationRepository(db)


PICKS = (
    QuestPick(QuestKind.REVIEW_CALL, 1),
    QuestPick(QuestKind.SAY_IT_BETTER, 2),
    QuestPick(QuestKind.TALK_DAYS, 3),
)


def test_a_weeks_quests_are_chosen_once_and_kept_in_order(repo: Repository) -> None:
    repo.choose(USER, MON, PICKS, NOON)
    repo.choose(USER, MON, (QuestPick(QuestKind.LONG_CALL, 1),), NOON)

    stored = repo.quests(USER, MON)
    assert [(q.kind, q.target, q.done_at) for q in stored] == [
        (QuestKind.REVIEW_CALL, 1, None),
        (QuestKind.SAY_IT_BETTER, 2, None),
        (QuestKind.TALK_DAYS, 3, None),
    ]
    assert repo.quests(OTHER, MON) == []
    assert repo.quests(USER, MON + timedelta(weeks=1)) == []


def test_a_quest_is_done_once_and_a_week_with_all_done_counts(repo: Repository) -> None:
    repo.choose(USER, MON, PICKS, NOON)
    for kind in ("review_call", "say_it_better"):
        repo.quest_done(USER, MON, kind, NOON)
    repo.quest_done(USER, MON, "review_call", NOON + timedelta(hours=1))
    assert repo.completed_weeks(USER) == 0

    repo.quest_done(USER, MON, "talk_days", NOON)

    assert {q.done_at for q in repo.quests(USER, MON)} == {NOON}
    assert repo.completed_weeks(USER) == 1


def test_a_done_quest_is_celebrated_once(repo: Repository) -> None:
    repo.choose(USER, MON, PICKS, NOON)
    assert not repo.celebrated(USER, "quest", "review_call", NOON)

    repo.quest_done(USER, MON, "review_call", NOON)

    assert repo.celebrated(USER, "quest", "review_call", NOON)
    assert not repo.celebrated(USER, "quest", "review_call", NOON)
    assert repo.quests(USER, MON)[0].celebrated_at == NOON


def test_milestones_are_dated_once_and_backfilled_ones_need_no_celebration(
    repo: Repository,
) -> None:
    repo.reach(USER, ["first_conversation", "first_card"], NOON, backfilled=True)
    later = NOON + timedelta(days=1)
    repo.reach(USER, ["first_conversation", "week_streak"], later, backfilled=False)

    reached = repo.reached(USER)
    assert set(reached) == {"first_conversation", "first_card", "week_streak"}
    assert reached["first_conversation"].at == NOON
    assert reached["first_conversation"].backfilled
    assert reached["first_conversation"].celebrated_at == NOON
    assert (reached["week_streak"].at, reached["week_streak"].celebrated_at) == (later, None)

    assert repo.celebrated(USER, "milestone", "week_streak", later)
    assert not repo.celebrated(USER, "milestone", "week_streak", later)
    assert not repo.celebrated(USER, "milestone", "unknown", later)
    assert repo.reached(OTHER) == {}


def test_reminders_can_be_paused_and_resumed(repo: Repository) -> None:
    assert repo.reminders_paused_until(USER) is None
    until = NOON + timedelta(days=30)

    repo.pause_reminders(USER, until)
    assert repo.reminders_paused_until(USER) == until

    repo.pause_reminders(USER, None)
    assert repo.reminders_paused_until(USER) is None


def test_speaking_outside_conversations_is_read_from_its_own_tables(db: SqlClient) -> None:
    repo = SqlMotivationRepository(db)
    db.execute("INSERT INTO app_user (id) VALUES (CAST(:id AS uuid))", {"id": str(USER)})
    persona = uuid4()
    db.execute(
        """INSERT INTO persona
               (id, user_id, language, role, name, gender, age, origin, backstory, look, voice)
           VALUES (CAST(:id AS uuid), CAST(:user AS uuid), 'de', 'buddy', 'Lena', 'female', 30,
                   'Berlin', 'A friend.', CAST('{}' AS jsonb), 'coral')""",
        {"id": str(persona), "user": str(USER)},
    )
    for sender, at in (("learner", NOON), ("partner", NOON), ("learner", NOON - timedelta(days=9))):
        db.execute(
            """INSERT INTO penpal_note (id, user_id, persona_id, sender, status, body, created_at)
               VALUES (CAST(:id AS uuid), CAST(:user AS uuid), CAST(:persona AS uuid), :sender,
                       'ready', 'Hallo', CAST(:at AS timestamptz))""",
            {
                "id": str(uuid4()),
                "user": str(USER),
                "persona": str(persona),
                "sender": sender,
                "at": at.isoformat(),
            },
        )
    db.execute(
        """INSERT INTO pronunciation_drill
               (user_id, language, drilled_at, drill, target, heard, was_right)
           VALUES (CAST(:user AS uuid), 'de', CAST(:at AS timestamptz), 'word', 'ich', 'isch',
                   false)""",
        {"user": str(USER), "at": (NOON + timedelta(minutes=1)).isoformat()},
    )

    events = repo.speaking_events(USER, NOON - timedelta(days=7))

    assert events == [
        SpeakingEvent("pen_pal_reply", NOON),
        SpeakingEvent("drill", NOON + timedelta(minutes=1)),
    ]
    assert repo.speaking_events(OTHER, NOON - timedelta(days=7)) == []
