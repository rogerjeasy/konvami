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
from uuid import UUID

from mangum import Mangum

from konvami_api import observability
from konvami_api.api.app import Services, create_app
from konvami_api.domain.accounts import AccountService
from konvami_api.domain.candidate_speech import CandidateSpeech
from konvami_api.domain.caption_lookup import CaptionLookupService
from konvami_api.domain.card_details import CardDetailsService
from konvami_api.domain.card_schedule import CardScheduleService
from konvami_api.domain.cards import CardService
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.coach_facts import CoachFacts, coach_service
from konvami_api.domain.continuation import Continuations
from konvami_api.domain.conversation_review import ConversationReview
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.costs import CostService, Level, Meter, SpendGuard
from konvami_api.domain.course_import import CourseImportService
from konvami_api.domain.director import CaseSuggestion, DirectorService
from konvami_api.domain.exam_acoustics import ExamAcoustics
from konvami_api.domain.exam_centre import ExamScript, ExamService
from konvami_api.domain.exports import DataExportService
from konvami_api.domain.feedback import FeedbackService
from konvami_api.domain.flags import FlagService
from konvami_api.domain.grammar_map import GrammarMapService
from konvami_api.domain.halves import HalvesService
from konvami_api.domain.halves_check import ModelBrain
from konvami_api.domain.halves_writer import CaseMaterial, ModelCaseWriter
from konvami_api.domain.home import HomeService
from konvami_api.domain.host import HostScript
from konvami_api.domain.levels import LevelService
from konvami_api.domain.live_speech import LiveSpeech
from konvami_api.domain.memories import MemoryService
from konvami_api.domain.moderation import TextGuard
from konvami_api.domain.motivation import MotivationService
from konvami_api.domain.motivation_sources import motivation_sources
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.penpal import PenPalService
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.phrasebook import PhrasebookService
from konvami_api.domain.placement import PlacementScript, PlacementService
from konvami_api.domain.planner import SessionPlanner
from konvami_api.domain.plans import PlanService
from konvami_api.domain.practice import PracticeScript
from konvami_api.domain.premium_voices import PremiumVoices, PremiumVoiceService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.profile_questions import ProfileQuestionService
from konvami_api.domain.progress import ProgressService
from konvami_api.domain.pronunciation import PronunciationService
from konvami_api.domain.push import PushService
from konvami_api.domain.radio import RadioService
from konvami_api.domain.radio_check import ModelBrain as RadioBrain
from konvami_api.domain.real_life import RealLifeService
from konvami_api.domain.recordings import RecordingService
from konvami_api.domain.reminders import ReminderService
from konvami_api.domain.reports import ReportService
from konvami_api.domain.retries import RetryService
from konvami_api.domain.sounds import Sounds
from konvami_api.domain.spoken import Listener
from konvami_api.domain.spotter import LiveCheck, LiveSpotter
from konvami_api.domain.stories import StoryService
from konvami_api.domain.teacher_report import TeacherReportService
from konvami_api.domain.then_vs_now import ThenVsNowService
from konvami_api.domain.tutor import TutorService
from konvami_api.domain.two_partners import GuestSpeech
from konvami_api.domain.video_avatars import VideoAvatarService
from konvami_api.domain.vocabulary import VocabularyService
from konvami_api.domain.voice import CallPurpose, VoiceCallService
from konvami_api.domain.voice_messages import MessageChecker
from konvami_api.domain.voice_review import VoiceReviewService
from konvami_api.domain.voices import VoiceSampleService
from konvami_api.domain.web_deletion import WebDeletionService
from konvami_api.domain.week_review import WeekReviewService
from konvami_api.persistence.coach_repository import SqlCoachRepository
from konvami_api.persistence.continuation_repository import SqlContinuationRepository
from konvami_api.persistence.data_api import DataApiClient, RdsData
from konvami_api.persistence.export_repository import SqlExportRepository
from konvami_api.persistence.halves_repository import SqlHalvesRepository
from konvami_api.persistence.migrations import migrate_when_awake
from konvami_api.persistence.motivation_repository import SqlMotivationRepository
from konvami_api.persistence.pronunciation_repository import SqlPronunciationRepository
from konvami_api.persistence.radio_repository import SqlRadioRepository
from konvami_api.persistence.repositories import (
    SqlAccountRepository,
    SqlAlertLog,
    SqlAnswerAllowance,
    SqlAttemptLog,
    SqlCardRepository,
    SqlChargeRepository,
    SqlConversationRepository,
    SqlDraftLog,
    SqlEntitlementRepository,
    SqlExamRepository,
    SqlFeedbackRepository,
    SqlFlagRepository,
    SqlImportRepository,
    SqlLevelRepository,
    SqlMemoryRepository,
    SqlOnboardingRepository,
    SqlOwnScenarioRepository,
    SqlPackRepository,
    SqlPenPalRepository,
    SqlPersonaRepository,
    SqlPhraseRepository,
    SqlPlacementRepository,
    SqlPremiumVoiceRepository,
    SqlProfileRepository,
    SqlPushDeviceRepository,
    SqlQuestionRepository,
    SqlRecordingRepository,
    SqlReportRepository,
    SqlRetryRepository,
    SqlTutorRepository,
    SqlVoiceSessionRepository,
    SqlWeekReviewRepository,
)
from konvami_api.persistence.schedule_repository import SqlScheduleRepository
from konvami_api.persistence.sql import SqlClient
from konvami_api.persistence.story_repository import SqlStoryRepository
from konvami_api.persistence.video_avatar_repository import SqlVideoAvatarRepository
from konvami_api.persistence.vocabulary_repository import SqlVocabularyRepository
from konvami_api.providers.audio_encoding import FfmpegEncoder
from konvami_api.providers.aws import (
    LambdaCallStarter,
    LambdaClient,
    LambdaCoachStarter,
    LambdaDetailsStarter,
    LambdaExamStarter,
    LambdaFitStarter,
    LambdaHalvesStarter,
    LambdaPenPalStarter,
    LambdaRadioStarter,
    LambdaReportStarter,
    LambdaStoryStarter,
    LambdaWeekReviewStarter,
    SecretsClient,
    SnsClient,
    SnsNotifier,
    cached_secret,
)
from konvami_api.providers.azure_assessment import AzurePronunciation
from konvami_api.providers.cognito_accounts import CognitoAccounts
from konvami_api.providers.cognito_email_proof import CognitoClient, CognitoEmailProof
from konvami_api.providers.elevenlabs_speech import ElevenLabsSpeech
from konvami_api.providers.expo_push import ExpoPush
from konvami_api.providers.openai_moderation import OpenAiModerator
from konvami_api.providers.openai_realtime import OpenAiRealtime
from konvami_api.providers.openai_speech import OpenAiSpeech
from konvami_api.providers.openai_text import OpenAiText
from konvami_api.providers.openai_transcription import OpenAiTranscription
from konvami_api.providers.s3_store import S3, S3FileStore, s3_client
from konvami_api.providers.video_avatar import vendor_for
from konvami_api.providers.web_page import WebPageFetcher
from konvami_api.settings import (
    COSTS_VARIABLE,
    HALVES_VARIABLE,
    PLANS_VARIABLE,
    PREMIUM_VOICES_VARIABLE,
    RADIO_VARIABLE,
    TEXT_MODELS_VARIABLE,
    VIDEO_AVATARS_VARIABLE,
    VOICE_VARIABLE,
    cost_settings,
    halves_settings,
    plan_settings,
    premium_voice_settings,
    radio_settings,
    text_models,
    video_avatar_settings,
    voice_settings,
)
from konvami_api.worker import follow_call

