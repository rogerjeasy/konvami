"""Request and response bodies. Keys are camelCase; profile field names are data and stay as
they are stored (`target_language`).
"""

import dataclasses
import datetime as dt
from collections.abc import Callable, Mapping, Sequence
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool
from pydantic.alias_generators import to_camel

from konvami_api.domain.accounts import AccountView, PictureUpload
from konvami_api.domain.cards import Article, Card, Deck, Part, Queue, Saved, WordDetails
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
from konvami_api.domain.director import ExamPace, ExamWeek, Reason, SessionKind, WeekPlan
from konvami_api.domain.exam_centre import ExamCentre, Simulation
from konvami_api.domain.exams import ExamCard, PartKind, SpeakingExam
from konvami_api.domain.fsrs import Rating
from konvami_api.domain.grammar_map import GrammarMap, Mastery, TopicPage, TopicState, Trend
from konvami_api.domain.home import HomeView, LevelView
from konvami_api.domain.levels import LevelStep
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
from konvami_api.domain.plan import SessionPlan
from konvami_api.domain.profile import (
    AVOID_TOPIC_MAX,
    GLOBAL_SCOPE,
    MAX_AVOID_TOPICS,
    Profile,
    Source,
)
from konvami_api.domain.progress import ProgressView
from konvami_api.domain.reminders import ReminderNotes
from konvami_api.domain.reports import Report, ReportState, Severity
from konvami_api.domain.reports import Status as ReportStatus
from konvami_api.domain.retries import Retried
from konvami_api.domain.tutor import MAX_QUESTION as TUTOR_QUESTION_MAX
from konvami_api.domain.tutor import Source as TutorSource
from konvami_api.domain.tutor import TutorQuestion
from konvami_api.domain.voice import CallPurpose, CallStarted
from konvami_api.domain.voice_review import Answered, Outcome
from konvami_api.domain.week_review import WeekReview

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
    # A practice call that rehearses a role-play (a scenario id from the catalog), or the
    # speaking test an exam call simulates (a format id of the exam centre).
    scenario: str | None = Field(default=None, max_length=MAX_SCENARIO_ID)
    # A practice call that practises a grammar topic first (a topic id from the grammar map),
    # or "words": a review conversation built around the learner's due words.
    practise: str | None = Field(default=None, max_length=MAX_SCENARIO_ID)


class PlanWordOut(ApiModel):
    text: str
    meaning: str


class CallPlanOut(ApiModel):
    """What a practice conversation sets out to practise, as the learner sees it: the kinds of
    mistake (a language pack's categories) and the words to use. How the partner is told to
    bring them up stays on the server."""

    # The language practised (an ISO 639-1 code), which the words are in.
    language: str
    focus: list[str]
    words: list[PlanWordOut]
    # A review conversation: the words are its point.
    review: bool

    @classmethod
    def of(cls, plan: SessionPlan) -> "CallPlanOut":
        return cls(
            language=plan.language,
            focus=[point.topic for point in plan.focus],
            words=[PlanWordOut(text=word.text, meaning=word.meaning) for word in plan.words],
            review=plan.review,
        )


class VoiceCallOut(ApiModel):
    call_id: str
    # The provider's answer (SDP) for the app's peer connection.
    sdp: str
    # The call is ended by the server after this many seconds.
    max_seconds: int
    # A practice conversation's plan; null for the guide's calls.
    plan: CallPlanOut | None

    @classmethod
    def of(cls, started: CallStarted) -> "VoiceCallOut":
        return cls(
            call_id=started.call_id,
            sdp=started.sdp_answer,
            max_seconds=started.max_seconds,
            plan=CallPlanOut.of(started.plan) if started.plan else None,
        )


class GrammarTopicOut(ApiModel):
    """A topic of the grammar map and how well the learner has it. The app names it in the
    interface language."""

    id: str
    level: str
    mastery: Mastery
    # Over the conversations that count: how often it was used, how often right, in how many.
    uses: int
    correct: int
    conversations: int
    trend: Trend | None
    last_used_at: dt.datetime | None

    @classmethod
    def of(cls, state: TopicState) -> "GrammarTopicOut":
        found = state.mastery
        return cls(
            id=state.topic.id,
            level=state.topic.level,
            mastery=found.state,
            uses=found.uses,
            correct=found.correct,
            conversations=found.conversations,
            trend=found.trend,
            last_used_at=found.last_used_at,
        )


