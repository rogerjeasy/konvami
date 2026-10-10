import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.host import HostScript
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, PlacementStatus
from konvami_api.domain.placement import MIN_TASKS, PlacementScript, PlacementService
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.voice import (
    CallPurpose,
    VoiceCallService,
    VoiceError,
    VoiceSettings,
)
from tests.fakes import (
    FakeAccountDirectory,
    FakeVoiceProvider,
    FixedClock,
    InMemoryOnboardingRepository,
    InMemoryPlacementRepository,
    InMemoryProfileRepository,
    InMemoryVoiceSessionRepository,
    RecordingCallStarter,
    ScriptedTextModel,
)

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
OFFER = "v=0 offer"
SETTINGS = VoiceSettings(
    models={
        CallPurpose.ONBOARDING: "gpt-realtime-2.1-mini",
        CallPurpose.PLACEMENT: "gpt-realtime-2.1",
    },
    max_seconds={CallPurpose.ONBOARDING: 480, CallPurpose.PLACEMENT: 720},
    voice="marin",
    transcription_model="gpt-transcribe",
    daily_call_limit=3,
)


class Setup:
    def __init__(self) -> None:
        self.clock = FixedClock(NOON)
        self.profiles = ProfileService(InMemoryProfileRepository(), CATALOG, self.clock)
        self.accounts = FakeAccountDirectory(
            {
                USER: Account("Amara", "fr", voice_consent=True),
                OTHER_USER: Account("Jonas", "de", voice_consent=False),
            }
        )
        self.provider = FakeVoiceProvider()
        self.sessions = InMemoryVoiceSessionRepository()
        self.starter = RecordingCallStarter()
        self.onboarding = OnboardingService(
            self.profiles, InMemoryOnboardingRepository(), self.clock
        )
        self.text = ScriptedTextModel()
        self.placement = PlacementService(
            profiles=self.profiles,
            onboarding=self.onboarding,
            results=InMemoryPlacementRepository(),
            text_model=self.text,
            model="gpt-6.1-sol",
            clock=self.clock,
        )
        self.service = VoiceCallService(
            settings=SETTINGS,
            scripts={
                CallPurpose.ONBOARDING: HostScript(CATALOG, self.profiles),
                CallPurpose.PLACEMENT: PlacementScript(self.placement),
            },
            accounts=self.accounts,
            provider=self.provider,
            sessions=self.sessions,
            starter=self.starter,
            clock=self.clock,
        )


@pytest.fixture
def setup() -> Setup:
    return Setup()


def test_a_call_is_created_with_the_guides_instructions_and_tools(setup: Setup) -> None:
    started = setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    assert (started.call_id, started.sdp_answer, started.max_seconds) == (
        "rtc_1",
        "v=0 answer",
        480,
    )
    offer, session, _ = setup.provider.created[0]
    assert offer == OFFER
    assert session["type"] == "realtime"
    assert session["model"] == "gpt-realtime-2.1-mini"
    assert "Amara" in session["instructions"]
    assert "Speak French" in session["instructions"]
    assert session["tools"][0]["name"] == "save_target_language"
    assert session["tool_choice"] == "auto"
    assert session["audio"]["output"] == {"voice": "marin"}
    assert session["audio"]["input"]["transcription"] == {"model": "gpt-transcribe"}
    assert session["audio"]["input"]["turn_detection"] == {
        "type": "server_vad",
        "silence_duration_ms": 800,
    }


def test_the_provider_gets_a_hashed_user_id_never_the_real_one(setup: Setup) -> None:
    setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    identifier = setup.provider.created[0][2]
    assert identifier == hashlib.sha256(str(USER).encode()).hexdigest()
    assert str(USER) not in identifier


def test_the_guide_is_told_what_the_learner_already_answered(setup: Setup) -> None:
    setup.profiles.apply(
        USER, [Change("target_language", "de")], source=Source.ASKED, origin=Origin.FORM
    )

    setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    assert "- learning de" in setup.provider.created[0][1]["instructions"]


def test_the_call_is_recorded_and_its_server_side_started(setup: Setup) -> None:
    setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    session = setup.sessions.get("rtc_1")
    assert session is not None
    assert (session.user_id, session.purpose, session.model, session.started_at) == (
        USER,
        CallPurpose.ONBOARDING,
        "gpt-realtime-2.1-mini",
        NOON,
    )
    assert setup.starter.started == [("rtc_1", USER, "onboarding")]


def test_no_call_without_consent_to_the_voice_provider(setup: Setup) -> None:
    with pytest.raises(VoiceError) as error:
        setup.service.start(OTHER_USER, CallPurpose.ONBOARDING, OFFER)

    assert error.value.code == "consent_required"
    assert setup.provider.created == []


def test_calls_are_limited_per_learner_per_day(setup: Setup) -> None:
    for _ in range(3):
        setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    with pytest.raises(VoiceError) as error:
        setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    assert error.value.code == "call_limit"
    assert len(setup.provider.created) == 3


def test_the_limit_frees_up_a_day_later(setup: Setup) -> None:
    for _ in range(3):
        setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    setup.clock.now = NOON + timedelta(hours=24, seconds=1)

    assert setup.service.start(USER, CallPurpose.ONBOARDING, OFFER).call_id == "rtc_4"


def test_a_provider_failure_is_reported_and_nothing_is_recorded(setup: Setup) -> None:
    setup.provider.fail = True

    with pytest.raises(VoiceError) as error:
        setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    assert error.value.code == "voice_unavailable"
    assert setup.sessions.sessions == {}
    assert setup.starter.started == []


def test_a_call_whose_server_side_cannot_start_is_hung_up(setup: Setup) -> None:
    setup.starter.fail = True

    with pytest.raises(VoiceError) as error:
        setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    assert error.value.code == "voice_unavailable"
    assert setup.provider.hung_up == ["rtc_1"]


