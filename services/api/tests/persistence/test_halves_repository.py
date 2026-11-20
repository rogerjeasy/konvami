"""Two Halves' storage, in memory and on PostgreSQL: both keep the same things."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.halves import (
    Block,
    Case,
    Correction,
    Duo,
    HalvesRepository,
    Invite,
    Move,
    Profile,
    RecapLine,
    Report,
    SeatState,
)
from konvami_api.persistence.halves_repository import SqlHalvesRepository
from konvami_api.persistence.sql import SqlClient
from tests.halves_fake import InMemoryHalvesRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("22222222-2222-4222-8222-222222222222")
CASE = UUID("33333333-3333-4333-8333-333333333333")
MOVE = UUID("44444444-4444-4444-8444-444444444444")
NOON = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


@pytest.fixture(params=["memory", "postgres"])
def store(request: pytest.FixtureRequest) -> HalvesRepository:
    if request.param == "memory":
        return InMemoryHalvesRepository()
    return SqlHalvesRepository(request.getfixturevalue("db"))


def profile(user: UUID = USER, **changes: object) -> Profile:
    made = Profile(user, "Linde-7", "fr", "city:Lyon", "adult", True, False, 1, NOON)
    return Profile(**{**made.__dict__, **changes})


def case(**changes: object) -> Case:
    made = Case(
        CASE,
        "lost_cello",
        "friend",
        "open",
        NOON,
        (
            SeatState("A", USER, None, "de", "fr", last_active=NOON),
            SeatState("B", OTHER, None, "fr", "de", final_answers=(1, 0), again=True),
        ),
    )
    return Case(**{**made.__dict__, **changes})


def move(**changes: object) -> Move:
    made = Move(
        MOVE,
        CASE,
        "A",
        1,
        USER,
        "delivered",
        "Ein Schaffner hat um 14:20 Uhr",
        NOON,
        audio_key="halves/a.m4a",
        veil_key="halves/a-veil.mp3",
        veiled=True,
        reasons=(),
        delivered_at=NOON,
        reaction="bravo",
        answers=(2, 1),
        corrections=(Correction("um 14:20 Uhr", "um 14.20 Uhr", "Uhrzeit", True),),
        attempts=1,
    )
    return Move(**{**made.__dict__, **changes})


def test_a_profile_is_kept_changed_and_deleted(store: HalvesRepository) -> None:
    assert store.profile(USER) is None
    store.save_profile(profile())
    store.save_profile(profile(strikes=2, place=None, paused=True))
    assert store.profile(USER) == profile(strikes=2, place=None, paused=True)
    store.delete_profile(USER)
    assert store.profile(USER) is None


def test_a_case_keeps_its_seats_and_recap(store: HalvesRepository) -> None:
    store.save_case(case())
    assert store.case(CASE) == case()
    ended = case(
        status="solved",
        ended_at=NOON + timedelta(days=2),
        recaps={"A": (RecapLine("A", "Fertig!", "halves/r.mp3"), RecapLine("B", "Bravo!"))},
        recap_status="ready",
    )
    store.save_case(ended)
    assert store.case(CASE) == ended
    assert [c.id for c in store.cases_of(USER, 10)] == [CASE]
    assert [c.id for c in store.cases_of(OTHER, 10)] == [CASE]
    assert store.open_cases(10) == []


def test_a_move_is_kept_whole_and_found_by_case_learner_and_state(store: HalvesRepository) -> None:
    store.save_case(case())
    store.save_move(move())
    assert store.move(MOVE) == move()
    assert store.moves_of(CASE) == [move()]
    assert store.moves_by(USER) == [move()]
    assert store.moves_since(USER, NOON - timedelta(hours=1)) == 1
    assert store.moves_since(USER, NOON + timedelta(hours=1)) == 0
    store.save_move(move(status="held", reasons=("romance",)))
    assert [m.id for m in store.held(10)] == [MOVE]
    store.save_move(move(status="checking"))
    assert [m.id for m in store.stale_checks(NOON + timedelta(minutes=6), 10)] == [MOVE]
    store.save_move(move(delete_after=NOON + timedelta(days=30)))
    assert store.expired(NOON + timedelta(days=29), 10) == []
    assert [m.id for m in store.expired(NOON + timedelta(days=31), 10)] == [MOVE]
    store.save_move(move(delete_after=NOON, transcript="", audio_key=None, veil_key=None))
    assert store.expired(NOON + timedelta(days=31), 10) == []


def test_one_invite_per_learner_until_it_expires(store: HalvesRepository) -> None:
    first = Invite("ABC234", USER, None, NOON, NOON + timedelta(days=7))
    store.save_invite(first)
    second = Invite("XYZ789", USER, "lost_cello", NOON, NOON + timedelta(days=7))
    store.save_invite(second)
    assert store.invite("ABC234") is None
    assert store.invite_of(USER) == second
    store.delete_expired_invites(NOON + timedelta(days=8))
    assert store.invite("XYZ789") is None


def test_blocks_work_both_ways_and_only_their_maker_lifts_them(store: HalvesRepository) -> None:
    block = Block(UUID(int=7), USER, OTHER, "Vega-3", NOON)
    store.add_block(block)
    store.add_block(Block(UUID(int=8), USER, OTHER, "Vega-3", NOON))
    assert store.blocked(OTHER, USER)
    assert store.blocks_of(USER) == [block]
    store.remove_block(OTHER, block.id)
    assert store.blocked(USER, OTHER)
    store.remove_block(USER, block.id)
    assert not store.blocked(USER, OTHER)


def test_a_duo_is_stored_once_whoever_asks(store: HalvesRepository) -> None:
    store.add_duo(Duo(UUID(int=1), OTHER, USER, NOON))
    store.add_duo(Duo(UUID(int=2), USER, OTHER, NOON))
    duos = store.duos_of(USER)
    assert len(duos) == 1
    assert {duos[0].user_a, duos[0].user_b} == {USER, OTHER}
    assert store.duos_of(OTHER) == duos
    store.remove_duo(OTHER, USER)
    assert store.duos_of(USER) == []


def test_a_report_is_queued_until_the_owner_decides(store: HalvesRepository) -> None:
    store.save_case(case())
    store.save_move(move())
    report = Report(UUID(int=9), OTHER, MOVE, "harassment", "rude", "open", NOON)
    store.add_report(report)
    assert store.open_reports(10) == [report]
    closed = Report(**{**report.__dict__, "status": "removed", "resolved_at": NOON})
    store.save_report(closed)
    assert store.report(report.id) == closed
    assert store.open_reports(10) == []


def test_deleting_a_learner_leaves_their_seat_to_an_ai_and_takes_their_moves(
    db: SqlClient,
) -> None:
    store = SqlHalvesRepository(db)
    store.save_profile(profile())
    store.save_case(case())
    store.save_move(move())
    db.execute("DELETE FROM app_user WHERE id = CAST(:id AS uuid)", {"id": str(USER)})
    left = store.case(CASE)
    assert left is not None
    assert left.seat("A").user_id is None
    assert left.seat("A").ai
    assert store.move(MOVE) is None
    assert store.profile(USER) is None
