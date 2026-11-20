"""When a flashcard comes back: FSRS, the spaced-repetition scheduler spec §6.7 names.

A card's memory is two numbers. Stability is how many days pass until the chance of recalling
the card has fallen to 90%; difficulty, from 1 to 10, is how hard the card is for this learner.
Each review moves both, by how well the card was remembered and how long it had been.

This is FSRS-6, checked against the reference implementation (py-fsrs) in the tests. Every
function takes the 21 parameters (`weights`): the published defaults, or a learner's own once
their reviews have been fitted (`fsrs_fit.py`). It is pure arithmetic: no clock, no storage.
"""

import math
from dataclasses import dataclass
from typing import Literal, get_args

Rating = Literal["again", "hard", "good", "easy"]
RATINGS: tuple[Rating, ...] = get_args(Rating)
# The scheduler's 21 parameters.
Weights = tuple[float, ...]
WEIGHT_COUNT = 21

# The 21 default parameters of FSRS-6, as published with the algorithm: the first four are the
# stability after a first review rated again, hard, good or easy; the others shape how
# difficulty and stability change.
DEFAULT_WEIGHTS: Weights = (
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    0.001,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    0.1542,
)
# The share of cards a learner should still know when they come back.
RETENTION = 0.9

MIN_STABILITY = 0.001
MIN_DIFFICULTY, MAX_DIFFICULTY = 1.0, 10.0
# A card always waits a day at least, and never longer than a hundred years.
MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS = 1, 36500


@dataclass(frozen=True)
class Memory:
    # Days until the chance of recalling the card falls to 90%.
    stability: float
    # 1 (easy for this learner) to 10 (hard).
    difficulty: float


def _grade(rating: Rating) -> int:
    """A rating as the number the formulas use: 1 (again) to 4 (easy)."""
    return RATINGS.index(rating) + 1


def _decay(w: Weights) -> float:
    return -w[20]


def _factor(w: Weights) -> float:
    """Makes the forgetting curve pass through 90% after exactly `stability` days: what
    stability means, whatever share `RETENTION` asks for."""
    return math.pow(0.9, 1 / _decay(w)) - 1


def _clamp_difficulty(difficulty: float) -> float:
    return min(max(difficulty, MIN_DIFFICULTY), MAX_DIFFICULTY)


def _first_difficulty(grade: int, w: Weights) -> float:
    return w[4] - math.exp(w[5] * (grade - 1)) + 1


def retrievability(memory: Memory, days: int, weights: Weights = DEFAULT_WEIGHTS) -> float:
    """The chance that the card is still recalled `days` after its last review."""
    return math.pow(1 + _factor(weights) * days / memory.stability, _decay(weights))


def _recalled(memory: Memory, recall: float, grade: int, w: Weights) -> float:
    """Stability after a card was remembered: it grows more the harder the recall was (a low
    chance of recall), the easier the card is, and the less stable it was."""
    hard_penalty = w[15] if grade == 2 else 1.0
    easy_bonus = w[16] if grade == 4 else 1.0
    growth = (
        math.exp(w[8])
        * (11 - memory.difficulty)
        * math.pow(memory.stability, -w[9])
        * (math.exp((1 - recall) * w[10]) - 1)
        * hard_penalty
        * easy_bonus
    )
    return memory.stability * (1 + growth)


def _forgotten(memory: Memory, recall: float, w: Weights) -> float:
    """Stability after a card was forgotten: a fraction of what it was, never more."""
    relearned = (
        w[11]
        * math.pow(memory.difficulty, -w[12])
        * (math.pow(memory.stability + 1, w[13]) - 1)
        * math.exp((1 - recall) * w[14])
    )
    return min(relearned, memory.stability / math.exp(w[17] * w[18]))


def _same_day(memory: Memory, grade: int, w: Weights) -> float:
    """Stability after a second look on the same day, which teaches less than one days later."""
    change = math.exp(w[17] * (grade - 3 + w[18])) * math.pow(memory.stability, -w[19])
    if grade > 1:
        # Remembering a card never makes it less stable.
        change = max(change, 1.0)
    return memory.stability * change


def _next_difficulty(difficulty: float, grade: int, w: Weights) -> float:
    change = -w[6] * (grade - 3)
    # The closer to the hardest, the smaller a step towards it.
    moved = difficulty + (10.0 - difficulty) * change / 9.0
    # A slight pull back to where an easy card starts, so difficulty cannot only pile up.
    return _clamp_difficulty(w[7] * _first_difficulty(4, w) + (1 - w[7]) * moved)


def review(
    memory: Memory | None, days_since: int, rating: Rating, weights: Weights = DEFAULT_WEIGHTS
) -> Memory:
    """A card's memory after a review. `memory` is None for a card's first review;
    `days_since` is the whole days since the review before."""
    w = weights
    grade = _grade(rating)
    if memory is None:
        return Memory(
            stability=max(w[grade - 1], MIN_STABILITY),
            difficulty=_clamp_difficulty(_first_difficulty(grade, w)),
        )
    if days_since < 1:
        stability = _same_day(memory, grade, w)
    elif grade == 1:
        stability = _forgotten(memory, retrievability(memory, days_since, w), w)
    else:
        stability = _recalled(memory, retrievability(memory, days_since, w), grade, w)
    return Memory(
        stability=max(stability, MIN_STABILITY),
        difficulty=_next_difficulty(memory.difficulty, grade, w),
    )


def interval_days(
    memory: Memory, weights: Weights = DEFAULT_WEIGHTS, retention: float = RETENTION
) -> int:
    """How many days until the card should come back: when the chance of recalling it has
    fallen to `retention`."""
    decay = _decay(weights)
    days = memory.stability / _factor(weights) * (math.pow(retention, 1 / decay) - 1)
    return min(max(round(days), MIN_INTERVAL_DAYS), MAX_INTERVAL_DAYS)
