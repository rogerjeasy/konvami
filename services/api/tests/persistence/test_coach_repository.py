"""The Coach's days, suggestions and answers (spec §6.12, migration 0230), against a real
PostgreSQL, and the same behaviour from the in-memory stand-in."""

import datetime as dt
from uuid import UUID, uuid4

import pytest

from konvami_api.domain.coach import (
    Action,
    Brief,
    CoachRepository,
    Kind,
    Signal,
    Suggestion,
)
from konvami_api.persistence.coach_repository import SqlCoachRepository
from konvami_api.persistence.sql import SqlClient
from tests.fakes import InMemoryCoachRepository
from tests.persistence.test_repositories import OTHER_USER, USER

NOON = dt.datetime(2026, 11, 20, 12, 0, tzinfo=dt.UTC)
TODAY = dt.date(2026, 11, 20)
LENA = UUID("00000000-0000-4000-8000-00000000000a")


@pytest.fixture(params=["memory", "postgres"])
def store(request: pytest.FixtureRequest) -> CoachRepository:
    if request.param == "memory":
        return InMemoryCoachRepository()
    db: SqlClient = request.getfixturevalue("db")
    return SqlCoachRepository(db)


def brief(day: dt.date = TODAY, basis: str = "") -> Brief:
    return Brief(
        day=day,
        basis=basis,
        wording="template",
        holding_back=(Signal(Kind.WEAK_TOPIC, "dative", 60, {"topic": "dative"}, trend="worse"),),
        going_well=(Signal(Kind.PACE_UP, "", 45, {"before": 80, "after": 95}, positive=True),),
        created_at=NOON,
    )


def suggestion(rank: int, kind: Kind = Kind.WEAK_TOPIC, day: dt.date = TODAY) -> Suggestion:
    return Suggestion(
        id=uuid4(),
        day=day,
        rank=rank,
        kind=kind,
        key=f"key{rank}",
        evidence={"topic": "dative", "accuracy": 50, "words": ["Bahnhof"]},
        action=Action("lesson", topic="dative", partner=LENA),
        minutes=10,
        urgent=rank == 0,
    )


def test_a_day_is_kept_with_its_findings_and_suggestions(store: CoachRepository) -> None:
    items = [suggestion(1), suggestion(0)]

    store.save(USER, "de", brief(), items)

    assert store.brief(USER, "de", TODAY) == brief()
    assert store.brief(USER, "fr", TODAY) is None
    assert store.brief(OTHER_USER, "de", TODAY) is None
    assert store.suggestions(USER, "de", TODAY) == [items[1], items[0]]


def test_finding_again_replaces_the_unanswered_suggestions_only(store: CoachRepository) -> None:
    kept, dropped = suggestion(0), suggestion(1)
    store.save(USER, "de", brief(), [kept, dropped])
    assert store.respond(USER, kept.id, "accepted", None, NOON)
    fresh = suggestion(1, Kind.CARDS_OVERDUE)

    store.save(USER, "de", brief(basis="rtc_2"), [fresh])

    assert [s.id for s in store.suggestions(USER, "de", TODAY)] == [kept.id, fresh.id]
    found = store.brief(USER, "de", TODAY)
    assert found is not None
    assert found.basis == "rtc_2"


def test_an_answer_is_kept_and_only_by_its_learner(store: CoachRepository) -> None:
    item = suggestion(0)
    store.save(USER, "de", brief(), [item])

    assert not store.respond(OTHER_USER, item.id, "dismissed", "not_useful", NOON)
    assert not store.respond(USER, uuid4(), "dismissed", "not_useful", NOON)
    assert store.respond(USER, item.id, "dismissed", "too_long", NOON)

    answered = store.answered(USER, "de", TODAY - dt.timedelta(days=30))
    assert [(s.id, s.status, s.reason, s.responded_at) for s in answered] == [
        (item.id, "dismissed", "too_long", NOON)
    ]
    assert store.answered(USER, "de", TODAY + dt.timedelta(days=1)) == []


def test_earlier_shown_suggestions_are_settled_and_make_the_history(
    store: CoachRepository,
) -> None:
    yesterday = TODAY - dt.timedelta(days=1)
    shown = [suggestion(rank, day=yesterday) for rank in range(4)]
    store.save(USER, "de", brief(yesterday), shown)
    # The fourth was never shown, but one the learner took up counts wherever it was.
    store.respond(USER, shown[3].id, "accepted", None, NOON - dt.timedelta(days=1))

    unsettled = store.unsettled(USER, "de", TODAY)
    assert [s.id for s in unsettled] == [s.id for s in shown]
    assert store.unsettled(USER, "de", yesterday) == []

    store.settle(USER, shown[3].id, "resolved", True, NOON)

    history = store.history(USER, "de", TODAY, 10)
    assert [s.id for s in history] == [s.id for s in shown]
    assert (history[3].outcome, history[3].acted) == ("resolved", True)
    assert [s.id for s in store.unsettled(USER, "de", TODAY)] == [s.id for s in shown[:3]]
    assert store.history(USER, "de", yesterday, 10) == []
    assert len(store.history(USER, "de", TODAY, 2)) == 2


def test_the_wording_is_asked_for_once_and_again_when_stale(store: CoachRepository) -> None:
    store.save(USER, "de", brief(), [suggestion(0)])

    def ask(at: dt.datetime, max_requests: int = 4) -> bool:
        return store.request_wording(
            USER,
            "de",
            TODAY,
            at=at,
            stale_before=at - dt.timedelta(minutes=5),
            max_requests=max_requests,
        )

    assert ask(NOON)
    assert not ask(NOON + dt.timedelta(minutes=1))
    assert ask(NOON + dt.timedelta(minutes=10))
    found = store.brief(USER, "de", TODAY)
    assert found is not None
    assert found.wording == "pending"
    assert not ask(NOON + dt.timedelta(hours=1), max_requests=2)
    assert not store.request_wording(
        USER, "de", TODAY + dt.timedelta(days=1), at=NOON, stale_before=NOON, max_requests=4
    )


def test_the_models_words_and_order_are_stored(store: CoachRepository) -> None:
    first, second = suggestion(0), suggestion(1)
    store.save(USER, "de", brief(), [first, second])

    store.worded(
        USER,
        "de",
        TODAY,
        "model",
        {second.id: (0, "Kurze Lektion", "50 % richtig."), first.id: (1, "", "")},
    )

    found = store.suggestions(USER, "de", TODAY)
    assert [(s.id, s.title, s.why) for s in found] == [
        (second.id, "Kurze Lektion", "50 % richtig."),
        (first.id, None, None),
    ]
    stored = store.brief(USER, "de", TODAY)
    assert stored is not None
    assert stored.wording == "model"
