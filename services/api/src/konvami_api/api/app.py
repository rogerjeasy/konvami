"""The HTTP API. Handlers translate between HTTP and the domain services and decide nothing."""

from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, FastAPI, Query
from pydantic import AwareDatetime

from konvami_api.api.auth import CurrentUser
from konvami_api.api.errors import ErrorBody, install_error_handlers
from konvami_api.api.schemas import (
    CatalogOut,
    ConversationsOut,
    HomeOut,
    OnboardingOut,
    PersonaOut,
    PersonaPatch,
    PersonasOut,
    PlacementDecision,
    PlacementOut,
    ProfileOut,
    ProfilePatch,
    TranscriptOut,
    VoiceCallIn,
    VoiceCallOut,
)
from konvami_api.domain.catalog import Catalog
from konvami_api.domain.conversations import PAGE_DEFAULT, ConversationService
from konvami_api.domain.home import HomeService
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.voice import VoiceCallService


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


# Documented error responses, so the generated client knows their shape.
type Responses = dict[int | str, dict[str, Any]]
NOT_AUTHENTICATED: Responses = {401: {"model": ErrorBody}}
REFUSED: Responses = {422: {"model": ErrorBody}}
CONFLICT: Responses = {409: {"model": ErrorBody}}
NOT_FOUND: Responses = {404: {"model": ErrorBody}}
CALL_REFUSED: Responses = {code: {"model": ErrorBody} for code in (403, 404, 409, 429, 503)}
# An IANA time zone name is at most a few dozen characters ("America/Argentina/ComodRivadavia").
MAX_TIME_ZONE_LENGTH = 64


def _router(services: Services) -> APIRouter:
    router = APIRouter(prefix="/v1", responses=NOT_AUTHENTICATED)

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

    @router.patch(
        "/personas/{persona_id}", operation_id="changePersona", responses=REFUSED | NOT_FOUND
    )
    def change_persona(user: CurrentUser, persona_id: UUID, patch: PersonaPatch) -> PersonaOut:
        look = None if patch.look is None else patch.look.model_dump()
        return PersonaOut.of(services.personas.change(user, persona_id, name=patch.name, look=look))

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

    return router


def create_app(services: Services) -> FastAPI:
    # The interactive docs and the schema are not served; the schema is exported at build time
    # for the generated TypeScript client.
    app = FastAPI(title="Konvami API", version="1", docs_url=None, redoc_url=None, openapi_url=None)
    install_error_handlers(app)
    app.include_router(_router(services))
    return app