_DB_SETTINGS = {
    "cluster_arn": "KONVAMI_DB_CLUSTER_ARN",
    "secret_arn": "KONVAMI_DB_SECRET_ARN",
    "database": "KONVAMI_DB_NAME",
}
# Set once the voice infrastructure exists; until then no voice call can start.
_USER_POOL = "KONVAMI_USER_POOL_ID"
_APP_CLIENT_ID = "KONVAMI_APP_CLIENT_ID"
_OPENAI_SECRET = "KONVAMI_OPENAI_SECRET_ARN"  # noqa: S105 - the name of a setting
# Empty until ElevenLabs is turned on (infra/envs/dev `elevenlabs_enabled`).
_ELEVENLABS_SECRET = "KONVAMI_ELEVENLABS_SECRET_ARN"  # noqa: S105 - the name of a setting
# The video avatar vendor's key (spec §6.20 P2); unset until a vendor is chosen.
_VIDEO_AVATAR_SECRET = "KONVAMI_VIDEO_AVATAR_SECRET_ARN"  # noqa: S105 - the name of a setting
_CALL_WORKER = "KONVAMI_CALL_WORKER"
# The secret RevenueCat's webhook sends in its Authorization header (infra/envs/dev `plans`).
_STORE_SECRET = "KONVAMI_REVENUECAT_SECRET_ARN"  # noqa: S105 - the name of a setting
# The private bucket for photos and voice samples (infra/modules/media).
_MEDIA_BUCKET = "KONVAMI_MEDIA_BUCKET"
# The SNS topic the owner's budget alerts are emailed through (infra/modules/budget).
_ALERT_TOPIC = "KONVAMI_ALERT_TOPIC_ARN"

