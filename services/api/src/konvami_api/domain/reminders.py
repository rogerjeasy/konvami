"""What the phone needs from the server to remind the learner (spec §6.18). Reminders are
scheduled on the device for the next seven days; most of them come from the week's plan, and
these two from here: the question a partner asks the day after an event the learner told them
about, and a word of the day from the learner's own saved words."""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

from konvami_api.domain.cards import Card, CardService
from konvami_api.domain.conversations import zone_of
from konvami_api.domain.memories import MemoryService

# How far ahead the phone schedules reminders.
DAYS_AHEAD = 7
# The saved words the word of the day takes turns among: the newest ones.
WORD_POOL = 100


@dataclass(frozen=True)
class FollowUp:
    # The day to ask on: the day after the event.
    day: dt.date
    # The question, in the learner's explanation language, as its partner asks it.
    text: str


@dataclass(frozen=True)
class DailyWord:
    day: dt.date
    card: Card


@dataclass(frozen=True)
class ReminderNotes:
    follow_ups: tuple[FollowUp, ...]
    words: tuple[DailyWord, ...]


class ReminderService:
    def __init__(
        self,
        *,
        memories: MemoryService,
        cards: CardService,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._memories = memories
        self._cards = cards
        self._clock = clock

    def notes(self, user_id: UUID, timezone: str | None) -> ReminderNotes:
        """What the next seven days, today's included, can remind of. `timezone` is the
        device's: the days are the learner's own."""
        today = self._clock().astimezone(zone_of(timezone)).date()
        days = [today + dt.timedelta(days=n) for n in range(DAYS_AHEAD)]
        return ReminderNotes(self._follow_ups(user_id, days), self._words(user_id, days))

    def _follow_ups(self, user_id: UUID, days: list[dt.date]) -> tuple[FollowUp, ...]:
        """The day after each event with a question, within the days; none while memory is
        off, as partners are then told nothing from before."""
        book = self._memories.view(user_id)
        if not book.enabled:
            return ()
        asks = [
            FollowUp(memory.day + dt.timedelta(days=1), memory.ask)
            for memory in book.memories
            if memory.kind == "event" and memory.day is not None and memory.ask
        ]
        return tuple(sorted((ask for ask in asks if ask.day in days), key=lambda a: a.day))

    def _words(self, user_id: UUID, days: list[dt.date]) -> tuple[DailyWord, ...]:
        """One saved word a day: the words take turns, by the day of the year, so a day keeps
        its word and two days in a row never share one while there are two words or more."""
        words = sorted(self._cards.words(user_id, WORD_POOL), key=lambda card: card.created_at)
        if not words:
            return ()
        return tuple(DailyWord(day, words[day.toordinal() % len(words)]) for day in days)
