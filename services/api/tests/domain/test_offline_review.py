from datetime import timedelta

import pytest

from konvami_api.domain.cards import CardError
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
