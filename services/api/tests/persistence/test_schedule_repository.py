"""A learner's fitted card schedule, stored the same in memory and on PostgreSQL."""

import datetime as dt
from dataclasses import dataclass, replace
from uuid import UUID, uuid4

import pytest

from konvami_api.domain.card_schedule import ScheduleRepository
from konvami_api.domain.cards import Card, CardRepository
from konvami_api.domain.fsrs import DEFAULT_WEIGHTS, Memory, Rating
from konvami_api.domain.fsrs_fit import FitOutcome
from konvami_api.persistence.repositories import SqlCardRepository
from konvami_api.persistence.schedule_repository import SqlScheduleRepository
from konvami_api.persistence.sql import SqlClient
from tests.fakes import InMemoryCardRepository, InMemoryScheduleRepository

USER = UUID("11111111-1111-1111-1111-111111111111")
OTHER = UUID("22222222-2222-2222-2222-222222222222")
NOON = dt.datetime(2026, 11, 2, 12, 0, tzinfo=dt.UTC)
DAY = dt.timedelta(days=1)
FITTED = (1.0, *DEFAULT_WEIGHTS[1:])


@dataclass
class Store:
    cards: CardRepository
    schedule: ScheduleRepository


@pytest.fixture(params=["memory", "postgres"])
def store(request: pytest.FixtureRequest) -> Store:
    if request.param == "memory":
        cards = InMemoryCardRepository()
        return Store(cards, InMemoryScheduleRepository(cards))
    db: SqlClient = request.getfixturevalue("db")
    return Store(SqlCardRepository(db), SqlScheduleRepository(db))


def card(made: dt.datetime, front: str) -> Card:
    return Card(
        id=uuid4(),
        kind="word",
        front=front,
        back="meaning",
        note=None,
        explained_in="en",
        source_call_id=None,
        created_at=made,
        due_at=made,
        reviewed_at=None,
        memory=None,
        reviews=0,
        lapses=0,
    )


def reviewed(store: Store, user: UUID, made: dt.datetime, ratings: list[Rating]) -> Card:
    """A card made at `made` and rated once a day from then on."""
    current = card(made, f"Wort {made.isoformat()} {user}")
    assert store.cards.add(user, "de", current.front, current, 1000)
    for i, rating in enumerate(ratings):
        after = replace(
            current,
            reviewed_at=made + i * DAY,
            memory=Memory(2.0, 5.0),
            reviews=current.reviews + 1,
        )
        assert store.cards.reviewed(user, after, rating, current.reviews)
        current = after
    return current


def test_a_learner_without_a_fit_keeps_the_defaults(store: Store) -> None:
    assert store.schedule.weights(USER) is None
    state = store.schedule.fit_state(USER)
    assert (state.reviews, state.attempted_at) == (0, None)


def test_the_review_log_is_read_per_card_oldest_card_first(store: Store) -> None:
    reviewed(store, USER, NOON, ["good", "again", "good"])
    reviewed(store, USER, NOON + DAY, ["easy"])
    reviewed(store, OTHER, NOON, ["hard"])
    # A card never reviewed is not in the log.
    fresh = card(NOON, "neu")
    store.cards.add(USER, "de", fresh.front, fresh, 1000)

    log = store.schedule.review_log(USER, 10)

    assert log == [
        [(NOON, "good"), (NOON + DAY, "again"), (NOON + 2 * DAY, "good")],
        [(NOON + DAY, "easy")],
    ]
    assert store.schedule.fit_state(USER).reviews == 4
    # Only the newest cards are read when there are more.
    assert store.schedule.review_log(USER, 1) == [[(NOON + DAY, "easy")]]


def test_a_fit_is_claimed_once_per_period(store: Store) -> None:
    reviewed(store, USER, NOON, ["good"])

    assert store.schedule.claim(USER, NOON, NOON - 7 * DAY)
    assert not store.schedule.claim(USER, NOON + DAY, NOON - 6 * DAY)
    assert store.schedule.fit_state(USER).attempted_at == NOON
    assert store.schedule.claim(USER, NOON + 8 * DAY, NOON + DAY)


def test_a_kept_fit_gives_the_learner_their_weights(store: Store) -> None:
    reviewed(store, USER, NOON, ["good"])
    store.schedule.claim(USER, NOON, NOON - 7 * DAY)

    store.schedule.store(USER, FitOutcome(FITTED, 1200, 0.5, 0.45), NOON + DAY)

    assert store.schedule.weights(USER) == FITTED
    assert store.schedule.weights(OTHER) is None


def test_a_fit_that_was_not_kept_leaves_the_defaults(store: Store) -> None:
    reviewed(store, USER, NOON, ["good"])
    store.schedule.store(USER, FitOutcome(FITTED, 1200, 0.5, 0.45), NOON)

    store.schedule.store(USER, FitOutcome(None, 1300, 0.5, 0.51), NOON + 7 * DAY)

    assert store.schedule.weights(USER) is None
