"""When a flashcard comes back: FSRS, the spaced-repetition scheduler spec §6.7 names.

A card's memory is two numbers. Stability is how many days pass until the chance of recalling
the card has fallen to 90%; difficulty, from 1 to 10, is how hard the card is for this learner.
Each review moves both, by how well the card was remembered and how long it had been.

This is FSRS-6 with its published default parameters, checked against the reference
implementation (py-fsrs) in the tests. It is pure arithmetic: no clock, no storage.
"""

import math
from dataclasses import dataclass
from typing import Literal, get_args

Rating = Literal["again", "hard", "good", "easy"]
RATINGS: tuple[Rating, ...] = get_args(Rating)

# The 21 default parameters of FSRS-6, as published with the algorithm: the first four are the
# stability after a first review rated again, hard, good or easy; the others shape how
# difficulty and stability change.
_W = (
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
_DECAY = -_W[20]
# Makes the forgetting curve pass through 90% after exactly `stability` days: what stability
# means, whatever share `RETENTION` asks for.
_FACTOR = math.pow(0.9, 1 / _DECAY) - 1

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


def _clamp_difficulty(difficulty: float) -> float:
    return min(max(difficulty, MIN_DIFFICULTY), MAX_DIFFICULTY)


def _first_difficulty(grade: int) -> float:
    return _W[4] - math.exp(_W[5] * (grade - 1)) + 1


def retrievability(memory: Memory, days: int) -> float:
    """The chance that the card is still recalled `days` after its last review."""
    return math.pow(1 + _FACTOR * days / memory.stability, _DECAY)


def _recalled(memory: Memory, recall: float, grade: int) -> float:
    """Stability after a card was remembered: it grows more the harder the recall was (a low
    chance of recall), the easier the card is, and the less stable it was."""
    hard_penalty = _W[15] if grade == 2 else 1.0
    easy_bonus = _W[16] if grade == 4 else 1.0
    growth = (
        math.exp(_W[8])
        * (11 - memory.difficulty)
        * math.pow(memory.stability, -_W[9])
        * (math.exp((1 - recall) * _W[10]) - 1)
        * hard_penalty
        * easy_bonus
    )
    return memory.stability * (1 + growth)


def _forgotten(memory: Memory, recall: float) -> float:
    """Stability after a card was forgotten: a fraction of what it was, never more."""
    relearned = (
        _W[11]
        * math.pow(memory.difficulty, -_W[12])
        * (math.pow(memory.stability + 1, _W[13]) - 1)
        * math.exp((1 - recall) * _W[14])
    )
    return min(relearned, memory.stability / math.exp(_W[17] * _W[18]))


def _same_day(memory: Memory, grade: int) -> float:
    """Stability after a second look on the same day, which teaches less than one days later."""
    change = math.exp(_W[17] * (grade - 3 + _W[18])) * math.pow(memory.stability, -_W[19])
    if grade > 1:
        # Remembering a card never makes it less stable.
        change = max(change, 1.0)
    return memory.stability * change


def _next_difficulty(difficulty: float, grade: int) -> float:
    change = -_W[6] * (grade - 3)
    # The closer to the hardest, the smaller a step towards it.
    moved = difficulty + (10.0 - difficulty) * change / 9.0
    # A slight pull back to where an easy card starts, so difficulty cannot only pile up.
    return _clamp_difficulty(_W[7] * _first_difficulty(4) + (1 - _W[7]) * moved)


def review(memory: Memory | None, days_since: int, rating: Rating) -> Memory:
    """A card's memory after a review. `memory` is None for a card's first review;
    `days_since` is the whole days since the review before."""
    grade = _grade(rating)
    if memory is None:
        return Memory(
            stability=max(_W[grade - 1], MIN_STABILITY),
            difficulty=_clamp_difficulty(_first_difficulty(grade)),
        )
    if days_since < 1:
        stability = _same_day(memory, grade)
    elif grade == 1:
        stability = _forgotten(memory, retrievability(memory, days_since))
    else:
        stability = _recalled(memory, retrievability(memory, days_since), grade)
    return Memory(
        stability=max(stability, MIN_STABILITY),
        difficulty=_next_difficulty(memory.difficulty, grade),
    )


def interval_days(memory: Memory) -> int:
    """How many days until the card should come back: when the chance of recalling it has
    fallen to `RETENTION`."""
    days = memory.stability / _FACTOR * (math.pow(RETENTION, 1 / _DECAY) - 1)
    return min(max(round(days), MIN_INTERVAL_DAYS), MAX_INTERVAL_DAYS)
