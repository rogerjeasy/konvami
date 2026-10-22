"""Request and response bodies. Keys are camelCase; profile field names are data and stay as
they are stored (`target_language`).
"""

import dataclasses
import datetime as dt
from collections.abc import Callable, Mapping
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool
from pydantic.alias_generators import to_camel

from konvami_api.domain.accounts import AccountView, PictureUpload
from konvami_api.domain.cards import Card, Deck, Queue, Saved
from konvami_api.domain.cards import Kind as CardKind
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
from konvami_api.domain.costs import Allowance, CostReport, Level, Share
from konvami_api.domain.fsrs import Rating
from konvami_api.domain.home import HomeView, LevelView
from konvami_api.domain.live_call import Speaker, TurnAudio
from konvami_api.domain.memories import TEXT_MAX as MEMORY_TEXT_MAX
from konvami_api.domain.memories import Kind as MemoryKind
from konvami_api.domain.memories import Memory, MemoryBook
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
from konvami_api.domain.profile import (
    AVOID_TOPIC_MAX,
    GLOBAL_SCOPE,
    MAX_AVOID_TOPICS,
    Profile,
    Source,
)
from konvami_api.domain.progress import ProgressView
from konvami_api.domain.reports import Report, ReportState, Severity
from konvami_api.domain.reports import Status as ReportStatus
from konvami_api.domain.tutor import MAX_QUESTION as TUTOR_QUESTION_MAX
from konvami_api.domain.tutor import Source as TutorSource
from konvami_api.domain.tutor import TutorQuestion
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


class ScenarioOut(ApiModel):
    # The app names a role-play and its goals in its own strings, by these ids.
    id: str
    level: CefrLevel
    goals: list[str]


