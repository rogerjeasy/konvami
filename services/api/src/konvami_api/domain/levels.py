"""The adaptive level engine, basic version (spec §6.9, P0): the level practice runs at follows
how the learner really does.

Each session report also says how the learner's grammar, vocabulary and speaking compared with
the level the conversation was held at (`LevelFit`). After each report, the conversations held
since the level last changed are read, newest first. When five of them count, and at least four
point the same way with none pointing the other, the level moves one step (decided 2026-10-23).
It never jumps, and the count starts again after every change, the learner's own included: what
the learner sets in their profile always wins, until the evidence has built up again.

The new level is the profile's `starting_level` (spec §6.1.2: "Measured"), so the partner speaks
at it from the next call. The step is kept with the conversation that settled it, so that its
report can announce it (spec §6.9: "It never jumps silently").
"""

import datetime as dt
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from konvami_api.domain.catalog import STARTING_LEVELS
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.voice import CallPurpose, VoiceSessionRepository

# How a skill compared with the conversation's level. `unclear`: the conversation showed too
# little of it.
Fit = Literal["below", "at", "above", "unclear"]
FITS: tuple[Fit, ...] = ("below", "at", "above", "unclear")

# How many counted conversations the level waits for, and how many of them must agree.
EVIDENCE = 5
AGREEING = 4

LEVEL_FIELD = "starting_level"

# Which way one conversation points: up, down, or neither.
Leaning = Literal[-1, 0, 1]


@dataclass(frozen=True)
class LevelFit:
    """How the learner did in one conversation, per skill, against its level. Pronunciation and
    listening are left out: a transcript cannot show them."""

    grammar: Fit
    vocabulary: Fit
    speaking: Fit


@dataclass(frozen=True)
class LevelStep:
    """A change of level the engine made after a conversation."""

    call_id: str
    language: str
    before: str
    after: str
    at: dt.datetime

    @property
    def rose(self) -> bool:
        return STARTING_LEVELS.index(self.after) > STARTING_LEVELS.index(self.before)


@dataclass(frozen=True)
class LevelPoint:
    """The level from `at` on, and who set it: the learner (asked) or the app (measured)."""

    at: dt.datetime
    level: str
    source: Source


def leaning(fit: LevelFit) -> Leaning | None:
    """Up when at least two skills were above the level and none below; down the other way
    round; None when two skills or more were unclear, so the conversation does not count."""
    marks = (fit.grammar, fit.vocabulary, fit.speaking)
    if marks.count("unclear") >= 2:
        return None
    above, below = marks.count("above"), marks.count("below")
    if above >= 2 and below == 0:
        return 1
    if below >= 2 and above == 0:
        return -1
    return 0


def next_level(level: str, leanings: Sequence[Leaning]) -> str | None:
    """The level to move to, from the counted conversations since it was set, the newest first;
    None to stay."""
    recent = list(leanings[:EVIDENCE])
    if len(recent) < EVIDENCE:
        return None
    index = STARTING_LEVELS.index(level)
    if recent.count(1) >= AGREEING and -1 not in recent and index + 1 < len(STARTING_LEVELS):
        return STARTING_LEVELS[index + 1]
    if recent.count(-1) >= AGREEING and 1 not in recent and index > 0:
        return STARTING_LEVELS[index - 1]
    return None


class LevelEvidence(Protocol):
    def level_fits(self, user_id: UUID, language: str, since: dt.datetime) -> list[LevelFit]:
        """What the ready reports in `language` found, for the conversations that started at
        `since` or later, the newest first. Reports without a fit are left out."""
        ...


class LevelRepository(Protocol):
    def stepped(self, user_id: UUID, step: LevelStep) -> None: ...

    def step(self, user_id: UUID, call_id: str) -> LevelStep | None:
        """The step the conversation settled, if it is the learner's and settled one."""
        ...


class LevelService:
    def __init__(
        self,
        profiles: ProfileService,
        sessions: VoiceSessionRepository,
        evidence: LevelEvidence,
        repository: LevelRepository,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._sessions = sessions
        self._evidence = evidence
        self._repository = repository
        self._clock = clock

    def after_report(self, call_id: str) -> None:
        """A practice conversation's report is written: moves the level if the evidence says
        so. Runs in the call worker, after the report."""
        session = self._sessions.get(call_id)
        if session is None or session.purpose is not CallPurpose.PRACTICE:
            return
        user_id = session.user_id
        profile = self._profiles.get(user_id)
        language = profile.target_language
        stored = profile.fields.get((language, LEVEL_FIELD)) if language else None
        if language is None or stored is None:
            return
        fits = self._evidence.level_fits(user_id, language, since=stored.updated_at)
        leanings = [found for fit in fits if (found := leaning(fit)) is not None]
        after = next_level(stored.value, leanings)
        if after is None:
            return
        self._profiles.apply(
            user_id,
            [Change(LEVEL_FIELD, after, scope=language)],
            source=Source.MEASURED,
            origin=Origin.SYSTEM,
        )
        self._repository.stepped(
            user_id, LevelStep(call_id, language, stored.value, after, self._clock())
        )

    def step(self, user_id: UUID, call_id: str) -> LevelStep | None:
        return self._repository.step(user_id, call_id)

    def history(self, user_id: UUID, language: str) -> tuple[LevelPoint, ...]:
        """The level over time in a language, the oldest first: each change, by anyone."""
        return tuple(
            LevelPoint(change.changed_at, change.new_value, change.source)
            for change in self._profiles.history(user_id, language, LEVEL_FIELD)
        )
