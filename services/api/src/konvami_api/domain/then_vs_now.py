"""Then vs Now (spec §7 feature 7, §6.15): the learner hears themselves from their first weeks
next to a recent conversation of the same kind.

Nothing is measured. Two recordings of the same learner, weeks apart, say more than a score
that would have to be invented; the app only picks the pair and plays it.
"""

import datetime as dt
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from konvami_api.domain.conversations import Conversation, ConversationService
from konvami_api.domain.recordings import RecordingService

# A pair is shown only when the two conversations began at least this far apart: a few days of
# practice change too little to hear.
MIN_GAP = dt.timedelta(days=14)
# How many recorded conversations are opened (their turns read) at each end to find a pair.
MAX_OPENED = 8
# How many conversations are looked at in all at each end: a learner who switched recordings off
# for a long time has many without audio, and each look is a read.
MAX_LOOKED_AT = 40
# The oldest conversation is at the end of the newest-first list, so the list is read to its end;
# this many pages (of `_PAGE`) is a learner's whole history many times over.
_MAX_PAGES = 40
_PAGE = 50
_WEEK = dt.timedelta(days=7)


class ThenVsNowStatus(StrEnum):
    # The learner does not keep recordings (6.7).
    OFF = "off"
    # They keep them, but no recorded conversation of theirs exists yet.
    NONE = "none"
    # Recorded conversations exist but none of the same kind is far enough from the first.
    NOT_YET = "not_yet"
    READY = "ready"


@dataclass(frozen=True)
class ThenVsNow:
    status: ThenVsNowStatus
    # The two conversations, whose transcripts the app reads; both None unless `ready`.
    then: Conversation | None = None
    now: Conversation | None = None
    # Whole weeks between their starts; 0 unless `ready`.
    weeks_apart: int = 0


def _kind(conversation: Conversation) -> str | None:
    """Conversations are alike when both are free talk, or both are the same role-play."""
    return conversation.scenario


class ThenVsNowService:
    def __init__(self, *, conversations: ConversationService, recordings: RecordingService) -> None:
        self._conversations = conversations
        self._recordings = recordings

    def compare(self, user_id: UUID) -> ThenVsNow:
        if not self._recordings.kept(user_id):
            return ThenVsNow(ThenVsNowStatus.OFF)
        history = self._history(user_id)
        opened: dict[str, bool] = {}

        def recorded(conversation: Conversation) -> bool:
            if conversation.id not in opened:
                turns = self._conversations.turns(conversation.id)
                opened[conversation.id] = any(
                    turn.speaker == "learner" and turn.audio is not None for turn in turns
                )
            return opened[conversation.id]

        oldest = _first_recorded(history, recorded)
        if not oldest:
            return ThenVsNow(ThenVsNowStatus.NONE)
        newest = _first_recorded(reversed(history), recorded)
        for then in oldest:
            now = next(
                (
                    candidate
                    for candidate in newest
                    if _kind(candidate) == _kind(then)
                    and candidate.started_at - then.started_at >= MIN_GAP
                ),
                None,
            )
            if now is not None:
                return ThenVsNow(
                    ThenVsNowStatus.READY, then, now, (now.started_at - then.started_at) // _WEEK
                )
        return ThenVsNow(ThenVsNowStatus.NOT_YET)

    def _history(self, user_id: UUID) -> list[Conversation]:
        """The learner's conversations that count, oldest first."""
        found: list[Conversation] = []
        before: dt.datetime | None = None
        for _ in range(_MAX_PAGES):
            page = self._conversations.listed(user_id, limit=_PAGE, before=before)
            # A review conversation is built around words, not a topic worth hearing again.
            found.extend(c for c in page.conversations if not c.review)
            if page.next is None:
                break
            before = page.next
        found.reverse()
        return found


def _first_recorded(
    conversations: Iterable[Conversation], recorded: Callable[[Conversation], bool]
) -> list[Conversation]:
    """The first `MAX_OPENED` conversations in the order given that hold the learner's voice,
    looking at no more than `MAX_LOOKED_AT`."""
    picked: list[Conversation] = []
    for looked_at, conversation in enumerate(conversations):
        if len(picked) == MAX_OPENED or looked_at == MAX_LOOKED_AT:
            break
        if recorded(conversation):
            picked.append(conversation)
    return picked
