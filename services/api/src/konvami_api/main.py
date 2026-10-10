"""AWS Lambda entry points. Everything is built once per container, from environment variables
that Terraform sets (ARNs, names and settings; never secrets).
"""

import asyncio
import datetime as dt
import os
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import cache
from typing import Any

from mangum import Mangum

from konvami_api.api.app import Services, create_app
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.home import HomeService
from konvami_api.domain.host import HostScript
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.placement import PlacementScript, PlacementService
from konvami_api.domain.practice import PracticeScript
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.voice import CallPurpose, VoiceCallService
from konvami_api.persistence.data_api import DataApiClient, RdsData
from konvami_api.persistence.migrations import migrate_when_awake
from konvami_api.persistence.repositories import (
    SqlConversationRepository,
    SqlOnboardingRepository,
    SqlPersonaRepository,
    SqlPlacementRepository,
    SqlProfileRepository,
    SqlVoiceSessionRepository,
)
from konvami_api.persistence.sql import SqlClient
from konvami_api.providers.aws import LambdaCallStarter, LambdaClient, SecretsClient, cached_secret
from konvami_api.providers.cognito_accounts import CognitoAccounts, CognitoIdp
from konvami_api.providers.openai_realtime import OpenAiRealtime
from konvami_api.providers.openai_text import OpenAiText
from konvami_api.settings import TEXT_MODELS_VARIABLE, VOICE_VARIABLE, text_models, voice_settings
from konvami_api.worker import follow_call

_DB_SETTINGS = {
    "cluster_arn": "KONVAMI_DB_CLUSTER_ARN",
    "secret_arn": "KONVAMI_DB_SECRET_ARN",
    "database": "KONVAMI_DB_NAME",
}
# Set once the voice infrastructure exists; until then no voice call can start.
_USER_POOL = "KONVAMI_USER_POOL_ID"
_OPENAI_SECRET = "KONVAMI_OPENAI_SECRET_ARN"  # noqa: S105 - the name of a setting
_CALL_WORKER = "KONVAMI_CALL_WORKER"

# Each attempt waits about 20 seconds for a paused database; waking takes about 15.
MIGRATION_ATTEMPTS = 4


@dataclass(frozen=True)
class Clients:
    """The AWS clients. boto3's in Lambda; stubs in tests."""

    rds_data: RdsData
    cognito: CognitoIdp
    functions: LambdaClient
    secrets: SecretsClient


@dataclass(frozen=True)
class Backend:
    services: Services
    realtime: OpenAiRealtime


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def _sql_client(
    environment: Mapping[str, str], rds_data: RdsData, sleep: Callable[[float], object]
) -> SqlClient:
    missing = [name for name in _DB_SETTINGS.values() if not environment.get(name)]
    if missing:
        raise RuntimeError(f"Missing settings: {', '.join(missing)}")
    settings = {key: environment[name] for key, name in _DB_SETTINGS.items()}
    return DataApiClient(rds_data, sleep=sleep, **settings)


def build_backend(
    environment: Mapping[str, str],
    clients: Clients,
    sleep: Callable[[float], object] = time.sleep,
) -> Backend:
    sql = _sql_client(environment, clients.rds_data, sleep)
    profiles = ProfileService(SqlProfileRepository(sql), CATALOG, _now)
    onboarding = OnboardingService(profiles, SqlOnboardingRepository(sql), _now)
    openai_key = cached_secret(clients.secrets, environment.get(_OPENAI_SECRET, ""))
    realtime = OpenAiRealtime(openai_key)
    text = OpenAiText(openai_key)
    models = text_models(environment.get(TEXT_MODELS_VARIABLE))
    placement = PlacementService(
        profiles=profiles,
        onboarding=onboarding,
        results=SqlPlacementRepository(sql),
        text_model=text,
        model=models.assessment,
        clock=_now,
    )
    personas = PersonaService(
        profiles=profiles,
        onboarding=onboarding,
        repository=SqlPersonaRepository(sql),
        text_model=text,
        model=models.personas,
    )
    conversations = ConversationService(SqlConversationRepository(sql), personas)
    voice = VoiceCallService(
        settings=voice_settings(environment.get(VOICE_VARIABLE)),
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
        accounts=CognitoAccounts(clients.cognito, environment.get(_USER_POOL, "")),
        provider=realtime,
        sessions=SqlVoiceSessionRepository(sql),
        starter=LambdaCallStarter(clients.functions, environment.get(_CALL_WORKER, "")),
        clock=_now,
    )
    home = HomeService(
        profiles=profiles,
        onboarding=onboarding,
        personas=personas,
        placement=placement,
        conversations=conversations,
        clock=_now,
    )
    services = Services(
        CATALOG, profiles, onboarding, voice, placement, personas, conversations, home
    )
    return Backend(services, realtime)


def build_handler(
    environment: Mapping[str, str],
    clients: Clients,
    sleep: Callable[[float], object] = time.sleep,
) -> Mangum:
    return Mangum(create_app(build_backend(environment, clients, sleep).services), lifespan="off")


def _clients() -> Clients:
    import boto3  # Provided by the Lambda runtime; imported late so tests need no AWS setup.

    return Clients(
        rds_data=boto3.client("rds-data"),
        cognito=boto3.client("cognito-idp"),
        functions=boto3.client("lambda"),
        secrets=boto3.client("secretsmanager"),
    )


@cache
def _backend() -> Backend:
    return build_backend(os.environ, _clients())


@cache
def _api() -> Mangum:
    return Mangum(create_app(_backend().services), lifespan="off")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """The API: every route, behind API Gateway."""
    return _api()(event, context)


def migrate_handler(event: dict[str, Any], context: Any) -> dict[str, list[str]]:
    """Applies pending schema migrations. Invoked by Terraform after each deploy."""
    client = _sql_client(os.environ, _clients().rds_data, time.sleep)
    return {"applied": migrate_when_awake(client, attempts=MIGRATION_ATTEMPTS)}


def call_worker_handler(event: dict[str, Any], context: Any) -> None:
    """Follows one live voice call to its end. Started by the API when a call is created."""
    backend = _backend()
    asyncio.run(follow_call(backend.services.voice, backend.realtime, event["call_id"]))