class GrammarMapOut(ApiModel):
    language: str
    # The learner's level, for the map to show where they are.
    level: str
    topics: list[GrammarTopicOut]

    @classmethod
    def of(cls, found: GrammarMap) -> "GrammarMapOut":
        return cls(
            language=found.language,
            level=found.level,
            topics=[GrammarTopicOut.of(state) for state in found.topics],
        )


class TopicMistakeOut(ApiModel):
    conversation_id: str
    at: dt.datetime
    original: str
    corrected: str
    explanation: str
    certain: bool


class GrammarTopicPageOut(ApiModel):
    topic: GrammarTopicOut
    # Sentences that use it well, and typical learner sentences that break it.
    examples: list[str]
    typical_mistakes: list[str]
    # The learner's own, newest first.
    mistakes: list[TopicMistakeOut]

    @classmethod
    def of(cls, page: TopicPage) -> "GrammarTopicPageOut":
        return cls(
            topic=GrammarTopicOut.of(page.state),
            examples=list(page.state.topic.examples),
            typical_mistakes=list(page.typical_mistakes),
            mistakes=[
                TopicMistakeOut(
                    conversation_id=m.call_id,
                    at=m.at,
                    original=m.original,
                    corrected=m.corrected,
                    explanation=m.explanation,
                    certain=m.certain,
                )
                for m in page.mistakes
            ],
        )


# A sentence said on purpose is a few seconds of compressed audio; this is a minute and more, in
# base64.
MAX_SPOKEN_AUDIO = 2_000_000


class RecordingIn(ApiModel):
    """A sentence recorded on the device: a correction said again, or a card's answer."""

    # The recording, in base64.
    audio: str = Field(min_length=1, max_length=MAX_SPOKEN_AUDIO)
    # Its file type: "m4a" (a phone) or "webm" (a browser).
    format: str = Field(min_length=1, max_length=8)
    # How long it plays, as the recorder measured it.
    duration_ms: int | None = Field(default=None, ge=0, le=600_000)


class RetriedOut(ApiModel):
    heard: str
    right: bool
    said: str
    better: str

    @classmethod
    def of(cls, retried: Retried) -> "RetriedOut":
        return cls(
            heard=retried.heard, right=retried.right, said=retried.said, better=retried.better
        )


class RetryOut(ApiModel):
    # The correction's position in the report.
    index: int
    # Whether one of the attempts was right.
    right: bool


class RetriesOut(ApiModel):
    retries: list[RetryOut]


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


class WordDetailsOut(ApiModel):
    """A word's forms (spec §6.7); a form the word does not have is null."""

    part: Part
    article: Article | None
    plural: str | None
    present: str | None
    preterite: str | None
    perfect: str | None
    separable: bool | None
    case: str | None
    comparative: str | None
    superlative: str | None

    @classmethod
    def of(cls, details: WordDetails) -> "WordDetailsOut":
        return cls(**dataclasses.asdict(details))


class AnsweredOut(ApiModel):
    """A card answered out loud: what was heard, how close it came, and the rating that points
    to. The card is not rated yet."""

    heard: str
    outcome: Outcome
    expected: str
    suggested: Rating

    @classmethod
    def of(cls, answered: Answered) -> "AnsweredOut":
        return cls(
            heard=answered.heard,
            outcome=answered.outcome,
            expected=answered.expected,
            suggested=answered.suggested,
        )


class CardAudioOut(ApiModel):
    # A short-lived address of the card's sound (MP3).
    url: str


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
    # A word's forms; null until they are written down, and for a correction.
    details: WordDetailsOut | None

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
            details=WordDetailsOut.of(card.details) if card.details else None,
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
    # The language the cards are in (ISO 639-1).
    language: str

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
            language=queue.language,
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


class LevelStepOut(ApiModel):
    """The level the conversation's evidence moved the learner to (spec §6.9)."""

    before: StartingLevel
    after: StartingLevel
    rose: bool

    @classmethod
    def of(cls, step: LevelStep) -> "LevelStepOut":
        return cls.model_validate({"before": step.before, "after": step.after, "rose": step.rose})


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
    # Set when this conversation moved the learner's level: the report announces it.
    level_step: LevelStepOut | None

    @classmethod
    def of(cls, report: Report, saved: Saved, step: LevelStep | None) -> "SessionReportOut":
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
            level_step=LevelStepOut.of(step) if step else None,
        )


