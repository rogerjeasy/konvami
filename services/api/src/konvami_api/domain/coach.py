"""The Coach (spec §6.12, §8.2): one place that reads everything Konvami knows about how the
learner is doing and turns it into a few suggestions for what to do next, each with the reason
and the evidence behind it.

It sits on top of what already analyses the learner: the reports and their confirmed mistakes,
the grammar map, the cards and their schedule, the pronunciation lab, the level engine, the exam
centre, the Learning Director's week, the partners and the imports. Nothing here measures
anything new.

Two halves, as everywhere in Konvami where a model writes for the learner:

- **Signals, by code** (`find_signals`): plain rules over numbers, the same every time, free and
  testable. Each signal has its evidence (counts, dates, the learner's own sentence), an action
  the app can start with one tap, and how long it takes. `rank` orders them, with what the
  learner said about earlier suggestions (`FeedbackMemory`).
- **Words, by the small text model** (`CoachService.phrase`): at most a few times a day, once
  for a new day and again after a new report, in the background. It is given the computed facts
  only, picks and orders at most three of the candidates and phrases them in the explanation
  language. An answer that names a number the facts do not hold is thrown away. Without a model,
  past the month's spend target, without the learner's consent or when it fails, the app words
  the same suggestions from its own templates.

What the Coach finds for a day is stored, so the suggestions stay put while the learner comes and
goes, and so it can be checked afterwards whether a suggestion was taken up and whether what it
was about got better (`settle`).
"""

import datetime as dt
import json
import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_list, answer_object

# --- What the Coach looks for ---------------------------------------------------------------------


class Kind(StrEnum):
    # Something to work on, each with an action.
    RECURRING_MISTAKE = "recurring_mistake"
    SAY_IT_BETTER = "say_it_better"
    WEAK_TOPIC = "weak_topic"
    CARDS_OVERDUE = "cards_overdue"
    CARDS_LAPSING = "cards_lapsing"
    REVIEW_DUE = "review_due"
    PROBLEM_SOUND = "problem_sound"
    EXAM_NEAR = "exam_near"
    LEVEL_CLOSE = "level_close"
    LONG_GAP = "long_gap"
    STREAK_AT_RISK = "streak_at_risk"
    PARTNER_UNVISITED = "partner_unvisited"
    IMPORT_WAITING = "import_waiting"
    # What is holding the learner back but has no action of its own.
    PLAN_MISSED = "plan_missed"
    # Good news: what went well, to say so.
    TOPIC_IMPROVED = "topic_improved"
    FEWER_MISTAKES = "fewer_mistakes"
    PACE_UP = "pace_up"
    LEVEL_UP = "level_up"
    STREAK_BEST = "streak_best"
    CARDS_REMEMBERED = "cards_remembered"


ActionType = Literal[
    "lesson",
    "say_it_better",
    "review_cards",
    "review_conversation",
    "sound_drill",
    "exam",
    "free_talk",
    "call_partner",
    "import_call",
]

Trend = Literal["better", "same", "worse"]
Response = Literal["accepted", "snoozed", "dismissed"]
Reason = Literal["not_interested", "already_know", "too_long", "not_useful"]
SuggestionStatus = Literal["open", "accepted", "snoozed", "dismissed"]
Outcome = Literal["resolved", "persists"]
# How the day's suggestions are worded: by the app's templates, being worded by the model, or
# worded by it.
Wording = Literal["template", "pending", "model"]


@dataclass(frozen=True)
class Action:
    """What one tap starts. The fields an action does not use are None."""

    type: ActionType
    topic: str | None = None
    sound: str | None = None
    exam: str | None = None
    partner: UUID | None = None
    call_id: str | None = None
    import_id: UUID | None = None
    # Cards to review.
    count: int | None = None

    def document(self) -> dict[str, Any]:
        found: dict[str, Any] = {"type": self.type}
        for name in ("topic", "sound", "exam", "call_id", "count"):
            value = getattr(self, name)
            if value is not None:
                found[name] = value
        if self.partner is not None:
            found["partner"] = str(self.partner)
        if self.import_id is not None:
            found["import_id"] = str(self.import_id)
        return found

    @classmethod
    def from_document(cls, document: Mapping[str, Any]) -> "Action":
        return cls(
            type=document["type"],
            topic=document.get("topic"),
            sound=document.get("sound"),
            exam=document.get("exam"),
            partner=UUID(document["partner"]) if document.get("partner") else None,
            call_id=document.get("call_id"),
            import_id=UUID(document["import_id"]) if document.get("import_id") else None,
            count=document.get("count"),
        )


@dataclass(frozen=True)
class Signal:
    """One thing the Coach found, with the facts that show it."""

    kind: Kind
    # What it is about, so that the same thing is recognised another day: a kind of mistake, a
    # topic, a sound, a partner; "" for a signal that is about the learner as a whole.
    key: str
    # How much it matters, 0 to 100, before the learner's own preferences are counted.
    score: int
    # Numbers, dates and the learner's own sentences; JSON values only.
    evidence: Mapping[str, Any]
    # None for a signal that only describes (what holds the learner back, what went well).
    action: Action | None = None
    minutes: int = 0
    # Comes before the week's plan on Today (`URGENT_FROM`).
    urgent: bool = False
    positive: bool = False
    trend: Trend | None = None


# --- The facts the signals are found in -----------------------------------------------------------


@dataclass(frozen=True)
class MistakeFact:
    """A confirmed mistake of one recent conversation."""

    category: str
    # The grammar topic of its kind; None for one about single words.
    topic: str | None
    severity: str
    original: str
    corrected: str


@dataclass(frozen=True)
class ReportFact:
    call_id: str
    mistakes: tuple[MistakeFact, ...]
    # Confirmed corrections of this report the learner said again ("Say it better").
    retried: int = 0


