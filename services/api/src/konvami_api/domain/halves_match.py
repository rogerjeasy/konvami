"""Who Two Halves pairs with whom (7.3, phase 2; design note 2026-11-20-two-halves-phase2-design).

Pure rules, no storage. Two learners who are looking for a partner are paired when:

- both are adults (the minor band is not opened: it needs an audio classifier and a second
  moderator, concept §3.9), and neither blocked the other;
- they are a **mirror**: each learns the language the other grew up with, so each speaks the hard
  language and hears the easy one; or, ranked lower and labelled, they learn the **same**
  language (same-language mode, with the Bridge to help the listener).

The one who has waited longest is paired first, with the best partner for them: a mirror before
the same language, and among equals the one who has waited longest too.
"""

import datetime as dt
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from konvami_api.domain.halves_cases import LANGUAGES

type Fit = Literal["mirror", "same"]


@dataclass(frozen=True)
class Seeker:
    user_id: UUID
    band: Literal["adult", "minor"]
    # The language they grew up with ("other" when it is not one of the four).
    native: str
    # The language they learn.
    target: str
    since: dt.datetime


def fit(one: Seeker, other: Seeker) -> Fit | None:
    """How well two seekers fit, or None when they cannot be paired."""
    if one.user_id == other.user_id or one.band != "adult" or other.band != "adult":
        return None
    if one.target not in LANGUAGES or other.target not in LANGUAGES:
        return None
    if one.target != other.target and one.native == other.target and other.native == one.target:
        return "mirror"
    if one.target == other.target:
        return "same"
    return None


_RANK: dict[Fit, int] = {"mirror": 0, "same": 1}


def pairs(
    seekers: Sequence[Seeker], blocked: Callable[[UUID, UUID], bool]
) -> list[tuple[Seeker, Seeker, Fit]]:
    """The pairs to make now, the longest waiting first. Each seeker is in at most one pair."""
    waiting = sorted(seekers, key=lambda s: (s.since, str(s.user_id)))
    taken: set[UUID] = set()
    made: list[tuple[Seeker, Seeker, Fit]] = []
    for seeker in waiting:
        if seeker.user_id in taken:
            continue
        best: tuple[int, dt.datetime, Seeker, Fit] | None = None
        for other in waiting:
            if other.user_id in taken or other.user_id == seeker.user_id:
                continue
            found = fit(seeker, other)
            if found is None or blocked(seeker.user_id, other.user_id):
                continue
            key = (_RANK[found], other.since)
            if best is None or key < (best[0], best[1]):
                best = (key[0], key[1], other, found)
        if best is not None:
            taken.update({seeker.user_id, best[2].user_id})
            made.append((seeker, best[2], best[3]))
    return made
