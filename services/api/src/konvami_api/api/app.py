"""The HTTP API. Handlers translate between HTTP and the domain services and decide nothing."""

import base64
import binascii
import datetime as dt
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, Path, Query, Request
from pydantic import AwareDatetime, BaseModel, ConfigDict

from konvami_api.api.auth import CurrentUser, recently_signed_in
from konvami_api.api.errors import ApiError, ErrorBody, install_error_handlers
from konvami_api.api.public import public_router
from konvami_api.api.schemas import (
    AccountDeletedOut,
    AccountOut,
    AllowanceOut,
    AnsweredOut,
    CardAudioOut,
    CardIn,
    CardOut,
    CatalogOut,
    ConversationsOut,
    CostsOut,
    DataExportOut,
    DeckOut,
    DeckSummaryOut,
    ExamCardOut,
    ExamCentreOut,
    FeedbackIn,
    FeedbackInboxOut,
    FeedbackOut,
    FeedbackResolution,
    FlagIn,
    FlagOut,
    FlagQueueOut,
    FlagResolution,
    FlagsOut,
    GrammarMapOut,
    GrammarTopicPageOut,
    HomeOut,
    ImportIn,
    ImportOut,
    ImportsOut,
    ImportUploadOut,
    InboxFeedbackOut,
    MemoriesOut,
    MemoryOut,
    MemoryPatch,
    MemorySettingsPatch,
    NextSimulationOut,
    OnboardingOut,
    PenPalNoteOut,
    PenPalOut,
    PenPalReplyOut,
    PenPalSettingsIn,
    PenPalSettingsOut,
    PenPalThreadOut,
    PersonaDescription,
    PersonaDraftOut,
    PersonaIn,
    PersonaOut,
    PersonaPatch,
    PersonasOut,
    PersonaTemplatesOut,
    PhrasebookOut,
    PhraseIn,
    PhraseOut,
    PhraseSuggestionOut,
    PhraseSuggestionsIn,
    PhraseSuggestionsOut,
    PictureConfirm,
    PictureUploadOut,
    PlacementDecision,
    PlacementOut,
    PlanOut,
    PremiumVoiceChoiceIn,
    PremiumVoicesOut,
    ProblemWordOut,
    ProblemWordsOut,
    ProfileAnswerIn,
    ProfileChangesOut,
    ProfileOut,
    ProfilePatch,
    ProfileQuestionOut,
    ProgressOut,
    PronunciationAttemptIn,
    PronunciationAttemptOut,
    PronunciationPickIn,
    PronunciationPickOut,
    PushDeviceIn,
    PushDeviceOut,
    QueuedFlagOut,
    QueueOut,
    RecordingIn,
    RecordingsOut,
    RecordingsPatch,
    ReportOut,
    RetriedOut,
    RetriesOut,
    RetryOut,
    ReviewIn,
    SimulationOut,
    SoundDetailOut,
    SoundOut,
    SoundsOut,
    SoundSummaryOut,
    SpeakingExamOut,
    ThenVsNowOut,
    TranscriptOut,
    TutorCorrectionIn,
    TutorQuestionIn,
    TutorQuestionOut,
    TutorQuestionsOut,
    VoiceCallIn,
    VoiceCallOut,
    VoiceSampleOut,
    WeekReviewOut,
)
from konvami_api.domain.accounts import AccountService, AccountView
from konvami_api.domain.card_details import CardDetailsService
from konvami_api.domain.cards import PAGE_DEFAULT as CARDS_PAGE_DEFAULT
from konvami_api.domain.cards import QUEUE_DEFAULT, CardError, CardService
from konvami_api.domain.catalog import Catalog
from konvami_api.domain.conversation_review import ConversationReview
from konvami_api.domain.conversations import PAGE_DEFAULT, ConversationService
from konvami_api.domain.costs import CostService
from konvami_api.domain.course_import import CourseImportError, CourseImportService
from konvami_api.domain.director import DirectorService
from konvami_api.domain.exam_centre import ExamService, Simulation
from konvami_api.domain.exports import DataExportService
from konvami_api.domain.feedback import FeedbackService, FeedbackStatus
from konvami_api.domain.flags import FlagService, FlagStatus
from konvami_api.domain.grammar_map import GrammarMapService
from konvami_api.domain.home import HomeService
from konvami_api.domain.levels import LevelService
from konvami_api.domain.memories import Memory, MemoryBook, MemoryService
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.penpal import PenPalError, PenPalService
from konvami_api.domain.persona_parts import Voice
from konvami_api.domain.personas import Persona, PersonaService
from konvami_api.domain.phrasebook import PhrasebookEntry, PhrasebookService
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.plans import Perk, PlanService, StoreEvent, token_matches
from konvami_api.domain.premium_voices import PremiumVoiceService
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.profile_questions import ProfileQuestionService
from konvami_api.domain.progress import ProgressService
from konvami_api.domain.pronunciation import PronunciationError, PronunciationService
from konvami_api.domain.push import PushService
from konvami_api.domain.recordings import RecordingService
from konvami_api.domain.reminders import ReminderService
from konvami_api.domain.reports import ReportService, ReportState
from konvami_api.domain.retries import RetryError, RetryService
from konvami_api.domain.then_vs_now import ThenVsNowService
from konvami_api.domain.tutor import TutorService
from konvami_api.domain.voice import CallPurpose, VoiceCallService
from konvami_api.domain.voice_review import VoiceReviewService
from konvami_api.domain.voices import VoiceSampleService
from konvami_api.domain.web_deletion import WebDeletionService
from konvami_api.domain.week_review import WeekReviewService


@dataclass(frozen=True)
class Services:
    """Everything the handlers need, built once per Lambda container (or per test)."""

    catalog: Catalog
    profiles: ProfileService
    questions: ProfileQuestionService
    onboarding: OnboardingService
    voice: VoiceCallService
    placement: PlacementService
    personas: PersonaService
    conversations: ConversationService
    reports: ReportService
    levels: LevelService
    cards: CardService
    memories: MemoryService
    reminders: ReminderService
    push: PushService
    home: HomeService
    progress: ProgressService
    accounts: AccountService
    recordings: RecordingService
    tutor: TutorService
    phrasebook: PhrasebookService
    course_imports: CourseImportService
    voices: VoiceSampleService
    premium_voices: PremiumVoiceService
    costs: CostService
    grammar: GrammarMapService
    card_details: CardDetailsService
    retries: RetryService
    voice_review: VoiceReviewService
    conversation_review: ConversationReview
    director: DirectorService
    week_reviews: WeekReviewService
    exams: ExamService
    flags: FlagService
    then_vs_now: ThenVsNowService
    pronunciation: PronunciationService

    pen_pal: PenPalService

    feedback: FeedbackService

    exports: DataExportService
    web_deletion: WebDeletionService

    plans: PlanService
    # Reads the secret RevenueCat's webhook sends (Secrets Manager); empty when not set up.
    store_secret: Callable[[], str]


