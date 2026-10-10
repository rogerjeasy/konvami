"""Request and response bodies. Keys are camelCase; profile field names are data and stay as
they are stored (`target_language`).
"""

import datetime as dt
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from konvami_api.domain.accounts import AccountView, PictureUpload
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
from konvami_api.domain.conversations import (
    Activity,
    Conversation,
    ConversationPage,
    Transcript,
)
from konvami_api.domain.home import HomeView
from konvami_api.domain.live_call import Speaker
from konvami_api.domain.onboarding import OnboardingStatus, PlacementStatus, Stage
from konvami_api.domain.persona_parts import (
    Backdrop,
    CorrectionTiming,
    FormOfAddress,
    Gender,
    Hair,
    HairColor,
    Role,
    Skin,
    Strictness,
    Style,
    Top,
    Voice,
)
from konvami_api.domain.personas import (
    BACKSTORY_MAX,
    DESCRIPTION_MAX,
    NAME_MAX,
    ROLE_TEACHING,
    Persona,
    PersonaFields,
    Personality,
    Teaching,
    personality_of,
    teaching_of,
)
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
    # The partner to talk to: needed for practice, ignored for the guide's calls.
    persona_id: UUID | None = None
    # Today on the learner's calendar, so a persona names the right weekday. Left out, or not
    # a date any time zone has right now, the date in UTC is used.
    local_date: dt.date | None = None


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


def teaching_of_role(role: Role) -> Teaching:
    return ROLE_TEACHING[role]


class PersonalityModel(ApiModel):
    """How a persona comes across. Each trait is a point from 1 to 5 between two poles."""

    # Reserved (1) to warm (5).
    warmth: int
    # Serious (1) to playful (5).
    playfulness: int
    # Concise (1) to talkative (5).
    talkativeness: int
    # Laid-back (1) to curious (5).
    curiosity: int
    # Dry (1) to humorous (5).
    humour: int
    form_of_address: FormOfAddress
    style: Style

    @classmethod
    def of(cls, personality: Personality) -> "PersonalityModel":
        return cls.model_validate(personality.model_dump())


class TeachingModel(ApiModel):
    """How a persona treats mistakes and adapts to the learner. Every key is always present;
    null means "as the learner's profile says" (or, for speed, the voice's own pace)."""

    correction_timing: CorrectionTiming
    strictness: Strictness
    explanation_usage: ExplanationUsage | None
    level: StartingLevel | None
    focus: str | None
    speed: float | None

    @classmethod
    def of(cls, teaching: Teaching) -> "TeachingModel":
        return cls.model_validate(teaching.model_dump())


class PersonaDraftOut(ApiModel):
    """A persona that is not saved: a template, or one written from a description."""

    role: Role
    name: str
    gender: Gender
    age: int
    origin: str
    occupation: str
    tagline: str | None
    backstory: str
    look: LookModel
    voice: Voice
    personality: PersonalityModel
    teaching: TeachingModel

    @classmethod
    def of(cls, fields: PersonaFields) -> "PersonaDraftOut":
        return cls(
            role=fields.role,
            name=fields.name,
            gender=fields.gender,
            age=fields.age,
            origin=fields.origin,
            occupation=fields.occupation,
            tagline=fields.tagline,
            backstory=fields.backstory,
            look=LookModel.model_validate(fields.look.model_dump()),
            voice=fields.voice,
            # Without settings of their own: what their role does.
            personality=PersonalityModel.of(fields.personality or Personality()),
            teaching=TeachingModel.of(fields.teaching or teaching_of_role(fields.role)),
        )


class PersonaOut(ApiModel):
    id: UUID
    role: Role
    name: str
    gender: Gender
    age: int
    origin: str
    # What they do for a living, in a few words; may be empty.
    occupation: str
    # One line about the persona in the learner's explanation language; null for a built-in
    # partner, for which the app shows its own line for the role.
    tagline: str | None
    backstory: str
    look: LookModel
    voice: Voice
    # Their own settings or, without any, what their role does.
    personality: PersonalityModel
    teaching: TeachingModel

    @classmethod
    def of(cls, persona: Persona) -> "PersonaOut":
        return cls(
            id=persona.id,
            role=persona.role,
            name=persona.name,
            gender=persona.gender,
            age=persona.age,
            origin=persona.origin,
            occupation=persona.occupation,
            tagline=persona.tagline,
            backstory=persona.backstory,
            look=LookModel.model_validate(persona.look),
            voice=persona.voice,  # type: ignore[arg-type]
            personality=PersonalityModel.of(personality_of(persona)),
            teaching=TeachingModel.of(teaching_of(persona)),
        )


