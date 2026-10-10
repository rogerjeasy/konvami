"""The HTTP API. Handlers translate between HTTP and the domain services and decide nothing."""

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
    CatalogOut,
    ConversationsOut,
    HomeOut,
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
    TranscriptOut,
    VoiceCallIn,
    VoiceCallOut,
    VoiceSampleOut,
)
from konvami_api.domain.accounts import AccountService
from konvami_api.domain.catalog import Catalog
from konvami_api.domain.conversations import PAGE_DEFAULT, ConversationService
from konvami_api.domain.home import HomeService
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.persona_parts import Voice
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
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
    home: HomeService
    accounts: AccountService
    voices: VoiceSampleService


# Documented error responses, so the generated client knows their shape.
type Responses = dict[int | str, dict[str, Any]]
NOT_AUTHENTICATED: Responses = {401: {"model": ErrorBody}}
REFUSED: Responses = {422: {"model": ErrorBody}}
CONFLICT: Responses = {409: {"model": ErrorBody}}
NOT_FOUND: Responses = {404: {"model": ErrorBody}}
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
            user, offer.purpose, offer.sdp, offer.persona_id, offer.local_date
        )
        return VoiceCallOut.of(started)

    @router.get("/home", operation_id="getHome", responses=CONFLICT)
    def get_home(
        user: CurrentUser,
        # The device's time zone ("Europe/Zurich"): days and the streak follow the learner's
        # calendar. Left out or unknown, they follow UTC.
        tz: Annotated[str | None, Query(max_length=MAX_TIME_ZONE_LENGTH)] = None,
    ) -> HomeOut:
        return HomeOut.of(services.home.view(user, tz))

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
        return TranscriptOut.of(services.conversations.transcript(user, conversation_id))

    @router.get("/account", operation_id="getAccount")
    def get_account(user: CurrentUser) -> AccountOut:
        return AccountOut.of(services.accounts.view(user))

    @router.post("/account/picture/upload", operation_id="startPictureUpload")
    def start_picture_upload(user: CurrentUser) -> PictureUploadOut:
        return PictureUploadOut.of(services.accounts.start_picture_upload(user))

    @router.post("/account/picture", operation_id="confirmPicture", responses=REFUSED | NOT_FOUND)
    def confirm_picture(user: CurrentUser, confirm: PictureConfirm) -> AccountOut:
        return AccountOut.of(services.accounts.confirm_picture(user, confirm.upload_id))

    @router.delete("/account/picture", operation_id="removePicture")
    def remove_picture(user: CurrentUser) -> AccountOut:
        return AccountOut.of(services.accounts.remove_picture(user))

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
