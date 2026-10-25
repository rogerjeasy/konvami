"""The Learning Director over HTTP: this week's plan on Today, last week's check-in on Progress."""

from datetime import UTC, datetime
from uuid import UUID

from konvami_api.api.app import Services
from tests.api.conftest import USER, Call
from tests.api.test_api import onboarded, talked
from tests.fakes import (
    FakeSpeechModel,
    FixedClock,
    InMemoryVoiceSessionRepository,
    RecordingWeekStarter,
    ScriptedTextModel,
)

# The conftest's clock is Friday 9 October at noon; the Monday after it starts a new week.
LAST_FRIDAY = datetime(2026, 10, 9, 11, 0, tzinfo=UTC)
NEXT_MONDAY = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)


def test_today_carries_this_weeks_plan(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)

    plan = call("GET", "/v1/home?tz=Europe/Zurich").body["plan"]

    # They joined on Friday: their first week is Saturday's share, and today's.
    assert plan["week"] == "2026-10-05"
    assert (plan["minutes"], plan["days"], plan["capped"]) == (10, 1, False)
    assert plan["sessions"] == {"review": 0, "rolePlay": 0, "free": 1}
    assert len(plan["topics"]) == 3
    assert (plan["doneMinutes"], plan["doneDays"]) == (0, 0)
    assert plan["reason"] == "on_track"
    assert plan["today"] == [
        {"kind": "free", "minutes": 5, "topic": plan["topics"][0], "scenario": None}
    ]
    assert (plan["todayCards"], plan["missed"]) == (0, [])


def test_progress_has_no_check_in_before_a_week_with_practice(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    assert call("GET", "/v1/progress").body["lastWeek"] is None


def last_week(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> None:
    """A learner who talked for 8 minutes last Friday; it is now the Monday after."""
    lena, _ = onboarded(call, text_model)
    talked(calls, "rtc_1", lena, at=LAST_FRIDAY, minutes=8)
    clock.now = NEXT_MONDAY


def test_progress_shows_last_weeks_numbers_before_the_check_in_is_written(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> None:
    last_week(call, text_model, calls, clock)

    review = call("GET", "/v1/progress?tz=Europe/Zurich").body["lastWeek"]

    assert (review["status"], review["text"]) == ("none", None)
    numbers = review["numbers"]
    assert numbers["week"] == "2026-10-05"
    # Their first week began on the Friday they joined.
    assert (numbers["minutes"], numbers["plannedMinutes"], numbers["previousMinutes"]) == (
        8,
        10,
        0,
    )
    assert numbers["conversations"] == 1
    assert set(numbers) >= {"topics", "mistakes", "previousMistakes", "levelBefore", "levelAfter"}


def test_asking_for_the_check_in_starts_its_writer_and_it_can_then_be_heard(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
    services: Services,
    week_starter: RecordingWeekStarter,
    speech: FakeSpeechModel,
) -> None:
    last_week(call, text_model, calls, clock)

    asked = call("POST", "/v1/weeks/2026-10-05/review?tz=Europe/Zurich")
    followed = call("GET", "/v1/weeks/2026-10-05/review?tz=Europe/Zurich")
    early = call("GET", "/v1/weeks/2026-10-05/review/audio")
    text_model.answers.append({"text": "Tu as parlé 8 minutes cette semaine."})
    services.week_reviews.write(UUID(USER), week_starter.started[0][1])
    heard = call("GET", "/v1/weeks/2026-10-05/review/audio")

    assert (asked.status, asked.body["status"]) == (200, "pending")
    assert (followed.status, followed.body["status"]) == (200, "pending")
    assert early.status == 404
    review = call("GET", "/v1/progress?tz=Europe/Zurich").body["lastWeek"]
    assert (review["status"], review["text"]) == ("ready", "Tu as parlé 8 minutes cette semaine.")
    assert heard.status == 200
    assert heard.body["url"]
    assert len(speech.tasks) == 1


def test_only_last_weeks_check_in_can_be_asked_for(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> None:
    last_week(call, text_model, calls, clock)

    response = call("POST", "/v1/weeks/2026-09-28/review")
    read = call("GET", "/v1/weeks/2026-09-28/review")

    assert response.status == 404
    assert response.body["error"]["code"] == "not_found"
    assert read.status == 404


def test_a_week_without_practice_has_nothing_to_report(
    call: Call, text_model: ScriptedTextModel, clock: FixedClock
) -> None:
    onboarded(call, text_model)
    clock.now = NEXT_MONDAY

    response = call("POST", "/v1/weeks/2026-10-05/review")

    assert response.status == 409
    assert response.body["error"]["code"] == "nothing_to_report"
