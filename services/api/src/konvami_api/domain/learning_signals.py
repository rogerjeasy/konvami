"""Explicit learner phrases for adaptive support; never inferred emotion from audio (§6.9).

These are candidate cues for the report analyst to validate in context. Quoted speech, jokes
and negation can invalidate a match; each cue therefore retains its original turn as evidence.
"""

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from konvami_api.domain.live_call import Turn

SignalKind = Literal[
    "repeat_request", "comprehension_request", "frustration_statement", "challenge_request"
]

# Full phrases avoid treating ordinary vocabulary ('boring', 'repeat') as a learner state.
PHRASES: Mapping[str, Mapping[SignalKind, tuple[str, ...]]] = {
    "en": {
        "repeat_request": ("could you repeat", "can you repeat", "say that again"),
        "comprehension_request": (
            "i don't understand",
            "i do not understand",
            "could you explain",
            "can you explain",
        ),
        "frustration_statement": ("i'm frustrated", "i am frustrated", "this is frustrating"),
        "challenge_request": (
            "i'm bored",
            "i am bored",
            "this exercise is too easy",
            "make it harder",
        ),
    },
    "de": {
        "repeat_request": (
            "kannst du das wiederholen",
            "können sie das wiederholen",
            "bitte wiederholen",
        ),
        "comprehension_request": (
            "ich verstehe das nicht",
            "ich verstehe nicht",
            "kannst du das erklären",
        ),
        "frustration_statement": ("ich bin frustriert", "das frustriert mich"),
        "challenge_request": ("ich langweile mich", "das ist zu einfach", "mach es schwieriger"),
    },
    "fr": {
        "repeat_request": ("peux-tu répéter", "pouvez-vous répéter", "tu peux répéter"),
        "comprehension_request": (
            "je ne comprends pas",
            "peux-tu expliquer",
            "pouvez-vous expliquer",
        ),
        "frustration_statement": ("je suis frustré", "je suis frustrée", "ça me frustre"),
        "challenge_request": ("je m'ennuie", "c'est trop facile", "rends ça plus difficile"),
    },
    "it": {
        "repeat_request": ("puoi ripetere", "può ripetere", "potresti ripetere"),
        "comprehension_request": ("non capisco", "non ho capito", "puoi spiegare"),
        "frustration_statement": (
            "sono frustrato",
            "sono frustrata",
            "mi sento frustrato",
            "mi sento frustrata",
        ),
        "challenge_request": ("mi annoio", "è troppo facile", "rendilo più difficile"),
    },
}


@dataclass(frozen=True)
class LearningSignal:
    kind: SignalKind
    turn: int
    quote: str


def learning_signals(turns: Sequence[Turn], language: str) -> tuple[LearningSignal, ...]:
    phrases = PHRASES.get(language, {})
    found: list[LearningSignal] = []
    for index, turn in enumerate(turns):
        if turn.speaker != "learner":
            continue
        text = unicodedata.normalize("NFKC", turn.said).casefold().replace("\u2019", "'")
        for kind, alternatives in phrases.items():
            if any(
                re.search(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text)
                for phrase in alternatives
            ):
                found.append(LearningSignal(kind, index, turn.said))
    return tuple(found)