class ReportOut(ApiModel):
    # "none": never asked for. "too_short": the learner said too little to report on.
    status: ReportStatus
    # Only when the status is "ready".
    report: SessionReportOut | None

    @classmethod
    def of(
        cls, state: ReportState, saved: Saved | None, step: LevelStep | None = None
    ) -> "ReportOut":
        """`saved`: which of the report's words and mistakes are cards; with a report only."""
        report = state.report
        return cls(
            status=state.status,
            report=SessionReportOut.of(report, saved, step) if report and saved else None,
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


class LevelPointOut(ApiModel):
    # From when the learner practised at this level.
    at: dt.datetime
    level: StartingLevel
    # "asked": set by the learner; "measured": by the placement test or the level engine.
    source: Source


class ExamCardOut(ApiModel):
    id: str
    # In the language of the exam, as printed on the card.
    title: str
    prompts: list[str]

    @classmethod
    def of(cls, card: ExamCard) -> "ExamCardOut":
        return cls(id=card.id, title=card.title, prompts=list(card.prompts))


class ExamPartOut(ApiModel):
    id: str
    # The app names each kind of part in its own strings.
    kind: PartKind
    seconds: int


class SpeakingExamOut(ApiModel):
    """A speaking test the exam centre simulates (spec §6.13)."""

    id: str
    # The profile's exam type ("goethe"), and the levels it is the test for.
    exam: str
    levels: list[str]
    name: str
    prep_seconds: int
    parts: list[ExamPartOut]
    # The share of the points it takes to pass.
    pass_share: float

    @classmethod
    def of(cls, exam: SpeakingExam) -> "SpeakingExamOut":
        return cls(
            id=exam.id,
            exam=exam.exam,
            levels=list(exam.levels),
            name=exam.name,
            prep_seconds=exam.prep_seconds,
            parts=[ExamPartOut(id=p.id, kind=p.kind, seconds=p.seconds) for p in exam.parts],
            pass_share=exam.pass_share,
        )


class ReadinessOut(ApiModel):
    # The latest simulation's share of the points, and its change from the one before.
    latest: float
    change: float | None
    passing: bool
    # The part with the lowest share lately.
    weakest: str | None
    # When a steady rise would reach the pass mark; null without one.
    ready_on: dt.date | None


class SimulationSummaryOut(ApiModel):
    call_id: str
    exam: str
    started_at: dt.datetime
    status: Literal["pending", "ready", "failed", "too_short"]
    # Null until it is scored.
    total: float | None
    passed: bool | None


class LearnerExamOut(ApiModel):
    type: str
    target_level: str | None
    date: dt.date | None


class ExamCentreOut(ApiModel):
    """The exam centre in one answer."""

    language: str
    # The exam in the learner's profile; null without one.
    exam: LearnerExamOut | None
    # The speaking test of that exam; null when there is none.
    suggested: str | None
    formats: list[SpeakingExamOut]
    # Newest first.
    simulations: list[SimulationSummaryOut]
    # Per speaking test the learner tried.
    readiness: dict[str, ReadinessOut]

    @classmethod
    def of(cls, centre: ExamCentre) -> "ExamCentreOut":
        exam = centre.exam
        return cls(
            language=centre.language,
            exam=LearnerExamOut(type=exam.type, target_level=exam.target_level, date=exam.date)
            if exam
            else None,
            suggested=centre.suggested,
            formats=[SpeakingExamOut.of(found) for found in centre.formats],
            simulations=[
                SimulationSummaryOut(
                    call_id=s.call_id,
                    exam=s.exam,
                    started_at=s.started_at,
                    status=s.status,
                    total=s.result.total if s.result else None,
                    passed=s.result.passed if s.result else None,
                )
                for s in centre.simulations
            ],
            readiness={
                exam_id: ReadinessOut(
                    latest=r.latest,
                    change=r.change,
                    passing=r.passing,
                    weakest=r.weakest,
                    ready_on=r.ready_on,
                )
                for exam_id, r in centre.readiness.items()
            },
        )


class NextSimulationOut(ApiModel):
    exam: SpeakingExamOut
    # One per part, in order.
    cards: list[ExamCardOut]


class MarksOut(ApiModel):
    task: int
    coherence: int
    vocabulary: int
    grammar: int


class PartScoreOut(ApiModel):
    part: str
    marks: MarksOut
    share: float
    # In the learner's explanation language.
    feedback: str
    # In the language of the exam.
    model_answer: str


class SimulationResultOut(ApiModel):
    # An estimate from the transcript, never an official score.
    total: float
    passed: bool
    pass_share: float
    summary: str
    parts: list[PartScoreOut]


class SimulationOut(ApiModel):
    call_id: str
    exam: str
    # The card of each part, in order.
    cards: list[ExamCardOut]
    started_at: dt.datetime
    status: Literal["pending", "ready", "failed", "too_short"]
    result: SimulationResultOut | None

    @classmethod
    def of(cls, simulation: Simulation, cards: Sequence[ExamCard]) -> "SimulationOut":
        result = simulation.result
        return cls(
            call_id=simulation.call_id,
            exam=simulation.exam,
            cards=[ExamCardOut.of(card) for card in cards],
            started_at=simulation.started_at,
            status=simulation.status,
            result=SimulationResultOut(
                total=result.total,
                passed=result.passed,
                pass_share=result.pass_share,
                summary=result.summary,
                parts=[
                    PartScoreOut(
                        part=part.part,
                        marks=MarksOut.model_validate(dict(part.marks)),
                        share=round(part.share, 4),
                        feedback=part.feedback,
                        model_answer=part.model_answer,
                    )
                    for part in result.parts
                ],
            )
            if result
            else None,
        )


class PlanSessionOut(ApiModel):
    """One conversation of today's plan."""

    kind: SessionKind
    minutes: int
    # The grammar topic it puts first; null for a review conversation.
    topic: str | None
    # A role-play's scenario; null for the other kinds.
    scenario: str | None
    # A simulation's speaking test (an exam centre format id); null for the other kinds.
    exam: str | None


class WeekSessionsOut(ApiModel):
    exam: int
    review: int
    role_play: int
    free: int


class WeakestPartOut(ApiModel):
    # Its place in the test, 1 for the first.
    number: int
    kind: PartKind


class ExamWeekOut(ApiModel):
    """The week's simulations of the learner's speaking test."""

    # The speaking test (an exam centre format id) and its name.
    test: str
    name: str
    # How often the plan has one, from how close the exam is.
    pace: ExamPace
    # How long one takes.
    minutes: int
    # The simulations the pace asks for, those the week has room for, and those done.
    wanted: int
    simulations: int
    done: int
    # The part that scored lowest lately; null before a score.
    weakest: WeakestPartOut | None

    @classmethod
    def of(cls, exam: ExamWeek) -> "ExamWeekOut":
        weakest = exam.weakest
        return cls(
            test=exam.test,
            name=exam.name,
            pace=exam.pace,
            minutes=exam.minutes,
            wanted=exam.wanted,
            simulations=exam.simulations,
            done=exam.done,
            weakest=WeakestPartOut(number=weakest.number, kind=weakest.kind) if weakest else None,
        )


class WeekPlanOut(ApiModel):
    """This week's plan (the Learning Director, spec §6.12), as it stands now."""

    # The week's Monday, on the learner's calendar.
    week: dt.date
    # The speaking it sets out to do, and on how many days.
    minutes: int
    days: int
    # True when the voice minutes made the week shorter than the learner's habit.
    capped: bool
    # Conversations of each kind the week plans.
    sessions: WeekSessionsOut
    # Grammar topics, in order.
    topics: list[str]
    # Card reviews to aim for.
    cards: int
    done_minutes: int
    done_days: int
    # What is left for today, the shortest first; empty when nothing is.
    today: list[PlanSessionOut]
    today_cards: int
    # Why today's part is what it is.
    reason: Reason
    # The planned days that went by without practice, when they made today longer.
    missed: list[dt.date]
    # The week's exam simulations; null without an exam that has a speaking test.
    exam: ExamWeekOut | None
    # The planned days among the next seven, today's included: the app reminds on them.
    upcoming: list[dt.date]

    @classmethod
    def of(cls, plan: WeekPlan) -> "WeekPlanOut":
        return cls(
            week=plan.week,
            minutes=plan.minutes,
            days=plan.days,
            capped=plan.capped,
            sessions=WeekSessionsOut(
                exam=plan.sessions[SessionKind.EXAM],
                review=plan.sessions[SessionKind.REVIEW],
                role_play=plan.sessions[SessionKind.ROLE_PLAY],
                free=plan.sessions[SessionKind.FREE],
            ),
            topics=list(plan.topics),
            cards=plan.cards,
            done_minutes=plan.done_minutes,
            done_days=plan.done_days,
            today=[
                PlanSessionOut(
                    kind=session.kind,
                    minutes=session.minutes,
                    topic=session.topic,
                    scenario=session.scenario,
                    exam=session.exam,
                )
                for session in plan.today
            ],
            today_cards=plan.today_cards,
            reason=plan.reason,
            missed=list(plan.missed),
            exam=ExamWeekOut.of(plan.exam) if plan.exam else None,
            upcoming=list(plan.upcoming),
        )


class TopicMoveOut(ApiModel):
    topic: str
    # How well the learner had it when the week began, and when it ended.
    before: Mastery
    after: Mastery
    moved: bool


class WeekNumbersOut(ApiModel):
    # The week's Monday, on the learner's calendar.
    week: dt.date
    minutes: int
    planned_minutes: int
    previous_minutes: int
    days: int
    planned_days: int
    conversations: int
    role_plays: int
    reviews: int
    cards_reviewed: int
    topics: list[TopicMoveOut]
    # Confirmed mistakes in the week's reports, and in the week before's.
    mistakes: int
    previous_mistakes: int
    # The level when the week began and when it ended; null before there was one.
    level_before: StartingLevel | None
    level_after: StartingLevel | None
    # Saved words the week's conversations brought, and of them the ones the learner said.
    words_planned: int
    words_used: int


class WeekReviewOut(ApiModel):
    """Last week's check-in (spec §6.12): its numbers, and a few sentences from the partner
    once they are written."""

    status: Literal["none", "pending", "ready", "failed"]
    text: str | None
    numbers: WeekNumbersOut

    @classmethod
    def of(cls, review: WeekReview) -> "WeekReviewOut":
        numbers = review.numbers
        return cls(
            status=review.status,
            text=review.text,
            numbers=WeekNumbersOut(
                week=numbers.week,
                minutes=numbers.minutes,
                planned_minutes=numbers.planned_minutes,
                previous_minutes=numbers.previous_minutes,
                days=numbers.days,
                planned_days=numbers.planned_days,
                conversations=numbers.conversations,
                role_plays=numbers.role_plays,
                reviews=numbers.reviews,
                cards_reviewed=numbers.cards_reviewed,
                topics=[
                    TopicMoveOut(
                        topic=move.topic, before=move.before, after=move.after, moved=move.moved
                    )
                    for move in numbers.topics
                ],
                mistakes=numbers.mistakes,
                previous_mistakes=numbers.previous_mistakes,
                level_before=cast(StartingLevel | None, numbers.level_before),
                level_after=cast(StartingLevel | None, numbers.level_after),
                words_planned=numbers.words_planned,
                words_used=numbers.words_used,
            ),
        )


class SoundOut(ApiModel):
    # A short-lived address of the sound (MP3).
    url: str


class ProgressOut(ApiModel):
    """The Progress screen in one answer."""

    language: str
    level: HomeLevelOut | None
    # The level over time, the oldest first.
    level_history: list[LevelPointOut]
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
    # Last week's check-in; null when the learner did not practise last week.
    last_week: WeekReviewOut | None

    @classmethod
    def of(cls, progress: ProgressView, last_week: WeekReview | None) -> "ProgressOut":
        talk, cards = progress.talk, progress.cards
        return cls(
            last_week=WeekReviewOut.of(last_week) if last_week else None,
            language=progress.language,
            level=HomeLevelOut.of(progress.level) if progress.level else None,
            level_history=[
                LevelPointOut.model_validate(
                    {"at": point.at, "level": point.level, "source": point.source}
                )
                for point in progress.level_history
            ],
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


class FollowUpOut(ApiModel):
    # The day to ask on: the day after the event.
    day: dt.date
    # What the partner asks, in the learner's explanation language.
    text: str


class DailyWordOut(ApiModel):
    day: dt.date
    card: CardOut


class ReminderNotesOut(ApiModel):
    """What the phone's reminders of the next seven days need besides the week's plan
    (spec §6.18): the questions after the learner's events, and a word of the day."""

    follow_ups: list[FollowUpOut]
    # One a day, today's first; empty without saved words.
    words: list[DailyWordOut]

    @classmethod
    def of(cls, notes: ReminderNotes) -> "ReminderNotesOut":
        return cls(
            follow_ups=[FollowUpOut(day=ask.day, text=ask.text) for ask in notes.follow_ups],
            words=[DailyWordOut(day=word.day, card=CardOut.of(word.card)) for word in notes.words],
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
    plan: WeekPlanOut
    reminders: ReminderNotesOut

    @classmethod
    def of(cls, home: HomeView, plan: WeekPlan, notes: ReminderNotes) -> "HomeOut":
        level, exam = home.level, home.exam
        return cls(
            plan=WeekPlanOut.of(plan),
            reminders=ReminderNotesOut.of(notes),
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
