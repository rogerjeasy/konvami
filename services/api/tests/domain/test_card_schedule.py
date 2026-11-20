"""A learner's own card schedule: when their log is fitted, and what the fitted parameters do."""

from collections.abc import Sequence
from dataclasses import replace
from datetime import timedelta

from konvami_api.domain.card_schedule import REFIT_AFTER, CardScheduleService
from konvami_api.domain.cards import Card
from konvami_api.domain.fsrs import DEFAULT_WEIGHTS
from konvami_api.domain.fsrs_fit import MIN_REVIEWS, FitOutcome, History, Step
from tests.domain.test_cards import reported
from tests.world import NOON, OTHER_USER, USER, World

DAY = timedelta(days=1)
# A learner whose cards first rated "good" stay ten days, not the published 2.3.
FITTED = (*DEFAULT_WEIGHTS[:2], 10.0, *DEFAULT_WEIGHTS[3:])


def logged(world: World, reviews: int) -> Card:
    """A learner with one card reviewed `reviews` times a day apart (written straight into the
    store: a thousand reviews through the service would only make the test slow)."""
    card = world.cards.save(USER, reported(world), "word", 0)
    owner, language, key, _ = world.card_store.cards[card.id]
    reviewed = replace(card, reviews=reviews, reviewed_at=NOON)
    world.card_store.cards[card.id] = (owner, language, key, reviewed)
    for i in range(reviews):
        world.card_store.reviews.append((card.id, "good", NOON - (reviews - i) * DAY))
    return reviewed


def test_a_short_log_is_not_fitted() -> None:
    world = World()
    logged(world, MIN_REVIEWS - 1)

    assert not world.card_schedule.maybe_fit(USER)
    assert world.fit_starter.started == []


def test_a_long_enough_log_is_fitted_once_a_week() -> None:
    world = World()
    logged(world, MIN_REVIEWS)

    assert world.card_schedule.maybe_fit(USER)
    assert not world.card_schedule.maybe_fit(USER)
    world.clock.now += REFIT_AFTER - timedelta(minutes=1)
    assert not world.card_schedule.maybe_fit(USER)
    world.clock.now += timedelta(minutes=2)
    assert world.card_schedule.maybe_fit(USER)

    assert world.fit_starter.started == [USER, USER]


def test_a_worker_that_does_not_start_leaves_reviewing_alone() -> None:
    world = World()
    logged(world, MIN_REVIEWS)
    world.fit_starter.fails = True

    # Opening a review session works, and the fit is tried again in a week.
    assert world.cards.queue(USER).due >= 0
    assert world.fit_starter.started == [USER]
    assert not world.card_schedule.maybe_fit(USER)


def test_opening_a_review_session_starts_a_fit_when_one_is_due() -> None:
    world = World()
    logged(world, MIN_REVIEWS)

    world.cards.queue(USER)

    assert world.fit_starter.started == [USER]


def test_a_fit_reads_the_learners_log_and_keeps_its_outcome() -> None:
    world = World()
    card = logged(world, 3)
    seen: list[Sequence[History]] = []

    def fit(histories: Sequence[History]) -> FitOutcome:
        seen.append(histories)
        return FitOutcome(FITTED, 3, 0.5, 0.4)

    schedule = CardScheduleService(repository=world.schedule_store, clock=world.clock, fit=fit)

    outcome = schedule.fit(USER)

    assert seen == [[(Step(0, "good"), Step(1, "good"), Step(1, "good"))]]
    assert outcome.weights == FITTED
    assert world.card_schedule.weights(USER) == FITTED
    assert world.card_schedule.weights(OTHER_USER) is None
    assert card.id in world.card_store.cards


def test_fitted_parameters_schedule_the_learners_cards() -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)
    assert not world.cards.deck(USER).tuned

    world.schedule_store.outcomes[USER] = FitOutcome(FITTED, MIN_REVIEWS, 0.5, 0.4)
    queued = world.cards.queue(USER).cards[0]
    reviewed = world.cards.review(USER, card.id, "good")

    assert queued.due_in["good"] == 10 * DAY
    assert reviewed.due_at == world.clock() + 10 * DAY
    assert world.cards.deck(USER).tuned
    ahead = world.cards.ahead(USER)
    assert (ahead.weights, ahead.retention) == (FITTED, 0.9)


def test_without_a_fit_the_published_parameters_schedule_the_cards() -> None:
    world = World()
    card = world.cards.save(USER, reported(world), "word", 0)

    reviewed = world.cards.review(USER, card.id, "good")

    assert reviewed.due_at == world.clock() + 2 * DAY
    assert world.cards.ahead(USER).weights is None