@dataclass(frozen=True)
class TopicFact:
    id: str
    # `grammar_map.Mastery` values.
    state: str
    accuracy: float
    uses: int
    # `grammar_map.Trend` values; None while there is too little to compare.
    trend: str | None
    last_used_days: int | None
    # The state a week ago.
    state_week_ago: str


@dataclass(frozen=True)
class SoundFact:
    id: str
    title: str
    tries: int
    right: int
    score: float | None
    problem_words: tuple[str, ...] = ()


@dataclass(frozen=True)
class PartnerFact:
    id: UUID
    name: str
    conversations: int
    days_since: int | None


@dataclass(frozen=True)
class ExamFact:
    test: str
    name: str
    days_left: int | None
    simulations_7_days: int
    simulations_14_days: int
    last_days: int | None


@dataclass(frozen=True)
class ImportFact:
    id: UUID
    title: str
    days_since: int


@dataclass(frozen=True)
class CoachInputs:
    today: dt.date
    # The hour on the learner's clock, 0 to 23.
    hour: int
    conversations: int
    # Newest first.
    reports: tuple[ReportFact, ...] = ()
    # Confirmed mistakes per kind this week and the week before.
    mistakes_this_week: Mapping[str, int] = field(default_factory=dict)
    mistakes_last_week: Mapping[str, int] = field(default_factory=dict)
    topics: tuple[TopicFact, ...] = ()
    cards_due: int = 0
    oldest_due_days: int = 0
    # Words of the cards due now that were forgotten at least `LAPSES` times.
    lapsing: tuple[str, ...] = ()
    words_due: int = 0
    reviews_7_days: int = 0
    remembered_7_days: int = 0
    sounds: tuple[SoundFact, ...] = ()
    # Words per minute of the learner's recorded turns: the latest conversations and the ones
    # before; None without enough recordings.
    pace_before: float | None = None
    pace_after: float | None = None
    streak: int = 0
    best_streak: int = 0
    # Whether the learner's weekly habit plans today: a free day never puts the streak at risk.
    planned_today: bool = True
    practised_today: bool = False
    # Days since the last practice; None before any.
    days_since_practice: int | None = None
    level: str | None = None
    # Since the level was last set: conversations whose evidence pointed up, down, and counted.
    level_up: int = 0
    level_down: int = 0
    level_counted: int = 0
    # The level the engine moved up to in the last `LEVEL_NEWS_DAYS`.
    level_raised_to: str | None = None
    exam: ExamFact | None = None
    partners: tuple[PartnerFact, ...] = ()
    # Who an action talks to unless it names someone: the partner talked to last.
    partner: UUID | None = None
    imports: tuple[ImportFact, ...] = ()
    plan_missed: int = 0


# --- Thresholds (each one decided in docs/superpowers/specs/2026-11-20-coach-design.md) ----------

# A kind of mistake is recurring when it was confirmed in this many of the last conversations.
RECURRING_IN = 3
RECENT_REPORTS = 5
# A topic is weak below this share of right uses, once it was used this often.
WEAK_ACCURACY = 0.6
WEAK_USES = 4
# Cards: this many due, or due this many days, is a pile worth a word.
OVERDUE_CARDS = 15
OVERDUE_DAYS = 3
LAPSES = 2
LAPSING_CARDS = 3
# A review conversation needs words to be about (the Director's `MIN_REVIEW_WORDS` is 3; a
# suggestion of its own waits for a few more).
REVIEW_WORDS = 6
# A sound is a problem below this share of right drills, after this many, or below this score.
SOUND_RIGHT_SHARE = 0.6
SOUND_TRIES = 3
SOUND_SCORE = 70.0
# An exam is near within eight weeks (when the plan starts weekly simulations), close within two.
EXAM_NEAR_DAYS = 56
EXAM_CLOSE_DAYS = 14
# A gap is long after this many days without practice.
LONG_GAP_DAYS = 5
# A run of days is worth keeping from this long, and only late enough in the day to matter.
STREAK_DAYS = 3
STREAK_HOUR = 17
# A partner is waiting after this many days, once the learner talked to another one.
PARTNER_DAYS = 21
# An import is fresh for this long, and settled after a day.
IMPORT_DAYS = 14
# The level engine moves after five conversations, four of them pointing up (`levels.py`).
LEVEL_EVIDENCE = 5
LEVEL_AGREEING = 4
LEVEL_NEWS_DAYS = 7
# Pace is a change worth telling from this share up.
PACE_STEP = 0.1
# Cards remembered: worth saying from this share, over this many reviews.
REMEMBERED_SHARE = 0.85
REMEMBERED_REVIEWS = 20
# What a suggestion must score to come before the week's plan on Today.
URGENT_FROM = 85

# How long an action takes, in minutes.
LESSON_MINUTES = 10
CALL_MINUTES = 10
SHORT_CALL_MINUTES = 5
DRILL_MINUTES = 5
SAY_IT_BETTER_MINUTES = 3
SECONDS_PER_CARD = 15
MAX_REVIEW_CARDS = 20

_STATES = ("not_started", "introduced", "practising", "mostly_correct", "mastered")
_LEVELS = ("A0", "A1", "A2", "B1", "B2", "C1", "C2")


