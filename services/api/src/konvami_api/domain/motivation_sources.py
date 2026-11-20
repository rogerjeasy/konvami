"""Where motivation's facts come from: the one place that knows which service holds each, so the
API, the tests and the worker wire motivation the same way."""

import datetime as dt
from collections.abc import Callable
from uuid import UUID

from konvami_api.domain.cards import CardService
from konvami_api.domain.conversation_review import ConversationReview
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.director import DirectorService, SessionKind, habit_of, planned_weekdays
from konvami_api.domain.levels import LEVEL_FIELD, LevelFit, LevelService
from konvami_api.domain.memories import MemoryService
from konvami_api.domain.motivation import Sources
from konvami_api.domain.penpal import PenPalService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import ReportService

# Corrections from this many recent weeks of reports can be said better.
CORRECTION_WEEKS = 4
# Card reviews are counted over this time (the milestones count reviews ever).
_RECENT = dt.timedelta(days=30)


def follow_up_question(
    *,
    profiles: ProfileService,
    memories: MemoryService,
    conversations: ConversationService,
    clock: Callable[[], dt.datetime],
) -> Callable[[UUID, UUID | None], str | None]:
    """What a partner would ask a learner who has gone quiet: the follow-up it remembers about
    something in their life ("How did the interview go?"), in the explanation language. None
    while memory is off, without one, and for one that touches a topic the learner put off
    limits (6.10): a memory written before the topic was added can still mention it.

    The question is shown only inside the app (Today's welcome back). A push only learns that
    there is one (`has_question`), never its words."""

    def ask(user_id: UUID, partner: UUID | None) -> str | None:
        if partner is None:
            return None
        avoid = [topic.casefold() for topic in profiles.get(user_id).avoid_topics if topic]
        last = conversations.listed(user_id, limit=1).conversations
        last_day = last[0].started_at.date() if last else None
        recall = memories.recall(user_id, partner, clock().date(), last_day)
        if recall is None:
            return None
        return next(
            (
                memory.ask
                for memory in recall.follow_ups
                if memory.ask
                and not any(
                    topic in memory.text.casefold() or topic in memory.ask.casefold()
                    for topic in avoid
                )
            ),
            None,
        )

    return ask


def motivation_sources(
    *,
    profiles: ProfileService,
    levels: LevelService,
    director: DirectorService,
    cards: CardService,
    reports: ReportService,
    penpal: PenPalService,
    conversation_review: ConversationReview,
    memories: MemoryService,
    conversations: ConversationService,
    clock: Callable[[], dt.datetime],
) -> Sources:
    def language(user_id: UUID) -> str:
        return profiles.get(user_id).target_language or ""

    def level(user_id: UUID) -> str | None:
        return profiles.get(user_id).level(language(user_id))

    def level_fits(user_id: UUID) -> list[LevelFit]:
        profile = profiles.get(user_id)
        target = profile.target_language
        stored = profile.fields.get((target, LEVEL_FIELD)) if target else None
        if target is None or stored is None:
            return []
        return reports.level_fits(user_id, target, stored.updated_at)

    def weekdays(user_id: UUID) -> tuple[int, ...]:
        profile = profiles.get(user_id)
        return planned_weekdays(habit_of(profile, profile.target_language or "").days)

    def plan_kinds(user_id: UUID, timezone: str | None) -> tuple[bool, bool]:
        sessions = director.week(user_id, timezone).sessions
        return (
            sessions.get(SessionKind.REVIEW, 0) > 0,
            sessions.get(SessionKind.ROLE_PLAY, 0) > 0,
        )

    def corrections(user_id: UUID, timezone: str | None, monday: dt.date) -> bool:
        since = monday - dt.timedelta(weeks=CORRECTION_WEEKS)
        return any(found.count for found in reports.mistakes_by_week(user_id, timezone, since))

    def mistakes(
        user_id: UUID, timezone: str | None, since: dt.date
    ) -> list[tuple[dt.date, str, int]]:
        return [
            (found.week, found.category, found.count)
            for found in reports.mistakes_by_week(user_id, timezone, since)
        ]

    def deck(user_id: UUID) -> tuple[int, int]:
        progress = cards.progress(user_id, clock() - _RECENT)
        return progress.total, progress.reviews_ever

    return Sources(
        target_language=language,
        level=level,
        level_fits=level_fits,
        level_history=lambda user_id: levels.history(user_id, language(user_id)),
        planned_weekdays=weekdays,
        started=director.started,
        plan_kinds=plan_kinds,
        words_due=cards.due_count,
        corrections=corrections,
        pen_pal_enabled=lambda user_id: penpal.settings(user_id).enabled,
        words_used=lambda call_id: len(conversation_review.words_used(call_id)),
        cards=deck,
        most_words=lambda user_id: reports.totals(user_id, clock()).most_words,
        mistakes_by_week=mistakes,
        follow_up=follow_up_question(
            profiles=profiles, memories=memories, conversations=conversations, clock=clock
        ),
    )
