"""The review histories the server's scheduler and the app's offline scheduler are both checked
against (`tests/fixtures/fsrs_cases.json`), so the two cannot drift apart.

The server is the reference: after a change to `fsrs.py`, write the file again with
`poetry run python -m tests.domain.fsrs_cases` and the app's test
(`apps/mobile/src/offline/scheduler.test.ts`) shows whether the app still agrees.
"""

import json
import random
from pathlib import Path
from typing import TypedDict

from konvami_api.domain.fsrs import RATINGS, Memory, interval_days, review

FIXTURE = Path(__file__).parent.parent / "fixtures" / "fsrs_cases.json"
# A fixed seed: the same histories every time the file is written.
_SEED = 20261120
_HISTORIES = 40
_STEPS = 10
# The gaps between reviews the histories draw from: the same day, soon, and long after.
_GAPS = (0, 0, 1, 1, 2, 3, 5, 8, 13, 30, 90, 365, 2000)


class Step(TypedDict):
    days: int
    rating: str
    stability: float
    difficulty: float
    interval: int


def replay(steps: list[tuple[int, str]]) -> list[Step]:
    """What the scheduler gives for each review of a history: (days since, rating) pairs."""
    memory: Memory | None = None
    out: list[Step] = []
    for days, rating in steps:
        memory = review(memory, days, rating)  # type: ignore[arg-type]
        out.append(
            Step(
                days=days,
                rating=rating,
                stability=memory.stability,
                difficulty=memory.difficulty,
                interval=interval_days(memory),
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


def main() -> None:
    FIXTURE.write_text(json.dumps(cases(), indent=1) + "\n")


if __name__ == "__main__":
    main()
