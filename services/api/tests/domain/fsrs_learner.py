"""A simulated learner whose memory follows known FSRS parameters, for testing the fit.

The app schedules the learner's cards with the parameters it has (the defaults, as for a real
learner before a fit); whether each review is remembered is drawn from the learner's *true*
parameters. A fit of the resulting log should move towards the true parameters and predict
new reviews of this learner better than the defaults.
"""

import random

from konvami_api.domain.fsrs import (
    DEFAULT_WEIGHTS,
    Memory,
    Rating,
    Weights,
    interval_days,
    retrievability,
    review,
)
from konvami_api.domain.fsrs_fit import History, Step

# A learner who forgets new cards about twice as fast as the published average does, and whose
# cards grow stable more slowly after each review remembered (a lower w8).
FORGETFUL: Weights = (0.1, 0.6, 1.1, 4.0, *DEFAULT_WEIGHTS[4:8], 1.2, *DEFAULT_WEIGHTS[9:])

_FIRST: tuple[tuple[Rating, float], ...] = (
    ("again", 0.15),
    ("hard", 0.15),
    ("good", 0.55),
    ("easy", 0.15),
)
_REMEMBERED: tuple[tuple[Rating, float], ...] = (("hard", 0.15), ("good", 0.7), ("easy", 0.15))


def _pick(rng: random.Random, choices: tuple[tuple[Rating, float], ...]) -> Rating:
    roll, total = rng.random(), 0.0
    for rating, share in choices:
        total += share
        if roll < total:
            return rating
    return choices[-1][0]


def simulate(
    truth: Weights,
    cards: int,
    reviews_per_card: int,
    seed: int,
    scheduled_with: Weights = DEFAULT_WEIGHTS,
) -> list[History]:
    rng = random.Random(seed)  # noqa: S311 (a repeatable test, not security)
    histories: list[History] = []
    for _ in range(cards):
        first = _pick(rng, _FIRST)
        steps = [Step(0, first)]
        true: Memory | None = review(None, 0, first, truth)
        planned: Memory | None = review(None, 0, first, scheduled_with)
        while len(steps) < reviews_per_card:
            assert true is not None
            assert planned is not None
            if steps[-1].rating == "again":
                # Not known: shown again in the same sitting, then scheduled.
                step = Step(0, "good")
            else:
                wait = interval_days(planned, scheduled_with)
                days = max(1, round(wait * rng.uniform(0.7, 1.5)))
                known = rng.random() < retrievability(true, days, truth)
                step = Step(days, _pick(rng, _REMEMBERED) if known else "again")
            steps.append(step)
            true = review(true, step.days, step.rating, truth)
            planned = review(planned, step.days, step.rating, scheduled_with)
        histories.append(tuple(steps))
    return histories
