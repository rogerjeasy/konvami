"""Flashcards (spec §6.7): the words and corrections of a learner's own conversations, brought
back just before they would be forgotten.

A card is made from a Session Report, by the learner: a word with its meaning and the sentence
it came from, or a correction that asks for the right sentence. The server reads the content
from the stored report, so a card never holds text the app made up. `fsrs.py` decides when a
card comes back; this module keeps the cards and applies each review.
"""

import datetime as dt
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Literal, Protocol
from uuid import UUID, uuid4

from konvami_api.domain import fsrs
from konvami_api.domain.fsrs import Memory, Rating
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import Report, ReportService, words_in

# A word or phrase to remember, or a sentence the learner said and how it is right.
Kind = Literal["word", "correction"]

# A learner's cards per language. A bound on storage; nobody reviews this many.
MAX_CARDS = 1000
# A card that was not known comes back this soon, in the same sitting (FSRS's relearning step).
AGAIN_DELAY = dt.timedelta(minutes=10)
PAGE_DEFAULT = 50
PAGE_MAX = 100
# How many cards one review session holds.
QUEUE_DEFAULT = 20
QUEUE_MAX = 50


@dataclass(frozen=True)
class Card:
    id: UUID
    kind: Kind
    # A word: the word, and what it means. A correction: what the learner said, and how it is
    # right.
    front: str
    back: str
    # A word: the sentence it came from, if any. A correction: why.
    note: str | None
    # The language `back` (a word) or `note` (a correction) is written in.
    explained_in: str
    # The conversation it came from; None once that is gone.
    source_call_id: str | None
    created_at: dt.datetime
    due_at: dt.datetime
    # None until the first review.
    reviewed_at: dt.datetime | None
    memory: Memory | None
    reviews: int
    # How often the card was forgotten after it had been learned.
    lapses: int


@dataclass(frozen=True)
class Deck:
    cards: tuple[Card, ...]
    # Pass as `before` to read the next page; None on the last one.
    next: dt.datetime | None
    # Of the whole deck, not of this page.
    total: int
    due: int


@dataclass(frozen=True)
class QueueItem:
    card: Card
    # How long until the card would come back, for each rating it could get now.
    due_in: Mapping[Rating, dt.timedelta]


@dataclass(frozen=True)
class Queue:
    cards: tuple[QueueItem, ...]
    # Every card that is due, of which `cards` are the first.
    due: int


@dataclass(frozen=True)
class Saved:
    """Which words and mistakes of a report the learner has as cards, in the report's order."""

    words: tuple[bool, ...]
    mistakes: tuple[bool, ...]


class CardError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class CardRepository(Protocol):
    def add(self, user_id: UUID, language: str, key: str, card: Card, limit: int) -> bool:
        """Stores a new card. Not when the learner has a card of that kind with that key in the
        language already, nor when they have `limit` cards in it: then nothing is stored and
        the answer is False."""

    def by_key(self, user_id: UUID, language: str, kind: Kind, key: str) -> Card | None: ...

    def get(self, user_id: UUID, card_id: UUID) -> Card | None: ...

    def listed(
        self, user_id: UUID, language: str, limit: int, before: dt.datetime | None
    ) -> list[Card]:
        """The learner's cards in a language, newest first, made before `before`."""

    def due(self, user_id: UUID, language: str, now: dt.datetime, limit: int) -> list[Card]:
        """The cards due at `now`, the one that has waited longest first."""

    def counts(self, user_id: UUID, language: str, now: dt.datetime) -> tuple[int, int]:
        """How many cards the learner has in a language, and how many of them are due."""

    def reviewed(self, user_id: UUID, card: Card, rating: Rating, reviews_before: int) -> bool:
        """Stores a card as a review left it and logs the review. Only when the card still has
        `reviews_before` reviews: of two reviews at once, one is stored and one gets False."""

    def remove(self, user_id: UUID, card_id: UUID) -> bool: ...

    def known(
        self, user_id: UUID, language: str, keys: Sequence[tuple[Kind, str]]
    ) -> set[tuple[str, str]]:
        """Those of the given (kind, key) pairs the learner has a card for."""


def card_key(front: str) -> str:
    """What makes two cards the same: their words, whatever the capitals and punctuation."""
    return " ".join(words_in(front))


def _reviewed(card: Card, rating: Rating, now: dt.datetime) -> Card:
    """The card as a review at `now` leaves it."""
    days = (now - card.reviewed_at).days if card.reviewed_at else 0
    memory = fsrs.review(card.memory, days, rating)
    wait = AGAIN_DELAY if rating == "again" else dt.timedelta(days=fsrs.interval_days(memory))
    # Not knowing a new card, or one seen earlier today, is not forgetting it.
    forgotten = rating == "again" and card.memory is not None and days >= 1
    return replace(
        card,
        memory=memory,
        reviewed_at=now,
        due_at=now + wait,
        reviews=card.reviews + 1,
        lapses=card.lapses + (1 if forgotten else 0),
    )