# Documented error responses, so the generated client knows their shape.
type Responses = dict[int | str, dict[str, Any]]
NOT_AUTHENTICATED: Responses = {401: {"model": ErrorBody}}
REFUSED: Responses = {422: {"model": ErrorBody}}
CONFLICT: Responses = {409: {"model": ErrorBody}}
NOT_FOUND: Responses = {404: {"model": ErrorBody}}
TUTOR_REFUSED: Responses = {code: {"model": ErrorBody} for code in (403, 429, 503)}
CALL_REFUSED: Responses = {code: {"model": ErrorBody} for code in (403, 404, 409, 429, 503)}
RETRY_REFUSED: Responses = {code: {"model": ErrorBody} for code in (403, 404, 409, 422, 429, 503)}
ANSWER_REFUSED: Responses = {code: {"model": ErrorBody} for code in (403, 404, 422, 429, 503)}
PEN_PAL_REFUSED: Responses = ANSWER_REFUSED
LIMITED: Responses = {429: {"model": ErrorBody}}
UNAVAILABLE: Responses = {503: {"model": ErrorBody}}
# An IANA time zone name is at most a few dozen characters ("America/Argentina/ComodRivadavia").
MAX_TIME_ZONE_LENGTH = 64
# The changes made by voice that the Profile lists: the latest ones, which are the ones to undo.
MAX_CHANGES_SHOWN = 20


FORBIDDEN: Responses = {403: {"model": ErrorBody}}
# The plan does not include it: the app offers the paywall (spec §6.21.2).
PLAN_REQUIRED: Responses = {402: {"model": ErrorBody}}


def recorded(
    recording: RecordingIn, error: Callable[[str], Exception]
) -> tuple[bytes, float | None]:
    """A recording's audio, and how long it plays in seconds as the device measured it. Audio
    that is not base64 raises `error("invalid_value")`."""
    try:
        audio = base64.b64decode(recording.audio, validate=True)
    except (binascii.Error, ValueError) as invalid:
        raise error("invalid_value") from invalid
    seconds = recording.duration_ms / 1000 if recording.duration_ms is not None else None
    return audio, seconds


