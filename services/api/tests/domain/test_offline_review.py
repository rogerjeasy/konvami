import datetime as dt
from datetime import timedelta
from uuid import UUID, uuid4

import pytest

from konvami_api.domain.cards import CardError, OfflineReview
from konvami_api.domain.fsrs import Rating
from tests.domain.test_cards import reported
from tests.world import NOON, USER, World


def test_replayed_offline_rating_does_not_review_a_card_twice() -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    reviewed = world.cards.review(USER, card.id, "good", expected_reviews=0, reviewed_at=NOON)
    assert reviewed.reviews == 1
    with pytest.raises(CardError, match="conflict"):
        world.cards.review(USER, card.id, "good", expected_reviews=0, reviewed_at=NOON)
    assert world.cards.card(USER, card.id).reviews == 1


def test_delayed_sync_uses_when_the_learner_reviewed_not_when_network_returned() -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    world.clock.now += timedelta(days=3)
    result = world.cards.review(USER, card.id, "good", expected_reviews=0, reviewed_at=NOON)
    assert result.reviewed_at == NOON
    assert result.due_at == NOON + timedelta(days=2)


@pytest.mark.parametrize("offset", [-1, 1])
def test_rejects_reviews_before_creation_or_in_the_future(offset: int) -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    with pytest.raises(CardError, match="invalid_review"):
        world.cards.review(
            USER,
            card.id,
            "good",
            expected_reviews=0,
            reviewed_at=NOON + timedelta(days=offset),
        )


# Syncing a batch of reviews made offline (`CardService.sync`).


def offline(
    card_id: UUID,
    rating: Rating = "good",
    expected: int = 0,
    at: dt.datetime = NOON,
    client: UUID | None = None,
) -> OfflineReview:
    return OfflineReview(
        client_id=client or uuid4(),
        card_id=card_id,
        rating=rating,
        expected_reviews=expected,
        reviewed_at=at,
    )


def test_a_batch_is_applied_in_the_order_the_learner_reviewed() -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    world.clock.now += timedelta(days=3)
    later = offline(card.id, "good", expected=1, at=NOON + timedelta(days=2))
    first = offline(card.id, "again", expected=0, at=NOON)
    results = world.cards.sync(USER, [later, first])
    assert [r.client_id for r in results] == [first.client_id, later.client_id]
    assert [r.outcome for r in results] == ["applied", "applied"]
    stored = world.cards.card(USER, card.id)
    assert stored.reviews == 2
    assert stored.reviewed_at == NOON + timedelta(days=2)


def test_sending_the_same_batch_again_changes_nothing() -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    world.clock.now += timedelta(hours=1)
    batch = [offline(card.id)]
    world.cards.sync(USER, batch)
    again = world.cards.sync(USER, batch)
    assert again[0].outcome == "applied"
    assert again[0].card is not None
    assert again[0].card.reviews == 1
    assert world.cards.card(USER, card.id).reviews == 1


def test_a_rating_made_on_an_older_version_of_the_card_gives_way_to_the_server() -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    world.clock.now += timedelta(hours=1)
    # Another device reviewed the card first.
    world.cards.review(USER, card.id, "easy")
    result = world.cards.sync(USER, [offline(card.id, "again", expected=0)])[0]
    assert result.outcome == "superseded"
    assert result.card is not None
    assert result.card.reviews == 1
    assert world.card_store.reviews[-1][1] == "easy"


def test_a_removed_card_is_reported_as_removed() -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    world.cards.remove(USER, card.id)
    result = world.cards.sync(USER, [offline(card.id)])[0]
    assert (result.outcome, result.card) == ("removed", None)


def test_a_card_of_another_learner_is_removed_for_this_one() -> None:
    from tests.world import OTHER_USER

    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    assert world.cards.sync(OTHER_USER, [offline(card.id)])[0].outcome == "removed"
    assert world.cards.card(USER, card.id).reviews == 0


def test_a_review_time_outside_the_cards_history_is_moved_inside_it() -> None:
    world = World()
    call = reported(world)
    card = world.cards.save(USER, call, "word", 0)
    world.clock.now += timedelta(hours=2)
    # A phone clock running a day fast, and one set before the card existed.
    ahead = world.cards.sync(USER, [offline(card.id, at=NOON + timedelta(days=1))])[0]
    assert ahead.card is not None
    assert ahead.card.reviewed_at == world.clock.now
    other = world.cards.save(USER, call, "word", 1)
    behind = world.cards.sync(USER, [offline(other.id, at=NOON - timedelta(days=1))])[0]
    assert behind.card is not None
    assert behind.card.reviewed_at == other.created_at


def test_a_batch_is_bounded() -> None:
    from konvami_api.domain.cards import SYNC_MAX

    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)
    with pytest.raises(CardError, match="invalid_review"):
        world.cards.sync(USER, [offline(card.id) for _ in range(SYNC_MAX + 1)])


def test_cards_ahead_are_the_ones_due_within_the_days_offline_reviewing_covers() -> None:
    from konvami_api.domain.cards import OFFLINE_AHEAD

    world = World()
    call = reported(world)
    soon = world.cards.save(USER, call, "word", 0)
    later = world.cards.save(USER, call, "word", 1)
    world.clock.now += timedelta(minutes=1)
    world.cards.review(USER, soon.id, "good")  # back in two days
    world.cards.review(USER, later.id, "easy")  # back in eight
    ahead = world.cards.ahead(USER)
    assert timedelta(days=8) > OFFLINE_AHEAD
    assert [card.id for card in ahead.cards] == [soon.id]
    assert ahead.language == "de"
