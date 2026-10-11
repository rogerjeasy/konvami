"""Practice conversations as the learner meets them afterwards: the list in the library, one
transcript, and what they add up to (minutes, the week, the streak).

A conversation is a practice call. It counts, in the list and in the numbers, once it has ended
and the learner said something in it: a call that was opened and closed again is not practice.
"""

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Protocol
from uuid import UUID

from konvami_api.domain.live_call import Turn
from konvami_api.domain.personas import Persona, PersonaService

PAGE_DEFAULT = 20
PAGE_MAX = 50
_WEEK = 7


@dataclass(frozen=True)
class Conversation:
    # The voice call's id.
    id: str
    # None once the partner has been removed.
    persona_id: UUID | None
    started_at: dt.datetime
    # None while the call runs, and for the moment after it in which it is being saved.
    ended_at: dt.datetime | None
    # How long it lasted; 0 until it has ended.
    seconds: int
    learner_turns: int
    # Filled in by `ConversationService`; a repository leaves it out.
    partner: Persona | None = None

    @property
    def counts(self) -> bool:
        """Whether this call is practice: it has ended and the learner said something in it."""
        return self.ended_at is not None and self.learner_turns > 0


@dataclass(frozen=True)
class ConversationPage:
    conversations: tuple[Conversation, ...]
    # Pass as `before` to read the next page; None on the last one.
    next: dt.datetime | None


@dataclass(frozen=True)
class Transcript:
    conversation: Conversation
    turns: tuple[Turn, ...]


@dataclass(frozen=True)
class PartnerHistory:
    conversations: int
    last_at: dt.datetime


@dataclass(frozen=True)
class DayActivity:
    day: dt.date
    seconds: int
    conversations: int


@dataclass(frozen=True)
class ActivityDays:
    """The days a learner practised on, in their own time zone."""

    # The learner's date now.
    today: dt.date
    days: tuple[DayActivity, ...]


@dataclass(frozen=True)
class Activity:
    today: dt.date
    # Days in a row with practice, ending today or, while today is still open, yesterday.
    streak_days: int
    practised_today: bool
    today_seconds: int
    week_seconds: int
    # Monday to Sunday of the week that holds `today`.
    week: tuple[DayActivity, ...]
    # Everything so far.
    conversations: int
    seconds: int


class ConversationError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ConversationRepository(Protocol):
    def listed(self, user_id: UUID, limit: int, before: dt.datetime | None) -> list[Conversation]:
        """The learner's conversations that count, newest first, started before `before`."""

    def get(self, user_id: UUID, call_id: str) -> Conversation | None:
        """One practice call of this learner, whether or not it counts yet."""

    def turns(self, call_id: str) -> list[Turn]: ...

    def partner_history(self, user_id: UUID) -> dict[UUID, PartnerHistory]:
        """Per partner: how many conversations count, and when the last one started."""

    def days(self, user_id: UUID, timezone: str | None, now: dt.datetime) -> ActivityDays:
        """The conversations that count, added up per day of the learner's calendar. An unknown
        or missing time zone means UTC."""

    def longest(self, user_id: UUID) -> int:
        """The seconds of the longest conversation that counts; 0 without one."""


def summarise(activity: ActivityDays) -> Activity:
    today = activity.today
    by_day = {day.day: day for day in activity.days}

    # Today not practised yet does not break a streak: the day is not over.
    day = today if today in by_day else today - dt.timedelta(days=1)
    streak = 0
    while day in by_day:
        streak += 1
        day -= dt.timedelta(days=1)

    monday = today - dt.timedelta(days=today.weekday())
    week = tuple(
        by_day.get(day, DayActivity(day, 0, 0))
        for day in (monday + dt.timedelta(days=offset) for offset in range(_WEEK))
    )
    return Activity(
        today=today,
        streak_days=streak,
        practised_today=today in by_day,
        today_seconds=by_day[today].seconds if today in by_day else 0,
        week_seconds=sum(day.seconds for day in week),
        week=week,
        conversations=sum(day.conversations for day in activity.days),
        seconds=sum(day.seconds for day in activity.days),
    )


class ConversationService:
    def __init__(self, repository: ConversationRepository, personas: PersonaService) -> None:
        self._repository = repository
        self._personas = personas

    def _with_partners(
        self, user_id: UUID, conversations: list[Conversation]
    ) -> tuple[Conversation, ...]:
        if not conversations:
            # Nothing to attach a partner to: the partners need not be read.
            return ()
        partners = {persona.id: persona for persona in self._personas.partners(user_id)}
        return tuple(
            replace(conversation, partner=partners.get(conversation.persona_id))
            if conversation.persona_id
            else conversation
            for conversation in conversations
        )

    def listed(
        self, user_id: UUID, *, limit: int = PAGE_DEFAULT, before: dt.datetime | None = None
    ) -> ConversationPage:
        size = min(max(limit, 1), PAGE_MAX)
        # One more than asked for shows whether another page follows.
        found = self._repository.listed(user_id, size + 1, before)
        page = found[:size]
        return ConversationPage(
            conversations=self._with_partners(user_id, page),
            next=page[-1].started_at if len(found) > size else None,
        )

    def get(self, user_id: UUID, call_id: str) -> Conversation:
        conversation = self._repository.get(user_id, call_id)
        if conversation is None:
            raise ConversationError("not_found")
        return self._with_partners(user_id, [conversation])[0]

    def transcript(self, user_id: UUID, call_id: str) -> Transcript:
        conversation = self.get(user_id, call_id)
        return Transcript(conversation, tuple(self._repository.turns(call_id)))

    def partner_history(self, user_id: UUID) -> Mapping[UUID, PartnerHistory]:
        return self._repository.partner_history(user_id)

    def activity(self, user_id: UUID, timezone: str | None, now: dt.datetime) -> Activity:
        return summarise(self._repository.days(user_id, timezone, now))

    def days(self, user_id: UUID, timezone: str | None, now: dt.datetime) -> ActivityDays:
        """Every day the learner practised on, for what `summarise` leaves out: earlier weeks,
        the longest streak."""
        return self._repository.days(user_id, timezone, now)

    def longest_seconds(self, user_id: UUID) -> int:
        return self._repository.longest(user_id)