# Each attempt waits about 20 seconds for a paused database; waking takes about 15.
MIGRATION_ATTEMPTS = 4


@dataclass(frozen=True)
class Clients:
    """The AWS clients. boto3's in Lambda; stubs in tests."""

    rds_data: RdsData
    cognito: CognitoClient
    functions: LambdaClient
    secrets: SecretsClient
    s3: S3
    sns: SnsClient


@dataclass(frozen=True)
class Backend:
    services: Services
    realtime: OpenAiRealtime


# Crash reporting starts with the container, so an error while building the backend is reported too.
observability.init(os.environ)


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


def video_avatars(
    environment: Mapping[str, str],
    clients: Clients,
    sql: SqlClient,
    plans: PlanService,
    profiles: ProfileService,
) -> VideoAvatarService:
    """Video avatars (spec §6.20 P2): offered only when a vendor is configured, implemented in
    `providers/video_avatar.py` and has its key's secret. Video faces are a Pro feature, gated
    like the premium voices."""
    config = video_avatar_settings(environment.get(VIDEO_AVATARS_VARIABLE))
    secret = environment.get(_VIDEO_AVATAR_SECRET, "")
    vendor = vendor_for(config.vendor, cached_secret(clients.secrets, secret)) if secret else None
    return VideoAvatarService(
        avatars=config,
        vendor=vendor,
        choices=SqlVideoAvatarRepository(sql, _now),
        allowed=plans.can_use_premium_voices,
        language=lambda user: profiles.get(user).target_language or "",
    )


