from copy import deepcopy
from datetime import date
from uuid import UUID

from konvami_api.domain.continuation import Conversation
from konvami_api.domain.voice import VoiceSessionRepository


class MemoryContinuations:
    def __init__(self, sessions: VoiceSessionRepository | None = None) -> None:
        self.sessions = sessions
        self.refunded: set[str] = set()
        self.rows: dict[str, Conversation] = {}

    def create(self, conversation: Conversation) -> None:
        self.rows.setdefault(conversation.root_id, deepcopy(conversation))

    def get(self, call_id: str) -> Conversation | None:
        return next(
            (
                deepcopy(row)
                for row in self.rows.values()
                if any(item.call_id == call_id for item in row.segments)
            ),
            None,
        )

    def save(self, conversation: Conversation, revision: int) -> bool:
        if self.rows[conversation.root_id].revision != revision:
            return False
        self.rows[conversation.root_id] = deepcopy(conversation)
        return True

    def refund(self, root_id: str, user_id: UUID, week: date, seconds: int) -> None:
        row = self.rows.get(root_id)
        if row is None or row.user_id != user_id or root_id in self.refunded:
            return
        if self.sessions is not None:
            self.sessions.release_seconds(user_id, week, seconds)
        self.refunded.add(root_id)