def _router(services: Services) -> APIRouter:
    def not_deleted(request: Request, user: CurrentUser) -> None:
        """Refuses to change anything for an account that was deleted: its last access token
        outlives it by up to an hour. Reading is not checked; there is nothing left to read."""
        if request.method != "GET" and services.accounts.is_deleted(user):
            raise ApiError(401, "not_authenticated")

    router = APIRouter(
        prefix="/v1", responses=NOT_AUTHENTICATED, dependencies=[Depends(not_deleted)]
    )

    @router.get("/catalog", operation_id="getCatalog")
    def get_catalog(_: CurrentUser) -> CatalogOut:
        return CatalogOut.of(services.catalog)

    @router.get("/profile", operation_id="getProfile")
    def get_profile(user: CurrentUser) -> ProfileOut:
        return ProfileOut.of(services.profiles.get(user))

    @router.patch("/profile", operation_id="updateProfile", responses=REFUSED)
    def update_profile(user: CurrentUser, patch: ProfilePatch) -> ProfileOut:
        changes = [Change(change.field, change.value, change.scope) for change in patch.changes]
        # What the learner types or taps is, by definition, what they told us.
        profile = services.profiles.apply(user, changes, source=Source.ASKED, origin=Origin.FORM)
        return ProfileOut.of(profile)

    @router.get("/profile/changes", operation_id="getProfileChanges")
    def get_profile_changes(user: CurrentUser) -> ProfileChangesOut:
        """What a partner changed by voice, newest first (spec §6.1.3)."""
        return ProfileChangesOut.of(services.profiles.recent(user, Origin.VOICE, MAX_CHANGES_SHOWN))

    @router.post(
        "/profile/changes/{change_id}/undo",
        operation_id="undoProfileChange",
        responses=NOT_FOUND | CONFLICT | REFUSED,
    )
    def undo_profile_change(user: CurrentUser, change_id: int) -> ProfileChangesOut:
        """Puts a setting back to what it was before a change made by voice."""
        services.profiles.undo(user, change_id)
        return ProfileChangesOut.of(services.profiles.recent(user, Origin.VOICE, MAX_CHANGES_SHOWN))

    @router.get("/profile/question", operation_id="getProfileQuestion")
    def get_profile_question(user: CurrentUser) -> ProfileQuestionOut:
        """The question about a setting that is due now, if one is (spec §6.1.2)."""
        return ProfileQuestionOut.of(services.questions.next(user))

    @router.post(
        "/profile/questions/{question}/answer",
        operation_id="answerProfileQuestion",
        responses=NOT_FOUND | REFUSED,
    )
    def answer_profile_question(
        user: CurrentUser, question: str, answer: ProfileAnswerIn
    ) -> ProfileQuestionOut:
        """Applies the learner's answer to a question about a setting."""
        services.questions.answer(user, question, answer.option)
        return ProfileQuestionOut.of(None)

    @router.post(
        "/profile/questions/{question}/dismiss",
        operation_id="dismissProfileQuestion",
        responses=NOT_FOUND,
    )
    def dismiss_profile_question(user: CurrentUser, question: str) -> ProfileQuestionOut:
        """The learner does not want to answer now: the question comes back once, later."""
        services.questions.dismiss(user, question)
        return ProfileQuestionOut.of(None)

    def onboarding_of(user: UUID) -> OnboardingOut:
        return OnboardingOut.of(
            services.onboarding.status(user), services.onboarding.placement(user)
        )

    @router.get("/onboarding", operation_id="getOnboarding")
    def get_onboarding(user: CurrentUser) -> OnboardingOut:
        return onboarding_of(user)

    @router.post(
        "/onboarding/essentials/confirm", operation_id="confirmEssentials", responses=CONFLICT
    )
    def confirm_essentials(user: CurrentUser) -> OnboardingOut:
        services.onboarding.confirm_essentials(user)
        return onboarding_of(user)

    @router.get("/placement", operation_id="getPlacement")
    def get_placement(user: CurrentUser) -> PlacementOut:
        return PlacementOut.of(services.placement.view(user))

    @router.post("/placement/skip", operation_id="skipPlacement", responses=CONFLICT)
    def skip_placement(user: CurrentUser) -> OnboardingOut:
        services.onboarding.skip_placement(user)
        return onboarding_of(user)

    @router.post("/placement/decision", operation_id="decidePlacement", responses=CONFLICT)
    def decide_placement(user: CurrentUser, decision: PlacementDecision) -> OnboardingOut:
        services.placement.decide(user, decision.use)
        return onboarding_of(user)

    @router.post("/personas/starter", operation_id="proposeStarterPersonas", responses=CONFLICT)
    def propose_starter_personas(user: CurrentUser) -> PersonasOut:
        return PersonasOut.of(services.personas.propose(user))

    @router.get("/personas", operation_id="getPersonas")
    def get_personas(user: CurrentUser) -> PersonasOut:
        return PersonasOut.of(services.personas.partners(user))

    @router.post(
        "/personas",
        operation_id="createPersona",
        responses=REFUSED | CONFLICT | PLAN_REQUIRED,
    )
    def create_persona(user: CurrentUser, persona: PersonaIn) -> PersonaOut:
        return PersonaOut.of(services.personas.create(user, persona.model_dump(exclude_unset=True)))

    @router.get("/personas/templates", operation_id="getPersonaTemplates")
    def get_persona_templates(user: CurrentUser) -> PersonaTemplatesOut:
        return PersonaTemplatesOut.of(services.personas.templates(user))

    @router.post(
        "/personas/draft",
        operation_id="draftPersona",
        responses=REFUSED | CONFLICT | LIMITED | UNAVAILABLE,
    )
    def draft_persona(user: CurrentUser, wish: PersonaDescription) -> PersonaDraftOut:
        return PersonaDraftOut.of(services.personas.draft(user, wish.description))

    @router.patch(
        "/personas/{persona_id}", operation_id="changePersona", responses=REFUSED | NOT_FOUND
    )
    def change_persona(user: CurrentUser, persona_id: UUID, patch: PersonaPatch) -> PersonaOut:
        # Only what the request named: a key left out is not a change, a null is one.
        changes = patch.model_dump(exclude_unset=True)
        return PersonaOut.of(services.personas.change(user, persona_id, **changes))

    @router.post(
        "/personas/{persona_id}/duplicate",
        operation_id="duplicatePersona",
        responses=NOT_FOUND | CONFLICT | PLAN_REQUIRED,
    )
    def duplicate_persona(user: CurrentUser, persona_id: UUID) -> PersonaOut:
        return PersonaOut.of(services.personas.duplicate(user, persona_id))

    @router.get(
        "/voices/{voice}/sample",
        operation_id="getVoiceSample",
        responses=REFUSED | CONFLICT | UNAVAILABLE,
    )
    def get_voice_sample(user: CurrentUser, voice: Voice) -> VoiceSampleOut:
        return VoiceSampleOut(url=services.voices.sample(user, voice))

    @router.get("/premium-voices", operation_id="getPremiumVoices")
    def get_premium_voices(user: CurrentUser) -> PremiumVoicesOut:
        return PremiumVoicesOut.of(services.premium_voices.status(user))

    @router.put(
        "/premium-voices/choice",
        operation_id="choosePremiumVoice",
        responses=REFUSED | CONFLICT | {403: {"model": ErrorBody}},
    )
    def choose_premium_voice(user: CurrentUser, body: PremiumVoiceChoiceIn) -> PremiumVoicesOut:
        return PremiumVoicesOut.of(services.premium_voices.choose(user, body.voice_id))

    @router.get(
        "/premium-voices/{voice_id}/sample",
        operation_id="getPremiumVoiceSample",
        responses=REFUSED | CONFLICT | UNAVAILABLE | {403: {"model": ErrorBody}},
    )
    def get_premium_voice_sample(user: CurrentUser, voice_id: str) -> VoiceSampleOut:
        return VoiceSampleOut(url=services.premium_voices.sample(user, voice_id))

    @router.delete("/personas/{persona_id}", operation_id="removePersona", responses=NOT_FOUND)
    def remove_persona(user: CurrentUser, persona_id: UUID) -> PersonasOut:
        services.personas.remove(user, persona_id)
        return PersonasOut.of(services.personas.partners(user))

    @router.post("/onboarding/partners/confirm", operation_id="confirmPartners", responses=CONFLICT)
    def confirm_partners(user: CurrentUser) -> OnboardingOut:
        services.personas.confirm(user)
        return onboarding_of(user)

    @router.post("/onboarding/complete", operation_id="completeOnboarding", responses=CONFLICT)
    def complete_onboarding(user: CurrentUser) -> OnboardingOut:
        services.onboarding.complete(user)
        return onboarding_of(user)

    @router.post(
        "/voice/calls", operation_id="startVoiceCall", responses=CALL_REFUSED | PLAN_REQUIRED
    )
    def start_voice_call(user: CurrentUser, offer: VoiceCallIn) -> VoiceCallOut:
        if offer.purpose is CallPurpose.EXAM:
            services.plans.require(user, Perk.EXAM_SIMULATIONS)
        started = services.voice.start(
            user,
            offer.purpose,
            offer.sdp,
            offer.persona_id,
            offer.local_date,
            offer.scenario,
            offer.practise,
        )
        return VoiceCallOut.of(started)

    @router.get("/plan", operation_id="getPlan")
    def get_plan(user: CurrentUser) -> PlanOut:
        """What the learner has bought and what it includes (spec §6.21.2)."""
        return PlanOut.of(user, services.plans.plan(user), services.plans.tiers())

    @router.get("/voice/allowance", operation_id="getVoiceAllowance")
    def get_voice_allowance(user: CurrentUser) -> AllowanceOut:
        return AllowanceOut.of(services.voice.allowance(user))

    @router.get("/owner/costs", operation_id="getCosts", responses=FORBIDDEN)
    def get_costs(user: CurrentUser, month: dt.date | None = None) -> CostsOut:
        """A month's estimated spending (this month unless `month` names its first day)."""
        return CostsOut.of(services.costs.report(user, month))

    @router.get("/home", operation_id="getHome", responses=CONFLICT)
    def get_home(
        user: CurrentUser,
        # The device's time zone ("Europe/Zurich"): days and the streak follow the learner's
        # calendar. Left out or unknown, they follow UTC.
        tz: Annotated[str | None, Query(max_length=MAX_TIME_ZONE_LENGTH)] = None,
    ) -> HomeOut:
        home = services.home.view(user, tz)
        return HomeOut.of(
            home, services.director.week(user, tz), services.reminders.notes(user, tz)
        )

    @router.get("/progress", operation_id="getProgress", responses=CONFLICT)
    def get_progress(
        user: CurrentUser,
        # The device's time zone, as for `/home`: days and weeks follow the learner's calendar.
        tz: Annotated[str | None, Query(max_length=MAX_TIME_ZONE_LENGTH)] = None,
    ) -> ProgressOut:
        progress = services.progress.view(user, tz)
        return ProgressOut.of(progress, services.week_reviews.last_week(user, tz))

    @router.post(
        "/weeks/{week}/review",
        operation_id="requestWeekReview",
        responses=NOT_FOUND | CONFLICT | FORBIDDEN | UNAVAILABLE,
    )
    def request_week_review(
        user: CurrentUser,
        week: dt.date,
        # The device's time zone, as for `/progress`: which week was last week.
        tz: Annotated[str | None, Query(max_length=MAX_TIME_ZONE_LENGTH)] = None,
    ) -> WeekReviewOut:
        """Has last week's check-in written (once); `week` is its Monday."""
        return WeekReviewOut.of(services.week_reviews.request(user, tz, week))

    @router.get("/exams", operation_id="getExamCentre")
    def get_exam_centre(user: CurrentUser) -> ExamCentreOut:
        return ExamCentreOut.of(services.exams.centre(user))

    @router.get("/exams/{exam_id}/next", operation_id="getNextSimulation", responses=NOT_FOUND)
    def get_next_simulation(user: CurrentUser, exam_id: str) -> NextSimulationOut:
        """The cards of the learner's next simulation of a speaking test, to prepare with."""
        upcoming = services.exams.next(user, exam_id)
        return NextSimulationOut(
            exam=SpeakingExamOut.of(upcoming.exam),
            cards=[ExamCardOut.of(card) for card in upcoming.cards],
        )

    def simulation_of(user: UUID, simulation: Simulation) -> SimulationOut:
        return SimulationOut.of(simulation, services.exams.cards_of(user, simulation))

    @router.get("/exams/simulations/{call_id}", operation_id="getSimulation", responses=NOT_FOUND)
    def get_simulation(user: CurrentUser, call_id: str) -> SimulationOut:
        return simulation_of(user, services.exams.result(user, call_id))

    @router.post(
        "/exams/simulations/{call_id}/score",
        operation_id="rescoreSimulation",
        responses=NOT_FOUND | LIMITED,
    )
    def rescore_simulation(user: CurrentUser, call_id: str) -> SimulationOut:
        """Asks again for a score that could not be written."""
        return simulation_of(user, services.exams.retry(user, call_id))

    @router.get(
        "/exams/simulations/{call_id}/parts/{part_id}/audio",
        operation_id="getModelAnswerAudio",
        responses=NOT_FOUND | UNAVAILABLE,
    )
    def get_model_answer_audio(user: CurrentUser, call_id: str, part_id: str) -> SoundOut:
        """Where a part's model answer plays from, in the examiner's voice."""
        return SoundOut(url=services.exams.audio(user, call_id, part_id))

    @router.get("/weeks/{week}/review", operation_id="getWeekReview", responses=NOT_FOUND)
    def get_week_review(
        user: CurrentUser,
        week: dt.date,
        tz: Annotated[str | None, Query(max_length=MAX_TIME_ZONE_LENGTH)] = None,
    ) -> WeekReviewOut:
        """Last week's check-in, to follow one being written; `week` is its Monday."""
        return WeekReviewOut.of(services.week_reviews.get(user, tz, week))

    @router.get(
        "/weeks/{week}/review/audio",
        operation_id="getWeekReviewAudio",
        responses=NOT_FOUND | UNAVAILABLE,
    )
    def get_week_review_audio(user: CurrentUser, week: dt.date) -> SoundOut:
        """Where the check-in plays from, spoken by the partner who wrote it."""
        return SoundOut(url=services.week_reviews.audio(user, week))

    @router.get("/conversations", operation_id="getConversations", responses=REFUSED)
    def get_conversations(
        user: CurrentUser,
        limit: int = PAGE_DEFAULT,
        # The `next` of the page before.
        before: AwareDatetime | None = None,
    ) -> ConversationsOut:
        return ConversationsOut.of(services.conversations.listed(user, limit=limit, before=before))

    @router.get(
        "/conversations/{conversation_id}", operation_id="getConversation", responses=NOT_FOUND
    )
    def get_conversation(user: CurrentUser, conversation_id: str) -> TranscriptOut:
        transcript = services.conversations.transcript(user, conversation_id)
        return TranscriptOut.of(transcript, services.recordings.address)

    def report_of(user: UUID, call_id: str, state: ReportState) -> ReportOut:
        if state.report is None:
            return ReportOut.of(state, None)
        saved = services.cards.saved(user, state.report)
        return ReportOut.of(state, saved, services.levels.step(user, call_id))

    @router.get(
        "/conversations/{conversation_id}/report",
        operation_id="getConversationReport",
        responses=NOT_FOUND,
    )
    def get_conversation_report(user: CurrentUser, conversation_id: str) -> ReportOut:
        return report_of(user, conversation_id, services.reports.view(user, conversation_id))

    @router.post(
        "/conversations/{conversation_id}/report",
        operation_id="requestConversationReport",
        responses=NOT_FOUND | CONFLICT | FORBIDDEN | LIMITED | UNAVAILABLE,
    )
    def request_conversation_report(user: CurrentUser, conversation_id: str) -> ReportOut:
        """Asks for a report that is not there: for an earlier conversation, or again after one
        failed. Answers at once; the report is written in the background."""
        return report_of(user, conversation_id, services.reports.request(user, conversation_id))

    @router.post("/cards", operation_id="saveCard", responses=NOT_FOUND | CONFLICT | REFUSED)
    def save_card(user: CurrentUser, item: CardIn) -> CardOut:
        """Makes a flashcard of a word or a correction in a conversation's report. Saving one
        that is a card already answers with that card."""
        return CardOut.of(services.cards.save(user, item.conversation_id, item.kind, item.index))

    @router.get("/cards", operation_id="getCards", responses=REFUSED)
    def get_cards(
        user: CurrentUser,
        limit: int = CARDS_PAGE_DEFAULT,
        # The `next` of the page before.
        before: AwareDatetime | None = None,
    ) -> DeckOut:
        return DeckOut.of(services.cards.deck(user, limit=limit, before=before))

    @router.get("/cards/due", operation_id="getDueCards", responses=REFUSED)
    def get_due_cards(user: CurrentUser, limit: int = QUEUE_DEFAULT) -> QueueOut:
        return QueueOut.of(services.cards.queue(user, limit=limit))

    @router.post(
        "/cards/{card_id}/review",
        operation_id="reviewCard",
        responses=NOT_FOUND | CONFLICT | REFUSED,
    )
    def review_card(user: CurrentUser, card_id: UUID, review: ReviewIn) -> CardOut:
        return CardOut.of(services.cards.review(user, card_id, review.rating))

    @router.post("/cards/{card_id}/answers", operation_id="answerCard", responses=ANSWER_REFUSED)
    def answer_card(user: CurrentUser, card_id: UUID, answer: RecordingIn) -> AnsweredOut:
        """Hears a card answered out loud (voice review) and says how close it came. The card
        is rated as before, by the learner."""
        audio, seconds = recorded(answer, CardError)
        return AnsweredOut.of(
            services.voice_review.answer(user, card_id, audio, answer.format, seconds)
        )

    @router.get(
        "/cards/{card_id}/audio", operation_id="getCardAudio", responses=NOT_FOUND | UNAVAILABLE
    )
    def get_card_audio(user: CurrentUser, card_id: UUID) -> CardAudioOut:
        """Where the card's sound plays from: the word with its sentence, or a correction as it
        is right, in the learner's partner's voice. Made the first time it is asked for."""
        return CardAudioOut(url=services.card_details.audio(user, card_id))

    @router.delete("/cards/{card_id}", operation_id="removeCard", responses=NOT_FOUND | REFUSED)
    def remove_card(user: CurrentUser, card_id: UUID) -> DeckSummaryOut:
        services.cards.remove(user, card_id)
        services.card_details.forget(user, card_id)
        deck = services.cards.deck(user, limit=1)
        return DeckSummaryOut(total=deck.total, due=deck.due)

    @router.put("/push/device", operation_id="registerPushDevice", responses=REFUSED)
    def register_push_device(user: CurrentUser, device: PushDeviceIn) -> PushDeviceOut:
        """Lets the server reach this phone: reports, scores and a nudge after a quiet week."""
        services.push.register(
            user,
            token=device.token,
            platform=device.platform,
            timezone=device.time_zone,
            language=device.language,
            time=device.time,
        )
        return PushDeviceOut(registered=True)

    @router.delete("/push/devices/{token}", operation_id="removePushDevice")
    def remove_push_device(user: CurrentUser, token: str) -> PushDeviceOut:
        """This phone is not to be reached any more (reminders off, signing out)."""
        services.push.unregister(user, token)
        return PushDeviceOut(registered=False)

    # After `/cards/due`: a card's id is never "due".
    @router.get("/cards/{card_id}", operation_id="getCard", responses=NOT_FOUND | REFUSED)
    def get_card(user: CurrentUser, card_id: UUID) -> CardOut:
        """One of the learner's cards (a word of the day opens it)."""
        return CardOut.of(services.cards.card(user, card_id))

    def partners_named(user: UUID, memories: Sequence[Memory]) -> dict[UUID, Persona]:
        """The partners whose names the memories need; they are read only when one does."""
        if not any(memory.persona_id for memory in memories):
            return {}
        return {partner.id: partner for partner in services.personas.partners(user)}

    def memories_of(user: UUID, book: MemoryBook) -> MemoriesOut:
        return MemoriesOut.of(book, partners_named(user, book.memories))

    @router.post(
        "/conversations/{call_id}/report/mistakes/{index}/retries",
        operation_id="retryCorrection",
        responses=RETRY_REFUSED,
    )
    def retry_correction(
        user: CurrentUser, call_id: str, index: int, attempt: RecordingIn
    ) -> RetriedOut:
        """Says correction `index` of a conversation's report again ("Say it better")."""
        audio, seconds = recorded(attempt, RetryError)
        return RetriedOut.of(
            services.retries.retry(user, call_id, index, audio, attempt.format, seconds)
        )

    @router.get("/conversations/{call_id}/retries", operation_id="getRetries", responses=NOT_FOUND)
    def get_retries(user: CurrentUser, call_id: str) -> RetriesOut:
        """The corrections of a conversation's report the learner said again."""
        tried = services.retries.of_conversation(user, call_id)
        return RetriesOut(
            retries=[RetryOut(index=index, right=right) for index, right in sorted(tried.items())]
        )

    @router.put(
        "/conversations/{call_id}/flags",
        operation_id="flagItem",
        responses=NOT_FOUND | REFUSED | LIMITED,
    )
    def flag_item(user: CurrentUser, call_id: str, item: FlagIn) -> FlagOut:
        """Reports a partner's line or a correction (spec §16.1). Reporting one again changes the
        reason and puts it back in the owner's queue."""
        return FlagOut.of(
            services.flags.flag(user, call_id, item.kind, item.index, item.reason, item.note)
        )

    @router.get("/conversations/{call_id}/flags", operation_id="getFlags", responses=NOT_FOUND)
    def get_flags(user: CurrentUser, call_id: str) -> FlagsOut:
        """What the learner reported in a conversation."""
        return FlagsOut(
            flags=[FlagOut.of(flag) for flag in services.flags.of_conversation(user, call_id)]
        )

    @router.get("/owner/flags", operation_id="getFlagQueue", responses=FORBIDDEN)
    def get_flag_queue(user: CurrentUser, status: FlagStatus | None = "open") -> FlagQueueOut:
        """The owner's review queue (open flags unless `status` says otherwise)."""
        return FlagQueueOut(
            flags=[QueuedFlagOut.of(flag) for flag in services.flags.queue(user, status)]
        )

    @router.put(
        "/owner/flags/{flag_id}", operation_id="resolveFlag", responses=FORBIDDEN | NOT_FOUND
    )
    def resolve_flag(user: CurrentUser, flag_id: UUID, resolution: FlagResolution) -> QueuedFlagOut:
        """Closes a flag as resolved or dismissed, or opens it again."""
        return QueuedFlagOut.of(services.flags.resolve(user, flag_id, resolution.status))

    @router.get("/pen-pal", operation_id="getPenPal")
    def get_pen_pal(user: CurrentUser) -> PenPalOut:
        """The learner's pen-pal settings and a line per partner (spec §6.16)."""
        return PenPalOut.of(services.pen_pal.overview(user))

    @router.put("/pen-pal/settings", operation_id="updatePenPalSettings", responses=REFUSED)
    def update_pen_pal_settings(user: CurrentUser, changes: PenPalSettingsIn) -> PenPalSettingsOut:
        """Turns the partners' unprompted voice notes on or off, and sets how often and when."""
        return PenPalSettingsOut.of(
            services.pen_pal.configure(user, **changes.model_dump(exclude_none=True))
        )

    @router.get("/pen-pal/{persona_id}", operation_id="getPenPalThread", responses=NOT_FOUND)
    def get_pen_pal_thread(user: CurrentUser, persona_id: UUID) -> PenPalThreadOut:
        """One partner's thread: every note, oldest first, with an address to play each."""
        return PenPalThreadOut.of(services.pen_pal.thread(user, persona_id))

    @router.post(
        "/pen-pal/{persona_id}/opened", operation_id="openPenPalThread", responses=NOT_FOUND
    )
    def open_pen_pal_thread(user: CurrentUser, persona_id: UUID) -> PenPalOut:
        """The learner opened a thread: what the partner sent is read."""
        services.pen_pal.opened(user, persona_id)
        return PenPalOut.of(services.pen_pal.overview(user))

    @router.post(
        "/pen-pal/{persona_id}/notes", operation_id="askForPenPalNote", responses=PEN_PAL_REFUSED
    )
    def ask_for_pen_pal_note(user: CurrentUser, persona_id: UUID) -> PenPalNoteOut:
        """Asks a partner for a voice note now. It is written in the background: the note is
        pending until the thread shows it ready."""
        return PenPalNoteOut.of(services.pen_pal.ask(user, persona_id))

    @router.post(
        "/pen-pal/{persona_id}/replies", operation_id="sendPenPalReply", responses=PEN_PAL_REFUSED
    )
    def send_pen_pal_reply(
        user: CurrentUser, persona_id: UUID, note: RecordingIn
    ) -> PenPalReplyOut:
        """Answers a partner with a voice note: written down at once, word for word; the
        partner's answer follows in the background."""
        audio, seconds = recorded(note, PenPalError)
        heard, answer = services.pen_pal.reply(user, persona_id, audio, note.format, seconds)
        return PenPalReplyOut(heard=PenPalNoteOut.of(heard), answer=PenPalNoteOut.of(answer))

    @router.post(
        "/pen-pal/notes/{note_id}/retry", operation_id="retryPenPalNote", responses=PEN_PAL_REFUSED
    )
    def retry_pen_pal_note(user: CurrentUser, note_id: UUID) -> PenPalNoteOut:
        """Has a note or an answer that failed written again (three attempts in all)."""
        return PenPalNoteOut.of(services.pen_pal.retry(user, note_id))

    @router.post("/feedback", operation_id="sendFeedback", responses=LIMITED)
    def send_feedback(user: CurrentUser, message: FeedbackIn) -> FeedbackOut:
        """Sends the owner a bug report, an idea or any other message (spec §6.21.4)."""
        device = message.device.to_domain() if message.device else None
        return FeedbackOut.of(
            services.feedback.send(user, message.category, message.message, device)
        )

    @router.get("/owner/feedback", operation_id="getFeedbackInbox", responses=FORBIDDEN)
    def get_feedback_inbox(
        user: CurrentUser, status: FeedbackStatus | None = "open"
    ) -> FeedbackInboxOut:
        """The owner's inbox of feedback (open messages unless `status` says otherwise)."""
        return FeedbackInboxOut(
            messages=[InboxFeedbackOut.of(m) for m in services.feedback.inbox(user, status)]
        )

    @router.put(
        "/owner/feedback/{feedback_id}",
        operation_id="resolveFeedback",
        responses=FORBIDDEN | NOT_FOUND,
    )
    def resolve_feedback(
        user: CurrentUser, feedback_id: UUID, resolution: FeedbackResolution
    ) -> InboxFeedbackOut:
        """Marks a message done, or open again."""
        return InboxFeedbackOut.of(services.feedback.resolve(user, feedback_id, resolution.status))

    @router.get("/grammar", operation_id="getGrammarMap")
    def get_grammar_map(user: CurrentUser) -> GrammarMapOut:
        """Every grammar topic of the language learned, with how well the learner has it."""
        return GrammarMapOut.of(services.grammar.map(user))

    @router.get("/grammar/{topic_id}", operation_id="getGrammarTopic", responses=NOT_FOUND)
    def get_grammar_topic(user: CurrentUser, topic_id: str) -> GrammarTopicPageOut:
        """One topic of the map, with the learner's own mistakes on it."""
        return GrammarTopicPageOut.of(services.grammar.topic(user, topic_id))

    @router.get("/tutor/questions", operation_id="getTutorQuestions")
    def get_tutor_questions(user: CurrentUser) -> TutorQuestionsOut:
        """The questions the learner asked the Tutor, newest first."""
        return TutorQuestionsOut(
            questions=[TutorQuestionOut.of(q) for q in services.tutor.history(user)]
        )

    @router.post(
        "/tutor/questions",
        operation_id="askTutor",
        responses=REFUSED | CONFLICT | TUTOR_REFUSED,
    )
    def ask_tutor(user: CurrentUser, asked: TutorQuestionIn) -> TutorQuestionOut:
        """Asks the Tutor a question about the language learned (spec §6.8)."""
        return TutorQuestionOut.of(services.tutor.ask(user, asked.question))

    @router.post(
        "/tutor/corrections",
        operation_id="explainCorrection",
        responses=NOT_FOUND | CONFLICT | TUTOR_REFUSED,
    )
    def explain_correction(user: CurrentUser, asked: TutorCorrectionIn) -> TutorQuestionOut:
        """Asks the Tutor about one correction of a conversation's report (spec §6.5)."""
        question = services.tutor.explain_correction(user, asked.conversation_id, asked.index)
        return TutorQuestionOut.of(question)

    @router.get("/phrasebook", operation_id="getPhrasebook", responses=REFUSED)
    def get_phrasebook(user: CurrentUser) -> PhrasebookOut:
        """The learner's phrases for the language they are learning, newest first (spec §6.7)."""
        return PhrasebookOut(phrases=[PhraseOut.of(e) for e in services.phrasebook.phrases(user)])

    @router.post("/phrasebook", operation_id="savePhrase", responses=REFUSED | CONFLICT)
    def save_phrase(user: CurrentUser, item: PhraseIn) -> PhraseOut:
        """Keeps a phrase in the phrasebook. Keeping one that is kept already answers with it."""
        kept = services.phrasebook.save(user, item.phrase, item.meaning, item.situation)
        return PhraseOut.of(PhrasebookEntry(kept, in_deck=False))

    @router.post(
        "/phrasebook/suggestions",
        operation_id="suggestPhrases",
        responses=REFUSED | CONFLICT | TUTOR_REFUSED,
    )
    def suggest_phrases(user: CurrentUser, asked: PhraseSuggestionsIn) -> PhraseSuggestionsOut:
        """Phrases for a situation the learner describes, nothing kept until they choose."""
        found = services.phrasebook.suggest(user, asked.situation)
        return PhraseSuggestionsOut(suggestions=[PhraseSuggestionOut.of(s) for s in found])

    @router.post(
        "/phrasebook/{phrase_id}/card",
        operation_id="makePhraseCard",
        responses=NOT_FOUND | CONFLICT | REFUSED,
    )
    def make_phrase_card(user: CurrentUser, phrase_id: UUID) -> CardOut:
        """Makes a flashcard of a kept phrase. One that is a card already answers with it."""
        return CardOut.of(services.phrasebook.make_card(user, phrase_id))

    @router.delete(
        "/phrasebook/{phrase_id}", operation_id="removePhrase", responses=NOT_FOUND | REFUSED
    )
    def remove_phrase(user: CurrentUser, phrase_id: UUID) -> PhrasebookOut:
        services.phrasebook.remove(user, phrase_id)
        return PhrasebookOut(phrases=[PhraseOut.of(e) for e in services.phrasebook.phrases(user)])

    @router.get("/then-vs-now", operation_id="getThenVsNow")
    def get_then_vs_now(user: CurrentUser) -> ThenVsNowOut:
        """Two recorded conversations of the same kind, weeks apart, to hear side by side."""
        return ThenVsNowOut.of(services.then_vs_now.compare(user))

    @router.get("/pronunciation/sounds", operation_id="getPronunciationSounds")
    def get_pronunciation_sounds(user: CurrentUser) -> SoundsOut:
        """The problem sounds of the language the learner learns, with their practice so far
        (spec §6.14). Empty for a language that has none yet."""
        return SoundsOut(
            sounds=[SoundSummaryOut.of(s) for s in services.pronunciation.sounds(user)]
        )

    @router.get(
        "/pronunciation/sounds/{sound_id}",
        operation_id="getPronunciationSound",
        responses=NOT_FOUND,
    )
    def get_pronunciation_sound(user: CurrentUser, sound_id: str) -> SoundDetailOut:
        return SoundDetailOut.of(services.pronunciation.sound(user, sound_id))

    @router.get("/pronunciation/words", operation_id="getProblemWords")
    def get_problem_words(user: CurrentUser) -> ProblemWordsOut:
        """The words the learner was asked to say and missed, not yet said right twice in a row."""
        return ProblemWordsOut(
            words=[
                ProblemWordOut(word=w.word, sound_id=w.sound_id, misses=w.misses)
                for w in services.pronunciation.problem_words(user)
            ]
        )

    @router.get(
        "/pronunciation/audio",
        operation_id="getPronunciationAudio",
        responses=NOT_FOUND | UNAVAILABLE,
    )
    def get_pronunciation_audio(user: CurrentUser, text: str) -> SoundOut:
        """Where a word or sentence of the lab plays from, in the learner's partner's voice. Only
        the lab's own texts and the learner's problem words can be asked for."""
        return SoundOut(url=services.pronunciation.audio(user, text))

    @router.post(
        "/pronunciation/attempts", operation_id="drillPronunciation", responses=ANSWER_REFUSED
    )
    def drill_pronunciation(
        user: CurrentUser, attempt: PronunciationAttemptIn
    ) -> PronunciationAttemptOut:
        """Hears a drill said out loud and says, word by word, what was heard as asked."""
        audio, seconds = recorded(attempt.recording, PronunciationError)
        return PronunciationAttemptOut.of(
            services.pronunciation.attempt(
                user,
                attempt.drill,
                attempt.sound_id,
                attempt.target,
                audio,
                attempt.recording.format,
                seconds,
            )
        )

    @router.post(
        "/pronunciation/picks",
        operation_id="pickPronunciationWord",
        responses=NOT_FOUND | REFUSED,
    )
    def pick_pronunciation_word(
        user: CurrentUser, pick: PronunciationPickIn
    ) -> PronunciationPickOut:
        """Remembers which word of a pair the learner heard; right if it was the one played."""
        return PronunciationPickOut(
            right=services.pronunciation.pick(user, pick.sound_id, pick.played, pick.chosen)
        )

    @router.get("/imports", operation_id="getImports", responses=REFUSED)
    def get_imports(user: CurrentUser) -> ImportsOut:
        """What the learner brought, for the language they are learning, newest first (§6.17)."""
        return ImportsOut.of(services.course_imports.imports(user))

    @router.post("/imports/upload", operation_id="startImportUpload")
    def start_import_upload(user: CurrentUser) -> ImportUploadOut:
        """A form for one photo (a JPEG) to read: a menu, a letter, an article, a book page."""
        return ImportUploadOut.of(services.course_imports.start_upload(user))

    @router.post(
        "/imports",
        operation_id="createImport",
        responses=REFUSED | CONFLICT | NOT_FOUND | TUTOR_REFUSED | LIMITED,
    )
    def create_import(user: CurrentUser, brought: ImportIn) -> ImportOut:
        """Works out a pasted text, a web page or an uploaded photo at the learner's level."""
        imports = services.course_imports
        if brought.kind == "text":
            made = imports.create_from_text(
                user, brought.text or "", brought.textbook, brought.chapter
            )
        elif brought.kind == "link":
            made = imports.create_from_link(
                user, brought.url or "", brought.textbook, brought.chapter
            )
        else:
            if brought.upload_id is None:
                raise CourseImportError("invalid_value")
            made = imports.create_from_photo(
                user, brought.upload_id, brought.textbook, brought.chapter
            )
        return ImportOut.of(imports.entry(user, made.id))

    @router.get("/imports/{import_id}", operation_id="getImport", responses=NOT_FOUND)
    def get_import(user: CurrentUser, import_id: UUID) -> ImportOut:
        return ImportOut.of(services.course_imports.entry(user, import_id))

    @router.delete("/imports/{import_id}", operation_id="removeImport", responses=NOT_FOUND)
    def remove_import(user: CurrentUser, import_id: UUID) -> ImportsOut:
        services.course_imports.remove(user, import_id)
        return ImportsOut.of(services.course_imports.imports(user))

    @router.post(
        "/imports/{import_id}/words/{index}/card",
        operation_id="makeImportWordCard",
        responses=NOT_FOUND | CONFLICT | REFUSED,
    )
    def make_import_word_card(
        user: CurrentUser, import_id: UUID, index: Annotated[int, Path(ge=0, le=100)]
    ) -> CardOut:
        """Makes a flashcard of one of an import's words. One that is a card already answers
        with it."""
        return CardOut.of(services.course_imports.save_word(user, import_id, index))

    @router.get("/recordings", operation_id="getRecordings")
    def get_recordings(user: CurrentUser) -> RecordingsOut:
        """Whether the audio of the learner's conversations is kept (spec §6.6)."""
        return RecordingsOut(kept=services.recordings.kept(user))

    @router.patch("/recordings", operation_id="configureRecordings", responses=REFUSED)
    def configure_recordings(user: CurrentUser, settings: RecordingsPatch) -> RecordingsOut:
        """Keeps recordings, or stops: stopping deletes every recording kept so far."""
        return RecordingsOut(kept=services.recordings.configure(user, kept=settings.kept))

    @router.get("/memories", operation_id="getMemories")
    def get_memories(user: CurrentUser) -> MemoriesOut:
        """What the learner's partners know about them from earlier conversations."""
        return memories_of(user, services.memories.view(user))

    @router.patch("/memories", operation_id="configureMemories", responses=REFUSED)
    def configure_memories(user: CurrentUser, settings: MemorySettingsPatch) -> MemoriesOut:
        """Turns memory on or off, or names the topics partners leave alone."""
        book = services.memories.configure(
            user, enabled=settings.enabled, avoid_topics=settings.avoid_topics
        )
        return memories_of(user, book)

    @router.patch(
        "/memories/{memory_id}",
        operation_id="changeMemory",
        responses=NOT_FOUND | CONFLICT | REFUSED,
    )
    def change_memory(user: CurrentUser, memory_id: UUID, patch: MemoryPatch) -> MemoryOut:
        # Only what the request named: a key left out is not a change, a null day is one.
        changed = services.memories.change(user, memory_id, **patch.model_dump(exclude_unset=True))
        return MemoryOut.of(changed, partners_named(user, [changed]))

    @router.delete(
        "/memories/{memory_id}", operation_id="removeMemory", responses=NOT_FOUND | REFUSED
    )
    def remove_memory(user: CurrentUser, memory_id: UUID) -> MemoriesOut:
        """Forgets one memory for good."""
        services.memories.remove(user, memory_id)
        return memories_of(user, services.memories.view(user))

    def account_of(user: UUID, view: AccountView) -> AccountOut:
        return AccountOut.of(view, owner=services.costs.is_owner(user))

    @router.get("/account", operation_id="getAccount")
    def get_account(user: CurrentUser) -> AccountOut:
        return account_of(user, services.accounts.view(user))

    @router.post("/account/picture/upload", operation_id="startPictureUpload")
    def start_picture_upload(user: CurrentUser) -> PictureUploadOut:
        return PictureUploadOut.of(services.accounts.start_picture_upload(user))

    @router.post("/account/picture", operation_id="confirmPicture", responses=REFUSED | NOT_FOUND)
    def confirm_picture(user: CurrentUser, confirm: PictureConfirm) -> AccountOut:
        return account_of(user, services.accounts.confirm_picture(user, confirm.upload_id))

    @router.delete("/account/picture", operation_id="removePicture")
    def remove_picture(user: CurrentUser) -> AccountOut:
        return account_of(user, services.accounts.remove_picture(user))

    @router.post("/account/export", operation_id="exportData", responses=LIMITED)
    def export_data(user: CurrentUser) -> DataExportOut:
        """Writes a copy of everything kept for the learner and says where to read it."""
        return DataExportOut.of(services.exports.export(user))

    return router