def build_backend(
    environment: Mapping[str, str],
    clients: Clients,
    sleep: Callable[[float], object] = time.sleep,
) -> Backend:
    sql = _sql_client(environment, clients.rds_data, sleep)
    openai_key = cached_secret(clients.secrets, environment.get(_OPENAI_SECRET, ""))
    costs = cost_settings(environment.get(COSTS_VARIABLE))
    charges = SqlChargeRepository(sql)
    guard = SpendGuard(
        budget=costs.budget,
        charges=charges,
        alerts=SqlAlertLog(sql),
        notifier=SnsNotifier(clients.sns, environment.get(_ALERT_TOPIC, "")),
        clock=_now,
    )
    meter = Meter(prices=costs.prices, charges=charges, guard=guard, clock=_now)
    realtime = OpenAiRealtime(openai_key)
    text = OpenAiText(openai_key, meter=meter)
    # Reads what a learner writes for a partner's instructions before it is kept (moderation).
    text_guard = TextGuard(
        moderator=OpenAiModerator(openai_key, meter=meter),
        attempts=SqlAttemptLog(sql),
        clock=_now,
    )
    profiles = ProfileService(SqlProfileRepository(sql), CATALOG, _now, guard=text_guard)
    onboarding = OnboardingService(profiles, SqlOnboardingRepository(sql), _now)
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
        guard=text_guard,
        clock=_now,
        # The plan is built below, with the voice settings; the limit is asked per request.
        capacity=lambda user_id: plans.persona_limit(user_id),
    )
    conversations = ConversationService(SqlConversationRepository(sql), personas)
    push = PushService(
        repository=SqlPushDeviceRepository(sql),
        sender=ExpoPush(),
        personas=personas,
        conversations=conversations,
        clock=_now,
    )
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
        announce=push.report_ready,
    )
    vocabulary_store = SqlVocabularyRepository(sql)
    vocabulary = VocabularyService(
        profiles=profiles,
        accounts=directory,
        sessions=sessions,
        conversations=conversations,
        reports=reports,
        repository=vocabulary_store,
        text_model=text,
        model=models.report,
        clock=_now,
    )
    card_store = SqlCardRepository(sql)
    card_schedule = CardScheduleService(
        repository=SqlScheduleRepository(sql),
        clock=_now,
        starter=LambdaFitStarter(clients.functions, worker),
    )
    cards = CardService(
        profiles=profiles,
        reports=reports,
        repository=card_store,
        vocabulary=vocabulary_store,
        clock=_now,
        details=LambdaDetailsStarter(clients.functions, worker),
        schedule=card_schedule,
    )
    levels = LevelService(
        profiles=profiles,
        sessions=sessions,
        evidence=reports,
        repository=SqlLevelRepository(sql),
        clock=_now,
    )
    memories = MemoryService(
        profiles=profiles,
        conversations=conversations,
        sessions=sessions,
        repository=SqlMemoryRepository(sql),
        text_model=text,
        model=models.memory,
        clock=_now,
        guard=text_guard,
    )
    files = S3FileStore(clients.s3, environment.get(_MEDIA_BUCKET, ""))
    transcriber = OpenAiTranscription(openai_key, meter=meter)
    # Hears what the learner says on purpose outside a call, mistakes kept (the verbatim pass).
    listener = Listener(
        profiles=profiles, accounts=directory, transcriber=transcriber, model=models.verbatim
    )
    encoder = (
        FfmpegEncoder(environment["RECORDING_ENCODER_PATH"])
        if environment.get("RECORDING_ENCODER_PATH")
        else None
    )
    assessor = (
        AzurePronunciation(
            cached_secret(clients.secrets, environment.get("KONVAMI_AZURE_SPEECH_SECRET_ARN", "")),
            environment.get("KONVAMI_AZURE_SPEECH_REGION", ""),
            meter=meter,
        )
        if environment.get("KONVAMI_AZURE_SPEECH_SECRET_ARN")
        and environment.get("KONVAMI_AZURE_SPEECH_REGION")
        else None
    )
    recordings = RecordingService(
        profiles=profiles,
        conversations=conversations,
        sessions=sessions,
        repository=SqlRecordingRepository(sql),
        files=files,
        transcriber=transcriber,
        model=models.verbatim,
        aligner=transcriber,
        alignment_model=environment.get("RECORDING_ALIGNMENT_MODEL", ""),
        encoder=encoder,
        accounts=directory,
    )
    tutor_store = SqlTutorRepository(sql)
    tutor = TutorService(
        profiles=profiles,
        accounts=directory,
        conversations=conversations,
        reports=reports,
        repository=tutor_store,
        text_model=text,
        model=models.tutor,
        clock=_now,
    )
    course_imports = CourseImportService(
        listener=listener,
        profiles=profiles,
        accounts=directory,
        cards=cards,
        repository=SqlImportRepository(sql),
        limit=tutor_store,
        files=files,
        fetcher=WebPageFetcher(),
        text_model=text,
        model=models.tutor,
        clock=_now,
    )
    grammar = GrammarMapService(profiles=profiles, reports=reports)
    real_life = RealLifeService(
        profiles=profiles,
        accounts=directory,
        memories=memories,
        conversations=conversations,
        repository=SqlOwnScenarioRepository(sql),
        # Scenes count against the Tutor's requests of the day: the same strong text model.
        limit=tutor_store,
        guard=text_guard,
        text_model=text,
        model=models.tutor,
        clock=_now,
        listener=listener,
    )
    conversation_review = ConversationReview(
        profiles=profiles, sessions=sessions, conversations=conversations, cards=cards
    )
    voice_config = voice_settings(environment.get(VOICE_VARIABLE))
    plans = PlanService(
        settings=plan_settings(environment.get(PLANS_VARIABLE)),
        entitlements=SqlEntitlementRepository(sql),
        packs=SqlPackRepository(sql),
        owners=costs.owners,
        legacy_weekly_seconds=voice_config.weekly_seconds,
        used_seconds=sessions.seconds_used,
        clock=_now,
    )
    speech = OpenAiSpeech(openai_key, meter=meter)
    premium_config = premium_voice_settings(environment.get(PREMIUM_VOICES_VARIABLE))
    premium_speech = ElevenLabsSpeech(
        cached_secret(clients.secrets, environment.get(_ELEVENLABS_SECRET, "")), meter=meter
    )
    premium_voices = PremiumVoiceService(
        # Without the key's secret nothing is offered, whatever the voices say.
        premium=(
            premium_config.voices
            if environment.get(_ELEVENLABS_SECRET)
            else PremiumVoices(model="")
        ),
        access=plans,
        accounts=directory,
        choices=SqlPremiumVoiceRepository(sql, _now),
        speech=premium_speech,
        profiles=profiles,
        files=files,
    )
    sounds = Sounds(speech=speech, model=models.speech, files=files, premium=premium_voices)
    exams = ExamService(
        acoustics=ExamAcoustics(
            assessor,
            encoder,
            files,
            aligner=transcriber,
            alignment_model=environment.get("RECORDING_ALIGNMENT_MODEL", ""),
        )
        if assessor and encoder and encoder.available
        else None,
        recordings=recordings,
        accounts=directory,
        profiles=profiles,
        personas=personas,
        conversations=conversations,
        sessions=sessions,
        repository=SqlExamRepository(sql),
        starter=LambdaExamStarter(clients.functions, worker),
        text_model=text,
        # Scoring an exam is judging the learner's German, as the report does.
        model=models.report,
        sounds=sounds,
        clock=_now,
        announce=push.simulation_scored,
    )
    director = DirectorService(
        profiles=profiles,
        onboarding=onboarding,
        conversations=conversations,
        cards=cards,
        grammar=grammar,
        exams=exams,
        # The calls are built below, with the planner that reads this week's topics from here.
        allowance=lambda user_id: voice.allowance(user_id),
        call_seconds=voice_config.max_seconds.get(CallPurpose.PRACTICE, 0),
        clock=_now,
        # Two Halves is built below; the week's case is asked for when a plan is made.
        halves=lambda user_id, monday: _week_case(halves, user_id, monday),
    )
    voice = VoiceCallService(
        assessment_provider=exams.assessment_provider,
        continuations=Continuations(SqlContinuationRepository(sql)),
        current_language=lambda user: profiles.get(user).target_language,
        live_speech=LiveSpeech(premium_voices, premium_speech),
        candidate_speech=CandidateSpeech(directory, speech, models.speech, exams.candidate_voice),
        # The second partner of a two-partner conversation speaks with the same speech model.
        guest_speech=GuestSpeech(directory, speech, models.speech),
        settings=voice_config,
        scripts={
            CallPurpose.ONBOARDING: HostScript(CATALOG, profiles),
            CallPurpose.PLACEMENT: PlacementScript(placement),
            CallPurpose.EXAM: ExamScript(exams, candidate=bool(models.speech)),
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
                sessions=sessions,
                planner=SessionPlanner(
                    profiles=profiles,
                    reports=reports,
                    cards=cards,
                    # The Coach's focus of the day first (a mistake that keeps coming back, a
                    # weak topic), else the week's next topic.
                    week_topic=lambda user_id, today: (
                        coach.focus_topic(user_id, today) or director.topic_for_call(user_id, today)
                    ),
                    imports=course_imports.material,
                    events=real_life.debrief,
                ),
                own_scenarios=real_life.scenario,
                # A Two Halves briefing (7.5) is a role-play made from the learner's case; the
                # service is built below, so it is looked up when a call starts.
                extra_scenarios=lambda user_id, scenario: halves.briefing_scenario(
                    user_id, scenario
                ),
            ),
        },
        accounts=directory,
        provider=realtime,
        sessions=sessions,
        starter=LambdaCallStarter(clients.functions, worker),
        clock=_now,
        recordings=recordings,
        guard=guard,
        meter=meter,
        weekly_seconds=plans.weekly_seconds,
        # The same verbatim pass as after the call, so a turn written down live is not again.
        checker=LiveSpotter(
            profiles=profiles,
            personas=personas,
            check=LiveCheck(
                transcriber=transcriber,
                text_model=text,
                transcription_model=models.verbatim,
                model=models.spotter,
            ),
        ),
    )
    pen_pal = PenPalService(
        profiles=profiles,
        personas=personas,
        conversations=conversations,
        memories=memories,
        accounts=directory,
        repository=SqlPenPalRepository(sql),
        listener=listener,
        text_model=text,
        # A note is a short text; the answer and the check of its corrections judge the
        # learner's language, as a report does.
        note_model=models.week or models.memory,
        reply_model=models.report,
        speech=speech,
        speech_model=models.speech,
        files=files,
        starter=LambdaPenPalStarter(clients.functions, worker),
        clock=_now,
        announce=lambda user_id, persona_id, reply: push.pen_pal(user_id, persona_id, reply=reply),
    )
    motivation = MotivationService(
        repository=SqlMotivationRepository(sql),
        conversations=conversations,
        sources=motivation_sources(
            profiles=profiles,
            levels=levels,
            director=director,
            cards=cards,
            reports=reports,
            penpal=pen_pal,
            conversation_review=conversation_review,
            memories=memories,
            conversations=conversations,
            clock=_now,
        ),
        clock=_now,
    )
    # The nudge (built before motivation) asks it whether a learner paused their reminders.
    push.use_motivation(
        paused=motivation.reminders_paused,
        has_question=motivation.has_question,
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
        streak=lambda user_id, tz: motivation.streak(user_id, tz).days,
    )
    progress = ProgressService(
        profiles=profiles,
        onboarding=onboarding,
        placement=placement,
        conversations=conversations,
        reports=reports,
        cards=cards,
        levels=levels,
        clock=_now,
        streak=motivation.streak,
        milestones=motivation.milestones,
    )
    accounts = AccountService(
        records=SqlAccountRepository(sql), files=files, directory=directory, clock=_now
    )
    retries = RetryService(
        reports=reports,
        repository=SqlRetryRepository(sql),
        listener=listener,
        clock=_now,
    )
    pronunciation = PronunciationService(
        conversations=conversations,
        sessions=sessions,
        profiles=profiles,
        personas=personas,
        listener=listener,
        repository=SqlPronunciationRepository(sql),
        sounds=sounds,
        clock=_now,
        assessor=assessor,
    )
    coach_facts = CoachFacts(
        profiles=profiles,
        onboarding=onboarding,
        conversations=conversations,
        reports=reports,
        retries=retries,
        cards=cards,
        grammar=grammar,
        pronunciation=pronunciation,
        levels=levels,
        exams=exams,
        personas=personas,
        imports=course_imports,
        director=director,
        streak=motivation.streak,
    )
    coach = coach_service(
        profiles=profiles,
        facts=coach_facts,
        reports=reports,
        accounts=directory,
        repository=SqlCoachRepository(sql),
        starter=LambdaCoachStarter(clients.functions, worker),
        text_model=text,
        # Wording a few suggestions is a small-model job, like the weekly check-in.
        model=models.week or models.memory,
        affordable=lambda: guard.level() is Level.NORMAL,
        clock=_now,
    )
    halves_config = halves_settings(environment.get(HALVES_VARIABLE))
    halves = HalvesService(
        profiles=profiles,
        personas=personas,
        accounts=directory,
        repository=SqlHalvesRepository(sql),
        listener=listener,
        brain=ModelBrain(
            moderator=OpenAiModerator(openai_key, meter=meter),
            text_model=text,
            # The check, the stand-in and the recap are small jobs; corrections judge the
            # learner's language, as a report does.
            check_model=models.memory,
            write_model=models.week or models.memory,
            review_model=models.report,
            speech=speech,
            speech_model=models.speech,
            files=files,
            language_name=CATALOG.english_name,
            clock=_now,
        ),
        files=files,
        starter=LambdaHalvesStarter(clients.functions, worker),
        enabled=halves_config.enabled,
        allowed=lambda user_id: halves_config.open_to_testers or user_id in costs.owners,
        owners=costs.owners,
        clock=_now,
        announce=push.halves,
        strangers=halves_config.strangers,
        # A case from a course import is written by the strong model, as the import was.
        writer=ModelCaseWriter(
            text_model=text,
            model=models.report,
            moderator=OpenAiModerator(openai_key, meter=meter),
            language_name=CATALOG.english_name,
            clock=_now,
        ),
        material=lambda user_id, import_id: _case_material(course_imports, user_id, import_id),
    )
    radio_config = radio_settings(environment.get(RADIO_VARIABLE))
    radio = RadioService(
        profiles=profiles,
        accounts=directory,
        repository=SqlRadioRepository(sql),
        listener=listener,
        brain=RadioBrain(
            # The same check as a Two Halves move; corrections judge the learner's language, as
            # a report does.
            checker=MessageChecker(
                moderator=OpenAiModerator(openai_key, meter=meter),
                text_model=text,
                check_model=models.memory,
                review_model=models.report,
                language_name=CATALOG.english_name,
            ),
            text_model=text,
            write_model=models.week or models.memory,
            speech=speech,
            speech_model=models.speech,
            files=files,
            language_name=CATALOG.english_name,
        ),
        files=files,
        starter=LambdaRadioStarter(clients.functions, worker),
        enabled=radio_config.enabled,
        allowed=lambda user_id: radio_config.open_to_testers or user_id in costs.owners,
        owners=costs.owners,
        clock=_now,
        save_card=lambda user_id, phrase, meaning, explained_in: cards.save_phrase(
            user_id, phrase, meaning, explained_in
        ),
        # Past the month's spend target, the show is put together without a model.
        affordable=lambda: guard.level() is Level.NORMAL,
        announce=push.radio,
    )
    services = Services(
        halves=halves,
        radio=radio,
        catalog=CATALOG,
        profiles=profiles,
        questions=ProfileQuestionService(
            profiles=profiles,
            recordings=recordings,
            memories=memories,
            conversations=conversations,
            repository=SqlQuestionRepository(sql),
            clock=_now,
        ),
        onboarding=onboarding,
        voice=voice,
        placement=placement,
        personas=personas,
        conversations=conversations,
        reports=reports,
        levels=levels,
        cards=cards,
        memories=memories,
        reminders=ReminderService(memories=memories, cards=cards, clock=_now),
        push=push,
        home=home,
        progress=progress,
        accounts=accounts,
        recordings=recordings,
        tutor=tutor,
        course_imports=course_imports,
        real_life=real_life,
        teacher_report=TeacherReportService(
            profiles=profiles,
            conversations=conversations,
            reports=reports,
            grammar=grammar,
            levels=levels,
            clock=_now,
        ),
        vocabulary=vocabulary,
        caption_lookup=CaptionLookupService(
            profiles=profiles,
            accounts=directory,
            cards=cards,
            limit=tutor_store,
            text_model=text,
            model=models.tutor,
            clock=_now,
        ),
        phrasebook=PhrasebookService(
            sounds=Sounds(speech=speech, model=models.speech, files=files, premium=premium_voices),
            personas=personas,
            profiles=profiles,
            accounts=directory,
            cards=cards,
            repository=SqlPhraseRepository(sql),
            limit=tutor_store,
            text_model=text,
            model=models.tutor,
            clock=_now,
        ),
        voices=VoiceSampleService(
            profiles=profiles, files=files, speech=speech, model=models.speech
        ),
        premium_voices=premium_voices,
        video_avatars=video_avatars(environment, clients, sql, plans, profiles),
        card_schedule=card_schedule,
        card_details=CardDetailsService(
            profiles=profiles,
            personas=personas,
            repository=card_store,
            text_model=text,
            model=models.cards,
            sounds=sounds,
            files=files,
            clock=_now,
        ),
        grammar=grammar,
        director=director,
        exams=exams,
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
            review=conversation_review,
            allowance=voice.allowance,
            repository=SqlWeekReviewRepository(sql),
            starter=LambdaWeekReviewStarter(clients.functions, worker),
            text_model=text,
            model=models.week or models.memory,
            sounds=sounds,
            clock=_now,
        ),
        then_vs_now=ThenVsNowService(conversations=conversations, recordings=recordings),
        feedback=FeedbackService(
            repository=SqlFeedbackRepository(sql), owners=costs.owners, clock=_now
        ),
        web_deletion=WebDeletionService(
            proof=CognitoEmailProof(
                clients.cognito,
                user_pool_id=environment.get(_USER_POOL, ""),
                client_id=environment.get(_APP_CLIENT_ID, ""),
            ),
            accounts=accounts,
        ),
        exports=DataExportService(
            records=SqlExportRepository(sql), accounts=directory, files=files, clock=_now
        ),
        plans=plans,
        store_secret=cached_secret(clients.secrets, environment.get(_STORE_SECRET, "")),
        flags=FlagService(
            conversations=conversations,
            reports=reports,
            repository=SqlFlagRepository(sql),
            owners=costs.owners,
            clock=_now,
        ),
        pen_pal=pen_pal,
        motivation=motivation,
        stories=StoryService(
            profiles=profiles,
            personas=personas,
            cards=cards,
            memories=memories,
            repository=SqlStoryRepository(sql),
            listener=listener,
            text_model=text,
            # An episode is a short story at the learner's level, like a pen-pal note.
            model=models.week or models.memory,
            speech=speech,
            speech_model=models.speech,
            files=files,
            starter=LambdaStoryStarter(clients.functions, worker),
            clock=_now,
        ),
        retries=retries,
        pronunciation=pronunciation,
        coach=coach,
        conversation_review=conversation_review,
        voice_review=VoiceReviewService(
            profiles=profiles,
            cards=card_store,
            listener=listener,
            allowance=SqlAnswerAllowance(sql),
            clock=_now,
        ),
        costs=CostService(
            owners=costs.owners,
            budget=costs.budget,
            charges=charges,
            accounts=directory,
            clock=_now,
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
        sns=boto3.client("sns"),
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
    """The worker's jobs, all too long for an API request: following a live call to its end
    (`call_id`); what follows a conversation (`report`): writing its learner turns down a second
    time from their recordings, counting the due words the learner used as reviewed, writing
    its report, moving the level if the reports say so, then writing down what it told about
    the learner; and filling in a learner's new word cards with
    their forms (`card_details`); fitting a learner's card schedule to their reviews
    (`card_schedule`); writing a learner's weekly check-in (`week_review`); scoring
    an exam simulation (`exam`); and, once an hour, nudging learners who have been quiet for a
    week (`nudges`, from the schedule), and the partners' voice notes: the ones due, sent by the
    same hourly run (spec §6.16), and writing a note or an answer that is waiting (`pen_pal`);
    writing a listening story's episode (`story`, 5.29); and Radio Konvami's calls and shows
    (`radio`, section 8)."""
    if "nudges" in event:
        # One failing does not stop the others.
        try:
            backend.services.push.nudge()
        finally:
            try:
                backend.services.pen_pal.send_due()
            finally:
                try:
                    backend.services.halves.tick()
                finally:
                    backend.services.radio.tick()
        return
    if "halves" in event:
        _halves_job(backend, event["halves"], UUID(event["id"]))
        return
    if "radio" in event:
        _radio_job(backend, event["radio"], UUID(event["id"]))
        return
    if "pen_pal" in event:
        backend.services.pen_pal.write(UUID(event["pen_pal"]))
        return
    if "story" in event:
        backend.services.stories.write(UUID(event["story"]))
        return
    if "exam" in event:
        backend.services.exams.score(event["exam"])
        return
    if "coach" in event:
        day = dt.date.fromisoformat(event["day"])
        backend.services.coach.phrase(UUID(event["coach"]), day)
        return
    if "week_review" in event:
        week = dt.date.fromisoformat(event["week"])
        backend.services.week_reviews.write(UUID(event["week_review"]), week)
        return
    if "card_details" in event:
        backend.services.card_details.fill_in(UUID(event["card_details"]))
        return
    if "card_schedule" in event:
        if backend.services.card_schedule is not None:
            backend.services.card_schedule.fit(UUID(event["card_schedule"]))
        return
    if "report" in event:
        call_id = event["report"]
        services = backend.services
        # A failure in one step does not block the others (spec §12.2).
        try:
            services.recordings.transcribe(call_id)
        finally:
            try:
                services.conversation_review.after_conversation(call_id)
            finally:
                try:
                    services.reports.write(call_id)
                finally:
                    try:
                        services.levels.after_report(call_id)
                    finally:
                        try:
                            services.vocabulary.after_report(call_id)
                        finally:
                            services.memories.write(call_id)
    else:
        asyncio.run(follow_call(backend.services.voice, backend.realtime, event["call_id"]))


def _week_case(halves: HalvesService, user_id: UUID, monday: dt.date) -> CaseSuggestion | None:
    found = halves.suggestion(user_id, monday)
    return CaseSuggestion(found.template_id, found.title) if found else None


def _case_material(
    imports: CourseImportService, user_id: UUID, import_id: UUID
) -> CaseMaterial | None:
    """One of the learner's own course imports, as the Case Writer reads it (7.17)."""
    found = next((item for item in imports.imports(user_id) if item.id == import_id), None)
    if found is None:
        return None
    return CaseMaterial(
        id=found.id,
        title=found.title,
        language=found.language,
        level=found.level,
        text=found.text,
        words=tuple((word.word, word.meaning) for word in found.vocabulary),
    )


def _radio_job(backend: Backend, job: str, item_id: UUID) -> None:
    """Radio Konvami's jobs (section 8): check a call, build a show."""
    radio = backend.services.radio
    if job == "check":
        radio.check(item_id)
    elif job == "build":
        radio.build(item_id)


def _halves_job(backend: Backend, job: str, item_id: UUID) -> None:
    """Two Halves' jobs (section 7): check a move, play the AI stand-in, write the recap, and
    verify a native's nudge (phase 2)."""
    halves = backend.services.halves
    if job == "check":
        halves.check(item_id)
    elif job == "nudge":
        halves.check_nudge(item_id)
    elif job == "ai":
        halves.play(item_id)
    elif job == "recap":
        halves.write_recap(item_id)


def call_worker_handler(event: dict[str, Any], context: Any) -> None:
    """Started by the API when a call is created, and again when its report and its memories
    are to be written."""
    run_worker(_backend(), event)