class PersonasOut(ApiModel):
    personas: list[PersonaOut]

    @classmethod
    def of(cls, personas: list[Persona]) -> "PersonasOut":
        return cls(personas=[PersonaOut.of(persona) for persona in personas])


class PersonaTemplatesOut(ApiModel):
    templates: list[PersonaDraftOut]

    @classmethod
    def of(cls, templates: list[PersonaFields]) -> "PersonaTemplatesOut":
        return cls(templates=[PersonaDraftOut.of(template) for template in templates])


# Lengths are checked by the domain, which answers `invalid_value`; these only bound a request.
_TEXT_LIMIT = BACKSTORY_MAX * 2


class PersonaIn(ApiModel):
    """A new persona. Personality and teaching left out (or null): as their role does."""

    role: Role
    name: str = Field(max_length=NAME_MAX * 2)
    gender: Gender
    age: int
    origin: str = Field(max_length=_TEXT_LIMIT)
    occupation: str = Field(default="", max_length=_TEXT_LIMIT)
    tagline: str | None = Field(default=None, max_length=_TEXT_LIMIT)
    backstory: str = Field(max_length=_TEXT_LIMIT)
    look: LookModel
    voice: Voice
    personality: PersonalityModel | None = None
    teaching: TeachingModel | None = None


class PersonaPatch(ApiModel):
    """The parts of a persona to change; the ones left out stay. Personality or teaching set
    to null go back to what the persona's role does."""

    role: Role | None = None
    name: str | None = Field(default=None, max_length=NAME_MAX * 2)
    gender: Gender | None = None
    age: int | None = None
    origin: str | None = Field(default=None, max_length=_TEXT_LIMIT)
    occupation: str | None = Field(default=None, max_length=_TEXT_LIMIT)
    tagline: str | None = Field(default=None, max_length=_TEXT_LIMIT)
    backstory: str | None = Field(default=None, max_length=_TEXT_LIMIT)
    look: LookModel | None = None
    voice: Voice | None = None
    personality: PersonalityModel | None = None
    teaching: TeachingModel | None = None


class PersonaDescription(ApiModel):
    # Who the learner would like to talk to, in their own words.
    description: str = Field(max_length=DESCRIPTION_MAX * 2)


class VoiceSampleOut(ApiModel):
    # A short-lived address of the voice's sample (MP3).
    url: str


class ConversationOut(ApiModel):
    # The id of the voice call.
    id: str
    # Null once the partner has been removed.
    partner: PersonaOut | None
    started_at: dt.datetime
    # Null while the conversation runs and for the moment in which it is being saved.
    ended_at: dt.datetime | None
    seconds: int
    # How often the learner spoke. A conversation counts as practice from the first time.
    learner_turns: int

    @classmethod
    def of(cls, conversation: Conversation) -> "ConversationOut":
        partner = conversation.partner
        return cls(
            id=conversation.id,
            partner=PersonaOut.of(partner) if partner else None,
            started_at=conversation.started_at,
            ended_at=conversation.ended_at,
            seconds=conversation.seconds,
            learner_turns=conversation.learner_turns,
        )


class ConversationsOut(ApiModel):
    conversations: list[ConversationOut]
    # Pass as `before` to read the next page; null on the last one.
    next: dt.datetime | None

    @classmethod
    def of(cls, page: ConversationPage) -> "ConversationsOut":
        return cls(
            conversations=[ConversationOut.of(c) for c in page.conversations], next=page.next
        )


class TurnOut(ApiModel):
    speaker: Speaker
    text: str


class TranscriptOut(ApiModel):
    conversation: ConversationOut
    turns: list[TurnOut]

    @classmethod
    def of(cls, transcript: Transcript) -> "TranscriptOut":
        return cls(
            conversation=ConversationOut.of(transcript.conversation),
            turns=[TurnOut(speaker=turn.speaker, text=turn.text) for turn in transcript.turns],
        )


