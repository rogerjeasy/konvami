"""Ask-the-Tutor over HTTP (spec §6.8): asking, reading the questions asked, and asking about a
report's correction."""

from typing import Any

from konvami_api.api.app import Services
from konvami_api.domain.text import TextModelError
from konvami_api.domain.tutor import QUESTIONS_PER_DAY
from tests.api.conftest import USER, Call
from tests.api.test_api import onboarded
from tests.api.test_report_api import ANALYSIS, REVIEW, talked
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel

ANSWER: dict[str, Any] = {
    "explanation": "After mit, German always uses the dative: der Bus becomes dem Bus.",
    "examples": [{"text": "Ich fahre mit dem Bus.", "translation": "I take the bus."}],
    "topic": "case_dative",
    "unsure": False,
}


def test_a_question_is_answered_and_listed(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    text_model.answers.append(ANSWER)

    asked = call("POST", "/v1/tutor/questions", {"question": "Why dem after mit?"})

    assert asked.status == 200
    assert asked.body == {
        "id": "dddddddd-dddd-4ddd-8ddd-000000000001",
        "askedAt": "2026-10-09T12:00:00Z",
        "question": "Why dem after mit?",
        "answer": {
            "explanation": "After mit, German always uses the dative: der Bus becomes dem Bus.",
            "examples": [{"text": "Ich fahre mit dem Bus.", "translation": "I take the bus."}],
            "topic": "case_dative",
            "unsure": False,
        },
        "source": "text",
    }
    assert call("GET", "/v1/tutor/questions").body == {"questions": [asked.body]}


def test_a_report_correction_is_explained(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    talked(call, text_model, calls)
    call("POST", "/v1/conversations/rtc_1/report")
    text_model.answers += [ANALYSIS, REVIEW]
    services.reports.write("rtc_1")
    text_model.answers.append(ANSWER)

    asked = call("POST", "/v1/tutor/corrections", {"conversationId": "rtc_1", "index": 1})

    assert asked.status == 200
    assert asked.body["question"] == "mit der Bus → mit dem Bus"
    assert asked.body["source"] == "report"
    assert (
        call("POST", "/v1/tutor/corrections", {"conversationId": "rtc_1", "index": 5}).status == 404
    )


def test_a_question_that_is_empty_or_too_long_is_refused(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    assert call("POST", "/v1/tutor/questions", {"question": " "}).status == 422
    assert call("POST", "/v1/tutor/questions", {"question": "x" * 501}).status == 422


def test_the_daily_limit_is_reported(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    text_model.answers += [ANSWER] * QUESTIONS_PER_DAY
    for number in range(QUESTIONS_PER_DAY):
        call("POST", "/v1/tutor/questions", {"question": f"Frage {number}?"})

    response = call("POST", "/v1/tutor/questions", {"question": "Noch eine?"})

    assert (response.status, response.body["error"]["code"]) == (429, "tutor_limit")


def test_a_tutor_that_cannot_answer_asks_to_try_again(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)
    text_model.answers.append(TextModelError("timeout"))

    response = call("POST", "/v1/tutor/questions", {"question": "Warum?"})

    assert (response.status, response.body["error"]["code"]) == (503, "unavailable")


def test_the_tutor_is_the_signed_in_learners_own(call: Call) -> None:
    assert call("GET", "/v1/tutor/questions", subject=None).status == 401
    assert call("POST", "/v1/tutor/questions", {"question": "?"}, subject=None).status == 401
    assert call("GET", "/v1/tutor/questions", subject=USER).body == {"questions": []}
