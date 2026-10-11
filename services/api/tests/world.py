"""A whole backend on in-memory storage, with shortcuts for the states tests start from: a
learner who has finished onboarding, a conversation that has taken place.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import Account, AccountService
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.home import HomeService
from konvami_api.domain.host import HostScript
from konvami_api.domain.live_call import Turn
from konvami_api.domain.onboarding import OnboardingService
from konvami_api.domain.personas import Persona, PersonaService
from konvami_api.domain.placement import PlacementResult, PlacementScript, PlacementService
from konvami_api.domain.practice import PracticeScript
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.reports import MAX_REQUESTS, Report, ReportService, Stats
from konvami_api.domain.text import TextModelError
from konvami_api.domain.voice import (
    CallPurpose,
    FinishedCall,
    VoiceCallService,
    VoiceSession,
    VoiceSettings,
)
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
    InMemoryReportRepository,
    InMemoryVoiceSessionRepository,
    RecordingCallStarter,
    RecordingReportStarter,
    ScriptedTextModel,
)

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
# A Friday, at noon in UTC.
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
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
    daily_call_limit=3,
)
LEVELS = {
    "speaking": "A2",
    "listening": "B1",
    "grammar": "A2",
    "vocabulary": "A2",
    "pronunciation": "B1",
}


class World:
    def __init__(self, now: datetime = NOON) -> None:
        self.clock = FixedClock(now)
        self.profiles = ProfileService(InMemoryProfileRepository(), CATALOG, self.clock)
        self.onboarding = OnboardingService(
            self.profiles, InMemoryOnboardingRepository(), self.clock
        )
        self.text = ScriptedTextModel()
        self.results = InMemoryPlacementRepository()
        self.placement = PlacementService(
            profiles=self.profiles,
            onboarding=self.onboarding,
            results=self.results,
            text_model=self.text,
            model="gpt-6.1-sol",
            clock=self.clock,
        )
        self.personas = PersonaService(
            profiles=self.profiles,
            onboarding=self.onboarding,
            repository=InMemoryPersonaRepository(),
            text_model=self.text,
            model="gpt-6-luna",
            drafts=InMemoryDraftLog(),
            clock=self.clock,
        )
        self.accounts = FakeAccountDirectory(
            {
                USER: Account("Amara", "fr", voice_consent=True),
                OTHER_USER: Account("Jonas", "de", voice_consent=True),
            }
        )
        self.provider = FakeVoiceProvider()
        self.sessions = InMemoryVoiceSessionRepository()
        self.starter = RecordingCallStarter()
        self.conversations = ConversationService(
            InMemoryConversationRepository(self.sessions), self.personas
        )
        self.report_store = InMemoryReportRepository(self.sessions)
        self.report_starter = RecordingReportStarter()
        self.reports = ReportService(
            profiles=self.profiles,
            conversations=self.conversations,
            sessions=self.sessions,
            accounts=self.accounts,
            repository=self.report_store,
            starter=self.report_starter,
            text_model=self.text,
            model="gpt-6.1-sol",
            clock=self.clock,
        )
        self.practice = PracticeScript(
            profiles=self.profiles,
            onboarding=self.onboarding,
            personas=self.personas,
            placement=self.placement,
            conversations=self.conversations,
            reports=self.reports,
        )
        self.voice = VoiceCallService(
            settings=VOICE,
            scripts={
                CallPurpose.ONBOARDING: HostScript(CATALOG, self.profiles),
                CallPurpose.PLACEMENT: PlacementScript(self.placement),
                CallPurpose.PRACTICE: self.practice,
            },
            accounts=self.accounts,
            provider=self.provider,
            sessions=self.sessions,
            starter=self.starter,
            clock=self.clock,
        )
        self.home = HomeService(
            profiles=self.profiles,
            onboarding=self.onboarding,
            personas=self.personas,
            placement=self.placement,
            conversations=self.conversations,
            reports=self.reports,
            clock=self.clock,
        )
        self.files = InMemoryFileStore()
        self.speech = FakeSpeechModel()
        self.voices = VoiceSampleService(
            profiles=self.profiles, files=self.files, speech=self.speech, model="gpt-4o-mini-tts"
        )
        self.account = AccountService(
            records=InMemoryAccountRepository(),
            files=self.files,
            directory=self.accounts,
            clock=self.clock,
        )
        self._calls = 0

    def onboard(
        self,
        user: UUID = USER,
        *,
        level: str = "A2",
        usage: str = "when_stuck",
        exam: Any = None,
        measured: bool = False,
    ) -> list[Persona]:
        """Takes a learner of German through onboarding, with the language pack's own partners
        (Lena the buddy, Jonas the teacher and, with an exam, Frau Weber the coach)."""
        self.profiles.apply(
            user,
            [
                Change("target_language", "de"),
                Change("explanation_language", "fr"),
                Change("explanation_usage", usage),
                Change("goals", {"reasons": ["work"], "note": "job in Zurich"}),
                Change("exam", exam),
                Change("self_assessed_level", level),
                Change("course", None),
            ],
            source=Source.ASKED,
            origin=Origin.FORM,
        )
        self.onboarding.confirm_essentials(user)
        self.onboarding.skip_placement(user)
        if measured:
            self.results.save(
                user,
                "de",
                PlacementResult(
                    levels=LEVELS,
                    overall=level,
                    weak_areas=("Le datif après « mit »", "L'ordre des mots"),
                    measured_at=self.clock(),
                ),
            )
        # The writer does not deliver, so the built-in partners are offered.
        self.text.answers.append(TextModelError())
        partners = self.personas.propose(user)
        self.personas.confirm(user)
        self.onboarding.complete(user)
        return partners

    def talk(
        self,
        persona: Persona | None,
        *,
        at: datetime,
        minutes: float = 5,
        user: UUID = USER,
        learner_says: tuple[str, ...] = ("Hallo Lena!",),
        turns: tuple[Turn, ...] | None = None,
        ended: bool = True,
    ) -> str:
        """Records a practice conversation as the broker and the worker would: started at `at`,
        and (unless `ended` is False) finished `minutes` later. What was said is `turns`, or a
        greeting and the lines of `learner_says`. Returns its id."""
        self._calls += 1
        call_id = f"rtc_past_{self._calls}"
        self.sessions.started(
            VoiceSession(
                call_id,
                user,
                CallPurpose.PRACTICE,
                "gpt-realtime-2.1-mini",
                at,
                persona_id=persona.id if persona else None,
            )
        )
        if ended:
            if turns is None:
                greeting = Turn("persona", "Hallo! Wie geht's?")
                turns = (greeting, *(Turn("learner", line) for line in learner_says))
            self.sessions.finish(
                call_id,
                FinishedCall(
                    ended_at=at + timedelta(minutes=minutes),
                    outcome="closed",
                    usage={"input_audio_tokens": 100},
                    turns=tuple(turns),
                ),
            )
        return call_id

    def reported(self, call_id: str, *next_steps: str, target: str = "de") -> None:
        """Stores a ready report for a conversation, as the worker would after writing it."""
        now = self.clock()
        self.report_store.request(call_id, now, stale_before=now, max_requests=MAX_REQUESTS)
        self.report_store.written(
            call_id,
            "ready",
            Report(
                target=target,
                language="fr",
                summary="Vous avez parlé de votre week-end.",
                mistakes=(),
                rewrites=(),
                words=(),
                wins=(),
                next_steps=next_steps,
                stats=Stats(20, 15, 3, 9),
            ),
        )
