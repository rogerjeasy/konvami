"""Motivation over HTTP: the streak, quests and milestones, a celebrated moment, a pause."""

from tests.api.conftest import Call
from tests.api.test_api import onboarded
from tests.api.test_report_api import talked
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel


def test_motivation_answers_with_the_streak_quests_and_moments(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    response = call("GET", "/v1/motivation?tz=Europe%2FZurich")

    assert response.status == 200
    body = response.body
    assert body["streak"]["days"] == 1
    assert body["streak"]["spokeToday"] is True
    assert body["streak"]["repair"] is None
    assert len(body["quests"]["quests"]) == 3
    assert {"kind", "target", "progress", "done", "doneAt"} <= set(body["quests"]["quests"][0])
    first = next(m for m in body["milestones"] if m["id"] == "first_conversation")
    assert first["reached"] is True
    assert first["reachedAt"] is not None
    assert {"kind": "milestone", "id": "first_conversation"} in [
        {"kind": c["kind"], "id": c["id"]} for c in body["celebrations"]
    ]
    assert body["remindersPausedUntil"] is None

    # Today's streak is the same one.
    assert call("GET", "/v1/home?tz=Europe%2FZurich").body["activity"]["streakDays"] == 1


def test_a_moment_is_marked_celebrated_once(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)
    call("GET", "/v1/motivation")

    moment = {"kind": "milestone", "id": "first_conversation"}
    assert call("POST", "/v1/motivation/celebrated", moment).status == 204
    assert call("POST", "/v1/motivation/celebrated", moment).status == 404
    celebrations = call("GET", "/v1/motivation").body["celebrations"]
    assert "first_conversation" not in [c["id"] for c in celebrations]


def test_reminders_can_be_paused_for_a_month_and_resumed(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    paused = call("PUT", "/v1/motivation/reminder-pause", {"days": 30})
    assert paused.status == 200
    assert paused.body["pausedUntil"] is not None
    assert call("GET", "/v1/motivation").body["remindersPausedUntil"] == paused.body["pausedUntil"]

    assert call("PUT", "/v1/motivation/reminder-pause", {"days": 90}).status == 422
    resumed = call("PUT", "/v1/motivation/reminder-pause", {"days": None})
    assert resumed.body["pausedUntil"] is None
