"""The Session Report over HTTP: reading it, and asking for one."""

from datetime import timedelta
from typing import Any
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.accounts import Account
from konvami_api.domain.live_call import Turn
from konvami_api.domain.reports import MAX_REQUESTS
from konvami_api.domain.text import TextModelError
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from tests.api.conftest import OTHER_USER, USER, Call
from tests.api.test_api import NOON, onboarded
from tests.fakes import (
    FakeAccountDirectory,
    InMemoryVoiceSessionRepository,
    RecordingReportStarter,
    ScriptedTextModel,
)

TURNS = (
    Turn("persona", "Hallo Amara! Wie war dein Wochenende?"),
    Turn("learner", "Gut. Ich habe nach Berlin gefahren mit der Bus."),
    Turn("persona", "Oh, schön! Was hast du in Berlin gemacht?"),
    Turn("learner", "Ich habe ein Museum besucht, weil es war sehr interessant."),
)
ANALYSIS: dict[str, Any] = {
    "summary": "You talked about your weekend in Berlin.",
    "mistakes": [
        {
            "turn": 1,
            "original": "Ich habe nach Berlin gefahren",
            "corrected": "Ich bin nach Berlin gefahren",
            "explanation": "Verbs of movement such as fahren form the Perfekt with sein.",
            "category": "perfekt_auxiliary",
            "severity": "noticeable",
        },
        {
            "turn": 1,
            "original": "mit der Bus",
            "corrected": "mit dem Bus",
            "explanation": "mit takes the dative: der Bus becomes dem Bus.",
            "category": "case_dative",
            "severity": "minor",
        },
    ],
    "rewrites": [
        {
            "turn": 3,
            "original": "Ich habe ein Museum besucht",
            "natural": "Ich war im Museum",
            "note": "More usual when speaking.",
        }
    ],
    "words": [
        {"word": "das Wochenende", "meaning": "weekend", "example": "Wie war dein Wochenende?"},
        {"word": "die Ausstellung", "meaning": "exhibition", "example": ""},
    ],
    "wins": ["You told a whole story in the past tense."],
    "next_steps": ["The Perfekt with sein for verbs of movement."],
}
REVIEW: dict[str, Any] = {
    "mistakes": [{"id": 0, "verdict": "correct"}, {"id": 1, "verdict": "uncertain"}],
    "rewrites": [{"id": 0, "verdict": "keep"}],
}


def talked(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    turns: tuple[Turn, ...] = TURNS,
) -> None:
    """An onboarded learner and their finished conversation `rtc_1` with Lena."""
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
    calls.finish("rtc_1", FinishedCall(at + timedelta(minutes=5), "closed", {}, turns))


