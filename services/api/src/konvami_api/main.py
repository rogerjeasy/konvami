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
from konvami_api.domain.accounts import AccountService
from konvami_api.domain.cards import CardService
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.home import HomeService
from konvami_api.domain.host import HostScript
from konvami_api.domain.memories import MemoryService
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.placement import PlacementScript, PlacementService
from konvami_api.domain.practice import PracticeScript
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.progress import ProgressService
from konvami_api.domain.reports import ReportService
from konvami_api.domain.voice import CallPurpose, VoiceCallService
from konvami_api.domain.voices import VoiceSampleService
from konvami_api.persistence.data_api import DataApiClient, RdsData
from konvami_api.persistence.migrations import migrate_when_awake
from konvami_api.persistence.repositories import (
    SqlAccountRepository,
    SqlCardRepository,
    SqlConversationRepository,
    SqlDraftLog,
    SqlMemoryRepository,
    SqlOnboardingRepository,
    SqlPersonaRepository,
    SqlPlacementRepository,
    SqlProfileRepository,
    SqlReportRepository,
    SqlVoiceSessionRepository,
)
from konvami_api.persistence.sql import SqlClient
from konvami_api.providers.aws import (
    LambdaCallStarter,
    LambdaClient,
    LambdaReportStarter,
    SecretsClient,
    cached_secret,
)
from konvami_api.providers.cognito_accounts import CognitoAccounts, CognitoIdp
from konvami_api.providers.openai_realtime import OpenAiRealtime
from konvami_api.providers.openai_speech import OpenAiSpeech
from konvami_api.providers.openai_text import OpenAiText
from konvami_api.providers.s3_store import S3, S3FileStore, s3_client
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
# The private bucket for photos and voice samples (infra/modules/media).
_MEDIA_BUCKET = "KONVAMI_MEDIA_BUCKET"

# Each attempt waits about 20 seconds for a paused database; waking takes about 15.
MIGRATION_ATTEMPTS = 4


@dataclass(frozen=True)
class Clients:
    """The AWS clients. boto3's in Lambda; stubs in tests."""

    rds_data: RdsData
    cognito: CognitoIdp
    functions: LambdaClient
    secrets: SecretsClient
    s3: S3


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
        drafts=SqlDraftLog(sql),
        clock=_now,
    )
    conversations = ConversationService(SqlConversationRepository(sql), personas)
    directory = CognitoAccounts(clients.cognito, environment.get(_USER_POOL, ""))
    sessions = SqlVoiceSessionRepository(sql)
    worker = environment.get(_CALL_WORKER, "")
    reports = ReportService(
        profiles=profiles,
        conversations=conversations,
        sessions=sessions,
        accounts=directory,
        repository=SqlReportRepository(sql),
        starter=LambdaReportStarter(clients.functions, worker),
        text_model=text,
        model=models.report,
        clock=_now,
    )
    cards = CardService(
        profiles=profiles, reports=reports, repository=SqlCardRepository(sql), clock=_now
    )
    memories = MemoryService(
        profiles=profiles,
        conversations=conversations,
        sessions=sessions,
        repository=SqlMemoryRepository(sql),
        text_model=text,
        model=models.memory,
        clock=_now,
    )
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
                reports=reports,
                memories=memories,
            ),
        },
        accounts=directory,
        provider=realtime,
        sessions=sessions,
        starter=LambdaCallStarter(clients.functions, worker),
        clock=_now,
    )
    home = HomeService(
        profiles=profiles,
        onboarding=onboarding,
        personas=personas,
        placement=placement,
        conversations=conversations,
        reports=reports,
        cards=cards,
        clock=_now,
    )
    progress = ProgressService(
        profiles=profiles,
        onboarding=onboarding,
        placement=placement,
        conversations=conversations,
        reports=reports,
        cards=cards,
        clock=_now,
    )
    files = S3FileStore(clients.s3, environment.get(_MEDIA_BUCKET, ""))
    accounts = AccountService(
        records=SqlAccountRepository(sql), files=files, directory=directory, clock=_now
    )
    services = Services(
        catalog=CATALOG,
        profiles=profiles,
        onboarding=onboarding,
        voice=voice,
        placement=placement,
        personas=personas,
        conversations=conversations,
        reports=reports,
        cards=cards,
        memories=memories,
        home=home,
        progress=progress,
        accounts=accounts,
        voices=VoiceSampleService(
            profiles=profiles, files=files, speech=OpenAiSpeech(openai_key), model=models.speech
        ),
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
        s3=s3_client(),
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


def run_worker(backend: Backend, event: dict[str, Any]) -> None:
    """The worker's two jobs, both too long for an API request: following a live call to its
    end (`call_id`), and what follows a conversation (`report`): writing its report, then
    writing down what it told about the learner."""
    if "report" in event:
        try:
            backend.services.reports.write(event["report"])
        finally:
            # A failure in one step does not block the other (spec §12.2).
            backend.services.memories.write(event["report"])
    else:
        asyncio.run(follow_call(backend.services.voice, backend.realtime, event["call_id"]))


def call_worker_handler(event: dict[str, Any], context: Any) -> None:
    """Started by the API when a call is created, and again when its report and its memories
    are to be written."""
    run_worker(_backend(), event)
