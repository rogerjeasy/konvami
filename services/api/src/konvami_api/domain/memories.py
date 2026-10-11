"""Memory (spec §6.11): what a learner's partners know about them from earlier conversations.

After a practice conversation a text model reads it and writes down a few things worth knowing
next time: what the learner told about their life, what is coming up for them, what they like,
and what the partner told them. Before the next conversation the partner is told the ones that
matter now (`practice.py`). The learner can read, change and delete every one of them.

A memory is a short note in the learner's explanation language, with the learner as its subject
("Has a job interview at a logistics company"): it is shown to the learner as it is and given to
the partner as it is.
"""

import datetime as dt
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from typing import Literal, Protocol, TypedDict, Unpack, get_args
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.live_call import Turn
from konvami_api.domain.personas import Persona
from konvami_api.domain.profile import (
    AVOID_TOPICS,
    MEMORY_ENABLED,
    Change,
    Origin,
    ProfileService,
    Source,
    one_line,
)
from konvami_api.domain.reports import MIN_LEARNER_WORDS, measure, wording
from konvami_api.domain.text import (
    TextModel,
    TextModelError,
    TextTask,
    answer_list,
    answer_object,
)
from konvami_api.domain.voice import VoiceSessionRepository

# Something true of the learner; something on a day; something they like or do not; and what a
# partner and the learner share (spec §11.2). The last belongs to one partner, the others to all.
Kind = Literal["fact", "event", "preference", "relationship"]

# The most memories written down from one conversation: the few that matter, not a log.
MAX_PER_CALL = 5
TEXT_MAX = 200
# A learner's memories. A bound on storage and on what the writer is given to read; at it,
# nothing new is written down until the learner makes room.
MAX_MEMORIES = 300
# How many memories a partner is told before a conversation, and how many of them at most are
# things to ask about or things coming up: enough to know the learner, short enough to be used.
MAX_RECALLED = 20
MAX_FOLLOW_UPS = 3
MAX_COMING_UP = 3
# How long after its day an event is still worth opening a conversation with.
FOLLOW_UP_DAYS = 14
# How much a memory matters, from a passing detail to what shapes the learner's life.
IMPORTANCE = (1, 2, 3)


@dataclass(frozen=True)
class Memory:
    id: UUID
    kind: Kind
    text: str
    # The day an event is on; None for what has no day.
    day: dt.date | None
    importance: int
    # The partner a `relationship` memory belongs to; None for what every partner knows.
    persona_id: UUID | None
    # The conversation it came from; None once that is gone.
    source_call_id: str | None
    created_at: dt.datetime
    updated_at: dt.datetime


@dataclass(frozen=True)
class Recall:
    """What a partner knows from before, at the start of a conversation."""

    # What happened since the two last talked, the latest first: to be asked about.
    follow_ups: tuple[Memory, ...]
    # What is today or still to come, the soonest first.
    coming_up: tuple[Memory, ...]
    # The rest: what matters most first, then what is newest.
    notes: tuple[Memory, ...]


@dataclass(frozen=True)
class MemoryBook:
    """What the learner sees on "What my buddy knows about me" (spec §6.11)."""

    # Off: nothing is written down after a conversation and partners are told nothing from
    # before. What was written down stays until the learner deletes it.
    enabled: bool
    # Topics no partner brings up and nothing is remembered about, in the learner's words.
    avoid_topics: tuple[str, ...]
    # Newest first.
    memories: tuple[Memory, ...]


class MemoryChange(TypedDict, total=False):
    """What a learner may change about a memory. A key left out is not a change."""

    text: str
    day: dt.date | None


class MemoriesError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class MemoryRepository(Protocol):
    def claim(self, call_id: str, at: dt.datetime) -> bool:
        """A worker takes a call to write its memories down. Only one is ever told True for a
        call, until it is released; never for a call that does not exist."""

    def release(self, call_id: str) -> None:
        """The call could not be read: it may be claimed again."""

    def add(self, user_id: UUID, key: str, memory: Memory, limit: int) -> bool:
        """Stores a new memory. Not when the learner has one with that key already (for the
        same partner, or for all of them), nor when they have `limit` memories: then nothing
        is stored and the answer is False."""

    def replace(self, user_id: UUID, key: str, memory: Memory) -> bool:
        """Stores the learner's memory with this id as it is now. False, and nothing stored,
        when they have no such memory, or another one with that key already."""

    def listed(self, user_id: UUID) -> list[Memory]:
        """Everything remembered about a learner, newest first."""

    def get(self, user_id: UUID, memory_id: UUID) -> Memory | None: ...

    def remove(self, user_id: UUID, memory_id: UUID) -> bool: ...