def _deletion_router(services: Services) -> APIRouter:
    """Deleting the account, apart from the other routes: it is the one change that must also
    be possible for an account already remembered as deleted, to finish a deletion that was cut
    off before the sign-in was removed."""
    router = APIRouter(prefix="/v1", responses=NOT_AUTHENTICATED)

    @router.delete(
        "/account",
        operation_id="deleteAccount",
        # The password, typed moments ago: the app signs in again right before this call.
        dependencies=[Depends(recently_signed_in)],
        responses=FORBIDDEN,
    )
    def delete_account(user: CurrentUser) -> AccountDeletedOut:
        services.accounts.delete(user)
        return AccountDeletedOut()

    return router


# RevenueCat's event fields the plans need. It sends more; the rest is ignored.
class _StoreEventBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = ""
    type: str
    app_user_id: str = ""
    aliases: list[str] | None = None
    product_id: str = ""
    entitlement_ids: list[str] | None = None
    period_type: str = ""
    store: str = ""
    expiration_at_ms: int | None = None
    event_timestamp_ms: int
    transaction_id: str | None = None
    cancel_reason: str | None = None
    # Of a TRANSFER: the ids that had a purchase and the ids that have it now.
    transferred_from: list[str] | None = None
    transferred_to: list[str] | None = None


