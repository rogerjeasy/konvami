"""Fitting the scheduler to one learner: it must learn how a learner forgets, and never hand a
learner parameters that predict their reviews worse than the defaults."""

import datetime as dt

from konvami_api.domain.fsrs import DEFAULT_WEIGHTS, WEIGHT_COUNT, Rating
from konvami_api.domain.fsrs_fit import (
    BOUNDS,
    Step,
    fit_learner,
    histories_from_log,
    log_loss,
    pretrain,
)
from tests.domain.fsrs_learner import FORGETFUL, simulate

MONDAY = dt.datetime(2026, 11, 2, 9, 0, tzinfo=dt.UTC)
GOOD = 2  # the place of "good" among the four first stabilities


def test_the_days_between_reviews_are_counted_as_a_review_counts_them() -> None:
    log: list[list[tuple[dt.datetime, Rating]]] = [
        [
            (MONDAY, "good"),
            (MONDAY + dt.timedelta(days=1, hours=23), "good"),
            (MONDAY + dt.timedelta(days=2), "again"),
        ],
        [],
    ]

    assert histories_from_log(log) == [(Step(0, "good"), Step(1, "good"), Step(0, "again"))]


def test_only_reviews_a_day_or_more_after_the_one_before_are_predicted() -> None:
    history = (Step(0, "good"), Step(0, "good"), Step(3, "again"), Step(0, "good"), Step(2, "good"))

    _, count = log_loss(DEFAULT_WEIGHTS, [history])

    assert count == 2


def test_a_new_cards_stability_is_learned_from_its_second_review() -> None:
    histories = simulate(FORGETFUL, cards=1500, reviews_per_card=2, seed=3)

    fitted = pretrain(histories, DEFAULT_WEIGHTS)

    assert abs(fitted[GOOD] - FORGETFUL[GOOD]) < abs(DEFAULT_WEIGHTS[GOOD] - FORGETFUL[GOOD])
    # A card first rated better is never less stable.
    assert list(fitted[:4]) == sorted(fitted[:4])


def test_a_learner_unlike_the_average_gets_parameters_that_predict_them_better() -> None:
    histories = simulate(FORGETFUL, cards=600, reviews_per_card=8, seed=1)

    outcome = fit_learner(histories, iterations=40)

    assert outcome.weights is not None
    assert outcome.default_loss is not None
    assert outcome.fitted_loss is not None
    assert outcome.fitted_loss < outcome.default_loss
    # Their cards grow stable more slowly than the average learner's: the fit moved that way.
    assert abs(outcome.weights[8] - FORGETFUL[8]) < abs(DEFAULT_WEIGHTS[8] - FORGETFUL[8])
    assert len(outcome.weights) == WEIGHT_COUNT
    assert all(lo <= w <= hi for w, (lo, hi) in zip(outcome.weights, BOUNDS, strict=True))


def test_an_average_learner_keeps_the_defaults() -> None:
    histories = simulate(DEFAULT_WEIGHTS, cards=600, reviews_per_card=8, seed=2)

    outcome = fit_learner(histories, iterations=40)

    # Whatever the fit found does not predict the held-back cards clearly better.
    assert outcome.weights is None
    assert outcome.default_loss is not None


def test_a_short_log_is_not_fitted() -> None:
    histories = simulate(FORGETFUL, cards=100, reviews_per_card=8, seed=4)

    outcome = fit_learner(histories)

    assert outcome.weights is None
    assert (outcome.reviews, outcome.default_loss, outcome.fitted_loss) == (800, None, None)
