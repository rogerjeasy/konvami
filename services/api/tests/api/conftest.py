import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from mangum import Mangum

from konvami_api.api.app import Services, create_app
from konvami_api.domain.accounts import Account
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.host import HostScript
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.placement import PlacementScript, PlacementService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.voice import CallPurpose, VoiceCallService, VoiceSettings
from tests.fakes import (
    FakeAccountDirectory,
    FakeVoiceProvider,
    FixedClock,
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


def http_api_event(method: str, path: str, body: Any, subject: str | None) -> dict[str, Any]:
    """An API Gateway HTTP API (payload 2.0) event, as Lambda gets it behind a JWT authorizer."""
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
        "rawQueryString": "",
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
    models={CallPurpose.ONBOARDING: "gpt-realtime-2.1", CallPurpose.PLACEMENT: "gpt-realtime-2.1"},
    max_seconds={CallPurpose.ONBOARDING: 480, CallPurpose.PLACEMENT: 720},
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
def services(
    clock: FixedClock, voice_provider: FakeVoiceProvider, text_model: ScriptedTextModel
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
    voice = VoiceCallService(
        settings=VOICE,
        scripts={
            CallPurpose.ONBOARDING: HostScript(CATALOG, profiles),
            CallPurpose.PLACEMENT: PlacementScript(placement),
        },
        accounts=FakeAccountDirectory(
            {
                UUID(USER): Account("Amara", "fr", voice_consent=True),
                UUID(OTHER_USER): Account("Jonas", "de", voice_consent=False),
            }
        ),
        provider=voice_provider,
        sessions=InMemoryVoiceSessionRepository(),
        starter=RecordingCallStarter(),
        clock=clock,
    )
    personas = PersonaService(
        profiles=profiles,
        onboarding=onboarding,
        repository=InMemoryPersonaRepository(),
        text_model=text_model,
        model="gpt-6-luna",
    )
    return Services(CATALOG, profiles, onboarding, voice, placement, personas)


@pytest.fixture
def call(services: Services) -> Call:
    """Calls the API the way API Gateway does: through the Lambda handler, as a signed-in user."""
    handler = Mangum(create_app(services), lifespan="off")

    def _call(method: str, path: str, body: Any = None, *, subject: str | None = USER) -> Response:
        result = handler(http_api_event(method, path, body, subject), None)  # type: ignore[arg-type]
        text = result.get("body") or ""
        return Response(result["statusCode"], json.loads(text) if text else None)

    return _call
