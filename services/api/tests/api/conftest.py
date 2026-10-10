import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from mangum import Mangum

from konvami_api.api.app import Services, create_app
from konvami_api.domain.accounts import Account, AccountService
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.home import HomeService
from konvami_api.domain.host import HostScript
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.placement import PlacementScript, PlacementService
from konvami_api.domain.practice import PracticeScript
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.voice import CallPurpose, VoiceCallService, VoiceSettings
from konvami_api.domain.voices import VoiceSampleService
from tests.fakes import (
    FakeAccountDirectory,
    FakeSpeechModel,
    FakeVoiceProvider,
    FixedClock,
    InMemoryAccountRepository,
    InMemoryConversationRepository,
    InMemoryDraftLog,
    InMemoryFileStore,
    InMemoryOnboardingRepository,
    InMemoryPersonaRepository,
    InMemoryPlacementRepository,
    InMemoryProfileRepository,
    InMemoryVoiceSessionRepository,
    RecordingCallStarter,
    ScriptedTextModel,
)

USER = "11111111-1111-4111-8111-111111111111"
OTHER_USER = "22222222-2222-4222-8222-222222222222"


@dataclass
class Response:
    status: int
    body: Any


def http_api_event(method: str, target: str, body: Any, subject: str | None) -> dict[str, Any]:
    """An API Gateway HTTP API (payload 2.0) event, as Lambda gets it behind a JWT authorizer.
    `target` is the path, with its query string if it has one."""
    path, _, query = target.partition("?")
    context: dict[str, Any] = {
        "accountId": "503002144480",
        "apiId": "abc123",
        "domainName": "abc123.execute-api.eu-central-1.amazonaws.com",
        "domainPrefix": "abc123",
        "http": {
            "method": method,
            "path": path,
            "protocol": "HTTP/1.1",
            "sourceIp": "203.0.113.7",
            "userAgent": "Konvami/0.1.0",
        },
        "requestId": "req-1",
        "routeKey": "$default",
        "stage": "$default",
        "time": "09/Oct/2026:12:00:00 +0000",
        "timeEpoch": 1791547200000,
    }
    if subject is not None:
        context["authorizer"] = {
            "jwt": {
                "claims": {
                    "sub": subject,
                    "client_id": "client-1",
                    "token_use": "access",
                    "scope": "aws.cognito.signin.user.admin",
                    "iss": "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_pool",
                    "exp": "1791550800",
                    "iat": "1791547200",
                    "username": subject,
                },
                "scopes": None,
            }
        }
    return {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": path,
        "rawQueryString": query,
        "headers": {
            "accept": "application/json",
            "content-type": "application/json",
            "host": "abc123.execute-api.eu-central-1.amazonaws.com",
        },
        "requestContext": context,
        "body": None if body is None else json.dumps(body),
        "isBase64Encoded": False,
    }


Call = Callable[..., Response]


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(datetime(2026, 10, 9, 12, 0, tzinfo=UTC))


VOICE = VoiceSettings(
    models={
        CallPurpose.ONBOARDING: "gpt-realtime-2.1",
        CallPurpose.PLACEMENT: "gpt-realtime-2.1",
        CallPurpose.PRACTICE: "gpt-realtime-2.1-mini",
    },
    max_seconds={
        CallPurpose.ONBOARDING: 480,
        CallPurpose.PLACEMENT: 720,
        CallPurpose.PRACTICE: 600,
    },
    voice="marin",
    transcription_model="gpt-transcribe",
    daily_call_limit=2,
)


@pytest.fixture
def voice_provider() -> FakeVoiceProvider:
    return FakeVoiceProvider()


@pytest.fixture
def text_model() -> ScriptedTextModel:
    return ScriptedTextModel()


@pytest.fixture
def calls() -> InMemoryVoiceSessionRepository:
    """The recorded voice calls, for tests that need one to have taken place."""
    return InMemoryVoiceSessionRepository()


@pytest.fixture
def files() -> InMemoryFileStore:
    """The stored files, for tests that upload one or look at what is left."""
    return InMemoryFileStore()


@pytest.fixture
def directory() -> FakeAccountDirectory:
    """The accounts as the identity provider holds them."""
    return FakeAccountDirectory(
        {
            UUID(USER): Account("Amara", "fr", voice_consent=True),
            UUID(OTHER_USER): Account("Jonas", "de", voice_consent=False),
        }
    )


@pytest.fixture
def account_records() -> InMemoryAccountRepository:
    return InMemoryAccountRepository()


@pytest.fixture
def speech() -> FakeSpeechModel:
    return FakeSpeechModel()


@pytest.fixture
def services(
    clock: FixedClock,
    voice_provider: FakeVoiceProvider,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    files: InMemoryFileStore,
    directory: FakeAccountDirectory,
    account_records: InMemoryAccountRepository,
    speech: FakeSpeechModel,
) -> Services:
    """The real services on in-memory storage, for tests that prepare state behind the API."""
    profiles = ProfileService(InMemoryProfileRepository(), CATALOG, clock)
    onboarding = OnboardingService(profiles, InMemoryOnboardingRepository(), clock)
    placement = PlacementService(
        profiles=profiles,
        onboarding=onboarding,
        results=InMemoryPlacementRepository(),
        text_model=text_model,
        model="gpt-6.1-sol",
        clock=clock,
    )
    personas = PersonaService(
        profiles=profiles,
        onboarding=onboarding,
        repository=InMemoryPersonaRepository(),
        text_model=text_model,
        model="gpt-6-luna",
        drafts=InMemoryDraftLog(),
        clock=clock,
    )
    conversations = ConversationService(InMemoryConversationRepository(calls), personas)
    voice = VoiceCallService(
        settings=VOICE,
        scripts={
            CallPurpose.ONBOARDING: HostScript(CATALOG, profiles),
            CallPurpose.PLACEMENT: PlacementScript(placement),
            CallPurpose.PRACTICE: PracticeScript(
                profiles=profiles,
                onboarding=onboarding,
                personas=personas,
                placement=placement,
                conversations=conversations,
            ),
        },
        accounts=directory,
        provider=voice_provider,
        sessions=calls,
        starter=RecordingCallStarter(),
        clock=clock,
    )
    home = HomeService(
        profiles=profiles,
        onboarding=onboarding,
        personas=personas,
        placement=placement,
        conversations=conversations,
        clock=clock,
    )
    # Upload ids in the order they are handed out: ...0001, ...0002, and so on.
    upload_ids = (UUID(f"aaaaaaaa-aaaa-4aaa-8aaa-{number:012d}") for number in range(1, 100))
    accounts = AccountService(
        records=account_records,
        files=files,
        directory=directory,
        new_id=lambda: next(upload_ids),
    )
    return Services(
        catalog=CATALOG,
        profiles=profiles,
        onboarding=onboarding,
        voice=voice,
        placement=placement,
        personas=personas,
        conversations=conversations,
        home=home,
        accounts=accounts,
        voices=VoiceSampleService(
            profiles=profiles, files=files, speech=speech, model="gpt-4o-mini-tts"
        ),
    )


@pytest.fixture
def call(services: Services) -> Call:
    """Calls the API the way API Gateway does: through the Lambda handler, as a signed-in user."""
    handler = Mangum(create_app(services), lifespan="off")

    def _call(method: str, path: str, body: Any = None, *, subject: str | None = USER) -> Response:
        result = handler(http_api_event(method, path, body, subject), None)  # type: ignore[arg-type]
        text = result.get("body") or ""
        return Response(result["statusCode"], json.loads(text) if text else None)

    return _call