def memory_key(text: str) -> str:
    """What makes two memories the same: their words, whatever the capitals and punctuation."""
    return wording(text)


# --- What the model answers ----------------------------------------------------------------------


class _Found(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Kind
    text: str
    day: str | None
    importance: int
    turn: int
    replaces: int | None


class _Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    memories: list[_Found]


_SCHEMA = answer_object(
    {
        "memories": answer_list(
            answer_object(
                {
                    "kind": {"type": "string", "enum": list(get_args(Kind))},
                    "text": {"type": "string"},
                    "day": {"type": ["string", "null"]},
                    "importance": {"type": "integer", "enum": list(IMPORTANCE)},
                    "turn": {"type": "integer"},
                    "replaces": {"type": ["integer", "null"]},
                }
            ),
            MAX_PER_CALL,
        )
    }
)


def _instructions(target: str, explanation: str) -> str:
    return f"""You keep the memory of a language-learning app in which a learner practises
{target} by talking with AI conversation partners. You read one conversation and write down what
a good friend would still know next time. You get the date of the conversation, the partner's
name, what is remembered already (`known`), what must not be remembered (`never_about`) and the
transcript, its turns numbered from 0.

Write at most {MAX_PER_CALL} memories, the most useful first. None is fine, and usual for small
talk. Each one is a short note in {explanation}, in one sentence, with the learner as its
unnamed subject ("Has a job interview at a logistics company", "Supports Bayern München"): never
"you", "I" or "the learner". Name the partner by their name.

`kind`:
- `fact`: something true of the learner's life for a while (where they live, their work,
  family, pets, what they are learning {target} for).
- `event`: something that happens or happened on a day (an interview, a trip, a visit, a
  birthday, an exam, a first day at work).
- `preference`: what they like, dislike or fear, and what they said they do not want to talk
  about. That they would rather not talk about something is always worth keeping.
- `relationship`: what belongs to these two and to nobody else: something the learner promised
  the partner (a photo, a recipe, to tell how it went), something from the partner's own life
  that the learner took an interest in, a joke they share.

`day`: for an `event`, the date of the event itself as YYYY-MM-DD, worked out from the date of
the conversation ("on Friday" is the next Friday, "yesterday" the day before). It is never the
date of the conversation just because the learner told it then. null when no day can be worked
out, and for every other kind. Do not write the date in the note as well.

`importance`: 3 for what shapes their life, 2 for what a friend would ask about again, 1 for a
passing detail.

`turn`: the number of the turn that says it. For a `fact`, an `event` or a `preference` it must
be one of the learner's own turns: what the partner says about their own life is never a fact
about the learner.

`known` lists what is remembered already. Do not write any of it down again, in the same or in
other words. When the conversation brings news about one of them, write that memory as it is
true now and give its `id` as `replaces`: how the interview went (it keeps its `day`), a plan
that moved to another day, a new home in place of the old one. Something new that follows from
it (the first day in the job they got) is a memory of its own. Otherwise `replaces` is null.

`never_about` lists topics the learner asked the app to leave alone, in their own words. Write
nothing down that touches one of them, however clearly it was said.

Write down only what the transcript says. Never guess, never conclude something from a mistake
in their {target}, and leave out how well they speak: that is not what this memory is for. Leave
out their health, their religion, their political views, their money and their love life unless
the learner clearly chose to tell about it."""


# --- Reading the model's answer -------------------------------------------------------------------


@dataclass(frozen=True)
class _Note:
    """A memory as the model found it and this module accepts it."""

    kind: Kind
    text: str
    day: dt.date | None
    importance: int
    # The number, in what the model was shown as known, of the memory this is news about.
    replaces: int | None


def _day(kind: Kind, answered: str | None) -> dt.date | None:
    if kind != "event" or not answered:
        return None
    try:
        return dt.date.fromisoformat(answered)
    except ValueError:
        return None


def _notes(found: Sequence[_Found], turns: Sequence[Turn], partner: Persona | None) -> list[_Note]:
    """What of the model's answer is kept. A model can put what the partner said about their
    own life down as a fact about the learner, which would then be told to every partner: the
    turn it names for such a memory has to be one of the learner's."""
    notes: list[_Note] = []
    for item in found:
        text = one_line(item.text)[:TEXT_MAX].strip()
        said = turns[item.turn] if 0 <= item.turn < len(turns) else None
        if said is None or not wording(text):
            continue
        if item.kind == "relationship":
            if partner is None:
                continue
        elif said.speaker != "learner":
            continue
        importance = min(max(item.importance, IMPORTANCE[0]), IMPORTANCE[-1])
        notes.append(_Note(item.kind, text, _day(item.kind, item.day), importance, item.replaces))
    return notes[:MAX_PER_CALL]


# --- The service ---------------------------------------------------------------------------------


class MemoryService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        conversations: ConversationService,
        sessions: VoiceSessionRepository,
        repository: MemoryRepository,
        text_model: TextModel,
        model: str,
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._profiles = profiles
        self._conversations = conversations
        self._sessions = sessions
        self._repository = repository
        self._text_model = text_model
        self._model = model
        self._clock = clock
        self._new_id = new_id

    def view(self, user_id: UUID) -> MemoryBook:
        profile = self._profiles.get(user_id)
        return MemoryBook(
            enabled=profile.memory_enabled,
            avoid_topics=profile.avoid_topics,
            memories=tuple(self._repository.listed(user_id)),
        )

    def configure(
        self,
        user_id: UUID,
        *,
        enabled: bool | None = None,
        avoid_topics: Sequence[str] | None = None,
    ) -> MemoryBook:
        """The learner turns memory on or off, or says what to leave alone; None leaves a
        setting as it is. Both live in the profile (spec §6.1.2), where every change is checked
        and logged. Raises `ProfileError`, and then changes nothing."""
        changes = [
            Change(field, value)
            for field, value in (
                (MEMORY_ENABLED, enabled),
                (AVOID_TOPICS, None if avoid_topics is None else list(avoid_topics)),
            )
            if value is not None
        ]
        if changes:
            self._profiles.apply(user_id, changes, source=Source.ASKED, origin=Origin.FORM)
        return self.view(user_id)

    def change(self, user_id: UUID, memory_id: UUID, **changes: Unpack[MemoryChange]) -> Memory:
        """The learner puts a memory right: its words, or the day of an event."""
        memory = self._repository.get(user_id, memory_id)
        if memory is None:
            raise MemoriesError("not_found")
        if "text" in changes:
            text = one_line(changes["text"])
            # Their own words are not cut for them: a note that is too long is refused.
            if not memory_key(text) or len(text) > TEXT_MAX:
                raise MemoriesError("invalid_value")
            memory = replace(memory, text=text)
        if "day" in changes:
            if changes["day"] is not None and memory.kind != "event":
                raise MemoriesError("invalid_value")
            memory = replace(memory, day=changes["day"])
        memory = replace(memory, updated_at=self._clock())
        if not self._repository.replace(user_id, memory_key(memory.text), memory):
            # It says what another memory says already, or was forgotten a moment ago.
            gone = self._repository.get(user_id, memory_id) is None
            raise MemoriesError("not_found" if gone else "duplicate")
        return memory

    def remove(self, user_id: UUID, memory_id: UUID) -> None:
        """Forgets a memory for good (spec §6.19: a real deletion)."""
        if not self._repository.remove(user_id, memory_id):
            raise MemoriesError("not_found")

    def _known(self, user_id: UUID, persona_id: UUID | None) -> list[Memory]:
        """What a partner may know: what every partner knows, and what is theirs."""
        return [
            memory
            for memory in self._repository.listed(user_id)
            if memory.persona_id in (None, persona_id)
        ]

    def recall(
        self, user_id: UUID, persona_id: UUID, today: dt.date, last_talked: dt.date | None
    ) -> Recall | None:
        """What a partner is told before a conversation on `today`; `last_talked` is the day of
        their last one, None before the first. None while memory is off."""
        if not self._profiles.get(user_id).memory_enabled:
            return None
        known = self._known(user_id, persona_id)
        # Oldest first, each with its day: the sorts below keep that order among equals.
        dated = [(memory.day, memory) for memory in reversed(known) if memory.day is not None]
        coming_up = [
            memory for day, memory in sorted(dated, key=lambda found: found[0]) if day >= today
        ][:MAX_COMING_UP]
        earliest = today - dt.timedelta(days=FOLLOW_UP_DAYS)
        follow_ups = [
            memory
            for day, memory in sorted(dated, key=lambda found: found[0], reverse=True)
            # Once the two have talked after it, it was asked about then.
            if earliest <= day < today and (last_talked is None or last_talked <= day)
        ][:MAX_FOLLOW_UPS]
        told = {memory.id for memory in (*coming_up, *follow_ups)}
        # `known` is newest first, and sorting keeps that order among equals.
        notes = sorted(
            (memory for memory in known if memory.id not in told),
            key=lambda memory: -memory.importance,
        )[: MAX_RECALLED - len(told)]
        return Recall(tuple(follow_ups), tuple(coming_up), tuple(notes))

    def after_call(self, user_id: UUID, call_id: str) -> None:
        """A practice conversation has ended. While memory is off it is taken at once, so that
        nobody reads it later: the worker can get to a conversation long after it (a report
        that could not be started and is asked for again), when memory may be on again. What
        counts is the learner's choice when they talked."""
        if not self._profiles.get(user_id).memory_enabled:
            self._repository.claim(call_id, self._clock())

    def write(self, call_id: str) -> None:
        """Writes down what a conversation told about the learner. Runs apart from any request,
        after the conversation's report, and once for a conversation."""
        if not self._model:
            return
        session = self._sessions.get(call_id)
        if session is None:
            return
        user_id = session.user_id
        transcript = self._conversations.transcript(user_id, call_id)
        turns = transcript.turns
        partner = transcript.conversation.partner
        # As for a report: too little was said to learn anything from it.
        if measure(turns).learner_words < MIN_LEARNER_WORDS:
            return
        # A second invocation for the same conversation (a report asked for again) finds it
        # taken: reading it twice would cost twice and write the same things down in other words.
        if not self._repository.claim(call_id, self._clock()):
            return
        profile = self._profiles.get(user_id)
        # Turned off since the conversation ended (see `after_call`): the conversation stays
        # taken, and is not read once memory is on again either.
        if not profile.memory_enabled:
            return

        catalog = self._profiles.catalog
        language = profile.target_language or ""
        explained_in = profile.value(language, "explanation_language") or "en"
        known = self._known(user_id, partner.id if partner else None)
        content = {
            # The server's date. Near midnight it can be a day off the learner's own.
            "date": session.started_at.strftime("%A, %Y-%m-%d"),
            "partner": partner.name if partner else None,
            "known": [
                {
                    "id": number,
                    "kind": memory.kind,
                    "text": memory.text,
                    "day": memory.day.isoformat() if memory.day else None,
                }
                for number, memory in enumerate(known)
            ],
            "never_about": list(profile.avoid_topics),
            "transcript": [
                {"turn": number, "speaker": turn.speaker, "text": turn.text}
                for number, turn in enumerate(turns)
            ],
        }
        task = TextTask(
            model=self._model,
            instructions=_instructions(
                catalog.english_name(language), catalog.english_name(explained_in)
            ),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="memories",
            answer_schema=_SCHEMA,
        )
        try:
            answer = _Answer.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            # Nothing was written down: a later invocation for this conversation may try again.
            self._repository.release(call_id)
            return
        self._keep(user_id, call_id, partner, known, _notes(answer.memories, turns, partner))

    def _keep(
        self,
        user_id: UUID,
        call_id: str,
        partner: Persona | None,
        known: Sequence[Memory],
        notes: Sequence[_Note],
    ) -> None:
        now = self._clock()
        for note in notes:
            key = memory_key(note.text)
            persona_id = partner.id if partner and note.kind == "relationship" else None
            old = (
                known[note.replaces]
                if note.replaces is not None and 0 <= note.replaces < len(known)
                else None
            )
            if old is not None:
                # Storage refuses news that only repeats another memory.
                self._repository.replace(
                    user_id,
                    key,
                    replace(
                        old,
                        kind=note.kind,
                        text=note.text,
                        day=note.day,
                        importance=note.importance,
                        persona_id=persona_id,
                        source_call_id=call_id,
                        updated_at=now,
                    ),
                )
                continue
            self._repository.add(
                user_id,
                key,
                Memory(
                    id=self._new_id(),
                    kind=note.kind,
                    text=note.text,
                    day=note.day,
                    importance=note.importance,
                    persona_id=persona_id,
                    source_call_id=call_id,
                    created_at=now,
                    updated_at=now,
                ),
                MAX_MEMORIES,
            )
