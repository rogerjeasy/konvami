"""Request and response bodies. Keys are camelCase; profile field names are data and stay as
they are stored (`target_language`).
"""

import datetime as dt
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from konvami_api.domain.catalog import (
    CEFR_LEVELS,
    EXPLANATION_USAGES,
    GOAL_REASONS,
    STARTING_LEVELS,
    Catalog,
    CefrLevel,
    ExplanationUsage,
    GoalReason,
    StartingLevel,
)
from konvami_api.domain.onboarding import OnboardingStatus, PlacementStatus, Stage
from konvami_api.domain.persona_parts import Backdrop, Hair, HairColor, Role, Skin, Top
from konvami_api.domain.personas import NAME_MAX, Persona
from konvami_api.domain.placement import PlacementView
from konvami_api.domain.profile import GLOBAL_SCOPE, Profile, Source
from konvami_api.domain.voice import CallPurpose, CallStarted

# A request never needs more changes than the profile has fields.
MAX_CHANGES = 20


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class FieldOut(ApiModel):
    value: Any
    source: Source
    updated_at: dt.datetime


class ProfileOut(ApiModel):
    target_language: str | None
    global_fields: dict[str, FieldOut] = Field(alias="global")
    languages: dict[str, dict[str, FieldOut]]

    @classmethod
    def of(cls, profile: Profile) -> "ProfileOut":
        global_fields: dict[str, FieldOut] = {}
        languages: dict[str, dict[str, FieldOut]] = {}
        for (scope, field), stored in profile.fields.items():
            group = global_fields if scope == GLOBAL_SCOPE else languages.setdefault(scope, {})
            group[field] = FieldOut(
                value=stored.value, source=stored.source, updated_at=stored.updated_at
            )
        # Built by alias: `global` is a Python keyword, so the attribute has another name.
        return cls.model_validate(
            {
                "targetLanguage": profile.target_language,
                "global": global_fields,
                "languages": languages,
            }
        )


class ChangeIn(ApiModel):
    field: str = Field(min_length=1, max_length=64)
    value: Any = None
    # Left out for the language being learned.
    scope: str | None = Field(default=None, max_length=16)


class ProfilePatch(ApiModel):
    changes: list[ChangeIn] = Field(min_length=1, max_length=MAX_CHANGES)


class ExamOut(ApiModel):
    id: str
    name: str
    levels: list[CefrLevel]


class LanguageOut(ApiModel):
    code: str
    available: bool
    exams: list[ExamOut]


class NamedLanguageOut(ApiModel):
    code: str
    name: str


class CatalogOut(ApiModel):
    languages: list[LanguageOut]
    explanation_languages: list[NamedLanguageOut]
    starting_levels: list[StartingLevel]
    exam_levels: list[CefrLevel]
    goal_reasons: list[GoalReason]
    explanation_usages: list[ExplanationUsage]

    @classmethod
    def of(cls, catalog: Catalog) -> "CatalogOut":
        return cls(
            languages=[
                LanguageOut(
                    code=pack.code,
                    available=pack.available,
                    exams=[
                        ExamOut(id=exam.id, name=exam.name, levels=list(exam.levels))
                        for exam in pack.exams
                    ],
                )
                for pack in catalog.packs
            ],
            explanation_languages=[
                NamedLanguageOut(code=language.code, name=language.name)
                for language in catalog.explanation_languages
            ],
            starting_levels=list(STARTING_LEVELS),
            exam_levels=list(CEFR_LEVELS),
            goal_reasons=list(GOAL_REASONS),
            explanation_usages=list(EXPLANATION_USAGES),
        )


class OnboardingOut(ApiModel):
    stage: Stage
    missing: list[str]
    # Where the placement test stands, so the app can open the right screen of that stage.
    placement: PlacementStatus

    @classmethod
    def of(cls, status: OnboardingStatus, placement: PlacementStatus) -> "OnboardingOut":
        return cls(stage=status.stage, missing=status.missing, placement=placement)


class PlacementResultOut(ApiModel):
    # Level per skill: speaking, listening, grammar, vocabulary, pronunciation.
    levels: dict[str, StartingLevel]
    overall: StartingLevel
    weak_areas: list[str]
    measured_at: dt.datetime


class PlacementOut(ApiModel):
    status: PlacementStatus
    self_assessed: StartingLevel | None
    # The measured starting level differs from the learner's own estimate: they choose.
    differs: bool
    result: PlacementResultOut | None

    @classmethod
    def of(cls, view: PlacementView) -> "PlacementOut":
        return cls.model_validate(
            {
                "status": view.status,
                "selfAssessed": view.self_assessed,
                "differs": view.differs,
                "result": None
                if view.result is None
                else {
                    "levels": dict(view.result.levels),
                    "overall": view.result.overall,
                    "weakAreas": list(view.result.weak_areas),
                    "measuredAt": view.result.measured_at,
                },
            }
        )


class PlacementDecision(ApiModel):
    # Start at the measured level, or at the learner's own estimate.
    use: Literal["measured", "self"]


# A WebRTC offer for one audio track and a data channel is a few kilobytes.
MAX_SDP_LENGTH = 20_000


class VoiceCallIn(ApiModel):
    purpose: CallPurpose
    # The app's WebRTC offer (SDP).
    sdp: str = Field(min_length=1, max_length=MAX_SDP_LENGTH)


class VoiceCallOut(ApiModel):
    call_id: str
    # The provider's answer (SDP) for the app's peer connection.
    sdp: str
    # The call is ended by the server after this many seconds.
    max_seconds: int

    @classmethod
    def of(cls, started: CallStarted) -> "VoiceCallOut":
        return cls(call_id=started.call_id, sdp=started.sdp_answer, max_seconds=started.max_seconds)


class LookModel(ApiModel):
    """A portrait's parts and colors. The app draws exactly these names."""

    skin: Skin
    hair: Hair
    hair_color: HairColor
    top: Top
    backdrop: Backdrop
    glasses: bool
    beard: bool


class PersonaOut(ApiModel):
    id: UUID
    role: Role
    name: str
    age: int
    origin: str
    # One line about the persona in the learner's explanation language; null for a built-in
    # partner, for which the app shows its own line for the role.
    tagline: str | None
    look: LookModel

    @classmethod
    def of(cls, persona: Persona) -> "PersonaOut":
        return cls(
            id=persona.id,
            role=persona.role,
            name=persona.name,
            age=persona.age,
            origin=persona.origin,
            tagline=persona.tagline,
            look=LookModel.model_validate(persona.look),
        )


class PersonasOut(ApiModel):
    personas: list[PersonaOut]

    @classmethod
    def of(cls, personas: list[Persona]) -> "PersonasOut":
        return cls(personas=[PersonaOut.of(persona) for persona in personas])


class PersonaPatch(ApiModel):
    name: str | None = Field(default=None, max_length=NAME_MAX * 2)
    look: LookModel | None = None
