"""A report for the learner's human teacher (6.23): what the learner's conversations of a period
showed, for a class or a tutor who does not use Konvami.

The server gathers the numbers; the app turns them into a PDF the learner shares themselves (the
system's share sheet), with any transcripts they tick. Nothing is sent to the teacher by Konvami
and nothing is kept: the PDF exists only on the learner's device until they share it.

Only confirmed corrections count: one the second check could not confirm may not be a mistake
(spec §16.1), and a teacher reads a list of mistakes as facts.
"""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

from konvami_api.domain.conversations import (
    PAGE_MAX,
    Conversation,
    ConversationQuery,
    ConversationService,
)
from konvami_api.domain.grammar_map import GrammarMapService, Mastery, TopicState
from konvami_api.domain.levels import LevelFit, LevelPoint, LevelService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import DEFAULT_LEVEL, Mistake, ReportService

# The periods a report covers, in days.
PERIODS = (7, 30, 90)
# The learner's own sentences shown per kind of mistake: enough to see the pattern.
MAX_EXAMPLES = 3
# The kinds of mistake listed, the most frequent first.
MAX_KINDS = 10
# The reports read: more than anyone has in 90 days of daily practice.
MAX_REPORTS = 200
# The conversations listed (the library's largest page).
MAX_CONVERSATIONS = PAGE_MAX


class TeacherReportError(Exception):
    """`invalid_value` (a period not offered) or `no_language`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class MistakeKind:
    # One of the language pack's error categories, or `other`.
    category: str
    count: int
    # The learner's own sentences and the same put right, the newest first.
    examples: tuple[Mistake, ...]


@dataclass(frozen=True)
class DatedFit:
    """How the learner did against the conversation's level, per skill (the level engine's
    evidence, spec §6.9)."""

    at: dt.datetime
    fit: LevelFit


@dataclass(frozen=True)
class TeacherReport:
    language: str
    level: str
    since: dt.datetime
    until: dt.datetime
    # The conversations of the period that count, the newest first.
    conversations: tuple[Conversation, ...]
    seconds: int
    mistakes: tuple[MistakeKind, ...]
    # The grammar topics the learner has used, as they stand now.
    topics: tuple[TopicState, ...]
    # The level over time (every change, the oldest first).
    levels: tuple[LevelPoint, ...]
    fits: tuple[DatedFit, ...]


class TeacherReportService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        conversations: ConversationService,
        reports: ReportService,
        grammar: GrammarMapService,
        levels: LevelService,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._conversations = conversations
        self._reports = reports
        self._grammar = grammar
        self._levels = levels
        self._clock = clock

    def report(self, user_id: UUID, days: int) -> TeacherReport:
        """What the conversations of the last `days` days showed. Raises `TeacherReportError`."""
        if days not in PERIODS:
            raise TeacherReportError("invalid_value")
        language = self._profiles.get(user_id).target_language
        if not language:
            raise TeacherReportError("no_language")
        until = self._clock()
        since = until - dt.timedelta(days=days)
        conversations = self._conversations.listed(
            user_id, limit=MAX_CONVERSATIONS, query=ConversationQuery(after=since)
        ).conversations
        entries = [
            entry
            for entry in self._reports.history(user_id, MAX_REPORTS)
            if entry.started_at >= since
        ]
        return TeacherReport(
            language=language,
            level=self._profiles.get(user_id).level(language) or DEFAULT_LEVEL,
            since=since,
            until=until,
            conversations=conversations,
            seconds=sum(conversation.seconds for conversation in conversations),
            mistakes=_kinds([m for e in entries for m in e.report.mistakes]),
            topics=tuple(
                state
                for state in self._grammar.states(user_id)
                if state.mastery.state is not Mastery.NOT_STARTED
            ),
            levels=self._levels.history(user_id, language),
            fits=tuple(
                DatedFit(entry.started_at, entry.report.level_fit)
                for entry in entries
                if entry.report.level_fit is not None
            ),
        )


def _kinds(mistakes: list[Mistake]) -> tuple[MistakeKind, ...]:
    """Confirmed mistakes by kind, the most frequent first; `mistakes` are the newest first."""
    found: dict[str, list[Mistake]] = {}
    for mistake in mistakes:
        if mistake.certain:
            found.setdefault(mistake.category, []).append(mistake)
    ranked = sorted(found.items(), key=lambda item: (-len(item[1]), item[0]))
    return tuple(
        MistakeKind(category, len(said), tuple(said[:MAX_EXAMPLES]))
        for category, said in ranked[:MAX_KINDS]
    )
