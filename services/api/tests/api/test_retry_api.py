""" "Say it better" over HTTP (spec §6.5): an attempt at a report's correction, and the corrections
practised."""

import base64

from konvami_api.api.app import Services
from tests.api.conftest import OTHER_USER, Call
from tests.api.test_report_api import ANALYSIS, REVIEW, talked
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel, ScriptedTranscriber

AUDIO = base64.b64encode(b"\x00\x01" * 400).decode()
RETRY = "/v1/conversations/rtc_1/report/mistakes/0/retries"


def reported(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    """`rtc_1` with its report: a confirmed Perfekt mistake (0), an unconfirmed dative one (1)."""
    talked(call, text_model, calls)
    call("POST", "/v1/conversations/rtc_1/report")
    text_model.answers += [ANALYSIS, REVIEW]
    services.reports.write("rtc_1")


def test_an_attempt_says_what_was_heard_and_whether_it_is_right(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    retry_transcriber: ScriptedTranscriber,
) -> None:
    reported(call, text_model, calls, services)
    retry_transcriber.answers.append("Ich bin nach Berlin gefahren.")

    response = call("POST", RETRY, {"audio": AUDIO, "format": "m4a", "durationMs": 2400})

    assert (response.status, response.body) == (
        200,
        {
            "heard": "Ich bin nach Berlin gefahren.",
            "right": True,
            "said": "Ich habe nach Berlin gefahren",
            "better": "Ich bin nach Berlin gefahren",
        },
    )
    assert retry_transcriber.tasks[0].seconds == 2.4
    practised = call("GET", "/v1/conversations/rtc_1/retries")
    assert practised.body == {"retries": [{"index": 0, "right": True}]}


def test_a_correction_the_second_check_doubted_cannot_be_practised(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    response = call(
        "POST",
        "/v1/conversations/rtc_1/report/mistakes/1/retries",
        {"audio": AUDIO, "format": "m4a"},
    )

    assert (response.status, response.body["error"]["code"]) == (409, "unsure")


def test_audio_that_is_not_base64_is_refused(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    response = call("POST", RETRY, {"audio": "not audio!", "format": "m4a"})

    assert (response.status, response.body["error"]["code"]) == (422, "invalid_value")


def test_another_learners_conversation_cannot_be_practised(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    response = call("POST", RETRY, {"audio": AUDIO, "format": "m4a"}, subject=OTHER_USER)

    assert response.status == 404
