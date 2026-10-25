"""Review inside conversation (spec §6.7 "review conversation", §7): after a practice
conversation, each word of its plan that was due and that the learner said themselves counts as
reviewed, as if they had turned its card over and known it.

What the learner said is read as faithfully as it was written down (the verbatim pass first),
and a word counts in its forms (`word_use.py`). A word they did not use is left as it was: not
finding a moment for it is not forgetting it.
"""

import contextlib
from uuid import UUID

from konvami_api.domain.cards import CardService
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.voice import VoiceSessionRepository
from konvami_api.domain.word_use import uses_word


class ConversationReview:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        sessions: VoiceSessionRepository,
        conversations: ConversationService,
        cards: CardService,
    ) -> None:
        self._profiles = profiles
        self._sessions = sessions
        self._conversations = conversations
        self._cards = cards

    def after_conversation(self, call_id: str) -> None:
        session = self._sessions.get(call_id)
        if session is None or session.plan is None or not session.plan.words:
            return
        plan = session.plan
        pack = self._profiles.catalog.available_pack(plan.language)
        rules = pack.word_rules if pack else None
        turns = self._conversations.transcript(session.user_id, call_id).turns
        said = [turn.said for turn in turns if turn.speaker == "learner"]
        for word in plan.words:
            if word.card_id is None:
                continue
            if any(uses_word(word.text, line, rules) for line in said):
                # A card id that is not one (an old plan) is simply not there.
                with contextlib.suppress(ValueError):
                    self._cards.reviewed_in_conversation(
                        session.user_id, UUID(word.card_id), session.started_at
                    )
