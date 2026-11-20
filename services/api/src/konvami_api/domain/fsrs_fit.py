"""Fitting the scheduler to one learner (spec §6.7; gap 19 of the 2026-11-20 research).

FSRS predicts, for every review, the chance that the learner still knows the card. Its published
parameters were fitted on millions of learners; one learner's own reviews say how *they* forget.
This fits the 21 parameters to a learner's review log by minimising the log loss of those
predictions, in pure Python (the API runs on Lambda without a numerical library):

1. The first four parameters, a new card's stability by its first rating, are fitted one at a
   time from each card's second review, as the reference optimiser does first ("pretraining").
2. Then the other 17 move together by Adam on a finite-difference gradient, kept within bounds
   close to the reference optimiser's and pulled gently back towards where they started. The
   first four stay as pretrained: they are measured directly, and moving them with the rest let
   a card first rated "hard" end up more stable than one rated "good".
3. A fifth of the cards is held back. The fitted parameters are kept only when they predict
   those cards better than the defaults do; otherwise the learner keeps the defaults.

Design note: docs/superpowers/specs/2026-11-20-fsrs-fit-design.md.
"""

import datetime as dt
import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from konvami_api.domain.fsrs import (
    DEFAULT_WEIGHTS,
    WEIGHT_COUNT,
    Memory,
    Rating,
    Weights,
    retrievability,
    review,
)

# Fewer logged reviews than this, and a fit learns noise: Anki's guidance for its FSRS
# optimiser is about a thousand reviews.
MIN_REVIEWS = 1000
# The predictions the held-back cards must give before a fit is judged at all.
MIN_HELD_OUT = 100
# Every fifth card is held back to judge the fit (by its place in the log, so the same cards
# each time).
HOLD_OUT_EVERY = 5
# A fit must predict the held-back cards at least this much better (relative log loss) than
# the defaults, so a learner's schedule does not change on noise.
MIN_GAIN = 0.005
# The most cards one fit reads: a bound on the work, far above what a week brings.
MAX_CARDS = 2000

# Adam's steps, and its learning rate falling from the first to the last (cosine).
ITERATIONS = 64
LEARNING_RATE = 0.04
FINAL_LEARNING_RATE = 0.004
_BETA1, _BETA2, _EPSILON = 0.9, 0.999, 1e-8
# The parameters the gradient moves: all but the four pretrained stabilities.
_DESCENDED = range(4, WEIGHT_COUNT)
# The finite-difference step, as a share of each parameter's range.
_STEP = 1e-5
# How strongly a parameter is pulled back to where the fit started, per squared share of its
# range: enough to keep a parameter the data says little about where it was.
PULL = 0.05
# A first rating needs this many second reviews before its stability is fitted, and the fitted
# value is averaged (in log) with the starting one as if the start were this many reviews.
MIN_PRETRAIN = 30
PRETRAIN_PRIOR = 30

# The range each parameter is kept in. Close to the reference optimiser's clipping (fsrs-rs);
# the exact published values were not re-checked, so these are this module's own.
BOUNDS: tuple[tuple[float, float], ...] = (
    (0.001, 100.0),
    (0.001, 100.0),
    (0.001, 100.0),
    (0.001, 100.0),
    (1.0, 10.0),
    (0.001, 4.0),
    (0.001, 4.0),
    (0.001, 0.75),
    (0.0, 4.5),
    (0.0, 0.8),
    (0.001, 3.5),
    (0.001, 5.0),
    (0.001, 0.25),
    (0.001, 0.9),
    (0.0, 4.0),
    (0.0, 1.0),
    (1.0, 6.0),
    (0.0, 2.0),
    (0.0, 2.0),
    (0.0, 0.8),
    (0.1, 0.8),
)
# A predicted chance is kept this far from 0 and 1, so one surprise cannot dominate the loss.
_SURE = 1e-6


@dataclass(frozen=True)
class Step:
    # Whole days since the card's review before; 0 for its first and for a same-day repeat.
    days: int
    rating: Rating


# One card's reviews, oldest first.
History = tuple[Step, ...]


@dataclass(frozen=True)
class FitOutcome:
    # The learner's own parameters, or None when they keep the defaults.
    weights: Weights | None
    # Every review the fit read.
    reviews: int
    # The mean log loss on the held-back cards, with the defaults and with the fitted
    # parameters (None when there was nothing to judge).
    default_loss: float | None
    fitted_loss: float | None


def histories_from_log(log: Sequence[Sequence[tuple[dt.datetime, Rating]]]) -> list[History]:
    """Each card's reviews as the scheduler saw them: the whole days between two reviews are
    counted as `cards.py` counts them when a review is made."""
    out: list[History] = []
    for reviews in log:
        steps: list[Step] = []
        before: dt.datetime | None = None
        for at, rating in reviews:
            steps.append(Step((at - before).days if before else 0, rating))
            before = at
        if steps:
            out.append(tuple(steps))
    return out


def _clip(weights: Sequence[float]) -> Weights:
    return tuple(min(max(w, lo), hi) for w, (lo, hi) in zip(weights, BOUNDS, strict=True))


def _bce(recall: float, remembered: bool) -> float:
    p = min(max(recall, _SURE), 1 - _SURE)
    return -math.log(p if remembered else 1 - p)


def log_loss(weights: Weights, histories: Sequence[History]) -> tuple[float, int]:
    """The summed log loss of the scheduler's predictions, and how many there were: one for
    every review a day or more after the one before (a same-day repeat predicts nothing)."""
    total, count = 0.0, 0
    for history in histories:
        memory: Memory | None = None
        for step in history:
            if memory is not None and step.days >= 1:
                total += _bce(retrievability(memory, step.days, weights), step.rating != "again")
                count += 1
            memory = review(memory, step.days, step.rating, weights)
    return total, count