class _StoreHook(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event: _StoreEventBody


def _store_event(body: _StoreEventBody) -> StoreEvent | None:
    """RevenueCat's event for a Konvami learner, or None for one about nobody we know: the app
    names the learner to RevenueCat by their id, so an anonymous id is not ours."""
    moved_from = _ids(body.transferred_from)
    moved_to = _ids(body.transferred_to)
    # The event is about the first Konvami id it names. A transfer names none of its own: it is
    # about the ids it moves between.
    named = [*_ids([body.app_user_id, *(body.aliases or [])]), *moved_to, *moved_from]
    if named:
        user_id = named[0]
        expires = body.expiration_at_ms
        return StoreEvent(
            id=body.id,
            type=body.type,
            user_id=user_id,
            product_id=body.product_id,
            entitlement_ids=tuple(body.entitlement_ids or ()),
            trial=body.period_type == "TRIAL",
            store=body.store.lower(),
            expires_at=dt.datetime.fromtimestamp(expires / 1000, dt.UTC) if expires else None,
            at=dt.datetime.fromtimestamp(body.event_timestamp_ms / 1000, dt.UTC),
            transaction_id=body.transaction_id or "",
            cancel_reason=body.cancel_reason or "",
            transferred_from=moved_from,
            transferred_to=moved_to,
        )
    return None


def _ids(names: list[str] | None) -> tuple[UUID, ...]:
    """The learners among RevenueCat's ids: the ones that are a Konvami id, not an anonymous one."""
    found: list[UUID] = []
    for name in names or []:
        try:
            found.append(UUID(name))
        except ValueError:
            continue
    return tuple(found)


def _webhook_router(services: Services) -> APIRouter:
    """The one route the app does not call and that carries no access token: RevenueCat's
    webhook. It is closed unless the shared secret is set up and sent back in `Authorization`."""
    router = APIRouter(prefix="/webhooks", include_in_schema=False)

    @router.post("/revenuecat")
    def revenuecat(request: Request, hook: _StoreHook) -> dict[str, bool]:
        if not token_matches(request.headers.get("authorization"), services.store_secret()):
            raise ApiError(401, "not_authenticated")
        event = _store_event(hook.event)
        if event is not None:
            services.plans.apply(event)
        return {"ok": True}

    return router


def create_app(services: Services) -> FastAPI:
    # The interactive docs and the schema are not served; the schema is exported at build time
    # for the generated TypeScript client.
    app = FastAPI(title="Konvami API", version="1", docs_url=None, redoc_url=None, openapi_url=None)
    install_error_handlers(app)
    app.include_router(_router(services))
    app.include_router(_deletion_router(services))
    app.include_router(public_router(lambda: services.web_deletion))

    app.include_router(_webhook_router(services))
    return app
