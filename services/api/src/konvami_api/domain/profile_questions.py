"""Progressive profiling (spec §6.1.1 step 6, §6.1.2): a question about a setting, asked at the
moment it becomes relevant instead of in onboarding.

The server decides which question is due and applies the answer; the app only shows it, in a
small card on Today that can be dismissed. Three questions exist:

- `recordings`, after the first conversation: "Shall I keep your audio so you can hear it again?"
- `memory`, once a partner has written down a first memory: "Shall your partners remember?"
- `weekly_habit`, after the second conversation: "How often would you like to practise?"

A question is asked until it is answered. Answering it applies the setting like the Profile does
(validated and logged). A question the learner dismisses comes back once, a week later, and then
never: asking a third time is nagging. At most one question is asked a day. A setting the learner
has already chosen in the Profile counts as answered.
"""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.memories import MemoryService
from konvami_api.domain.profile import (
    GLOBAL_SCOPE,
    MEMORY_ENABLED,
    RECORDINGS_KEPT,
    WEEKLY_HABIT,
    Change,
    Origin,
    Profile,
    ProfileService,
    Source,
)
from konvami_api.domain.recordings import RecordingService

# Conversations before the questions that need some experience of the app.
CONVERSATIONS_BEFORE_RECORDINGS = 1
CONVERSATIONS_BEFORE_HABIT = 2
# A dismissed question is asked once more after this, and a second dismissal is final.
SNOOZE = dt.timedelta(days=7)
MAX_DISMISSALS = 2
# At most one question a day, however many are due.
MIN_GAP = dt.timedelta(days=1)

RECORDINGS = "recordings"
MEMORY = "memory"
HABIT = "weekly_habit"

# The answers to the weekly habit question, as (days, minutes) of practice.
HABIT_OPTIONS: dict[str, tuple[int, int]] = {
    "light": (2, 15),
    "steady": (3, 20),
    "daily": (5, 20),
}


@dataclass(frozen=True)
class Question:
    id: str
    # The answers the app offers, by id; it has the words for each.
    options: tuple[str, ...]


QUESTIONS: dict[str, Question] = {
    RECORDINGS: Question(RECORDINGS, ("keep", "stop")),
    MEMORY: Question(MEMORY, ("remember", "forget")),
    HABIT: Question(HABIT, tuple(HABIT_OPTIONS)),
}


class QuestionStatus(StrEnum):
    ANSWERED = "answered"
    DISMISSED = "dismissed"


@dataclass(frozen=True)
class QuestionState:
    status: QuestionStatus
    dismissals: int
    at: dt.datetime


class QuestionRepository(Protocol):
    def states(self, user_id: UUID) -> dict[str, QuestionState]:
        """What became of each question the learner was asked, by question id."""
        ...

    def answered(self, user_id: UUID, question: str, at: dt.datetime) -> None: ...

    def dismissed(self, user_id: UUID, question: str, at: dt.datetime) -> None:
        """Counts one more dismissal."""


class QuestionError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ProfileQuestionService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        recordings: RecordingService,
        memories: MemoryService,
        conversations: ConversationService,
        repository: QuestionRepository,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._recordings = recordings
        self._memories = memories
        self._conversations = conversations
        self._repository = repository
        self._clock = clock

    def next(self, user_id: UUID) -> Question | None:
        """The question to ask now, or None."""
        now = self._clock()
        states = self._repository.states(user_id)
        if any(now - state.at < MIN_GAP for state in states.values()):
            return None
        profile = self._profiles.get(user_id)
        candidates = [
            question
            for question in QUESTIONS.values()
            if not _settled(question.id, profile, states.get(question.id), now)
        ]
        if not candidates:
            return None
        conversations = self._conversations.activity(user_id, None, now).conversations
        for question in candidates:
            if self._relevant(question.id, user_id, conversations):
                return question
        return None

    def _relevant(self, question: str, user_id: UUID, conversations: int) -> bool:
        if question == RECORDINGS:
            return conversations >= CONVERSATIONS_BEFORE_RECORDINGS
        if question == MEMORY:
            return bool(self._memories.view(user_id).memories)
        return conversations >= CONVERSATIONS_BEFORE_HABIT

    def answer(self, user_id: UUID, question: str, option: str) -> None:
        """Applies the learner's answer to the setting and records the question as answered.
        Raises `QuestionError` for a question or an answer that does not exist, and
        `ProfileError` when the setting cannot be changed."""
        asked = QUESTIONS.get(question)
        if asked is None:
            raise QuestionError("not_found")
        if option not in asked.options:
            raise QuestionError("invalid_option")
        if question == RECORDINGS:
            self._recordings.configure(user_id, kept=option == "keep")
        elif question == MEMORY:
            self._memories.configure(user_id, enabled=option == "remember")
        else:
            days, minutes = HABIT_OPTIONS[option]
            self._profiles.apply(
                user_id,
                [Change(WEEKLY_HABIT, {"days": days, "minutes": minutes})],
                source=Source.ASKED,
                origin=Origin.FORM,
            )
        self._repository.answered(user_id, question, self._clock())

    def dismiss(self, user_id: UUID, question: str) -> None:
        if question not in QUESTIONS:
            raise QuestionError("not_found")
        self._repository.dismissed(user_id, question, self._clock())


def _chosen(question: str, profile: Profile) -> bool:
    """Whether the learner already chose this setting themselves, in the Profile."""
    scope = profile.target_language
    if question == RECORDINGS:
        return (GLOBAL_SCOPE, RECORDINGS_KEPT) in profile.fields
    if question == MEMORY:
        return (GLOBAL_SCOPE, MEMORY_ENABLED) in profile.fields
    return scope is None or (scope, WEEKLY_HABIT) in profile.fields


def _settled(
    question: str, profile: Profile, state: QuestionState | None, now: dt.datetime
) -> bool:
    """Whether the question is not to be asked now: answered, chosen elsewhere, or dismissed
    too recently or too often."""
    if _chosen(question, profile):
        return True
    if state is None:
        return False
    if state.status is QuestionStatus.ANSWERED or state.dismissals >= MAX_DISMISSALS:
        return True
    return now - state.at < SNOOZE
