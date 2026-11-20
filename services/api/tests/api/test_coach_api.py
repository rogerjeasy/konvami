"""The Coach over HTTP (5.1, 5.26): today's suggestions, what holds the learner back and what went
well, and the learner's answers."""

from datetime import timedelta
from uuid import uuid4

from tests.api.conftest import Call
from tests.api.test_api import onboarded, talked
from tests.fakes import (
    FixedClock,
    InMemoryVoiceSessionRepository,
    RecordingCoachStarter,
    ScriptedTextModel,
)


def quiet_for_a_week(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> dict[str, str]:
    """A learner whose last conversation was six days ago."""
    partners = onboarded(call, text_model)
    talked(calls, "rtc_1", partners[0], at=clock() - timedelta(days=6))
    return partners[0]


def test_before_entering_the_app_there_is_no_coach(call: Call) -> None:
    assert call("GET", "/v1/coach").status == 409


def test_a_learner_back_after_a_week_is_offered_a_short_conversation(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
    coach_starter: RecordingCoachStarter,
) -> None:
    lena = quiet_for_a_week(call, text_model, calls, clock)

    coach = call("GET", "/v1/coach?tz=Europe/Zurich").body

    assert coach["day"] == clock().date().isoformat()
    assert coach["wording"] == "pending"
    assert coach["leads"] is False
    first = coach["suggestions"][0]
    assert first["kind"] == "long_gap"
    assert first["evidence"]["days"] == 6
    assert first["action"] == {
        "type": "free_talk",
        "topic": None,
        "sound": None,
        "exam": None,
        "partnerId": lena["id"],
        "callId": None,
        "importId": None,
        "count": None,
    }
    assert (first["minutes"], first["status"], first["title"], first["why"]) == (
        5,
        "open",
        None,
        None,
    )
    assert coach["holdingBack"][0]["kind"] == "long_gap"
    assert coach["goingWell"] == []
    assert coach["history"] == []
    assert len(coach_starter.started) == 1


def test_an_answer_is_kept_and_the_suggestion_leaves_the_day(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> None:
    quiet_for_a_week(call, text_model, calls, clock)
    first = call("GET", "/v1/coach").body["suggestions"][0]

    answered = call(
        "POST",
        f"/v1/coach/suggestions/{first['id']}/feedback",
        {"response": "dismissed", "reason": "too_long"},
    )

    assert answered.status == 204
    assert first["id"] not in {s["id"] for s in call("GET", "/v1/coach").body["suggestions"]}


def test_an_unknown_suggestion_or_answer_is_refused(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> None:
    quiet_for_a_week(call, text_model, calls, clock)
    first = call("GET", "/v1/coach").body["suggestions"][0]

    unknown = call("POST", f"/v1/coach/suggestions/{uuid4()}/feedback", {"response": "accepted"})
    wrong = call("POST", f"/v1/coach/suggestions/{first['id']}/feedback", {"response": "maybe"})

    assert unknown.status == 404
    assert unknown.body["error"]["code"] == "not_found"
    assert wrong.status == 422
