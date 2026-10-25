"""The HTTP API. Handlers translate between HTTP and the domain services and decide nothing."""

import datetime as dt
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, Query, Request
from pydantic import AwareDatetime

from konvami_api.api.auth import CurrentUser, recently_signed_in
from konvami_api.api.errors import ApiError, ErrorBody, install_error_handlers
from konvami_api.api.schemas import (
    AccountDeletedOut,
    AccountOut,
    AllowanceOut,
    CardIn,
    CardOut,
    CatalogOut,
    ConversationsOut,
    CostsOut,
    DeckOut,
    DeckSummaryOut,
    GrammarMapOut,
    GrammarTopicPageOut,
    HomeOut,
    MemoriesOut,
    MemoryOut,
    MemoryPatch,
    MemorySettingsPatch,
    OnboardingOut,
    PersonaDescription,
    PersonaDraftOut,
    PersonaIn,
    PersonaOut,
    PersonaPatch,
    PersonasOut,
    PersonaTemplatesOut,
    PictureConfirm,
    PictureUploadOut,
    PlacementDecision,
    PlacementOut,
    ProfileOut,
    ProfilePatch,
    ProgressOut,
    QueueOut,
    RecordingsOut,
    RecordingsPatch,
    ReportOut,
    ReviewIn,
    TranscriptOut,
    TutorCorrectionIn,
    TutorQuestionIn,
    TutorQuestionOut,
    TutorQuestionsOut,
    VoiceCallIn,
    VoiceCallOut,
    VoiceSampleOut,
)
from konvami_api.domain.accounts import AccountService, AccountView
from konvami_api.domain.cards import PAGE_DEFAULT as CARDS_PAGE_DEFAULT
from konvami_api.domain.cards import QUEUE_DEFAULT, CardService
from konvami_api.domain.catalog import Catalog
from konvami_api.domain.conversations import PAGE_DEFAULT, ConversationService
from konvami_api.domain.costs import CostService
from konvami_api.domain.grammar_map import GrammarMapService
from konvami_api.domain.home import HomeService
from konvami_api.domain.levels import LevelService
from konvami_api.domain.memories import Memory, MemoryBook, MemoryService
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.persona_parts import Voice
from konvami_api.domain.personas import Persona, PersonaService
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.progress import ProgressService
from konvami_api.domain.recordings import RecordingService
from konvami_api.domain.reports import ReportService, ReportState
from konvami_api.domain.tutor import TutorService
from konvami_api.domain.voice import VoiceCallService
from konvami_api.domain.voices import VoiceSampleService


@dataclass(frozen=True)
class Services:
    """Everything the handlers need, built once per Lambda container (or per test)."""

    catalog: Catalog
    profiles: ProfileService
    onboarding: OnboardingService
    voice: VoiceCallService
    placement: PlacementService
    personas: PersonaService
    conversations: ConversationService
    reports: ReportService
    levels: LevelService
    cards: CardService
    memories: MemoryService
    home: HomeService
    progress: ProgressService
    accounts: AccountService
    recordings: RecordingService
    tutor: TutorService
    voices: VoiceSampleService
    costs: CostService
    grammar: GrammarMapService


# Documented error responses, so the generated client knows their shape.
type Responses = dict[int | str, dict[str, Any]]
NOT_AUTHENTICATED: Responses = {401: {"model": ErrorBody}}
REFUSED: Responses = {422: {"model": ErrorBody}}
CONFLICT: Responses = {409: {"model": ErrorBody}}
NOT_FOUND: Responses = {404: {"model": ErrorBody}}
TUTOR_REFUSED: Responses = {code: {"model": ErrorBody} for code in (403, 429, 503)}
CALL_REFUSED: Responses = {code: {"model": ErrorBody} for code in (403, 404, 409, 429, 503)}
LIMITED: Responses = {429: {"model": ErrorBody}}
UNAVAILABLE: Responses = {503: {"model": ErrorBody}}
# An IANA time zone name is at most a few dozen characters ("America/Argentina/ComodRivadavia").
MAX_TIME_ZONE_LENGTH = 64


FORBIDDEN: Responses = {403: {"model": ErrorBody}}


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

    @router.post("/personas", operation_id="createPersona", responses=REFUSED | CONFLICT)
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
        responses=NOT_FOUND | CONFLICT,
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

    @router.post("/voice/calls", operation_id="startVoiceCall", responses=CALL_REFUSED)
    def start_voice_call(user: CurrentUser, offer: VoiceCallIn) -> VoiceCallOut:
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
        return HomeOut.of(services.home.view(user, tz))

    @router.get("/progress", operation_id="getProgress", responses=CONFLICT)
    def get_progress(
        user: CurrentUser,
        # The device's time zone, as for `/home`: days and weeks follow the learner's calendar.
        tz: Annotated[str | None, Query(max_length=MAX_TIME_ZONE_LENGTH)] = None,
    ) -> ProgressOut:
        return ProgressOut.of(services.progress.view(user, tz))

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

    @router.delete("/cards/{card_id}", operation_id="removeCard", responses=NOT_FOUND | REFUSED)
    def remove_card(user: CurrentUser, card_id: UUID) -> DeckSummaryOut:
        services.cards.remove(user, card_id)
        deck = services.cards.deck(user, limit=1)
        return DeckSummaryOut(total=deck.total, due=deck.due)

    def partners_named(user: UUID, memories: Sequence[Memory]) -> dict[UUID, Persona]:
        """The partners whose names the memories need; they are read only when one does."""
        if not any(memory.persona_id for memory in memories):
            return {}
        return {partner.id: partner for partner in services.personas.partners(user)}

    def memories_of(user: UUID, book: MemoryBook) -> MemoriesOut:
        return MemoriesOut.of(book, partners_named(user, book.memories))

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


def create_app(services: Services) -> FastAPI:
    # The interactive docs and the schema are not served; the schema is exported at build time
    # for the generated TypeScript client.
    app = FastAPI(title="Konvami API", version="1", docs_url=None, redoc_url=None, openapi_url=None)
    install_error_handlers(app)
    app.include_router(_router(services))
    app.include_router(_deletion_router(services))
    return app