def test_a_conversation_without_a_report_says_so(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    response = call("GET", "/v1/conversations/rtc_1/report")

    assert (response.status, response.body) == (200, {"status": "none", "report": None})


def test_a_report_can_be_asked_for_and_is_pending_until_it_is_written(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    report_starter: RecordingReportStarter,
) -> None:
    talked(call, text_model, calls)

    asked = call("POST", "/v1/conversations/rtc_1/report")
    read = call("GET", "/v1/conversations/rtc_1/report")

    assert (asked.status, asked.body) == (200, {"status": "pending", "report": None})
    assert read.body == {"status": "pending", "report": None}
    assert report_starter.started == ["rtc_1"]


def test_a_written_report_is_read_in_full(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    talked(call, text_model, calls)
    call("POST", "/v1/conversations/rtc_1/report")
    text_model.answers += [ANALYSIS, REVIEW]
    services.reports.write("rtc_1")

    response = call("GET", "/v1/conversations/rtc_1/report")

    assert response.status == 200
    assert response.body == {
        "status": "ready",
        "report": {
            "language": "en",
            "summary": "You talked about your weekend in Berlin.",
            "mistakes": [
                {
                    "turn": 1,
                    "original": "Ich habe nach Berlin gefahren",
                    "corrected": "Ich bin nach Berlin gefahren",
                    "explanation": "Verbs of movement such as fahren form the Perfekt with sein.",
                    "category": "perfekt_auxiliary",
                    "severity": "noticeable",
                    "certain": True,
                    "saved": False,
                },
                {
                    "turn": 1,
                    "original": "mit der Bus",
                    "corrected": "mit dem Bus",
                    "explanation": "mit takes the dative: der Bus becomes dem Bus.",
                    "category": "case_dative",
                    "severity": "minor",
                    "certain": False,
                    "saved": False,
                },
            ],
            "rewrites": [
                {
                    "turn": 3,
                    "original": "Ich habe ein Museum besucht",
                    "natural": "Ich war im Museum",
                    "note": "More usual when speaking.",
                }
            ],
            "words": [
                {
                    "text": "das Wochenende",
                    "meaning": "weekend",
                    "example": "Wie war dein Wochenende?",
                    "saved": False,
                },
                {
                    "text": "die Ausstellung",
                    "meaning": "exhibition",
                    "example": None,
                    "saved": False,
                },
            ],
            "wins": ["You told a whole story in the past tense."],
            "nextSteps": ["The Perfekt with sein for verbs of movement."],
            "stats": {
                "learnerWords": 19,
                "partnerWords": 14,
                "learnerTurns": 2,
                "longestTurnWords": 10,
            },
        },
    }


def test_a_report_is_only_read_or_asked_for_by_the_learner_who_had_the_conversation(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    report_starter: RecordingReportStarter,
) -> None:
    talked(call, text_model, calls)
    not_found = {"error": {"code": "not_found", "field": None}}

    for method in ("GET", "POST"):
        theirs = call(method, "/v1/conversations/rtc_1/report", subject=OTHER_USER)
        unknown = call(method, "/v1/conversations/rtc_nothing/report")
        assert (theirs.status, theirs.body) == (404, not_found)
        assert (unknown.status, unknown.body) == (404, not_found)
    assert report_starter.started == []


def test_a_conversation_without_a_word_of_the_learner_has_nothing_to_report(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls, turns=(Turn("persona", "Hallo!"),))

    response = call("POST", "/v1/conversations/rtc_1/report")

    assert response.status == 409
    assert response.body == {"error": {"code": "nothing_to_report", "field": None}}


def test_a_report_is_not_written_for_a_learner_who_withdrew_their_consent(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    directory: FakeAccountDirectory,
) -> None:
    talked(call, text_model, calls)
    directory.accounts[UUID(USER)] = Account("Amara", "fr", voice_consent=False)

    response = call("POST", "/v1/conversations/rtc_1/report")

    assert response.status == 403
    assert response.body == {"error": {"code": "consent_required", "field": None}}


def test_a_report_that_cannot_be_started_is_unavailable(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    report_starter: RecordingReportStarter,
) -> None:
    talked(call, text_model, calls)
    report_starter.fail = True

    response = call("POST", "/v1/conversations/rtc_1/report")

    assert response.status == 503
    assert response.body == {"error": {"code": "unavailable", "field": None}}
    assert call("GET", "/v1/conversations/rtc_1/report").body["status"] == "failed"


def test_a_report_that_keeps_failing_cannot_be_asked_for_without_end(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    report_starter: RecordingReportStarter,
) -> None:
    talked(call, text_model, calls)
    statuses = []
    for _ in range(MAX_REQUESTS + 1):
        statuses.append(call("POST", "/v1/conversations/rtc_1/report").status)
        text_model.answers.append(TextModelError("no answer"))
        services.reports.write("rtc_1")

    assert statuses == [200] * MAX_REQUESTS + [429]
    assert len(report_starter.started) == MAX_REQUESTS
    refused = call("POST", "/v1/conversations/rtc_1/report")
    assert refused.body == {"error": {"code": "report_limit", "field": None}}
