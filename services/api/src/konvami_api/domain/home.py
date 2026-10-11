"""What the Today screen shows (spec §14.1): who to talk to, how practice is going, the level,
what to work on and the exam ahead. Everything here is read from what the learner told the app
or did in it; a section with nothing behind it is left out, never filled in.
"""

import datetime as dt
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from konvami_api.domain.conversations import Activity, Conversation, ConversationService
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.personas import Persona, PersonaService
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.profile import Profile, ProfileService, Source
from konvami_api.domain.reports import ReportService, what_to_practise

RECENT_CONVERSATIONS = 3


@dataclass(frozen=True)
class LevelView:
    # The level practice starts at, "A0" to "C2".
    level: str
    source: Source
    # The level per skill from the placement test; None when it was not taken.
    skills: Mapping[str, str] | None


@dataclass(frozen=True)
class ExamView:
    type: str
    # The exam's proper name; None for one the language pack does not list.
    name: str | None
    target_level: str | None
    date: dt.date | None
    # Days until the exam on the learner's calendar; None without a date.
    days_left: int | None


@dataclass(frozen=True)
class PartnerView:
    persona: Persona
    conversations: int
    last_talked_at: dt.datetime | None


@dataclass(frozen=True)
class HomeView:
    language: str
    level: LevelView | None
    # Things to work on, most useful first, and where they come from: the last conversation's
    # report or, until there is one, the placement test. None when there is nothing.
    focus: tuple[str, ...]
    focus_source: Literal["report", "placement"] | None
    exam: ExamView | None
    partners: tuple[PartnerView, ...]
    # Who the main button talks to: the partner talked to last, or the first one.
    suggested_partner_id: UUID | None
    activity: Activity
    recent: tuple[Conversation, ...]


class HomeService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        onboarding: OnboardingService,
        personas: PersonaService,
        placement: PlacementService,
        conversations: ConversationService,
        reports: ReportService,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._reports = reports
        self._profiles = profiles
        self._onboarding = onboarding
        self._personas = personas
        self._placement = placement
        self._conversations = conversations
        self._clock = clock

    def view(self, user_id: UUID, timezone: str | None) -> HomeView:
        if self._onboarding.status(user_id).stage is not Stage.DONE:
            raise OnboardingError("wrong_stage")
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        result = self._placement.view(user_id).result
        activity = self._conversations.activity(user_id, timezone, self._clock())
        history = self._conversations.partner_history(user_id)
        partners = tuple(
            PartnerView(
                persona=persona,
                conversations=met.conversations if met else 0,
                last_talked_at=met.last_at if met else None,
            )
            for persona in self._personas.partners(user_id)
            for met in [history.get(persona.id)]
        )
        focus = what_to_practise(
            self._reports.next_steps(user_id), result.weak_areas if result else ()
        )
        return HomeView(
            language=language,
            level=self._level(profile, language, result.levels if result else None),
            focus=focus.areas,
            focus_source=focus.source,
            exam=self._exam(profile, language, activity.today),
            partners=partners,
            suggested_partner_id=_suggested(partners),
            activity=activity,
            recent=self._conversations.listed(user_id, limit=RECENT_CONVERSATIONS).conversations,
        )

    def _level(
        self, profile: Profile, language: str, skills: Mapping[str, str] | None
    ) -> LevelView | None:
        stored = profile.fields.get((language, "starting_level"))
        if stored is None:
            return None
        return LevelView(level=stored.value, source=stored.source, skills=skills)

    def _exam(self, profile: Profile, language: str, today: dt.date) -> ExamView | None:
        exam = profile.value(language, "exam")
        if exam is None:
            return None
        date = dt.date.fromisoformat(exam["date"]) if exam.get("date") else None
        if date is not None and date < today:
            return None
        pack = self._profiles.catalog.available_pack(language)
        known = pack.exam(exam["type"]) if pack else None
        return ExamView(
            type=exam["type"],
            name=known.name if known else None,
            target_level=exam.get("target_level"),
            date=date,
            days_left=(date - today).days if date else None,
        )


def _suggested(partners: tuple[PartnerView, ...]) -> UUID | None:
    met = [
        (partner.last_talked_at, partner.persona.id)
        for partner in partners
        if partner.last_talked_at is not None
    ]
    if met:
        return max(met, key=lambda last: last[0])[1]
    return partners[0].persona.id if partners else None