class HomeLevelOut(ApiModel):
    # The level practice starts at.
    level: StartingLevel
    source: Source
    # Level per skill from the placement test; null when it was not taken.
    skills: dict[str, StartingLevel] | None


class HomeExamOut(ApiModel):
    type: str
    # The exam's proper name; null for one the language pack does not list.
    name: str | None
    target_level: CefrLevel | None
    date: dt.date | None
    # Days until the exam on the learner's calendar; null without a date.
    days_left: int | None


class HomePartnerOut(ApiModel):
    persona: PersonaOut
    conversations: int
    last_talked_at: dt.datetime | None


class DayOut(ApiModel):
    day: dt.date
    seconds: int


class ActivityOut(ApiModel):
    # The learner's date, in the time zone the app named.
    today: dt.date
    # Days in a row with practice, ending today or, while today is still open, yesterday.
    streak_days: int
    practised_today: bool
    today_seconds: int
    week_seconds: int
    # Monday to Sunday of the current week.
    week: list[DayOut]
    # Everything so far.
    conversations: int
    seconds: int

    @classmethod
    def of(cls, activity: Activity) -> "ActivityOut":
        return cls(
            today=activity.today,
            streak_days=activity.streak_days,
            practised_today=activity.practised_today,
            today_seconds=activity.today_seconds,
            week_seconds=activity.week_seconds,
            week=[DayOut(day=day.day, seconds=day.seconds) for day in activity.week],
            conversations=activity.conversations,
            seconds=activity.seconds,
        )


class HomeOut(ApiModel):
    """The Today screen in one answer."""

    language: str
    level: HomeLevelOut | None
    # Things to work on from the placement test, most useful first.
    focus: list[str]
    # Null without an exam, and once its day has passed.
    exam: HomeExamOut | None
    partners: list[HomePartnerOut]
    # Who the main button talks to: the partner talked to last, or the first one.
    suggested_partner_id: UUID | None
    activity: ActivityOut
    recent: list[ConversationOut]

    @classmethod
    def of(cls, home: HomeView) -> "HomeOut":
        level, exam = home.level, home.exam
        return cls(
            language=home.language,
            level=None
            if level is None
            else HomeLevelOut.model_validate(
                {
                    "level": level.level,
                    "source": level.source,
                    "skills": None if level.skills is None else dict(level.skills),
                }
            ),
            focus=list(home.focus),
            exam=None
            if exam is None
            else HomeExamOut.model_validate(
                {
                    "type": exam.type,
                    "name": exam.name,
                    "targetLevel": exam.target_level,
                    "date": exam.date,
                    "daysLeft": exam.days_left,
                }
            ),
            partners=[
                HomePartnerOut(
                    persona=PersonaOut.of(partner.persona),
                    conversations=partner.conversations,
                    last_talked_at=partner.last_talked_at,
                )
                for partner in home.partners
            ],
            suggested_partner_id=home.suggested_partner_id,
            activity=ActivityOut.of(home.activity),
            recent=[ConversationOut.of(conversation) for conversation in home.recent],
        )


class PictureOut(ApiModel):
    # A short-lived address of the photo. The app reads the account again for a new one.
    url: str


class AccountOut(ApiModel):
    """What the backend keeps for an account. Name and email live with the identity provider."""

    picture: PictureOut | None

    @classmethod
    def of(cls, view: AccountView) -> "AccountOut":
        return cls(picture=PictureOut(url=view.picture_url) if view.picture_url else None)


class PictureUploadOut(ApiModel):
    """How to send a photo: a form POST to `url` with `fields`, then the JPEG as `file`."""

    upload_id: UUID
    url: str
    fields: dict[str, str]

    @classmethod
    def of(cls, upload: PictureUpload) -> "PictureUploadOut":
        return cls(upload_id=upload.upload_id, url=upload.form.url, fields=dict(upload.form.fields))


class PictureConfirm(ApiModel):
    # The `uploadId` the form was given with.
    upload_id: UUID


class AccountDeletedOut(ApiModel):
    deleted: Literal[True] = True