class CardService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        reports: ReportService,
        repository: CardRepository,
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._profiles = profiles
        self._reports = reports
        self._repository = repository
        self._clock = clock
        self._new_id = new_id

    def _language(self, user_id: UUID) -> str:
        """The language whose deck the learner sees: the one they are learning now."""
        return self._profiles.get(user_id).target_language or ""

    def save(self, user_id: UUID, call_id: str, kind: Kind, index: int) -> Card:
        """Makes a card of the word, or the correction, at `index` in a conversation's report.
        Saving what is already a card answers with that card."""
        state = self._reports.view(user_id, call_id)
        report = state.report
        if state.status != "ready" or report is None:
            raise CardError("no_report")
        front, back, note = self._content(report, kind, index)
        key = card_key(front)
        existing = self._repository.by_key(user_id, report.target, kind, key)
        if existing is not None:
            return existing
        now = self._clock()
        card = Card(
            id=self._new_id(),
            kind=kind,
            front=front,
            back=back,
            note=note,
            explained_in=report.language,
            source_call_id=call_id,
            created_at=now,
            # A new card is learned at once: it is due from the moment it is made.
            due_at=now,
            reviewed_at=None,
            memory=None,
            reviews=0,
            lapses=0,
        )
        if self._repository.add(user_id, report.target, key, card, MAX_CARDS):
            return card
        # Not stored: another request made the same card meanwhile, or the deck is full.
        existing = self._repository.by_key(user_id, report.target, kind, key)
        if existing is None:
            raise CardError("too_many")
        return existing

    def _content(self, report: Report, kind: Kind, index: int) -> tuple[str, str, str | None]:
        if kind == "word":
            if not 0 <= index < len(report.words):
                raise CardError("no_such_item")
            word = report.words[index]
            return word.text, word.meaning, word.example
        if not 0 <= index < len(report.mistakes):
            raise CardError("no_such_item")
        mistake = report.mistakes[index]
        if not mistake.certain:
            # A correction nobody could confirm is a hint; a card would teach it as a fact.
            raise CardError("not_certain")
        return mistake.original, mistake.corrected, mistake.explanation

    def deck(
        self, user_id: UUID, *, limit: int = PAGE_DEFAULT, before: dt.datetime | None = None
    ) -> Deck:
        language = self._language(user_id)
        size = min(max(limit, 1), PAGE_MAX)
        # One more than asked for shows whether another page follows.
        found = self._repository.listed(user_id, language, size + 1, before)
        page = found[:size]
        total, due = self._repository.counts(user_id, language, self._clock())
        return Deck(
            cards=tuple(page),
            next=page[-1].created_at if len(found) > size else None,
            total=total,
            due=due,
        )

    def due_count(self, user_id: UUID) -> int:
        return self._repository.counts(user_id, self._language(user_id), self._clock())[1]

    def queue(self, user_id: UUID, *, limit: int = QUEUE_DEFAULT) -> Queue:
        """The cards to review now, each with when it would come back for every rating."""
        language = self._language(user_id)
        now = self._clock()
        size = min(max(limit, 1), QUEUE_MAX)
        cards = self._repository.due(user_id, language, now, size)
        return Queue(
            cards=tuple(
                QueueItem(
                    card,
                    {rating: _reviewed(card, rating, now).due_at - now for rating in fsrs.RATINGS},
                )
                for card in cards
            ),
            due=self._repository.counts(user_id, language, now)[1],
        )

    def review(self, user_id: UUID, card_id: UUID, rating: Rating) -> Card:
        card = self._repository.get(user_id, card_id)
        if card is None:
            raise CardError("not_found")
        after = _reviewed(card, rating, self._clock())
        if not self._repository.reviewed(user_id, after, rating, card.reviews):
            # Another review of the same card was stored first (a rating tapped twice).
            raise CardError("conflict")
        return after

    def remove(self, user_id: UUID, card_id: UUID) -> None:
        if not self._repository.remove(user_id, card_id):
            raise CardError("not_found")

    def saved(self, user_id: UUID, report: Report) -> Saved:
        words = [("word", card_key(word.text)) for word in report.words]
        mistakes = [("correction", card_key(mistake.original)) for mistake in report.mistakes]
        known = self._repository.known(user_id, report.target, [*words, *mistakes])  # type: ignore[list-item]
        return Saved(
            words=tuple(pair in known for pair in words),
            mistakes=tuple(pair in known for pair in mistakes),
        )
