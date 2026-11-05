"""The Session Planner (spec §8.2, §8.6): what one practice conversation sets out to practise.

Before every conversation it picks, from what is known of the learner:
- the grammar topics to work on (`grammar_topics.py`): one the learner chose to practise, then
  those of the confirmed mistakes of their last conversations, the recent and serious ones
  weighing most, each with how a partner brings it up without naming it (spec §7 "targeted
  elicitation") and the learner's own sentences;
- the words to bring back, from their cards, those due first (spec §7 "review inside
  conversation");
- what they talked about lately, so that the partner finds something new.

A guided lesson (spec §6.3, `practise="lesson:<topic>"`) teaches that one topic: its rules and
sentences, and nothing else to compete with it.

A conversation about something the learner imported (spec §6.17, `practise="import:<id>"`, or
`"letter:<id>"` to rehearse a letter's reply) is the material alone, with the learner's own
mistakes still showing.

A review conversation (spec §6.7, `practise=PRACTISE_WORDS`) is built around the words instead:
more of them, the due ones only (or the next ones when none is due), and no structure to
compete with them.

It is plain code, not a model: it runs while the learner waits for the call to connect, and the
partner, who is a model, makes the conversation out of it.
"""

import datetime as dt
from collections.abc import Callable, Sequence
from uuid import UUID

from konvami_api.domain.cards import CardService
from konvami_api.domain.catalog import LanguagePack
from konvami_api.domain.grammar_map import GrammarMapError
from konvami_api.domain.grammar_topics import GrammarTopic
from konvami_api.domain.plan import (
    FocusPoint,
    ImportMaterial,
    LessonMaterial,
    PlanWord,
    SessionPlan,
)
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import Report, ReportService, Severity

MAX_FOCUS = 2
# The learner's own sentences shown per kind of mistake: enough to see the pattern.
MAX_EXAMPLES = 2
MAX_PLAN_WORDS = 4
# A review conversation's words: enough for a few minutes each in a ten-minute call.
MAX_REVIEW_WORDS = 6
# What a learner asks to practise for a review conversation, instead of a grammar topic.
PRACTISE_WORDS = "words"
# What precedes a grammar topic's id when a learner asks for a guided lesson on it (spec §6.3).
LESSON_PREFIX = "lesson:"
# What precedes an import's id (32 hex digits) when a learner asks to talk about it, or, for a
# letter, to rehearse its reply or phone call (spec §6.17).
IMPORT_PREFIX = "import:"
LETTER_PREFIX = "letter:"
# The conversations whose mistakes count; older ones are what the learner may since have learnt.
RECENT_REPORTS = 5
RECENT_TOPICS = 3
# How much a mistake weighs, by how much it matters and how recent its conversation is (the
# newest first). A kind seen once in the last conversation outweighs one seen twice in the oldest.
_SEVERITY_WEIGHT: dict[Severity, float] = {"blocks_meaning": 1.5, "noticeable": 1.0, "minor": 0.5}
_RECENCY_WEIGHT = (1.0, 0.8, 0.6, 0.4, 0.2)


def _topic_of(pack: LanguagePack, category: str) -> GrammarTopic | None:
    """The grammar topic a kind of mistake belongs to; None for one about single words."""
    return next((topic for topic in pack.grammar_map if category in topic.categories), None)


def lesson_material(pack: LanguagePack, topic: GrammarTopic) -> LessonMaterial:
    """What a guided lesson on a topic teaches: the pack's rule notes for its kinds of mistake,
    then the topic's own sentences."""
    notes = [note for category in topic.categories if (note := pack.note(category)) is not None]
    return LessonMaterial(
        topic=topic.id,
        title=topic.title,
        rules=tuple(note.rule for note in notes),
        right=(*topic.examples, *(sentence for note in notes for sentence in note.right)),
        wrong=tuple(sentence for note in notes for sentence in note.wrong),
    )


def choose_focus(
    reports: Sequence[Report], pack: LanguagePack, practise: GrammarTopic | None = None
) -> tuple[FocusPoint, ...]:
    """The grammar topics to work on: the one the learner chose to practise, if any, then those
    of the confirmed mistakes of their last conversations (newest first). A mistake the second
    check doubted may not be one, and one about single words has no topic to steer towards."""
    weights: dict[str, float] = {}
    examples: dict[str, list[tuple[str, str]]] = {}
    for recency, report in zip(_RECENCY_WEIGHT, reports, strict=False):
        for mistake in report.mistakes:
            topic = _topic_of(pack, mistake.category)
            if not mistake.certain or topic is None:
                continue
            weights[topic.id] = weights.get(topic.id, 0.0) + (
                recency * _SEVERITY_WEIGHT[mistake.severity]
            )
            said = examples.setdefault(topic.id, [])
            if len(said) < MAX_EXAMPLES:
                said.append((mistake.original, mistake.corrected))
    # Heaviest first; of two as heavy, the map's order (the more basic topic first).
    order = {topic.id: position for position, topic in enumerate(pack.grammar_map)}
    chosen = sorted(weights, key=lambda topic: (-weights[topic], order.get(topic, len(order))))
    if practise is not None:
        chosen = [practise.id, *(topic for topic in chosen if topic != practise.id)]
    return tuple(
        FocusPoint(
            topic.id, topic.title, topic.elicit, tuple(examples.get(topic.id, ())), topic.categories
        )
        for topic_id in chosen[:MAX_FOCUS]
        if (topic := pack.topic(topic_id)) is not None
    )


