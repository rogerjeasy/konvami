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
from konvami_api.domain.card_details import CardDetailsService
from konvami_api.domain.cards import CardService
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.conversation_review import ConversationReview
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.costs import Budget, CostService, SpendGuard
from konvami_api.domain.director import DirectorService
from konvami_api.domain.grammar_map import GrammarMapService
from konvami_api.domain.home import HomeService
from konvami_api.domain.host import HostScript
from konvami_api.domain.levels import LevelService
from konvami_api.domain.memories import MemoryService
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.placement import PlacementScript, PlacementService
from konvami_api.domain.planner import SessionPlanner
from konvami_api.domain.practice import PracticeScript
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.progress import ProgressService
from konvami_api.domain.recordings import RecordingService
from konvami_api.domain.reports import ReportService
from konvami_api.domain.retries import RetryService
from konvami_api.domain.sounds import Sounds
from konvami_api.domain.spoken import Listener
from konvami_api.domain.tutor import TutorService
from konvami_api.domain.voice import CallPurpose, VoiceCallService, VoiceSettings
from konvami_api.domain.voice_review import VoiceReviewService
from konvami_api.domain.voices import VoiceSampleService
from konvami_api.domain.week_review import WeekReviewService
from tests.fakes import (
    FakeAccountDirectory,
    FakeSpeechModel,
    FakeTranscriber,
    FakeVoiceProvider,
    FixedClock,
    InMemoryAccountRepository,
    InMemoryAlertLog,
    InMemoryCardRepository,
    InMemoryChargeRepository,
    InMemoryConversationRepository,
    InMemoryDailyAllowance,
    InMemoryDraftLog,
    InMemoryFileStore,
    InMemoryLevelRepository,
    InMemoryMemoryRepository,
    InMemoryOnboardingRepository,
    InMemoryPersonaRepository,
    InMemoryPlacementRepository,
    InMemoryProfileRepository,
    InMemoryRecordingRepository,
    InMemoryReportRepository,
    InMemoryRetryRepository,
    InMemoryTutorRepository,
    InMemoryVoiceSessionRepository,
    InMemoryWeekReviewRepository,
    RecordingCallStarter,
    RecordingNotifier,
    RecordingReportStarter,
    RecordingWeekStarter,
    ScriptedTextModel,
    ScriptedTranscriber,
)

USER = "11111111-1111-4111-8111-111111111111"
OTHER_USER = "22222222-2222-4222-8222-222222222222"
# The account that may see the costs.
OWNER = "33333333-3333-4333-8333-333333333333"
BUDGET = Budget(target_usd=150, ceiling_usd=250)


@dataclass
class Response:
    status: int
    body: Any


# When every test request arrives (the event's `timeEpoch`), in seconds.
REQUEST_TIME = 1791547200


def http_api_event(
    method: str,
    target: str,
    body: Any,
    subject: str | None,
    signed_in_seconds_ago: int = 0,
) -> dict[str, Any]:
    """An API Gateway HTTP API (payload 2.0) event, as Lambda gets it behind a JWT authorizer.
    `target` is the path, with its query string if it has one. `signed_in_seconds_ago`: how
    long ago the caller typed their password (the token's `auth_time`); a token that was only
    refreshed since keeps the old time."""
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
        "timeEpoch": REQUEST_TIME * 1000,
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
                    "auth_time": str(REQUEST_TIME - signed_in_seconds_ago),
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
    weekly_seconds=900,
)


@pytest.fixture
def charges() -> InMemoryChargeRepository:
    return InMemoryChargeRepository()


@pytest.fixture
def voice_provider() -> FakeVoiceProvider:
    return FakeVoiceProvider()


@pytest.fixture
def text_model() -> ScriptedTextModel:
    return ScriptedTextModel()


@pytest.fixture
def retry_transcriber() -> ScriptedTranscriber:
    return ScriptedTranscriber()


