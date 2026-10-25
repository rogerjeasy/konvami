"""Voice review (spec §6.7): the learner answers a card out loud instead of turning it over.

A word card asks for the word from its meaning (and the sentence it came from, with a gap); a
correction card asks for the sentence as it is right. The answer is heard by the `Listener`,
which keeps mistakes, and compared word for word. A noun said without its article, or with
another one, is almost right: the word is known, its gender is not yet.

The answer suggests a rating; the learner still gives it, so a mishearing never moves a card on
its own.
"""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from konvami_api.domain.cards import Card, CardError, CardRepository
from konvami_api.domain.costs import Feature
from konvami_api.domain.fsrs import Rating
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import words_in
from konvami_api.domain.spoken import Listener, SpokenError, is_right, says

# Each answer is a short request to a paid model: a long review of every card twice stays below.
MAX_ANSWERS_PER_DAY = 300
# The articles a noun card can start with ("der Termin").
ARTICLES = frozenset({"der", "die", "das"})

# Right; the word without its article, or with another one; not the answer.
Outcome = Literal["right", "article", "wrong"]
_SUGGESTED: dict[Outcome, Rating] = {"right": "good", "article": "hard", "wrong": "again"}


@dataclass(frozen=True)
class Answered:
    # What the answer was heard as.
    heard: str
    outcome: Outcome
    # What was to be said: the word, or the sentence as it is right.
    expected: str
    # The rating the answer points to.
    suggested: Rating


class DailyAllowance(Protocol):
    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one more on `day` and returns True, unless the learner has reached `limit`.
        One step: requests arriving together cannot both take the last place."""


def expected_of(card: Card) -> str:
    return card.front if card.kind == "word" else card.back


def outcome_of(card: Card, heard: str) -> Outcome:
    if card.kind == "correction":
        return "right" if is_right(heard, card.front, card.back) else "wrong"
    expected = words_in(card.front)
    if says(heard, expected):
        return "right"
    if len(expected) > 1 and expected[0] in ARTICLES and says(heard, expected[1:]):
        return "article"
    return "wrong"


class VoiceReviewService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        cards: CardRepository,
        listener: Listener,
        allowance: DailyAllowance,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._cards = cards
        self._listener = listener
        self._allowance = allowance
        self._clock = clock

    def answer(
        self,
        user_id: UUID,
        card_id: UUID,
        audio: bytes,
        audio_format: str,
        seconds: float | None = None,
    ) -> Answered:
        """Hears an answer to a card; `seconds` is how long the recording plays, as the app
        measured it. Raises `CardError` (`not_found`, `invalid_value`, `consent_required`,
        `answer_limit`, `unavailable`)."""
        card = self._cards.get(user_id, card_id)
        if card is None:
            raise CardError("not_found")
        try:
            self._listener.ready(user_id, audio, audio_format)
            if not self._allowance.reserve(user_id, self._clock().date(), MAX_ANSWERS_PER_DAY):
                raise CardError("answer_limit")
            language = self._profiles.get(user_id).target_language or ""
            heard = self._listener.hear(
                user_id, language, audio, audio_format, seconds, Feature.VOICE_REVIEW
            )
        except SpokenError as error:
            raise CardError(error.code) from error
        outcome = outcome_of(card, heard)
        return Answered(heard, outcome, expected_of(card), _SUGGESTED[outcome])
