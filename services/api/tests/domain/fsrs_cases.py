"""The review histories the server's scheduler and the app's offline scheduler are both checked
against, so the two cannot drift apart: with the published parameters
(`tests/fixtures/fsrs_cases.json`), and with a learner's own fitted parameters and another
retention (`tests/fixtures/fsrs_fitted_cases.json`).

The server is the reference: after a change to `fsrs.py`, write the files again with
`poetry run python -m tests.domain.fsrs_cases` (then `npx prettier --write` them) and the app's test
(`apps/mobile/src/offline/scheduler.test.ts`) shows whether the app still agrees.
"""

import json
import random
from pathlib import Path
from typing import TypedDict

from konvami_api.domain.fsrs import (
    DEFAULT_WEIGHTS,
    RATINGS,
    RETENTION,
    Memory,
    Weights,
    interval_days,
    review,
)

FIXTURE = Path(__file__).parent.parent / "fixtures" / "fsrs_cases.json"
FITTED_FIXTURE = Path(__file__).parent.parent / "fixtures" / "fsrs_fitted_cases.json"
# A fixed seed: the same histories every time the file is written.
_SEED = 20261120
_HISTORIES = 40
_STEPS = 10
# The gaps between reviews the histories draw from: the same day, soon, and long after.
_GAPS = (0, 0, 1, 1, 2, 3, 5, 8, 13, 30, 90, 365, 2000)
# Parameters as a fit could leave them: every one moved, the forgetting curve's decay too, so
# the app's test covers each place a parameter is read. Asked with a lower retention.
FITTED: Weights = (
    *(round(w * (0.8 if i % 2 else 1.15), 4) for i, w in enumerate(DEFAULT_WEIGHTS[:20])),
    0.3,
)
FITTED_RETENTION = 0.85


class Step(TypedDict):
    days: int
    rating: str
    stability: float
    difficulty: float
    interval: int


class FittedCases(TypedDict):
    weights: list[float]
    retention: float
    histories: list[list[Step]]


def replay(
    steps: list[tuple[int, str]],
    weights: Weights = DEFAULT_WEIGHTS,
    retention: float = RETENTION,
) -> list[Step]:
    """What the scheduler gives for each review of a history: (days since, rating) pairs."""
    memory: Memory | None = None
    out: list[Step] = []
    for days, rating in steps:
        memory = review(memory, days, rating, weights)  # type: ignore[arg-type]
        out.append(
            Step(
                days=days,
                rating=rating,
                stability=memory.stability,
                difficulty=memory.difficulty,
                interval=interval_days(memory, weights, retention),
            )
        )
    return out


def histories() -> list[list[tuple[int, str]]]:
    pick = random.Random(_SEED)  # noqa: S311 (not for security: a repeatable test set)
    made: list[list[tuple[int, str]]] = []
    for _ in range(_HISTORIES):
        steps = [(0, pick.choice(RATINGS))]
        steps += [(pick.choice(_GAPS), pick.choice(RATINGS)) for _ in range(_STEPS - 1)]
        made.append([(days, str(rating)) for days, rating in steps])
    return made


def cases() -> list[list[Step]]:
    return [replay(history) for history in histories()]


def fitted_cases() -> FittedCases:
    return FittedCases(
        weights=list(FITTED),
        retention=FITTED_RETENTION,
        histories=[replay(h, FITTED, FITTED_RETENTION) for h in histories()],
    )


def main() -> None:
    FIXTURE.write_text(json.dumps(cases(), indent=2) + "\n")
    FITTED_FIXTURE.write_text(json.dumps(fitted_cases(), indent=2) + "\n")


if __name__ == "__main__":
    main()
