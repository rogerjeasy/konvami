"""Feedback from the learner (spec §6.21.4: an in-app feedback form, support).

A learner tells the owner about a bug, an idea or anything else, in their own words. The device
and app version are sent only when the learner chose to include them, so a bug report can be
reproduced without the app collecting anything unasked. The owner reads the inbox (the owner
accounts of 6.12) and marks a message done.
"""

import datetime as dt
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID, uuid4

type FeedbackCategory = Literal["bug", "idea", "other"]
type FeedbackStatus = Literal["open", "done"]
type Platform = Literal["ios", "android", "web"]

# A message is a few paragraphs at most; the limit also keeps an inbox row readable.
MAX_MESSAGE_LENGTH = 2000
# A version string such as "0.1.0" or "iOS 19.1".
MAX_VERSION_LENGTH = 40
# Messages a learner can send in a day; more is not feedback but flooding the inbox.
MAX_FEEDBACK_PER_DAY = 10
# Rows of the owner's inbox in one answer.
INBOX_LIMIT = 100


@dataclass(frozen=True)
class DeviceInfo:
    """What the learner agreed to send along with a message."""

    app_version: str
    platform: Platform
    os_version: str


@dataclass(frozen=True)
class Feedback:
    id: UUID
    user_id: UUID
    category: FeedbackCategory
    message: str
    device: DeviceInfo | None
    status: FeedbackStatus
    created_at: dt.datetime
    resolved_at: dt.datetime | None = None


class FeedbackError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class FeedbackRepository(Protocol):
    def add(self, feedback: Feedback) -> Feedback:
        """Stores the message."""

    def sent_since(self, user_id: UUID, since: dt.datetime) -> int:
        """How many messages the learner sent from `since` on."""

    def inbox(self, status: FeedbackStatus | None, limit: int) -> list[Feedback]:
        """Messages of every learner with `status` (all when None), newest first."""

    def resolve(
        self, feedback_id: UUID, status: FeedbackStatus, at: dt.datetime
    ) -> Feedback | None:
        """Sets the message's status; None when there is no such message."""


class FeedbackService:
    def __init__(
        self,
        *,
        repository: FeedbackRepository,
        owners: frozenset[UUID],
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._repository = repository
        self._owners = owners
        self._clock = clock
        self._new_id = new_id

    def send(
        self,
        user_id: UUID,
        category: FeedbackCategory,
        message: str,
        device: DeviceInfo | None = None,
    ) -> Feedback:
        """Stores a message. Raises `FeedbackError`: `invalid_value` for an empty or too long
        message or a version that is empty or too long, and `feedback_limit`."""
        text = message.strip()
        if not text or len(text) > MAX_MESSAGE_LENGTH:
            raise FeedbackError("invalid_value")
        if device and any(
            not part.strip() or len(part) > MAX_VERSION_LENGTH
            for part in (device.app_version, device.os_version)
        ):
            raise FeedbackError("invalid_value")
        now = self._clock()
        sent = self._repository.sent_since(user_id, now - dt.timedelta(days=1))
        if sent >= MAX_FEEDBACK_PER_DAY:
            raise FeedbackError("feedback_limit")
        return self._repository.add(
            Feedback(
                id=self._new_id(),
                user_id=user_id,
                category=category,
                message=text,
                device=device,
                status="open",
                created_at=now,
            )
        )

    def is_owner(self, user_id: UUID) -> bool:
        return user_id in self._owners

    def inbox(self, user_id: UUID, status: FeedbackStatus | None = "open") -> Sequence[Feedback]:
        """The owner's inbox. Raises `FeedbackError("not_owner")`."""
        self._require_owner(user_id)
        return self._repository.inbox(status, INBOX_LIMIT)

    def resolve(self, user_id: UUID, feedback_id: UUID, status: FeedbackStatus) -> Feedback:
        """Marks a message done, or open again. Raises `FeedbackError`: `not_owner`,
        `not_found`."""
        self._require_owner(user_id)
        found = self._repository.resolve(feedback_id, status, self._clock())
        if found is None:
            raise FeedbackError("not_found")
        return found

    def _require_owner(self, user_id: UUID) -> None:
        if not self.is_owner(user_id):
            raise FeedbackError("not_owner")
