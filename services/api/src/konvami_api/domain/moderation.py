"""Moderation of what a learner writes and a partner's instructions then carry (spec §6.21.4
"Abuse prevention", §16.3).

A learner writes free text that ends up inside a partner's prompt: the partner's name, backstory
and teaching focus, what to leave alone, a goal's note, a memory they correct. Before any of it
is stored it is read twice:

1. by cheap local rules for what no provider is needed to see: an instruction aimed at the
   model ("ignore your rules"), a link, an email address or a phone number;
2. by a moderation provider (`Moderator`, spec §15 portability) for what is unsafe.

The check fails closed: when the provider cannot answer, new free text is refused with a message
to try again, never let through unchecked. Refusals are counted per learner and day (reasons
only, never the text); past `ATTEMPTS_PER_DAY` attempts to instruct or to publish something
unsafe, free text is refused until the next day (a soft limit: nothing else in the app stops).
"""

import datetime as dt
import re
import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from konvami_api.domain.costs import Charge, Feature

# What a refusal is for. These are the codes the app turns into a sentence.
INSTRUCTIONS = "text_instructions"
LINK = "text_link"
CONTACT = "text_contact"
UNSAFE = "text_unsafe"
UNAVAILABLE = "moderation_unavailable"
LIMIT = "moderation_limit"

# The refusals that count as an attempt to misuse a partner. A link or a phone number is a
# slip of the finger or of the mind, and is refused without counting.
ATTEMPT_REASONS = (INSTRUCTIONS, UNSAFE)
# Attempts a learner may make in a day (UTC) before free text is refused until the next one.
ATTEMPTS_PER_DAY = 10


class ModerationError(Exception):
    """A text was refused, or could not be checked. `code` is one of the codes above."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ModeratorError(Exception):
    """The provider could not say."""


@dataclass(frozen=True)
class Verdict:
    flagged: bool


class Moderator(Protocol):
    def check(self, texts: Sequence[str], charge: Charge) -> Verdict:
        """Whether any of `texts` is unsafe. Raises `ModeratorError` when it cannot tell."""


class AttemptLog(Protocol):
    def add(self, user_id: UUID, day: dt.date, reason: str) -> None:
        """Counts one refusal."""

    def count(self, user_id: UUID, day: dt.date, reasons: Sequence[str]) -> int:
        """The refusals of `day` for any of `reasons`."""


# --- Local rules ---------------------------------------------------------------------------------

# Phrases that address the model instead of describing a person. Written for the four languages
# of the app; matched on text without accents' case or invisible characters. A partner described
# as someone who "ignores rules" stays possible: only the order to forget one's own is refused.
_INSTRUCTION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(previous|prior|above|earlier|"
        r"all|your|the|any)\b.{0,20}\b(instructions?|rules?|prompts?|guidelines?|restrictions?)\b",
        r"\b(system|developer|hidden)\s+(prompt|message|instructions?)\b",
        r"\b(reveal|show|print|repeat|leak)\b.{0,25}\b(prompt|instructions)\b",
        r"\b(jailbreak|jail-break|dan mode|developer mode|do anything now)\b",
        r"\bpretend\b.{0,30}\b(no|without)\b.{0,15}\b(rules?|limits?|restrictions?|filters?)\b",
        r"\byou\s+(have|are)\s+no\s+(rules|restrictions|limits|filters)\b",
        r"\[/?(inst|sys)\]|<\|[a-z_]+\|>|^\s*#{1,3}\s*(system|assistant)\b|\brole\s*:\s*system\b",
        # German.
        r"\b(ignoriere|vergiss|missachte|umgehe)\b.{0,30}\b(anweisungen|regeln|vorgaben|"
        r"einschränkungen)\b",
        r"\b(system-?prompt|systemnachricht)\b",
        # French.
        r"\b(ignore|oublie|ignorez|oubliez|contourne)\b.{0,30}\b(instructions|règles|regles|"
        r"consignes|restrictions)\b",
        # Italian.
        r"\b(ignora|dimentica|ignorate|aggira)\b.{0,30}\b(istruzioni|regole|restrizioni)\b",
    )
)

_LINK = re.compile(
    r"https?://|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|app|me|ly|co|ch|de|fr|it|at|eu|info|"
    r"xyz|ru|cn)\b/?",
    re.IGNORECASE,
)
_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[a-z]{2,}", re.IGNORECASE)
_HANDLE = re.compile(r"(?<![\w.])@[a-z0-9_.]{3,}", re.IGNORECASE)
# A phone number: a plus and seven digits or more, or three groups of digits.
_PHONE = re.compile(r"\+\d[\d\s().-]{6,}\d|\b\d{3,4}[\s.-]\d{2,4}[\s.-]\d{2,4}(?:[\s.-]\d{2,4})?\b")
_INVISIBLE = dict.fromkeys(map(ord, "​‌‍⁠﻿­"))


def _plain(text: str) -> str:
    """The text as the rules read it: compatibility forms folded, invisible characters gone, so
    a letter in a look-alike alphabet or a zero-width space does not hide a phrase."""
    return unicodedata.normalize("NFKC", text).translate(_INVISIBLE)


def local_problem(text: str) -> str | None:
    """The code of the first rule the text breaks, or None."""
    plain = _plain(text)
    if any(pattern.search(plain) for pattern in _INSTRUCTION_PATTERNS):
        return INSTRUCTIONS
    if _EMAIL.search(plain) or _HANDLE.search(plain) or _PHONE.search(plain):
        return CONTACT
    if _LINK.search(plain):
        return LINK
    return None


# --- The guard -----------------------------------------------------------------------------------


class TextGuard:
    """What services call before they store free text a learner wrote."""

    def __init__(
        self,
        *,
        moderator: Moderator,
        attempts: AttemptLog,
        clock: Callable[[], dt.datetime],
        limit: int = ATTEMPTS_PER_DAY,
    ) -> None:
        self._moderator = moderator
        self._attempts = attempts
        self._clock = clock
        self._limit = limit

    def check(self, user_id: UUID, texts: Sequence[str]) -> None:
        """Returns when every text is fine. Raises `ModerationError`: with the reason a text was
        refused, `moderation_limit` when the learner has tried too often today, and
        `moderation_unavailable` when the provider could not be asked."""
        written = [text.strip() for text in texts if text.strip()]
        if not written:
            return
        day = self._clock().date()
        if self._attempts.count(user_id, day, ATTEMPT_REASONS) >= self._limit:
            raise ModerationError(LIMIT)
        for text in written:
            if (problem := local_problem(text)) is not None:
                self._refuse(user_id, day, problem)
        try:
            verdict = self._moderator.check(written, Charge(user_id, Feature.MODERATION))
        except ModeratorError as error:
            raise ModerationError(UNAVAILABLE) from error
        if verdict.flagged:
            self._refuse(user_id, day, UNSAFE)

    def _refuse(self, user_id: UUID, day: dt.date, reason: str) -> None:
        self._attempts.add(user_id, day, reason)
        raise ModerationError(reason)


class Screen(Protocol):
    """The part of the guard other services need, so they can be tried with a stand-in."""

    def check(self, user_id: UUID, texts: Sequence[str]) -> None: ...
