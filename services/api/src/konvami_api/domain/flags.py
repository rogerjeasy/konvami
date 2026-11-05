"""Flagging an AI turn or a correction (spec §6.21.3, §16.1).

Every line a partner said and every correction of a report can be reported with one tap: it is
offensive or unsafe, wrong, or (a correction only) not what the learner said. Flags feed the
owner's review queue and the evaluation sets. A learner flags an item once; flagging it again
changes the reason and puts it back in the queue.

The text of the item is copied into the flag when it is made, so the queue can be read after the
conversation is deleted, and so the owner sees exactly what the learner saw. Nothing else of the
conversation reaches the queue.
"""

import datetime as dt
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID, uuid4

from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.reports import ReportService

type FlagKind = Literal["turn", "correction"]
type FlagReason = Literal["offensive", "wrong", "not_said", "other"]
type FlagStatus = Literal["open", "resolved", "dismissed"]

# What each kind can be reported for. "I didn't say that" is about the learner's own words, which
# a partner's line does not quote.
REASONS: dict[FlagKind, frozenset[FlagReason]] = {
    "turn": frozenset({"offensive", "wrong", "other"}),
    "correction": frozenset({"offensive", "wrong", "not_said", "other"}),
}
# A note is a sentence or two; the limit also keeps a queue row readable.
MAX_NOTE_LENGTH = 500
# Flags a learner can make in a day; more than that is not reporting but flooding the queue.
MAX_FLAGS_PER_DAY = 50
# Rows of the owner's queue in one answer.
QUEUE_LIMIT = 100


@dataclass(frozen=True)
class Flag:
    id: UUID
    user_id: UUID
    call_id: str
    kind: FlagKind
    # Which turn of the transcript, or which correction of the report, counted from 0.
    index: int
    reason: FlagReason
    note: str | None
    # The flagged text: the partner's line, or "what the learner said → what it was put right as".
    excerpt: str
    status: FlagStatus
    flagged_at: dt.datetime
    resolved_at: dt.datetime | None = None


class FlagError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class FlagRepository(Protocol):
    def save(self, flag: Flag) -> Flag:
        """Stores the flag, or, when the learner flagged this item already, changes that one's
        reason, note and text and opens it again. Returns what is stored."""

    def made_since(self, user_id: UUID, since: dt.datetime) -> int:
        """How many flags the learner made from `since` on."""

    def of_conversation(self, user_id: UUID, call_id: str) -> list[Flag]:
        """The learner's flags in one conversation."""

    def queue(self, status: FlagStatus | None, limit: int) -> list[Flag]:
        """Flags of every learner with `status` (all when None), newest first."""

    def resolve(self, flag_id: UUID, status: FlagStatus, at: dt.datetime) -> Flag | None:
        """Sets the flag's status; None when there is no such flag."""


class FlagService:
    def __init__(
        self,
        *,
        conversations: ConversationService,
        reports: ReportService,
        repository: FlagRepository,
        owners: frozenset[UUID],
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._conversations = conversations
        self._reports = reports
        self._repository = repository
        self._owners = owners
        self._clock = clock
        self._new_id = new_id

    def flag(
        self,
        user_id: UUID,
        call_id: str,
        kind: FlagKind,
        index: int,
        reason: FlagReason,
        note: str | None = None,
    ) -> Flag:
        """Reports one item of the learner's conversation. Raises `ConversationError` for a
        conversation that is not theirs, and `FlagError`: `invalid_value` for a reason the kind
        cannot have or a note that is too long, `not_found` for an item that is not there (a
        learner's turn, or a correction the report does not have) and `flag_limit`."""
        if reason not in REASONS[kind]:
            raise FlagError("invalid_value")
        text = (note or "").strip() or None
        if text is not None and len(text) > MAX_NOTE_LENGTH:
            raise FlagError("invalid_value")
        excerpt = self._excerpt(user_id, call_id, kind, index)
        now = self._clock()
        if self._repository.made_since(user_id, now - dt.timedelta(days=1)) >= MAX_FLAGS_PER_DAY:
            raise FlagError("flag_limit")
        return self._repository.save(
            Flag(
                id=self._new_id(),
                user_id=user_id,
                call_id=call_id,
                kind=kind,
                index=index,
                reason=reason,
                note=text,
                excerpt=excerpt,
                status="open",
                flagged_at=now,
            )
        )

    def _excerpt(self, user_id: UUID, call_id: str, kind: FlagKind, index: int) -> str:
        if kind == "turn":
            turns = self._conversations.transcript(user_id, call_id).turns
            if not 0 <= index < len(turns) or turns[index].speaker != "persona":
                raise FlagError("not_found")
            return turns[index].text
        state = self._reports.view(user_id, call_id)
        mistakes = state.report.mistakes if state.report else ()
        if not 0 <= index < len(mistakes):
            raise FlagError("not_found")
        mistake = mistakes[index]
        return f"{mistake.original} → {mistake.corrected}"

    def of_conversation(self, user_id: UUID, call_id: str) -> list[Flag]:
        """What the learner flagged in a conversation. Raises `ConversationError` for one that
        is not theirs."""
        self._conversations.get(user_id, call_id)
        return self._repository.of_conversation(user_id, call_id)

    def is_owner(self, user_id: UUID) -> bool:
        return user_id in self._owners

    def queue(self, user_id: UUID, status: FlagStatus | None = "open") -> Sequence[Flag]:
        """The review queue. Raises `FlagError("not_owner")`."""
        self._require_owner(user_id)
        return self._repository.queue(status, QUEUE_LIMIT)

    def resolve(self, user_id: UUID, flag_id: UUID, status: FlagStatus) -> Flag:
        """Closes a flag as resolved (acted on) or dismissed (nothing wrong), or opens it again.
        Raises `FlagError`: `not_owner`, `not_found`."""
        self._require_owner(user_id)
        flag = self._repository.resolve(flag_id, status, self._clock())
        if flag is None:
            raise FlagError("not_found")
        return flag

    def _require_owner(self, user_id: UUID) -> None:
        if not self.is_owner(user_id):
            raise FlagError("not_owner")
