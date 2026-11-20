"""Two Halves' storage, in memory and on PostgreSQL: both keep the same things."""

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
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
    Nudge,
    Profile,
    RecapLine,
    Report,
    SeatState,
    Strike,
    Ticket,
)
from konvami_api.domain.halves_writer import CaseMaterial, word_case
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


def test_wrong_codes_are_counted_per_day_up_to_the_limit(store: HalvesRepository) -> None:
    day = date(2026, 11, 20)

    assert [store.note_wrong_code(USER, day, 2) for _ in range(3)] == [True, True, False]
    assert store.wrong_codes(USER, day) == 2
    assert store.wrong_codes(USER, day + timedelta(days=1)) == 0
    assert store.wrong_codes(UUID(int=2), day) == 0


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


# --- Phase 2 -------------------------------------------------------------------------------------


def test_a_case_written_for_it_keeps_its_template(store: HalvesRepository) -> None:
    words = tuple((w, w) for w in ("Frist", "Kaution", "Miete", "Wohnung", "Schlüssel", "Brief"))
    written = word_case(CaseMaterial(MOVE, "Brief", "de", "B1", "", words))
    assert written is not None
    store.save_case(case(template_id=written.id, custom=written))
    assert store.case(CASE) == case(template_id=written.id, custom=written)


def test_a_move_keeps_the_bridge_and_the_owners_decision(store: HalvesRepository) -> None:
    store.save_case(case())
    changed = move(bridge={"simpler": "Um 14:20."}, decided_at=NOON + timedelta(hours=3))
    store.save_move(changed)
    assert store.move(MOVE) == changed


def test_a_search_is_kept_one_a_learner_and_ended(store: HalvesRepository) -> None:
    store.save_profile(profile())
    store.save_ticket(Ticket(USER, NOON, NOON + timedelta(hours=12)))
    later = Ticket(USER, NOON, NOON + timedelta(hours=24), False, NOON + timedelta(hours=12))
    store.save_ticket(later)
    store.save_ticket(Ticket(OTHER, NOON + timedelta(hours=1), NOON + timedelta(hours=2)))
    assert store.ticket(USER) == later
    assert [t.user_id for t in store.tickets(10)] == [USER, OTHER]
    store.delete_ticket(USER)
    assert store.ticket(USER) is None


def test_a_nudge_is_kept_once_a_move_and_found_by_state(store: HalvesRepository) -> None:
    store.save_case(case())
    store.save_move(move())
    made = Nudge(MOVE, MOVE, OTHER, "um 14:20 Uhr", "checking", NOON)
    assert store.add_nudge(made)
    assert not store.add_nudge(replace(made, id=CASE))
    assert store.nudge(MOVE) == made
    assert store.stale_nudges(NOON + timedelta(minutes=6), 10) == [made]
    held = replace(made, status="held", attempts=1, reason="contact")
    store.save_nudge(held)
    assert store.nudges_of(MOVE) == [held]
    assert store.held_nudges(10) == [held]
    assert store.stale_nudges(NOON + timedelta(minutes=6), 10) == []


def test_leaving_deletes_a_learners_nudges_but_not_held_ones(store: HalvesRepository) -> None:
    store.save_case(case())
    store.save_move(move())
    store.save_move(move(id=CASE))
    passed = Nudge(MOVE, MOVE, OTHER, "um 14:20 Uhr", "passed", NOON)
    held = Nudge(USER, CASE, OTHER, "lena@example.com", "held", NOON)
    store.add_nudge(passed)
    store.add_nudge(held)
    store.delete_nudges_by(OTHER)
    assert store.nudges_of(MOVE) == []
    assert store.held_nudges(10) == [held]


def test_strikes_and_the_owners_numbers(store: HalvesRepository) -> None:
    store.save_profile(profile())
    store.save_case(case())
    store.save_move(move(status="held", reasons=("romance",), decided_at=NOON + timedelta(hours=2)))
    store.add_strike(Strike(CASE, USER, "warning", "romance", MOVE, NOON))
    assert [s.kind for s in store.strikes_of(USER)] == ["warning"]
    counts = store.counts(NOON - timedelta(days=1))
    assert (counts.moves, counts.held, counts.cases, counts.reports) == (1, 1, 1, 0)
    assert [round(h) for h in counts.decision_hours] == [2]