def _minutes_for(cards: int) -> int:
    return max(2, -(-cards * SECONDS_PER_CARD // 60))


def _trend(this_week: int, last_week: int) -> Trend:
    if this_week < last_week:
        return "better"
    if this_week > last_week:
        return "worse"
    return "same"


def _recurring(inputs: CoachInputs) -> list[Signal]:
    reports = inputs.reports[:RECENT_REPORTS]
    seen: dict[str, list[tuple[ReportFact, MistakeFact]]] = {}
    for report in reports:
        kinds: dict[str, MistakeFact] = {}
        for mistake in report.mistakes:
            kinds.setdefault(mistake.category, mistake)
        for category, mistake in kinds.items():
            seen.setdefault(category, []).append((report, mistake))
    found = []
    for category, where in seen.items():
        if len(where) < RECURRING_IN:
            continue
        newest = where[0][1]
        serious = any(m.severity == "blocks_meaning" for _, m in where)
        count = sum(
            1 for report in reports for mistake in report.mistakes if mistake.category == category
        )
        this_week = inputs.mistakes_this_week.get(category, 0)
        last_week = inputs.mistakes_last_week.get(category, 0)
        action = (
            Action("lesson", topic=newest.topic, partner=inputs.partner)
            if newest.topic and inputs.partner
            else Action("say_it_better", call_id=where[0][0].call_id)
        )
        found.append(
            Signal(
                Kind.RECURRING_MISTAKE,
                category,
                min(80, 60 + 5 * (len(where) - RECURRING_IN) + (10 if serious else 0)),
                {
                    "category": category,
                    "topic": newest.topic,
                    "conversations": len(where),
                    "out_of": len(reports),
                    "count": count,
                    "said": newest.original,
                    "corrected": newest.corrected,
                },
                action,
                LESSON_MINUTES if action.type == "lesson" else SAY_IT_BETTER_MINUTES,
                trend=_trend(this_week, last_week),
            )
        )
    return found


def _say_it_better(inputs: CoachInputs) -> list[Signal]:
    if not inputs.reports:
        return []
    latest = inputs.reports[0]
    waiting = len(latest.mistakes) - latest.retried
    if waiting <= 0 or latest.retried > 0:
        return []
    return [
        Signal(
            Kind.SAY_IT_BETTER,
            latest.call_id,
            55,
            {"call_id": latest.call_id, "count": waiting},
            Action("say_it_better", call_id=latest.call_id),
            SAY_IT_BETTER_MINUTES,
        )
    ]


_TOPIC_TREND: Mapping[str, Trend] = {"improving": "better", "slipping": "worse", "steady": "same"}


def _weak_topics(inputs: CoachInputs) -> list[Signal]:
    found = []
    for topic in inputs.topics:
        if topic.uses < WEAK_USES or topic.accuracy >= WEAK_ACCURACY or inputs.partner is None:
            continue
        slipping = topic.trend == "slipping"
        found.append(
            Signal(
                Kind.WEAK_TOPIC,
                topic.id,
                50 + (10 if slipping else 0),
                {
                    "topic": topic.id,
                    "accuracy": round(topic.accuracy * 100),
                    "uses": topic.uses,
                    "days": topic.last_used_days,
                },
                Action("lesson", topic=topic.id, partner=inputs.partner),
                LESSON_MINUTES,
                trend=_TOPIC_TREND.get(topic.trend or ""),
            )
        )
    return found


def _cards(inputs: CoachInputs) -> list[Signal]:
    found = []
    if inputs.cards_due >= OVERDUE_CARDS or (
        inputs.cards_due > 0 and inputs.oldest_due_days >= OVERDUE_DAYS
    ):
        count = min(inputs.cards_due, MAX_REVIEW_CARDS)
        found.append(
            Signal(
                Kind.CARDS_OVERDUE,
                "",
                40 + min(30, inputs.oldest_due_days * 3),
                {"due": inputs.cards_due, "days": inputs.oldest_due_days, "count": count},
                Action("review_cards", count=count),
                _minutes_for(count),
            )
        )
    if len(inputs.lapsing) >= LAPSING_CARDS and inputs.partner:
        found.append(
            Signal(
                Kind.CARDS_LAPSING,
                "",
                50,
                {"count": len(inputs.lapsing), "words": list(inputs.lapsing[:3])},
                Action("review_conversation", partner=inputs.partner),
                CALL_MINUTES,
            )
        )
    elif inputs.words_due >= REVIEW_WORDS and inputs.partner:
        found.append(
            Signal(
                Kind.REVIEW_DUE,
                "",
                45,
                {"count": inputs.words_due},
                Action("review_conversation", partner=inputs.partner),
                CALL_MINUTES,
            )
        )
    return found


def _sounds(inputs: CoachInputs) -> list[Signal]:
    found = []
    for sound in inputs.sounds:
        low_share = sound.tries >= SOUND_TRIES and sound.right / sound.tries < SOUND_RIGHT_SHARE
        low_score = sound.score is not None and sound.score < SOUND_SCORE
        if not (low_share or low_score or len(sound.problem_words) >= 2):
            continue
        evidence: dict[str, Any] = {
            "sound": sound.id,
            "title": sound.title,
            "tries": sound.tries,
            "right": sound.right,
            "words": list(sound.problem_words[:3]),
        }
        if sound.score is not None:
            evidence["score"] = round(sound.score)
        found.append(
            Signal(
                Kind.PROBLEM_SOUND,
                sound.id,
                45 + (10 if low_score else 0),
                evidence,
                Action("sound_drill", sound=sound.id),
                DRILL_MINUTES,
            )
        )
    return found


def _exam(inputs: CoachInputs) -> list[Signal]:
    exam = inputs.exam
    if exam is None:
        return []
    close = exam.days_left is not None and exam.days_left <= EXAM_CLOSE_DAYS
    near = exam.days_left is not None and exam.days_left <= EXAM_NEAR_DAYS
    if close and exam.simulations_7_days == 0:
        score = 90
    elif (near and exam.simulations_14_days == 0) or exam.last_days is None:
        score = 70
    else:
        return []
    return [
        Signal(
            Kind.EXAM_NEAR,
            exam.test,
            score,
            {
                "exam": exam.test,
                "name": exam.name,
                "days": exam.days_left,
                "count": exam.simulations_14_days,
                "last": exam.last_days,
            },
            Action("exam", exam=exam.test),
            CALL_MINUTES,
            urgent=score >= URGENT_FROM,
        )
    ]


def _level(inputs: CoachInputs) -> list[Signal]:
    found = []
    level = inputs.level
    if (
        level in _LEVELS
        and level != _LEVELS[-1]
        and inputs.level_down == 0
        and inputs.level_up >= 2
        and inputs.level_counted < LEVEL_EVIDENCE
        and inputs.partner
    ):
        needed = max(LEVEL_EVIDENCE - inputs.level_counted, LEVEL_AGREEING - inputs.level_up)
        found.append(
            Signal(
                Kind.LEVEL_CLOSE,
                level,
                48,
                {
                    "level": level,
                    "next": _LEVELS[_LEVELS.index(level) + 1],
                    "count": inputs.level_up,
                    "needed": needed,
                },
                Action("free_talk", partner=inputs.partner),
                CALL_MINUTES,
            )
        )
    if inputs.level_raised_to:
        found.append(
            Signal(
                Kind.LEVEL_UP,
                inputs.level_raised_to,
                70,
                {"level": inputs.level_raised_to},
                positive=True,
            )
        )
    return found


def _rhythm(inputs: CoachInputs) -> list[Signal]:
    found = []
    gap = inputs.days_since_practice
    if gap is not None and gap >= LONG_GAP_DAYS and inputs.partner:
        found.append(
            Signal(
                Kind.LONG_GAP,
                "",
                65,
                {"days": gap},
                Action("free_talk", partner=inputs.partner),
                SHORT_CALL_MINUTES,
            )
        )
    elif (
        inputs.streak >= STREAK_DAYS
        and inputs.planned_today
        and not inputs.practised_today
        and inputs.hour >= STREAK_HOUR
    ):
        action = (
            Action("review_cards", count=min(inputs.cards_due, 5))
            if inputs.cards_due
            else Action("free_talk", partner=inputs.partner)
            if inputs.partner
            else None
        )
        if action is not None:
            found.append(
                Signal(
                    Kind.STREAK_AT_RISK,
                    "",
                    58,
                    {"days": inputs.streak},
                    action,
                    _minutes_for(action.count) if action.count else SHORT_CALL_MINUTES,
                )
            )
    if inputs.best_streak >= STREAK_DAYS and inputs.streak == inputs.best_streak:
        found.append(Signal(Kind.STREAK_BEST, "", 60, {"days": inputs.streak}, positive=True))
    if inputs.plan_missed:
        found.append(Signal(Kind.PLAN_MISSED, "", 40, {"days": inputs.plan_missed}))
    return found


def _partners(inputs: CoachInputs) -> list[Signal]:
    talked = [p for p in inputs.partners if p.conversations > 0]
    if not talked:
        return []
    waiting = [
        p
        for p in inputs.partners
        if p.id != inputs.partner and (p.days_since is None or p.days_since >= PARTNER_DAYS)
    ]
    if not waiting:
        return []
    # The one never met first, then the one not met for longest.
    partner = min(waiting, key=lambda p: (p.days_since is not None, -(p.days_since or 0)))
    return [
        Signal(
            Kind.PARTNER_UNVISITED,
            str(partner.id),
            25,
            {"partner": str(partner.id), "name": partner.name, "days": partner.days_since},
            Action("call_partner", partner=partner.id),
            CALL_MINUTES,
        )
    ]


def _imports(inputs: CoachInputs) -> list[Signal]:
    fresh = [i for i in inputs.imports if 1 <= i.days_since <= IMPORT_DAYS]
    if not fresh or inputs.partner is None:
        return []
    newest = min(fresh, key=lambda i: i.days_since)
    return [
        Signal(
            Kind.IMPORT_WAITING,
            str(newest.id),
            40,
            {"import": str(newest.id), "title": newest.title, "days": newest.days_since},
            Action("import_call", import_id=newest.id, partner=inputs.partner),
            CALL_MINUTES,
        )
    ]


def _good_news(inputs: CoachInputs) -> list[Signal]:
    found = []
    for topic in inputs.topics:
        if (
            topic.state in _STATES
            and topic.state_week_ago in _STATES
            and _STATES.index(topic.state) > _STATES.index(topic.state_week_ago)
            and _STATES.index(topic.state) >= _STATES.index("practising")
        ):
            found.append(
                Signal(
                    Kind.TOPIC_IMPROVED,
                    topic.id,
                    55 + 5 * _STATES.index(topic.state),
                    {"topic": topic.id, "was": topic.state_week_ago, "now": topic.state},
                    positive=True,
                )
            )
    this_week = sum(inputs.mistakes_this_week.values())
    last_week = sum(inputs.mistakes_last_week.values())
    # Fewer mistakes says little after one or two short conversations: the week before must have
    # had a few.
    if last_week >= 3 and this_week < last_week and inputs.reports:
        found.append(
            Signal(
                Kind.FEWER_MISTAKES,
                "",
                50,
                {"count": this_week, "before": last_week},
                positive=True,
            )
        )
    if (
        inputs.pace_before
        and inputs.pace_after
        and inputs.pace_after >= inputs.pace_before * (1 + PACE_STEP)
    ):
        found.append(
            Signal(
                Kind.PACE_UP,
                "",
                45,
                {"before": round(inputs.pace_before), "after": round(inputs.pace_after)},
                positive=True,
            )
        )
    if (
        inputs.reviews_7_days >= REMEMBERED_REVIEWS
        and inputs.remembered_7_days / inputs.reviews_7_days >= REMEMBERED_SHARE
    ):
        found.append(
            Signal(
                Kind.CARDS_REMEMBERED,
                "",
                40,
                {
                    "share": round(100 * inputs.remembered_7_days / inputs.reviews_7_days),
                    "count": inputs.reviews_7_days,
                },
                positive=True,
            )
        )
    return found


def find_signals(inputs: CoachInputs) -> list[Signal]:
    """Everything the Coach finds in the facts, in no particular order."""
    if inputs.conversations == 0 and not inputs.cards_due:
        # Before a first conversation there is nothing to coach: Today starts one.
        return []
    return [
        *_exam(inputs),
        *_recurring(inputs),
        *_say_it_better(inputs),
        *_weak_topics(inputs),
        *_cards(inputs),
        *_sounds(inputs),
        *_level(inputs),
        *_rhythm(inputs),
        *_partners(inputs),
        *_imports(inputs),
        *_good_news(inputs),
    ]


def signal_document(signal: Signal) -> dict[str, Any]:
    """A signal as stored with a day's brief (what holds the learner back, what went well)."""
    return {
        "kind": signal.kind.value,
        "key": signal.key,
        "score": signal.score,
        "evidence": dict(signal.evidence),
        "trend": signal.trend,
        "positive": signal.positive,
    }


def signal_from(document: Mapping[str, Any]) -> Signal:
    return Signal(
        kind=Kind(document["kind"]),
        key=document["key"],
        score=document["score"],
        evidence=document["evidence"],
        positive=document.get("positive", False),
        trend=document.get("trend"),
    )


# --- What the learner said about earlier suggestions ---------------------------------------------

# A kind the learner turned down stays out this long.
MUTE_DAYS = 30
# Asking for shorter things lasts this long.
SHORT_DAYS = 14
SHORT_MINUTES = 5
# A kind gets this much more for each time the learner took one up lately, up to `PREFER_MAX`.
PREFER_STEP = 5
PREFER_MAX = 15
SHORT_PENALTY = 20


@dataclass(frozen=True)
class FeedbackMemory:
    muted_kinds: frozenset[Kind] = frozenset()
    # (kind, key): "I already know this" about one thing.
    muted_keys: frozenset[tuple[Kind, str]] = frozenset()
    # Turned down for today ("Not now").
    snoozed: frozenset[tuple[Kind, str]] = frozenset()
    accepted: Mapping[Kind, int] = field(default_factory=dict)
    prefers_short: bool = False


_NO_MEMORY = FeedbackMemory()


def rank(signals: Iterable[Signal], memory: FeedbackMemory = _NO_MEMORY) -> list[Signal]:
    """The signals with an action, the most useful first, after what the learner said: a kind
    they turned down is left out, one they take up comes earlier, and long things come later
    while they asked for short ones. An urgent signal always comes first. One of each kind."""

    def weight(signal: Signal) -> int:
        bonus = min(PREFER_MAX, PREFER_STEP * memory.accepted.get(signal.kind, 0))
        if memory.prefers_short and signal.minutes > SHORT_MINUTES:
            bonus -= SHORT_PENALTY
        return signal.score + bonus

    usable = [
        signal
        for signal in signals
        if signal.action is not None
        and signal.kind not in memory.muted_kinds
        and (signal.kind, signal.key) not in memory.muted_keys
        and (signal.kind, signal.key) not in memory.snoozed
    ]
    ordered = sorted(usable, key=lambda s: (not s.urgent, -weight(s), s.kind.value, s.key))
    chosen: list[Signal] = []
    for signal in ordered:
        if all(other.kind is not signal.kind for other in chosen):
            chosen.append(signal)
    return chosen


def holding_back(signals: Iterable[Signal], top: int = 3) -> list[Signal]:
    """What holds the learner back most: the signals that are not good news, by score."""
    return sorted(
        (s for s in signals if not s.positive), key=lambda s: (-s.score, s.kind.value, s.key)
    )[:top]


def going_well(signals: Iterable[Signal], top: int = 3) -> list[Signal]:
    return sorted(
        (s for s in signals if s.positive), key=lambda s: (-s.score, s.kind.value, s.key)
    )[:top]


# --- What is stored -------------------------------------------------------------------------------

# Suggestions kept per day: the three shown and a few to take their place when one is turned down.
CANDIDATES = 6
SHOWN = 3
# Model wordings a learner may cause in one day (a new day, then after each report).
MAX_WORDINGS = 4
STALE_AFTER = dt.timedelta(minutes=5)
# A suggestion that is still about something after this long is settled as `persists`.
SETTLE_AFTER_DAYS = 7
HISTORY = 20
TITLE_MAX = 80
WHY_MAX = 240


@dataclass(frozen=True)
class Suggestion:
    id: UUID
    day: dt.date
    rank: int
    kind: Kind
    key: str
    evidence: Mapping[str, Any]
    action: Action
    minutes: int
    urgent: bool
    status: SuggestionStatus = "open"
    # Written by the model in the learner's explanation language; None: the app's template.
    title: str | None = None
    why: str | None = None
    reason: Reason | None = None
    responded_at: dt.datetime | None = None
    outcome: Outcome | None = None
    # Whether the learner practised after taking it up.
    acted: bool | None = None


@dataclass(frozen=True)
class Brief:
    """What the Coach found for one day."""

    day: dt.date
    # The latest report when it was found: a new report finds again.
    basis: str
    wording: Wording
    holding_back: tuple[Signal, ...]
    going_well: tuple[Signal, ...]
    created_at: dt.datetime


@dataclass(frozen=True)
class CoachView:
    brief: Brief
    # The day's suggestions still to show, in order (at most `SHOWN`).
    suggestions: tuple[Suggestion, ...]
    # Earlier suggestions, the newest first.
    history: tuple[Suggestion, ...]

    @property
    def leads(self) -> bool:
        """Whether the first suggestion comes before the week's plan on Today."""
        first = next((s for s in self.suggestions if s.status == "open"), None)
        return bool(first and first.urgent)


class CoachError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class CoachRepository(Protocol):
    def brief(self, user_id: UUID, language: str, day: dt.date) -> Brief | None: ...

    def save(
        self,
        user_id: UUID,
        language: str,
        brief: Brief,
        suggestions: Sequence[Suggestion],
    ) -> None:
        """Stores the day's brief and its suggestions, in place of the suggestions of the day
        the learner did not answer; the answered ones stay as they were."""

    def suggestions(self, user_id: UUID, language: str, day: dt.date) -> list[Suggestion]:
        """The day's suggestions, in rank order."""

    def respond(
        self,
        user_id: UUID,
        suggestion_id: UUID,
        status: SuggestionStatus,
        reason: Reason | None,
        at: dt.datetime,
    ) -> bool:
        """Notes the learner's answer; False for a suggestion that is not theirs."""

    def answered(self, user_id: UUID, language: str, since: dt.date) -> list[Suggestion]:
        """Suggestions the learner answered on `since` or later, newest first."""

    def unsettled(self, user_id: UUID, language: str, before: dt.date) -> list[Suggestion]:
        """Earlier days' shown suggestions with no outcome yet."""

    def settle(
        self, user_id: UUID, suggestion_id: UUID, outcome: Outcome, acted: bool, at: dt.datetime
    ) -> None: ...

    def history(
        self, user_id: UUID, language: str, before: dt.date, limit: int
    ) -> list[Suggestion]:
        """Shown or answered suggestions of the days before `before`, newest first."""

    def request_wording(
        self,
        user_id: UUID,
        language: str,
        day: dt.date,
        *,
        at: dt.datetime,
        stale_before: dt.datetime,
        max_requests: int,
    ) -> bool:
        """Marks the day's brief as being worded and says whether this caller is to start it:
        when it is worded by the templates, or has waited since before `stale_before`; never
        more than `max_requests` times a day. One step: of several callers, one is told True."""

    def worded(
        self,
        user_id: UUID,
        language: str,
        day: dt.date,
        wording: Wording,
        words: Mapping[UUID, tuple[int, str, str]],
    ) -> None:
        """Stores the model's wording: for each suggestion id its new rank, title and why."""


class CoachStarter(Protocol):
    def start(self, user_id: UUID, day: dt.date) -> None:
        """Has the day's suggestions worded by the worker, in the background."""


def memory_of(answered: Sequence[Suggestion], today: dt.date) -> FeedbackMemory:
    """What the learner's answers of the last `MUTE_DAYS` mean for today's ranking."""
    muted: set[Kind] = set()
    keys: set[tuple[Kind, str]] = set()
    snoozed: set[tuple[Kind, str]] = set()
    accepted: dict[Kind, int] = {}
    short = False
    for item in answered:
        age = (today - item.day).days
        if item.status == "accepted":
            accepted[item.kind] = accepted.get(item.kind, 0) + 1
        elif item.status == "snoozed" and age == 0:
            snoozed.add((item.kind, item.key))
        elif item.status == "dismissed":
            if item.reason == "already_know":
                keys.add((item.kind, item.key))
            elif item.reason == "too_long":
                if age < SHORT_DAYS:
                    short = True
                if age == 0:
                    snoozed.add((item.kind, item.key))
            elif age < MUTE_DAYS:
                muted.add(item.kind)
    return FeedbackMemory(frozenset(muted), frozenset(keys), frozenset(snoozed), accepted, short)


# --- The model's wording -------------------------------------------------------------------------

_ACTION_TEXT: Mapping[str, str] = {
    "lesson": "a ten-minute guided lesson on the grammar topic with a partner",
    "say_it_better": "saying the corrected sentences of the last report again (Say it better)",
    "review_cards": "reviewing flashcards",
    "review_conversation": "a conversation built around the words that are due",
    "sound_drill": "a short drill of the sound in the pronunciation lab",
    "exam": "a simulation of the speaking test",
    "free_talk": "a conversation with a partner",
    "call_partner": "a conversation with a partner they have not talked to for a while",
    "import_call": "a conversation about something they imported",
}

_KIND_TEXT: Mapping[Kind, str] = {
    Kind.RECURRING_MISTAKE: "a kind of mistake that came back in several recent conversations",
    Kind.SAY_IT_BETTER: "corrections from the last conversation not yet said again",
    Kind.WEAK_TOPIC: "a grammar topic used often but mostly wrong",
    Kind.CARDS_OVERDUE: "flashcards waiting to be reviewed",
    Kind.CARDS_LAPSING: "words forgotten again and again",
    Kind.REVIEW_DUE: "saved words due for review",
    Kind.PROBLEM_SOUND: "a sound that is hard for the learner",
    Kind.EXAM_NEAR: "the speaking test of the exam ahead",
    Kind.LEVEL_CLOSE: "conversations pointing to the next level",
    Kind.LONG_GAP: "a few days without practice",
    Kind.STREAK_AT_RISK: "today would continue a run of days with practice",
    Kind.PARTNER_UNVISITED: "a partner the learner has not talked to for a while",
    Kind.IMPORT_WAITING: "something the learner imported and has not talked about",
}


class _Worded(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str = Field(min_length=1, max_length=TITLE_MAX)
    why: str = Field(min_length=1, max_length=WHY_MAX)


class _Wording(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suggestions: list[_Worded] = Field(min_length=1, max_length=SHOWN)


_SCHEMA = answer_object(
    {
        "suggestions": answer_list(
            answer_object(
                {"id": {"type": "string"}, "title": {"type": "string"}, "why": {"type": "string"}}
            ),
            SHOWN,
        )
    }
)


def instructions(target: str, explanation: str) -> str:
    return f"""You are the learner's {target} coach in a language app. From the facts below, pick
at most three of the candidate suggestions and write each one for the learner, in
{explanation}, to the learner as "you", with the familiar form where {explanation} has one.

For each one you pick, give its id as it is, a title (an invitation to do the action, at most 60
characters) and why (one or two short sentences, at most 200 characters) that quotes the evidence
it rests on: the numbers, the topic or the sound, and, for a mistake, what the learner said and
what is right. Use only the facts given and never invent any: no number, date, word or result
that is not in them. Put the candidates marked urgent first; otherwise order them by how much
they would help the learner now.
Be warm and encouraging, like a good coach who believes in them. Never make the learner feel
guilty or behind, and never mention streaks being lost or broken. Mistakes are normal steps of
learning. No emoji, no lists, no quotation marks around topic names. Grammar topic and sound names
come in English or as ids: say them as a learner would in {explanation}."""


def facts_for_model(
    suggestions: Sequence[Suggestion], topic_titles: Mapping[str, str]
) -> list[dict[str, Any]]:
    """The candidates as the model reads them: what each is about, its evidence and action."""
    found = []
    for suggestion in suggestions:
        evidence = dict(suggestion.evidence)
        topic = evidence.get("topic")
        if isinstance(topic, str):
            evidence["topic"] = topic_titles.get(topic, topic)
        evidence.pop("call_id", None)
        evidence.pop("import", None)
        evidence.pop("partner", None)
        found.append(
            {
                "id": str(suggestion.id),
                "about": _KIND_TEXT.get(suggestion.kind, suggestion.kind.value),
                "urgent": suggestion.urgent,
                "evidence": evidence,
                "action": _ACTION_TEXT[suggestion.action.type],
                "minutes": suggestion.minutes,
            }
        )
    return found


_NUMBER = re.compile(r"\d+")


def invented_numbers(text: str, facts: Any) -> set[str]:
    """The numbers in `text` that the facts do not hold."""
    allowed = set(_NUMBER.findall(json.dumps(facts, ensure_ascii=False)))
    return set(_NUMBER.findall(text)) - allowed


def wording_of(
    answer: dict[str, Any],
    candidates: Sequence[Suggestion],
    facts: list[dict[str, Any]],
) -> dict[UUID, tuple[int, str, str]] | None:
    """The model's answer as new ranks and texts; None when it does not hold: an unknown or
    repeated id, an urgent candidate not first, or a number the facts do not hold."""
    try:
        worded = _Wording.model_validate(answer).suggestions
    except ValidationError:
        return None
    by_id = {str(s.id): s for s in candidates}
    if len({w.id for w in worded}) != len(worded) or any(w.id not in by_id for w in worded):
        return None
    urgent = [s for s in candidates if s.urgent]
    if urgent and worded[0].id != str(urgent[0].id):
        return None
    for item in worded:
        fact = next(f for f in facts if f["id"] == item.id)
        if invented_numbers(f"{item.title} {item.why}", fact):
            return None
    # The candidates keep the places they had between them; the ones it chose come first in its
    # order, the ones it left out after them with the app's own words.
    base = min(s.rank for s in candidates)
    chosen = {
        UUID(item.id): (base + position, " ".join(item.title.split()), " ".join(item.why.split()))
        for position, item in enumerate(worded)
    }
    rest = [s for s in candidates if s.id not in chosen]
    for offset, suggestion in enumerate(rest):
        chosen[suggestion.id] = (base + len(worded) + offset, "", "")
    return chosen


# --- The service ----------------------------------------------------------------------------------

type InputsReader = Callable[[UUID, str | None, dt.datetime], CoachInputs]
type TopicTitles = Callable[[str], Mapping[str, str]]


@dataclass(frozen=True)
class WordingGate:
    """Whether the model may word the day's suggestions for this learner."""

    # The small text model; "" for none.
    model: str
    # The learner agreed to the AI provider (2.5).
    consented: Callable[[UUID], bool]
    # The month's spend is under its target (`SpendGuard`).
    affordable: Callable[[], bool]


class CoachService:
    def __init__(
        self,
        *,
        language: Callable[[UUID], str],
        explanation: Callable[[UUID, str], str],
        language_name: Callable[[str], str],
        latest_report: Callable[[UUID], str],
        inputs: InputsReader,
        topic_titles: TopicTitles,
        practised_since: Callable[[UUID, dt.date], bool],
        repository: CoachRepository,
        starter: CoachStarter,
        text_model: TextModel,
        gate: WordingGate,
        charge: Callable[[UUID], Any],
        clock: Callable[[], dt.datetime],
        today: Callable[[UUID, str | None, dt.datetime], dt.date],
        new_id: Callable[[], UUID],
    ) -> None:
        """`inputs` reads the facts for one learner (`CoachFacts.read`); `today` is the
        learner's date on their calendar; `charge` the metering of a wording."""
        self._language = language
        self._explanation = explanation
        self._language_name = language_name
        self._latest_report = latest_report
        self._inputs = inputs
        self._topic_titles = topic_titles
        self._practised_since = practised_since
        self._repository = repository
        self._starter = starter
        self._text_model = text_model
        self._gate = gate
        self._charge = charge
        self._clock = clock
        self._today = today
        self._new_id = new_id

    def view(self, user_id: UUID, timezone: str | None) -> CoachView:
        """Today's suggestions, found again for a new day or after a new report."""
        now = self._clock()
        language = self._language(user_id)
        today = self._today(user_id, timezone, now)
        basis = self._latest_report(user_id)
        brief = self._repository.brief(user_id, language, today)
        if brief is None or brief.basis != basis:
            brief = self._find(user_id, timezone, language, today, basis, now)
        suggestions = self._repository.suggestions(user_id, language, today)
        shown = tuple(s for s in suggestions if s.status in ("open", "accepted"))[:SHOWN]
        history = tuple(self._repository.history(user_id, language, today, HISTORY))
        return CoachView(brief, shown, history)

    def respond(
        self, user_id: UUID, suggestion_id: UUID, response: Response, reason: Reason | None
    ) -> None:
        """Notes the learner's answer to a suggestion. Raises `CoachError("not_found")`."""
        status: SuggestionStatus = response
        kept = reason if response == "dismissed" else None
        if not self._repository.respond(user_id, suggestion_id, status, kept, self._clock()):
            raise CoachError("not_found")

    def focus_topic(self, user_id: UUID, today: dt.date) -> str | None:
        """The grammar topic the day's first suggestion is about, for the Session Planner to put
        first in a call that has no topic of its own; None when it is about something else."""
        language = self._language(user_id)
        for suggestion in self._repository.suggestions(user_id, language, today)[:SHOWN]:
            if suggestion.status not in ("open", "accepted"):
                continue
            if suggestion.kind in (Kind.RECURRING_MISTAKE, Kind.WEAK_TOPIC):
                topic = suggestion.evidence.get("topic")
                if isinstance(topic, str):
                    return topic
            return None
        return None

    def top(self, user_id: UUID, timezone: str | None) -> Suggestion | None:
        """The first suggestion of the day still open, as stored (for a reminder)."""
        language = self._language(user_id)
        today = self._today(user_id, timezone, self._clock())
        return next(
            (
                s
                for s in self._repository.suggestions(user_id, language, today)
                if s.status == "open"
            ),
            None,
        )

    def _find(
        self,
        user_id: UUID,
        timezone: str | None,
        language: str,
        today: dt.date,
        basis: str,
        now: dt.datetime,
    ) -> Brief:
        inputs = self._inputs(user_id, timezone, now)
        signals = find_signals(inputs)
        self._settle(user_id, language, today, signals)
        answered = self._repository.answered(user_id, language, today - dt.timedelta(MUTE_DAYS))
        kept = {(s.kind, s.key) for s in answered if s.day == today}
        ranked = [
            s for s in rank(signals, memory_of(answered, today)) if (s.kind, s.key) not in kept
        ][:CANDIDATES]
        offset = len([s for s in answered if s.day == today and s.status == "accepted"])
        suggestions = [
            Suggestion(
                id=self._new_id(),
                day=today,
                rank=offset + position,
                kind=signal.kind,
                key=signal.key,
                evidence=signal.evidence,
                action=signal.action,  # type: ignore[arg-type]
                minutes=signal.minutes,
                urgent=signal.urgent,
            )
            for position, signal in enumerate(ranked)
        ]
        brief = Brief(
            day=today,
            basis=basis,
            wording="template",
            holding_back=tuple(holding_back(signals)),
            going_well=tuple(going_well(signals)),
            created_at=now,
        )
        self._repository.save(user_id, language, brief, suggestions)
        if (
            suggestions
            and self._may_word(user_id)
            and self._repository.request_wording(
                user_id,
                language,
                today,
                at=now,
                stale_before=now - STALE_AFTER,
                max_requests=MAX_WORDINGS,
            )
        ):
            self._starter.start(user_id, today)
            brief = replace(brief, wording="pending")
        return brief

    def _may_word(self, user_id: UUID) -> bool:
        return bool(self._gate.model) and self._gate.consented(user_id) and self._gate.affordable()

    def _settle(
        self, user_id: UUID, language: str, today: dt.date, signals: Sequence[Signal]
    ) -> None:
        """Earlier suggestions: resolved when what they were about is no longer found, persists
        when it still is after `SETTLE_AFTER_DAYS`."""
        present = {(s.kind, s.key) for s in signals}
        now = self._clock()
        for suggestion in self._repository.unsettled(user_id, language, today):
            found = (suggestion.kind, suggestion.key) in present
            age = (today - suggestion.day).days
            if found and age < SETTLE_AFTER_DAYS:
                continue
            acted = suggestion.status == "accepted" and self._practised_since(
                user_id, suggestion.day
            )
            self._repository.settle(
                user_id, suggestion.id, "persists" if found else "resolved", acted, now
            )

    def phrase(self, user_id: UUID, day: dt.date) -> None:
        """Words the day's suggestions with the model (the worker's job)."""
        language = self._language(user_id)
        brief = self._repository.brief(user_id, language, day)
        if brief is None or brief.wording != "pending":
            return
        candidates = [
            s for s in self._repository.suggestions(user_id, language, day) if s.status == "open"
        ][: SHOWN + 2]
        if not candidates:
            self._repository.worded(user_id, language, day, "template", {})
            return
        facts = facts_for_model(candidates, self._topic_titles(language))
        explanation = self._explanation(user_id, language)
        task = TextTask(
            model=self._gate.model,
            instructions=instructions(
                self._language_name(language), self._language_name(explanation)
            ),
            content=json.dumps({"candidates": facts}, ensure_ascii=False),
            answer_name="coach_suggestions",
            answer_schema=_SCHEMA,
            charge=self._charge(user_id),
        )
        try:
            words = wording_of(self._text_model.answer(task), candidates, facts)
        except TextModelError:
            words = None
        if words is None:
            self._repository.worded(user_id, language, day, "template", {})
            return
        self._repository.worded(user_id, language, day, "model", words)