def mean_loss(weights: Weights, histories: Sequence[History]) -> float | None:
    total, count = log_loss(weights, histories)
    return total / count if count else None


def _golden_minimum(f: Callable[[float], float], lo: float, hi: float, steps: int = 40) -> float:
    """Where a function with one minimum between `lo` and `hi` is lowest."""
    ratio = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    c, d = b - ratio * (b - a), a + ratio * (b - a)
    fc, fd = f(c), f(d)
    for _ in range(steps):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - ratio * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + ratio * (b - a)
            fd = f(d)
    return (a + b) / 2


def pretrain(histories: Sequence[History], start: Weights) -> Weights:
    """A new card's stability for each first rating, from how often its second review a day or
    more later was remembered. A rating with too few such cards keeps its start; the four are
    kept in order (a card first rated better is never less stable)."""
    w = list(start)
    probe = Memory(stability=1.0, difficulty=5.0)
    for grade, rating in enumerate(("again", "hard", "good", "easy")):
        seen = [
            (h[1].days, h[1].rating != "again")
            for h in histories
            if len(h) > 1 and h[0].rating == rating and h[1].days >= 1
        ]
        if len(seen) < MIN_PRETRAIN:
            continue

        def loss(log_stability: float, seen: list[tuple[int, bool]] = seen) -> float:
            memory = Memory(stability=math.exp(log_stability), difficulty=probe.difficulty)
            return sum(_bce(retrievability(memory, days, start), ok) for days, ok in seen)

        lo, hi = BOUNDS[grade]
        fitted = _golden_minimum(loss, math.log(max(lo, 0.01)), math.log(hi))
        prior = math.log(start[grade])
        blended = (len(seen) * fitted + PRETRAIN_PRIOR * prior) / (len(seen) + PRETRAIN_PRIOR)
        w[grade] = math.exp(blended)
    for grade in range(1, 4):
        w[grade] = max(w[grade], w[grade - 1])
    return _clip(w)


def _objective(weights: Weights, start: Weights, histories: Sequence[History], count: int) -> float:
    total, _ = log_loss(weights, histories)
    pull = sum(
        ((w - s) / (hi - lo)) ** 2 for w, s, (lo, hi) in zip(weights, start, BOUNDS, strict=True)
    )
    return total / count + PULL * pull


def descend(histories: Sequence[History], start: Weights, iterations: int = ITERATIONS) -> Weights:
    """The parameters after the first four, moved by Adam to lower the mean log loss on
    `histories`."""
    _, count = log_loss(start, histories)
    if not count:
        return start
    w = list(start)
    m = [0.0] * WEIGHT_COUNT
    v = [0.0] * WEIGHT_COUNT
    for t in range(1, iterations + 1):
        here = _clip(w)
        base = _objective(here, start, histories, count)
        grad = [0.0] * WEIGHT_COUNT
        for i in _DESCENDED:
            lo, hi = BOUNDS[i]
            h = _STEP * (hi - lo)
            # Step inward at an upper bound, so the probe stays inside the range.
            sign = -1.0 if here[i] + h > hi else 1.0
            probe = list(here)
            probe[i] = here[i] + sign * h
            grad[i] = sign * (_objective(tuple(probe), start, histories, count) - base) / h
        progress = (t - 1) / max(iterations - 1, 1)
        rate = (
            FINAL_LEARNING_RATE
            + (LEARNING_RATE - FINAL_LEARNING_RATE) * (1 + math.cos(math.pi * progress)) / 2
        )
        for i in _DESCENDED:
            g = grad[i]
            m[i] = _BETA1 * m[i] + (1 - _BETA1) * g
            v[i] = _BETA2 * v[i] + (1 - _BETA2) * g * g
            m_hat = m[i] / (1 - _BETA1**t)
            v_hat = v[i] / (1 - _BETA2**t)
            w[i] -= rate * m_hat / (math.sqrt(v_hat) + _EPSILON)
        w = list(_clip(w))
    return _clip(w)


def review_count(histories: Sequence[History]) -> int:
    return sum(len(h) for h in histories)


def fit_learner(
    histories: Sequence[History],
    *,
    iterations: int = ITERATIONS,
    min_reviews: int = MIN_REVIEWS,
    min_held_out: int = MIN_HELD_OUT,
) -> FitOutcome:
    """The learner's own parameters when their log is long enough and the fit predicts the
    held-back cards better than the defaults; otherwise an outcome that keeps the defaults."""
    cards = list(histories)[:MAX_CARDS]
    reviews = review_count(cards)
    if reviews < min_reviews:
        return FitOutcome(None, reviews, None, None)
    train = [h for i, h in enumerate(cards) if i % HOLD_OUT_EVERY != HOLD_OUT_EVERY - 1]
    held = [h for i, h in enumerate(cards) if i % HOLD_OUT_EVERY == HOLD_OUT_EVERY - 1]
    held_total, held_count = log_loss(DEFAULT_WEIGHTS, held)
    if held_count < min_held_out:
        return FitOutcome(None, reviews, None, None)
    default_loss = held_total / held_count
    fitted = descend(train, pretrain(train, DEFAULT_WEIGHTS), iterations)
    fitted_loss = log_loss(fitted, held)[0] / held_count
    if fitted_loss < default_loss * (1 - MIN_GAIN):
        return FitOutcome(fitted, reviews, default_loss, fitted_loss)
    return FitOutcome(None, reviews, default_loss, fitted_loss)
