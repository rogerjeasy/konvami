"""The Session Planner (spec §8.2, §8.6): what one practice conversation sets out to practise.

Before every conversation it picks, from what is known of the learner:
- the kinds of mistake to work on, from the confirmed mistakes of their last conversations, the
  recent and serious ones weighing most, each with how a partner brings it up without naming it
  (spec §7 "targeted elicitation") and the learner's own sentences;
- the words to bring back, from their cards, those due first (spec §7 "review inside
  conversation");
- what they talked about lately, so that the partner finds something new.

It is plain code, not a model: it runs while the learner waits for the call to connect, and the
partner, who is a model, makes the conversation out of it.
"""

from collections.abc import Sequence
from uuid import UUID

from konvami_api.domain.cards import CardService
from konvami_api.domain.catalog import LanguagePack
from konvami_api.domain.plan import FocusPoint, PlanWord, SessionPlan
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import OTHER_CATEGORY, Report, ReportService, Severity

MAX_FOCUS = 2
# The learner's own sentences shown per kind of mistake: enough to see the pattern.
MAX_EXAMPLES = 2
MAX_PLAN_WORDS = 4
# The conversations whose mistakes count; older ones are what the learner may since have learnt.
RECENT_REPORTS = 5
RECENT_TOPICS = 3
# Kinds of mistake that are a matter of single words: no question calls for them.
NOT_ELICITABLE = frozenset({"lexical_choice", "vocabulary_false_friend", OTHER_CATEGORY})
# How much a mistake weighs, by how much it matters and how recent its conversation is (the
# newest first). A kind seen once in the last conversation outweighs one seen twice in the oldest.
_SEVERITY_WEIGHT: dict[Severity, float] = {"blocks_meaning": 1.5, "noticeable": 1.0, "minor": 0.5}
_RECENCY_WEIGHT = (1.0, 0.8, 0.6, 0.4, 0.2)


def choose_focus(reports: Sequence[Report], pack: LanguagePack) -> tuple[FocusPoint, ...]:
    """The kinds of mistake to work on, from the reports of the last conversations (newest
    first). Only confirmed mistakes count: one the second check doubted may not be one."""
    weights: dict[str, float] = {}
    examples: dict[str, list[tuple[str, str]]] = {}
    for recency, report in zip(_RECENCY_WEIGHT, reports, strict=False):
        for mistake in report.mistakes:
            note = pack.note(mistake.category)
            if not mistake.certain or note is None or not note.elicit:
                continue
            weights[mistake.category] = weights.get(mistake.category, 0.0) + (
                recency * _SEVERITY_WEIGHT[mistake.severity]
            )
            said = examples.setdefault(mistake.category, [])
            if len(said) < MAX_EXAMPLES:
                said.append((mistake.original, mistake.corrected))
    # Heaviest first; of two as heavy, the pack's order (the more basic structure first).
    order = {topic: position for position, topic in enumerate(pack.error_categories)}
    chosen = sorted(weights, key=lambda topic: (-weights[topic], order.get(topic, len(order))))
    return tuple(
        FocusPoint(topic, note.title, note.elicit, tuple(examples[topic]))
        for topic in chosen[:MAX_FOCUS]
        if (note := pack.note(topic)) is not None
    )


class SessionPlanner:
    def __init__(
        self, *, profiles: ProfileService, reports: ReportService, cards: CardService
    ) -> None:
        self._profiles = profiles
        self._reports = reports
        self._cards = cards

    def plan(self, user_id: UUID) -> SessionPlan:
        language = self._profiles.get(user_id).target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        reports = self._reports.recent(user_id, RECENT_REPORTS)
        return SessionPlan(
            language=language,
            focus=choose_focus(reports, pack) if pack else (),
            words=tuple(
                PlanWord(card.front, card.back)
                for card in self._cards.words_to_bring_back(user_id, MAX_PLAN_WORDS)
            ),
            recent_topics=tuple(report.summary for report in reports[:RECENT_TOPICS]),
        )
