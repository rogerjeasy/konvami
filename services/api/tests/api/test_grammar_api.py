"""The grammar map over HTTP (spec §6.8): the map, a topic's page, and a call that practises one."""

from datetime import timedelta
from typing import Any
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.live_call import Turn
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from tests.api.conftest import USER, Call
from tests.api.test_api import NOON, onboarded
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel

ANALYSIS: dict[str, Any] = {
    "summary": "You talked about your weekend.",
    "mistakes": [
        {
            "turn": 1,
            "original": "mit der Bus",
            "corrected": "mit dem Bus",
            "explanation": "mit takes the dative.",
            "category": "case_dative",
            "severity": "noticeable",
        }
    ],
    "rewrites": [],
    "words": [],
    "wins": [],
    "next_steps": [],
    "usage": [
        {"topic": "dative", "uses": 3, "wrong": 1},
        {"topic": "perfekt", "uses": 2, "wrong": 0},
    ],
}
REVIEW: dict[str, Any] = {"mistakes": [{"id": 0, "verdict": "correct"}], "rewrites": []}


def reported(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> dict[str, Any]:
    """An onboarded learner with one reported conversation; returns Lena."""
    lena, _ = onboarded(call, text_model)
    at = NOON - timedelta(hours=1)
    calls.started(
        VoiceSession(
            "rtc_1",
            UUID(USER),
            CallPurpose.PRACTICE,
            "gpt-realtime-2.1-mini",
            at,
            persona_id=UUID(lena["id"]),
        )
    )
    turns = (
        Turn("persona", "Wie war dein Wochenende?"),
        Turn("learner", "Gut. Ich bin mit der Bus nach Bern gefahren und habe Freunde besucht."),
    )
    calls.finish("rtc_1", FinishedCall(at + timedelta(minutes=5), "closed", {}, turns))
    call("POST", "/v1/conversations/rtc_1/report")
    text_model.answers += [ANALYSIS, REVIEW]
    services.reports.write("rtc_1")
    return lena


def test_the_map_lists_every_topic_with_how_well_the_learner_has_it(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    response = call("GET", "/v1/grammar")

    assert response.status == 200
    assert (response.body["language"], response.body["level"]) == ("de", "A2")
    topics = {topic["id"]: topic for topic in response.body["topics"]}
    assert topics["dative"] == {
        "id": "dative",
        "level": "A2",
        "mastery": "introduced",
        "uses": 3,
        "correct": 2,
        "conversations": 1,
        "trend": None,
        "lastUsedAt": "2026-10-09T11:00:00Z",
    }
    assert topics["plural"]["mastery"] == "not_started"


def test_a_topic_page_has_the_learners_mistakes_and_examples(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    response = call("GET", "/v1/grammar/dative")

    assert response.status == 200
    body = response.body
    assert body["topic"]["id"] == "dative"
    assert body["examples"][0] == "Ich fahre mit dem Bus."
    assert "Ich fahre mit der Bus." in body["typicalMistakes"]
    assert body["mistakes"] == [
        {
            "conversationId": "rtc_1",
            "at": "2026-10-09T11:00:00Z",
            "original": "mit der Bus",
            "corrected": "mit dem Bus",
            "explanation": "mit takes the dative.",
            "certain": True,
        }
    ]


def test_a_topic_the_language_does_not_have_is_not_found(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    response = call("GET", "/v1/grammar/klingon")

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


def test_a_practice_call_can_practise_a_topic_of_the_map(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    lena = reported(call, text_model, calls, services)

    response = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"], "practise": "passive"},
    )

    assert response.status == 200
    assert response.body["plan"]["focus"] == ["passive", "dative"]
    assert response.body["plan"]["review"] is False


def test_a_practice_call_can_be_a_review_of_the_words_due(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    lena = reported(call, text_model, calls, services)

    response = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"], "practise": "words"},
    )

    assert response.status == 200
    assert response.body["plan"]["review"] is True
    assert response.body["plan"]["focus"] == []


def test_a_topic_the_language_does_not_have_cannot_be_practised(
    call: Call, text_model: ScriptedTextModel
) -> None:
    lena, _ = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"], "practise": "x"},
    )

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")
