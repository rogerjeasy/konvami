"""What one practice conversation sets out to practise (spec §8.6 "Session Brief"), as the
Session Planner (`planner.py`) makes it. Kept apart from the planner so that the call itself can
carry a plan without depending on what the plan is made from.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class FocusPoint:
    # A topic of the language pack's grammar map (`grammar_topics.py`).
    topic: str
    # Its title (English, as the partner's instructions are).
    title: str
    elicit: str
    # What the learner said, and how it is right, from their own reports.
    examples: tuple[tuple[str, str], ...]
    # The kinds of mistake that are mistakes in it, for the live checks.
    categories: tuple[str, ...] = ()


@dataclass(frozen=True)
class PlanWord:
    text: str
    # In the learner's explanation language.
    meaning: str
    # The card it comes from, to count it as reviewed when the learner uses it. A word is the
    # same word whatever card it is on.
    card_id: str | None = field(default=None, compare=False)


@dataclass(frozen=True)
class LessonMaterial:
    """What a guided lesson (spec §6.3) teaches: one grammar topic, from the language pack's
    rule notes (`grammar.py`) and the topic's own sentences."""

    topic: str
    # Its title (English, as the partner's instructions are).
    title: str
    # The rules of the topic's kinds of mistake, in plain English; empty when the pack has none.
    rules: tuple[str, ...] = ()
    # Sentences in the language learned that follow the rule, and typical learner sentences that
    # break it.
    right: tuple[str, ...] = ()
    wrong: tuple[str, ...] = ()


@dataclass(frozen=True)
class SessionPlan:
    # The language practised (an ISO 639-1 code): what the words are in.
    language: str = ""
    focus: tuple[FocusPoint, ...] = ()
    words: tuple[PlanWord, ...] = ()
    # The summaries of the learner's last conversations, newest first.
    recent_topics: tuple[str, ...] = ()
    # A review conversation (spec §6.7): the words are its point, and the learner is to say them.
    review: bool = False
    # A guided lesson (spec §6.3): the topic taught, in place of the conversation's other plans.
    lesson: LessonMaterial | None = None

    def document(self) -> dict[str, Any]:
        """The plan as JSON, as it is stored with the call."""
        return {
            "language": self.language,
            "focus": [
                {
                    "topic": point.topic,
                    "title": point.title,
                    "elicit": point.elicit,
                    "examples": [list(example) for example in point.examples],
                    "categories": list(point.categories),
                }
                for point in self.focus
            ],
            "words": [
                {"text": word.text, "meaning": word.meaning, "card_id": word.card_id}
                for word in self.words
            ],
            "recent_topics": list(self.recent_topics),
            "review": self.review,
            "lesson": (
                {
                    "topic": self.lesson.topic,
                    "title": self.lesson.title,
                    "rules": list(self.lesson.rules),
                    "right": list(self.lesson.right),
                    "wrong": list(self.lesson.wrong),
                }
                if self.lesson
                else None
            ),
        }

    @classmethod
    def from_document(cls, document: dict[str, Any]) -> "SessionPlan":
        return cls(
            language=document.get("language", ""),
            focus=tuple(
                FocusPoint(
                    topic=point["topic"],
                    title=point["title"],
                    elicit=point["elicit"],
                    examples=tuple((said, better) for said, better in point["examples"]),
                    categories=tuple(point.get("categories", ())),
                )
                for point in document.get("focus", [])
            ),
            words=tuple(
                PlanWord(w["text"], w["meaning"], w.get("card_id"))
                for w in document.get("words", [])
            ),
            recent_topics=tuple(document.get("recent_topics", [])),
            review=document.get("review", False),
            lesson=(
                LessonMaterial(
                    topic=lesson["topic"],
                    title=lesson["title"],
                    rules=tuple(lesson.get("rules", ())),
                    right=tuple(lesson.get("right", ())),
                    wrong=tuple(lesson.get("wrong", ())),
                )
                if (lesson := document.get("lesson"))
                else None
            ),
        )