# What the learner imported: the material of an import, for a talk about it (`rehearse` False) or
# for rehearsing a letter's reply; None when they have no such import.
type ImportReader = Callable[[UUID, UUID, bool], ImportMaterial | None]

# The topic of the learner's week a call on a given day puts first (the Learning Director's
# `topic_for_call`); None when the week has none.
type WeekTopic = Callable[[UUID, dt.date], str | None]


class SessionPlanner:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        reports: ReportService,
        cards: CardService,
        week_topic: WeekTopic | None = None,
        imports: ImportReader | None = None,
    ) -> None:
        self._profiles = profiles
        self._reports = reports
        self._cards = cards
        self._week_topic = week_topic
        self._imports = imports

    def plan(
        self, user_id: UUID, practise: str | None = None, today: dt.date | None = None
    ) -> SessionPlan:
        """The plan of the learner's next conversation; `practise` is a grammar topic they
        chose to practise in it, or `PRACTISE_WORDS` for a review conversation. A call on
        `today` without a topic of its own puts the week's next topic first (spec §8.3: the
        Learning Director feeds the Session Planner). Raises `GrammarMapError` for a topic
        their language lacks."""
        language = self._profiles.get(user_id).target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        if practise is not None and practise.startswith((IMPORT_PREFIX, LETTER_PREFIX)):
            return self._import_plan(user_id, language, pack, practise)
        review = practise == PRACTISE_WORDS
        lesson = practise is not None and practise.startswith(LESSON_PREFIX)
        if lesson and practise is not None:
            practise = practise[len(LESSON_PREFIX) :]
        chosen = pack.topic(practise) if pack and practise and not review else None
        if practise is not None and not review and chosen is None:
            raise GrammarMapError("not_found")
        if pack and practise is None and today is not None and self._week_topic:
            week_topic = self._week_topic(user_id, today)
            chosen = pack.topic(week_topic) if week_topic else None
        reports = self._reports.recent(user_id, RECENT_REPORTS)
        if lesson and pack and chosen:
            # The lesson is the topic alone: the learner's own mistakes on it still show, but the
            # words and earlier talk would only crowd a ten-minute call.
            return SessionPlan(
                language=language,
                focus=choose_focus(reports, pack, chosen)[:1],
                lesson=lesson_material(pack, chosen),
            )
        if review:
            due = self._cards.words_due(user_id, MAX_REVIEW_WORDS)
            cards = due or self._cards.words_to_bring_back(user_id, MAX_REVIEW_WORDS)
        else:
            cards = self._cards.words_to_bring_back(user_id, MAX_PLAN_WORDS)
        return SessionPlan(
            language=language,
            focus=choose_focus(reports, pack, chosen) if pack and not review else (),
            words=tuple(PlanWord(card.front, card.back, str(card.id)) for card in cards),
            recent_topics=tuple(report.summary for report in reports[:RECENT_TOPICS]),
            review=review,
        )

    def _import_plan(
        self, user_id: UUID, language: str, pack: LanguagePack | None, practise: str
    ) -> SessionPlan:
        """A call about something the learner imported (spec §6.17): the material alone, with the
        learner's own mistakes still showing; the words and earlier talk would only compete with
        it. Raises `GrammarMapError` (`not_found`) for an import they do not have."""
        rehearse = practise.startswith(LETTER_PREFIX)
        raw = practise[len(LETTER_PREFIX if rehearse else IMPORT_PREFIX) :]
        try:
            import_id = UUID(hex=raw)
        except ValueError:
            raise GrammarMapError("not_found") from None
        material = self._imports(user_id, import_id, rehearse) if self._imports else None
        if material is None:
            raise GrammarMapError("not_found")
        reports = self._reports.recent(user_id, RECENT_REPORTS)
        return SessionPlan(
            language=language,
            focus=choose_focus(reports, pack, None)[:1] if pack else (),
            material=material,
        )
