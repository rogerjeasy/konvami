"""The grammar map (spec §6.8, §13.2): the topics of a language from A1 up, and how well a learner
has each one, judged from the evidence of their conversations rather than from quizzes.

A topic is configuration, like the rest of a language pack (`grammar_topics.py`). Evidence
comes from the Session Reports: for every topic the learner used in a conversation, how often
they used it and how many of those uses were wrong (`reports.py`, `TopicUse`). The state of a
topic follows from the last conversations that used it, the newest weighing most:

    not started → introduced → practising → mostly correct → mastered
"""

import datetime as dt
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from konvami_api.domain.grammar_topics import GrammarTopic
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import DEFAULT_LEVEL, ReportEntry, ReportService

# --- How well a learner has a topic ------------------------------------------------------------


@dataclass(frozen=True)
class Evidence:
    """What one conversation showed of a topic."""

    at: dt.datetime
    uses: int
    # How many of the uses were wrong.
    wrong: int


class Mastery(StrEnum):
    NOT_STARTED = "not_started"
    INTRODUCED = "introduced"
    PRACTISING = "practising"
    MOSTLY_CORRECT = "mostly_correct"
    MASTERED = "mastered"


class Trend(StrEnum):
    IMPROVING = "improving"
    STEADY = "steady"
    SLIPPING = "slipping"


@dataclass(frozen=True)
class TopicMastery:
    state: Mastery
    # Over the conversations that count.
    uses: int
    correct: int
    conversations: int
    # The share of right uses, the recent ones weighing most; 0 without uses.
    accuracy: float
    # None while there is too little to compare.
    trend: Trend | None
    last_used_at: dt.datetime | None


# The conversations that count: older ones show what the learner may since have learnt.
RECENT_CONVERSATIONS = 8
# How much each older conversation counts, relative to the one after it.
RECENCY_DECAY = 0.85
# Fewer uses than this are too few to judge.
MIN_USES = 4
PRACTISING_BELOW = 0.7
MASTERED_FROM = 0.9
MASTERED_USES = 10
MASTERED_CONVERSATIONS = 3
# A trend compares the newest conversations with the ones before; it needs this many in all,
# and a change of at least `TREND_STEP` in the share of right uses.
TREND_NEWEST = 2
TREND_CONVERSATIONS = 4
TREND_STEP = 0.15


def _accuracy(evidence: Sequence[Evidence], weigh: bool = True) -> float:
    total = right = 0.0
    for age, found in enumerate(evidence):
        weight = RECENCY_DECAY**age if weigh else 1.0
        total += weight * found.uses
        right += weight * max(0, found.uses - found.wrong)
    return right / total if total else 0.0


def mastery(evidence: Sequence[Evidence]) -> TopicMastery:
    """How well a topic is mastered, from what the conversations that used it showed."""
    counted = sorted((e for e in evidence if e.uses > 0), key=lambda e: e.at, reverse=True)
    counted = counted[:RECENT_CONVERSATIONS]
    uses = sum(e.uses for e in counted)
    correct = sum(max(0, e.uses - e.wrong) for e in counted)
    accuracy = _accuracy(counted)
    if not counted:
        state = Mastery.NOT_STARTED
    elif uses < MIN_USES:
        state = Mastery.INTRODUCED
    elif accuracy < PRACTISING_BELOW:
        state = Mastery.PRACTISING
    elif (
        accuracy >= MASTERED_FROM
        and uses >= MASTERED_USES
        and len(counted) >= MASTERED_CONVERSATIONS
    ):
        state = Mastery.MASTERED
    else:
        state = Mastery.MOSTLY_CORRECT
    trend = None
    if len(counted) >= TREND_CONVERSATIONS:
        change = _accuracy(counted[:TREND_NEWEST], weigh=False) - _accuracy(
            counted[TREND_NEWEST:], weigh=False
        )
        trend = (
            Trend.IMPROVING
            if change >= TREND_STEP
            else Trend.SLIPPING
            if change <= -TREND_STEP
            else Trend.STEADY
        )
    return TopicMastery(
        state=state,
        uses=uses,
        correct=correct,
        conversations=len(counted),
        accuracy=round(accuracy, 4),
        trend=trend,
        last_used_at=counted[0].at if counted else None,
    )


# --- A learner's map ---------------------------------------------------------------------------

# The conversations read for the map: more than `RECENT_CONVERSATIONS` per topic, as not every
# conversation uses every topic.
HISTORY = 60
# The learner's own mistakes a topic page shows.
MAX_TOPIC_MISTAKES = 10


@dataclass(frozen=True)
class TopicState:
    topic: GrammarTopic
    mastery: TopicMastery


@dataclass(frozen=True)
class GrammarMap:
    # The language learned, and the learner's level in it.
    language: str
    level: str
    topics: tuple[TopicState, ...]


@dataclass(frozen=True)
class TopicMistake:
    """One of the learner's mistakes on a topic, from a conversation's report."""

    call_id: str
    at: dt.datetime
    original: str
    corrected: str
    explanation: str
    # False when the report's second check could not confirm it.
    certain: bool


@dataclass(frozen=True)
class TopicPage:
    state: TopicState
    mistakes: tuple[TopicMistake, ...]
    # Typical learner sentences that break the rule, from the grammar notes.
    typical_mistakes: tuple[str, ...]


class GrammarMapError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class GrammarMapService:
    def __init__(self, *, profiles: ProfileService, reports: ReportService) -> None:
        self._profiles = profiles
        self._reports = reports

    def _topics(self, user_id: UUID) -> tuple[str, tuple[GrammarTopic, ...]]:
        language = self._profiles.get(user_id).target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        return language, pack.grammar_map if pack else ()

    def map(self, user_id: UUID) -> GrammarMap:
        """Every topic of the language learned, with how well the learner has it."""
        language, topics = self._topics(user_id)
        history = self._reports.history(user_id, HISTORY)
        return GrammarMap(
            language=language,
            level=self._profiles.get(user_id).level(language) or DEFAULT_LEVEL,
            topics=tuple(TopicState(topic, _mastered(topic, history)) for topic in topics),
        )

    def topic(self, user_id: UUID, topic_id: str) -> TopicPage:
        """One topic, with the learner's own mistakes on it. Raises `GrammarMapError`."""
        language, topics = self._topics(user_id)
        topic = next((t for t in topics if t.id == topic_id), None)
        if topic is None:
            raise GrammarMapError("not_found")
        history = self._reports.history(user_id, HISTORY)
        mistakes = [
            TopicMistake(
                entry.call_id,
                entry.started_at,
                m.original,
                m.corrected,
                m.explanation,
                m.certain,
            )
            for entry in history
            for m in entry.report.mistakes
            if m.category in topic.categories
        ]
        pack = self._profiles.catalog.available_pack(language)
        notes = [pack.note(category) for category in topic.categories] if pack else []
        return TopicPage(
            state=TopicState(topic, _mastered(topic, history)),
            mistakes=tuple(mistakes[:MAX_TOPIC_MISTAKES]),
            typical_mistakes=tuple(wrong for note in notes if note for wrong in note.wrong),
        )


def _mastered(topic: GrammarTopic, history: Sequence[ReportEntry]) -> TopicMastery:
    return mastery(
        tuple(
            Evidence(entry.started_at, use.uses, use.wrong)
            for entry in history
            for use in entry.report.usage
            if use.topic == topic.id
        )
    )