@pytest.fixture
def answer_transcriber() -> ScriptedTranscriber:
    """Writes down the cards answered out loud."""
    return ScriptedTranscriber()


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
def report_starter() -> RecordingReportStarter:
    """Records the reports asked for; `services.reports.write` then stands in for the worker."""
    return RecordingReportStarter()


@pytest.fixture
def week_starter() -> RecordingWeekStarter:
    return RecordingWeekStarter()


@pytest.fixture
def level_store(calls: InMemoryVoiceSessionRepository) -> InMemoryLevelRepository:
    """The level engine's steps, for tests that need the level to have moved."""
    return InMemoryLevelRepository(calls)


@pytest.fixture
def memory_store(calls: InMemoryVoiceSessionRepository) -> InMemoryMemoryRepository:
    """What is remembered, for tests that need something to have been written down."""
    return InMemoryMemoryRepository(calls)


@pytest.fixture
def services(
    clock: FixedClock,
    voice_provider: FakeVoiceProvider,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    memory_store: InMemoryMemoryRepository,
    files: InMemoryFileStore,
    directory: FakeAccountDirectory,
    account_records: InMemoryAccountRepository,
    speech: FakeSpeechModel,
    report_starter: RecordingReportStarter,
    charges: InMemoryChargeRepository,
    level_store: InMemoryLevelRepository,
    retry_transcriber: ScriptedTranscriber,
    answer_transcriber: ScriptedTranscriber,
    week_starter: RecordingWeekStarter,
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
    reports = ReportService(
        profiles=profiles,
        conversations=conversations,
        sessions=calls,
        accounts=directory,
        repository=InMemoryReportRepository(calls),
        starter=report_starter,
        text_model=text_model,
        model="gpt-6.1-sol",
        clock=clock,
    )
    levels = LevelService(
        profiles=profiles, sessions=calls, evidence=reports, repository=level_store, clock=clock
    )
    # Card ids in the order they are handed out: ...0001, ...0002, and so on.
    card_ids = (UUID(f"cccccccc-cccc-4ccc-8ccc-{number:012d}") for number in range(1, 10_000))
    card_store = InMemoryCardRepository()
    cards = CardService(
        profiles=profiles,
        reports=reports,
        repository=card_store,
        clock=clock,
        new_id=lambda: next(card_ids),
    )
    memories = MemoryService(
        profiles=profiles,
        conversations=conversations,
        sessions=calls,
        repository=memory_store,
        text_model=text_model,
        model="gpt-6-luna",
        clock=clock,
    )
    recordings = RecordingService(
        profiles=profiles,
        conversations=conversations,
        sessions=calls,
        repository=InMemoryRecordingRepository(calls),
        files=files,
        transcriber=FakeTranscriber(files),
        model="gpt-transcribe",
    )
    # Question ids in the order they are handed out: ...0001, ...0002, and so on.
    question_ids = (UUID(f"dddddddd-dddd-4ddd-8ddd-{n:012d}") for n in range(1, 10_000))
    tutor = TutorService(
        profiles=profiles,
        accounts=directory,
        conversations=conversations,
        reports=reports,
        repository=InMemoryTutorRepository(),
        text_model=text_model,
        model="gpt-6.1-sol",
        clock=clock,
        new_id=lambda: next(question_ids),
    )
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
                reports=reports,
                memories=memories,
                recordings=recordings,
                tutor=tutor,
                sessions=calls,
                planner=SessionPlanner(
                    profiles=profiles,
                    reports=reports,
                    cards=cards,
                    week_topic=lambda user_id, today: director.topic_for_call(user_id, today),
                ),
            ),
        },
        accounts=directory,
        provider=voice_provider,
        sessions=calls,
        starter=RecordingCallStarter(),
        clock=clock,
        recordings=recordings,
        guard=SpendGuard(
            budget=BUDGET,
            charges=charges,
            alerts=InMemoryAlertLog(),
            notifier=RecordingNotifier(),
            clock=clock,
        ),
    )
    grammar = GrammarMapService(profiles=profiles, reports=reports)
    director = DirectorService(
        profiles=profiles,
        onboarding=onboarding,
        conversations=conversations,
        cards=cards,
        grammar=grammar,
        allowance=voice.allowance,
        call_seconds=VOICE.max_seconds[CallPurpose.PRACTICE],
        clock=clock,
    )
    home = HomeService(
        profiles=profiles,
        onboarding=onboarding,
        personas=personas,
        placement=placement,
        conversations=conversations,
        reports=reports,
        cards=cards,
        clock=clock,
    )
    progress = ProgressService(
        profiles=profiles,
        onboarding=onboarding,
        placement=placement,
        conversations=conversations,
        reports=reports,
        cards=cards,
        levels=levels,
        clock=clock,
    )
    # Upload ids in the order they are handed out: ...0001, ...0002, and so on.
    upload_ids = (UUID(f"aaaaaaaa-aaaa-4aaa-8aaa-{number:012d}") for number in range(1, 100))
    accounts = AccountService(
        records=account_records,
        files=files,
        directory=directory,
        clock=clock,
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
        reports=reports,
        levels=levels,
        cards=cards,
        memories=memories,
        home=home,
        progress=progress,
        accounts=accounts,
        recordings=recordings,
        tutor=tutor,
        voices=VoiceSampleService(
            profiles=profiles, files=files, speech=speech, model="gpt-4o-mini-tts"
        ),
        grammar=grammar,
        director=director,
        week_reviews=WeekReviewService(
            profiles=profiles,
            accounts=directory,
            personas=personas,
            conversations=conversations,
            reports=reports,
            cards=cards,
            grammar=grammar,
            levels=levels,
            director=director,
            allowance=voice.allowance,
            repository=InMemoryWeekReviewRepository(),
            starter=week_starter,
            text_model=text_model,
            model="gpt-6-luna",
            sounds=Sounds(speech=speech, model="gpt-4o-mini-tts", files=files),
            clock=clock,
        ),
        card_details=CardDetailsService(
            profiles=profiles,
            personas=personas,
            repository=card_store,
            text_model=text_model,
            model="gpt-6.1-sol",
            sounds=Sounds(speech=speech, model="gpt-4o-mini-tts", files=files),
            files=files,
            clock=clock,
        ),
        retries=RetryService(
            reports=reports,
            repository=InMemoryRetryRepository(),
            listener=Listener(
                profiles=profiles,
                accounts=directory,
                transcriber=retry_transcriber,
                model="gpt-4o-transcribe",
            ),
            clock=clock,
        ),
        conversation_review=ConversationReview(
            profiles=profiles, sessions=calls, conversations=conversations, cards=cards
        ),
        voice_review=VoiceReviewService(
            profiles=profiles,
            cards=card_store,
            listener=Listener(
                profiles=profiles,
                accounts=directory,
                transcriber=answer_transcriber,
                model="gpt-4o-transcribe",
            ),
            allowance=InMemoryDailyAllowance(),
            clock=clock,
        ),
        costs=CostService(
            owners=frozenset({UUID(OWNER)}),
            budget=BUDGET,
            charges=charges,
            accounts=directory,
            clock=clock,
        ),
    )


@pytest.fixture
def call(services: Services) -> Call:
    """Calls the API the way API Gateway does: through the Lambda handler, as a signed-in user."""
    handler = Mangum(create_app(services), lifespan="off")

    def _call(
        method: str,
        path: str,
        body: Any = None,
        *,
        subject: str | None = USER,
        signed_in_seconds_ago: int = 0,
    ) -> Response:
        event = http_api_event(method, path, body, subject, signed_in_seconds_ago)
        result = handler(event, None)  # type: ignore[arg-type]
        text = result.get("body") or ""
        return Response(result["statusCode"], json.loads(text) if text else None)

    return _call
