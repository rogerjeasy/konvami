"""Cost control over HTTP (spec §6.19): a learner's voice minutes, and the owner's view."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from konvami_api.domain.costs import ChargeRecord, Feature
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from tests.api.conftest import OTHER_USER, OWNER, USER, Call
from tests.fakes import InMemoryChargeRepository, InMemoryVoiceSessionRepository

NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
OFFER = {"purpose": "onboarding", "sdp": "v=0 offer"}


def test_a_learner_sees_their_voice_minutes_this_week(
    call: Call, calls: InMemoryVoiceSessionRepository
) -> None:
    at = NOON - timedelta(hours=2)
    calls.started(VoiceSession("rtc_1", UUID(USER), CallPurpose.ONBOARDING, "gpt", at))
    calls.finish("rtc_1", FinishedCall(at + timedelta(seconds=300), "closed", {}, ()))

    response = call("GET", "/v1/voice/allowance")

    assert response.status == 200
    assert response.body == {
        "weeklySeconds": 900,
        "usedSeconds": 300,
        "remainingSeconds": 600,
        "resetsAt": "2026-10-12T00:00:00Z",
    }


def test_no_call_starts_once_the_weeks_minutes_are_used_up(call: Call) -> None:
    # The week has 900 seconds: 480 for the first call, the 420 left for the second.
    assert call("POST", "/v1/voice/calls", OFFER).body["maxSeconds"] == 480
    assert call("POST", "/v1/voice/calls", OFFER).body["maxSeconds"] == 420

    response = call("POST", "/v1/voice/calls", OFFER)

    assert response.status == 429
    assert response.body == {"error": {"code": "minutes_used_up", "field": None}}


def spent(charges: InMemoryChargeRepository, usd: float, user: str = USER) -> None:
    charges.add(
        ChargeRecord(UUID(user), Feature.REPORT, "openai", "gpt-6.1-sol", {}, usd, True, NOON)
    )


def test_no_voice_call_starts_at_the_spending_ceiling(
    call: Call, charges: InMemoryChargeRepository
) -> None:
    spent(charges, 250)

    response = call("POST", "/v1/voice/calls", OFFER)

    assert response.status == 503
    assert response.body == {"error": {"code": "voice_paused", "field": None}}


def test_only_the_owner_is_told_they_are_one(call: Call) -> None:
    assert call("GET", "/v1/account").body["owner"] is False
    assert call("GET", "/v1/account", subject=OWNER).body["owner"] is True


def test_a_learner_cannot_see_the_costs(call: Call) -> None:
    response = call("GET", "/v1/owner/costs")

    assert response.status == 403
    assert response.body == {"error": {"code": "not_owner", "field": None}}


def test_the_owner_sees_the_months_spending(call: Call, charges: InMemoryChargeRepository) -> None:
    spent(charges, 120.5)
    spent(charges, 40, user=OTHER_USER)

    response = call("GET", "/v1/owner/costs", subject=OWNER)

    assert response.status == 200
    assert response.body == {
        "month": "2026-10-01",
        "level": "economy",
        "targetUsd": 150.0,
        "ceilingUsd": 250.0,
        "totalUsd": 160.5,
        "unpriced": 0,
        "days": [{"day": "2026-10-09", "usd": 160.5}],
        "features": [{"key": "report", "usd": 160.5, "requests": 2}],
        "providers": [{"key": "openai", "usd": 160.5, "requests": 2}],
        "learners": [
            {
                "userId": USER,
                "name": "Amara",
                "usd": 120.5,
                "requests": 1,
                "voiceSeconds": 0,
            },
            {
                "userId": OTHER_USER,
                "name": "Jonas",
                "usd": 40.0,
                "requests": 1,
                "voiceSeconds": 0,
            },
        ],
    }


def test_the_owner_can_look_at_an_earlier_month(
    call: Call, charges: InMemoryChargeRepository
) -> None:
    charges.add(
        ChargeRecord(
            UUID(USER),
            Feature.TUTOR,
            "openai",
            "gpt-6.1-sol",
            {},
            2.5,
            True,
            datetime(2026, 9, 3, tzinfo=UTC),
        )
    )

    body = call("GET", "/v1/owner/costs?month=2026-09-01", subject=OWNER).body

    assert (body["month"], body["totalUsd"], body["level"]) == ("2026-09-01", 2.5, "normal")