class LanguageOut(ApiModel):
    code: str
    available: bool
    exams: list[ExamOut]
    # The role-plays the language offers, easiest first (spec §6.3).
    scenarios: list[ScenarioOut]


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
                    scenarios=[
                        ScenarioOut(
                            id=scenario.id,
                            level=cast(CefrLevel, scenario.level),
                            goals=[goal.id for goal in scenario.goals],
                        )
                        for scenario in pack.scenarios
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
# The longest scenario id accepted; the pack's ids are short words.
MAX_SCENARIO_ID = 40


class VoiceCallIn(ApiModel):
    purpose: CallPurpose
    # The app's WebRTC offer (SDP).
    sdp: str = Field(min_length=1, max_length=MAX_SDP_LENGTH)
    # The partner to talk to: needed for practice, ignored for the guide's calls.
    persona_id: UUID | None = None
    # Today on the learner's calendar, so a persona names the right weekday. Left out, or not
    # a date any time zone has right now, the date in UTC is used.
    local_date: dt.date | None = None
    # A practice call that rehearses a role-play (a scenario id from the catalog).
    scenario: str | None = Field(default=None, max_length=MAX_SCENARIO_ID)


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
    # The role-play it rehearsed, and the goals reached in it; null and [] for free talk.
    scenario: str | None
    goals_reached: list[str]

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
            scenario=conversation.scenario,
            goals_reached=list(conversation.goals_reached),
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


class TurnAudioOut(ApiModel):
    # A short-lived address that plays the turn (a WAV file).
    url: str
    milliseconds: int

    @classmethod
    def of(cls, audio: TurnAudio, address: Callable[[TurnAudio], str]) -> "TurnAudioOut":
        return cls(url=address(audio), milliseconds=audio.milliseconds)


class TurnOut(ApiModel):
    speaker: Speaker
    # As the live speech recognition wrote it down.
    text: str
    # A learner turn written down again from its recording, keeping their mistakes (spec §9.4).
    verbatim: str | None
    # Null without a recording.
    audio: TurnAudioOut | None


class TranscriptOut(ApiModel):
    conversation: ConversationOut
    turns: list[TurnOut]

    @classmethod
    def of(cls, transcript: Transcript, address: Callable[[TurnAudio], str]) -> "TranscriptOut":
        """`address` makes the address a recording is played from."""
        return cls(
            conversation=ConversationOut.of(transcript.conversation),
            turns=[
                TurnOut(
                    speaker=turn.speaker,
                    text=turn.text,
                    verbatim=turn.verbatim,
                    audio=TurnAudioOut.of(turn.audio, address) if turn.audio else None,
                )
                for turn in transcript.turns
            ],
        )


class RecordingsOut(ApiModel):
    # Whether the audio of conversations is kept for the learner to hear again.
    kept: bool


class RecordingsPatch(ApiModel):
    # Strict: "no" and 0 are not answers to a privacy setting.
    kept: StrictBool


class ExampleOut(ApiModel):
    # A sentence in the language learned, and its translation.
    text: str
    translation: str


class TutorAnswerOut(ApiModel):
    explanation: str
    examples: list[ExampleOut]
    # The grammar note the answer rests on (a mistake category); null when none applies.
    topic: str | None
    # The Tutor could not settle it: show it as a possibility, never as a fact.
    unsure: bool


class TutorQuestionOut(ApiModel):
    id: UUID
    asked_at: dt.datetime
    question: str
    answer: TutorAnswerOut
    source: TutorSource

    @classmethod
    def of(cls, question: TutorQuestion) -> "TutorQuestionOut":
        answer = question.answer
        return cls(
            id=question.id,
            asked_at=question.asked_at,
            question=question.question,
            answer=TutorAnswerOut(
                explanation=answer.explanation,
                examples=[
                    ExampleOut(text=e.text, translation=e.translation) for e in answer.examples
                ],
                topic=answer.topic,
                unsure=answer.unsure,
            ),
            source=question.source,
        )


class TutorQuestionsOut(ApiModel):
    # Newest first.
    questions: list[TutorQuestionOut]


class TutorQuestionIn(ApiModel):
    # Checked again by the Tutor (blank, too long); the limit here keeps a huge body out.
    question: Annotated[str, Field(max_length=TUTOR_QUESTION_MAX)]


class TutorCorrectionIn(ApiModel):
    conversation_id: Annotated[str, Field(min_length=1, max_length=200)]
    # The correction's place in the report's list, from 0.
    index: Annotated[int, Field(ge=0)]


# A conversation's id is the voice provider's id for the call: short, never free text.
MAX_CONVERSATION_ID_LENGTH = 128
# A report lists far fewer words and mistakes than this.
MAX_REPORT_INDEX = 100


class CardIn(ApiModel):
    """Which word or correction of a conversation's report to make a card of. The server reads
    its content from the report; the app sends none."""

    conversation_id: str = Field(min_length=1, max_length=MAX_CONVERSATION_ID_LENGTH)
    kind: CardKind
    # Its place among the report's words (kind "word") or mistakes (kind "correction").
    index: int = Field(ge=0, le=MAX_REPORT_INDEX)


class CardOut(ApiModel):
    id: UUID
    kind: CardKind
    # A word and its meaning; or what the learner said and how it is right.
    front: str
    back: str
    # A word: the sentence it came from. A correction: why. Null without one.
    note: str | None
    # The language the meaning or the reason is written in.
    explained_in: str
    # Null once the conversation it came from is gone.
    conversation_id: str | None
    created_at: dt.datetime
    due_at: dt.datetime
    # Null until the first review.
    reviewed_at: dt.datetime | None
    reviews: int
    lapses: int

    @classmethod
    def of(cls, card: Card) -> "CardOut":
        return cls(
            id=card.id,
            kind=card.kind,
            front=card.front,
            back=card.back,
            note=card.note,
            explained_in=card.explained_in,
            conversation_id=card.source_call_id,
            created_at=card.created_at,
            due_at=card.due_at,
            reviewed_at=card.reviewed_at,
            reviews=card.reviews,
            lapses=card.lapses,
        )


class DeckSummaryOut(ApiModel):
    # How many cards the learner has in the language they are learning, and how many are due.
    total: int
    due: int


class DeckOut(DeckSummaryOut):
    cards: list[CardOut]
    # Pass as `before` to read the next page; null on the last one.
    next: dt.datetime | None

    @classmethod
    def of(cls, deck: Deck) -> "DeckOut":
        return cls(
            cards=[CardOut.of(card) for card in deck.cards],
            next=deck.next,
            total=deck.total,
            due=deck.due,
        )


class QueueCardOut(ApiModel):
    card: CardOut
    # Seconds until the card would be due again, for each rating it could get now.
    due_in: dict[Rating, int]


class QueueOut(ApiModel):
    cards: list[QueueCardOut]
    # Every card that is due, of which `cards` are the first.
    due: int

    @classmethod
    def of(cls, queue: Queue) -> "QueueOut":
        return cls(
            cards=[
                QueueCardOut(
                    card=CardOut.of(item.card),
                    due_in={
                        rating: round(wait.total_seconds()) for rating, wait in item.due_in.items()
                    },
                )
                for item in queue.cards
            ],
            due=queue.due,
        )


class ReviewIn(ApiModel):
    rating: Rating


class MemoryOut(ApiModel):
    id: UUID
    kind: MemoryKind
    # A short note with the learner as its subject, in the language explanations were in then.
    text: str
    # The date of an event; null for what has no day.
    day: dt.date | None
    # Set for what belongs to one partner; null for what every partner knows.
    partner_id: UUID | None
    # Null also when that partner is not among the learner's partners now.
    partner_name: str | None
    created_at: dt.datetime
    updated_at: dt.datetime

    @classmethod
    def of(cls, memory: Memory, partners: Mapping[UUID, Persona]) -> "MemoryOut":
        partner = partners.get(memory.persona_id) if memory.persona_id else None
        return cls(
            id=memory.id,
            kind=memory.kind,
            text=memory.text,
            day=memory.day,
            partner_id=memory.persona_id,
            partner_name=partner.name if partner else None,
            created_at=memory.created_at,
            updated_at=memory.updated_at,
        )


class MemoriesOut(ApiModel):
    """What the learner's partners know about them, and what the learner set (spec §6.11)."""

    # Off: nothing new is written down and partners are told nothing from before.
    enabled: bool
    # What no partner brings up and nothing is remembered about, in the learner's words.
    avoid_topics: list[str]
    # Newest first.
    memories: list[MemoryOut]

    @classmethod
    def of(cls, book: MemoryBook, partners: Mapping[UUID, Persona]) -> "MemoriesOut":
        return cls(
            enabled=book.enabled,
            avoid_topics=list(book.avoid_topics),
            memories=[MemoryOut.of(memory, partners) for memory in book.memories],
        )


class MemorySettingsPatch(ApiModel):
    """A setting left out stays as it is."""

    # Strict: "no" and 0 are not answers to a privacy setting.
    enabled: StrictBool | None = None
    avoid_topics: (
        Annotated[
            list[Annotated[str, Field(max_length=AVOID_TOPIC_MAX)]],
            Field(max_length=MAX_AVOID_TOPICS),
        ]
        | None
    ) = None


class MemoryPatch(ApiModel):
    """What to change about one memory. A key left out is not a change; `day: null` takes an
    event's day away."""

    text: str = Field(default="", max_length=MEMORY_TEXT_MAX)
    day: dt.date | None = None


class ReportMistakeOut(ApiModel):
    # The turn of the transcript it is in, counted from 0.
    turn: int
    original: str
    corrected: str
    explanation: str
    # One of the language pack's error categories, or "other".
    category: str
    severity: Severity
    # False: the second check could not confirm it. Shown as a possible issue, never as a fact.
    certain: bool
    # The learner has it as a card.
    saved: bool


class ReportRewriteOut(ApiModel):
    turn: int
    original: str
    natural: str
    note: str


class ReportWordOut(ApiModel):
    text: str
    meaning: str
    # The sentence of the conversation it came from; null without one.
    example: str | None
    # The learner has it as a card.
    saved: bool


class ReportStatsOut(ApiModel):
    learner_words: int
    partner_words: int
    learner_turns: int
    longest_turn_words: int


class SessionReportOut(ApiModel):
    # The language the explanations are written in.
    language: str
    summary: str
    mistakes: list[ReportMistakeOut]
    rewrites: list[ReportRewriteOut]
    words: list[ReportWordOut]
    wins: list[str]
    next_steps: list[str]
    stats: ReportStatsOut

    @classmethod
    def of(cls, report: Report, saved: Saved) -> "SessionReportOut":
        return cls(
            language=report.language,
            summary=report.summary,
            mistakes=[
                ReportMistakeOut(**dataclasses.asdict(mistake), saved=known)
                for mistake, known in zip(report.mistakes, saved.mistakes, strict=True)
            ],
            rewrites=[
                ReportRewriteOut.model_validate(rewrite, from_attributes=True)
                for rewrite in report.rewrites
            ],
            words=[
                ReportWordOut(**dataclasses.asdict(word), saved=known)
                for word, known in zip(report.words, saved.words, strict=True)
            ],
            wins=list(report.wins),
            next_steps=list(report.next_steps),
            stats=ReportStatsOut.model_validate(report.stats, from_attributes=True),
        )


class ReportOut(ApiModel):
    # "none": never asked for. "too_short": the learner said too little to report on.
    status: ReportStatus
    # Only when the status is "ready".
    report: SessionReportOut | None

    @classmethod
    def of(cls, state: ReportState, saved: Saved | None) -> "ReportOut":
        """`saved`: which of the report's words and mistakes are cards; with a report only."""
        report = state.report
        return cls(
            status=state.status,
            report=SessionReportOut.of(report, saved) if report and saved else None,
        )


class HomeLevelOut(ApiModel):
    # The level practice starts at.
    level: StartingLevel
    source: Source
    # Level per skill from the placement test; null when it was not taken.
    skills: dict[str, StartingLevel] | None

    @classmethod
    def of(cls, level: LevelView) -> "HomeLevelOut":
        return cls.model_validate(
            {
                "level": level.level,
                "source": level.source,
                "skills": None if level.skills is None else dict(level.skills),
            }
        )


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


class WeekOut(ApiModel):
    # The week's Monday, on the learner's calendar.
    start: dt.date
    seconds: int
    conversations: int


class TalkShareOut(ApiModel):
    learner_words: int
    partner_words: int


class MistakeKindOut(ApiModel):
    # One of the language pack's error categories, or "other".
    category: str
    # How often it came up in each of the weeks, the oldest first.
    counts: list[int]


class MistakeTrendsOut(ApiModel):
    # The Mondays of the weeks the mistakes are counted in, the oldest first.
    weeks: list[dt.date]
    # The kinds that came up most, the most frequent first.
    kinds: list[MistakeKindOut]


class CardProgressOut(ApiModel):
    total: int
    due: int
    # Cards reviewed at least once.
    learned: int
    # Reviews in the last month, and how many of them the learner remembered.
    reviews: int
    remembered: int


class MilestoneOut(ApiModel):
    id: str
    # How far the learner is, never beyond the target, in the milestone's own unit.
    current: int
    target: int
    reached: bool


class ProgressOut(ApiModel):
    """The Progress screen in one answer."""

    language: str
    level: HomeLevelOut | None
    activity: ActivityOut
    # The last eight weeks, the oldest first.
    weeks: list[WeekOut]
    # The most days in a row the learner ever practised.
    longest_streak_days: int
    # Words said in the last month's conversations; null until one of them has a report.
    talk: TalkShareOut | None
    mistakes: MistakeTrendsOut
    cards: CardProgressOut
    milestones: list[MilestoneOut]

    @classmethod
    def of(cls, progress: ProgressView) -> "ProgressOut":
        talk, cards = progress.talk, progress.cards
        return cls(
            language=progress.language,
            level=HomeLevelOut.of(progress.level) if progress.level else None,
            activity=ActivityOut.of(progress.activity),
            weeks=[
                WeekOut(start=week.start, seconds=week.seconds, conversations=week.conversations)
                for week in progress.weeks
            ],
            longest_streak_days=progress.longest_streak_days,
            talk=TalkShareOut(learner_words=talk.learner_words, partner_words=talk.partner_words)
            if talk
            else None,
            mistakes=MistakeTrendsOut(
                weeks=list(progress.mistake_weeks),
                kinds=[
                    MistakeKindOut(category=trend.category, counts=list(trend.counts))
                    for trend in progress.mistakes
                ],
            ),
            cards=CardProgressOut(
                total=cards.total,
                due=cards.due,
                learned=cards.learned,
                reviews=cards.reviews,
                remembered=cards.remembered,
            ),
            milestones=[
                MilestoneOut(
                    id=mark.id, current=mark.current, target=mark.target, reached=mark.reached
                )
                for mark in progress.milestones
            ],
        )


class HomeOut(ApiModel):
    """The Today screen in one answer."""

    language: str
    level: HomeLevelOut | None
    # Things to work on, most useful first, and where they come from: the report on the last
    # conversation or, until there is one, the placement test. Null when there is nothing.
    focus: list[str]
    focus_source: Literal["report", "placement"] | None
    # Flashcards waiting to be reviewed.
    cards_due: int
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
            level=HomeLevelOut.of(level) if level else None,
            focus=list(home.focus),
            focus_source=home.focus_source,
            cards_due=home.cards_due,
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
    # The account may open the owner's view of the costs.
    owner: bool

    @classmethod
    def of(cls, view: AccountView, owner: bool) -> "AccountOut":
        picture = PictureOut(url=view.picture_url) if view.picture_url else None
        return cls(picture=picture, owner=owner)


class AllowanceOut(ApiModel):
    """The learner's voice minutes this week, in seconds (spec §6.19)."""

    weekly_seconds: int
    used_seconds: int
    remaining_seconds: int
    # When the week's minutes come back.
    resets_at: AwareDatetime

    @classmethod
    def of(cls, allowance: Allowance) -> "AllowanceOut":
        return cls(
            weekly_seconds=allowance.weekly_seconds,
            used_seconds=allowance.used_seconds,
            remaining_seconds=allowance.remaining_seconds,
            resets_at=allowance.resets_at,
        )


class DaySpendOut(ApiModel):
    day: dt.date
    usd: float


class ShareOut(ApiModel):
    # A feature or a provider.
    key: str
    usd: float
    requests: int


class LearnerSpendOut(ApiModel):
    user_id: UUID
    # The learner's first name; null when the account is gone or has none.
    name: str | None
    usd: float
    requests: int
    voice_seconds: int


class CostsOut(ApiModel):
    """A month's estimated spending, for the owner (spec §6.19). Estimates from usage counts and
    the configured prices, not the providers' invoices."""

    month: dt.date
    level: Level
    target_usd: float
    ceiling_usd: float
    total_usd: float
    # Requests to a model without a price: the total is too low by their cost.
    unpriced: int
    # Days with spending, oldest first (UTC).
    days: list[DaySpendOut]
    features: list[ShareOut]
    providers: list[ShareOut]
    # The learners who cost the most, most first.
    learners: list[LearnerSpendOut]

    @classmethod
    def of(cls, report: CostReport) -> "CostsOut":
        spending = report.spending
        return cls(
            month=report.month,
            level=report.level,
            target_usd=report.budget.target_usd,
            ceiling_usd=report.budget.ceiling_usd,
            total_usd=round(spending.total_usd, 2),
            unpriced=spending.unpriced,
            days=[DaySpendOut(day=d.day, usd=round(d.usd, 2)) for d in spending.days],
            features=[_share(share) for share in spending.features],
            providers=[_share(share) for share in spending.providers],
            learners=[
                LearnerSpendOut(
                    user_id=learner.user_id,
                    name=report.names.get(learner.user_id),
                    usd=round(learner.usd, 2),
                    requests=learner.requests,
                    voice_seconds=learner.voice_seconds,
                )
                for learner in spending.learners
                if learner.user_id is not None
            ],
        )


def _share(share: Share) -> ShareOut:
    return ShareOut(key=share.key, usd=round(share.usd, 2), requests=share.requests)


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