def test_a_purpose_without_a_configured_model_is_not_available(setup: Setup) -> None:
    service = VoiceCallService(
        settings=VoiceSettings({}, {}, voice="", transcription_model="", daily_call_limit=3),
        scripts={CallPurpose.ONBOARDING: HostScript(CATALOG, setup.profiles)},
        accounts=setup.accounts,
        provider=setup.provider,
        sessions=setup.sessions,
        starter=setup.starter,
        clock=setup.clock,
    )

    with pytest.raises(VoiceError) as error:
        service.start(USER, CallPurpose.ONBOARDING, OFFER)

    assert error.value.code == "voice_unavailable"
    assert setup.provider.created == []


def test_the_tools_for_a_running_call_belong_to_its_learner(setup: Setup) -> None:
    setup.service.start(USER, CallPurpose.ONBOARDING, OFFER)

    live = setup.service.live_call("rtc_1")
    assert live is not None
    live.handle(
        {
            "type": "response.done",
            "response": {
                "status": "completed",
                "output": [
                    {
                        "type": "function_call",
                        "status": "completed",
                        "name": "save_target_language",
                        "call_id": "call_1",
                        "arguments": '{"language": "de"}',
                    }
                ],
            },
        },
        10,
    )

    assert setup.profiles.get(USER).target_language == "de"
    assert setup.profiles.get(OTHER_USER).target_language is None


def test_an_unknown_call_has_no_server_side(setup: Setup) -> None:
    assert setup.service.live_call("rtc_unknown") is None


def test_a_caller_whose_account_no_longer_exists_is_refused(setup: Setup) -> None:
    stranger = UUID("33333333-3333-4333-8333-333333333333")

    with pytest.raises(VoiceError) as error:
        setup.service.start(stranger, CallPurpose.ONBOARDING, OFFER)

    assert error.value.code == "not_authenticated"
    assert setup.provider.created == []


# --- The placement test as a call ---------------------------------------------------------------

ESSENTIALS = [
    Change("target_language", "de"),
    Change("explanation_language", "fr"),
    Change("explanation_usage", "when_stuck"),
    Change("goals", {"reasons": ["work"], "note": None}),
    Change("exam", None),
    Change("self_assessed_level", "A2"),
    Change("course", None),
]


def ready_for_placement(setup: Setup) -> None:
    setup.profiles.apply(USER, ESSENTIALS, source=Source.ASKED, origin=Origin.FORM)
    setup.onboarding.confirm_essentials(USER)


def test_a_placement_call_gets_the_examiners_instructions_tools_and_patience(
    setup: Setup,
) -> None:
    ready_for_placement(setup)

    started = setup.service.start(USER, CallPurpose.PLACEMENT, OFFER)

    session = setup.provider.created[0][1]
    assert started.max_seconds == 720
    assert session["model"] == "gpt-realtime-2.1"
    assert "Conduct the test in German" in session["instructions"]
    assert [tool["name"] for tool in session["tools"]] == ["note_task", "finish_test"]
    # Learners pause to think in a language they are learning.
    assert session["audio"]["input"]["turn_detection"]["type"] == "semantic_vad"
    assert setup.onboarding.placement(USER) is PlacementStatus.IN_PROGRESS


def test_a_placement_call_cannot_start_before_the_essentials_are_confirmed(
    setup: Setup,
) -> None:
    with pytest.raises(OnboardingError) as error:
        setup.service.start(USER, CallPurpose.PLACEMENT, OFFER)

    assert error.value.code == "wrong_stage"
    assert setup.provider.created == []
    assert setup.onboarding.placement(USER) is PlacementStatus.NOT_STARTED


def test_a_placement_call_that_cannot_be_created_leaves_the_test_untaken(setup: Setup) -> None:
    ready_for_placement(setup)
    setup.provider.fail = True

    with pytest.raises(VoiceError):
        setup.service.start(USER, CallPurpose.PLACEMENT, OFFER)

    assert setup.onboarding.placement(USER) is PlacementStatus.NOT_STARTED


def test_when_a_placement_call_ends_its_result_is_worked_out(setup: Setup) -> None:
    ready_for_placement(setup)
    setup.text.answers.append(
        {
            "levels": dict.fromkeys(
                ["speaking", "listening", "grammar", "vocabulary", "pronunciation"], "B1"
            ),
            "overall": "B1",
            "weak_areas": [],
        }
    )
    call_id = setup.service.start(USER, CallPurpose.PLACEMENT, OFFER).call_id
    live = setup.service.live_call(call_id)
    assert live is not None

    def tool_call(name: str, arguments: str) -> dict[str, object]:
        item = {
            "type": "function_call",
            "status": "completed",
            "name": name,
            "call_id": "c",
            "arguments": arguments,
        }
        return {"type": "response.done", "response": {"status": "completed", "output": [item]}}

    for _ in range(MIN_TASKS):
        live.handle(
            tool_call("note_task", '{"task": "opinion", "level": "B1", "outcome": "handled"}'), 60
        )
    for text in (
        "Ich wohne in Zürich.",
        "Ich arbeite als Ingenieur.",
        "Am Wochenende wandere ich.",
    ):
        live.handle(
            {"type": "conversation.item.input_audio_transcription.completed", "transcript": text},
            90,
        )
    live.handle(
        tool_call(
            "finish_test",
            '{"speaking": "B1", "listening": "B1", "grammar": "B1", "vocabulary": "B1",'
            ' "pronunciation": "B1"}',
        ),
        400,
    )
    live.closed()

    setup.service.finished(call_id, live)

    assert setup.onboarding.placement(USER) is PlacementStatus.MEASURED
    assert setup.placement.view(USER).result is not None
