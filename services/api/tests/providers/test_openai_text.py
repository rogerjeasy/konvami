import json
from dataclasses import replace
from typing import Any
from uuid import UUID

import httpx
import pytest

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.text import TextModelError, TextTask
from konvami_api.providers.openai_text import OpenAiText

KEY = "sk-test-key"
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["grammar"],
    "properties": {"grammar": {"type": "string", "enum": ["A1", "A2"]}},
}
TASK = TextTask(
    model="gpt-6.1-sol",
    instructions="You grade language learners.",
    content="Learner said: 'Ich habe nach Hause gegangen.'",
    answer_name="estimate",
    answer_schema=SCHEMA,
)


def completed(text: str, status: str = "completed") -> dict[str, Any]:
    """An answer as the Responses API really sends it (captured 2026-10-09, shortened)."""
    return {
        "id": "resp_1",
        "object": "response",
        "status": status,
        "error": None,
        "incomplete_details": None,
        "model": "gpt-6.1-sol",
        "output": [
            {"id": "rs_1", "type": "reasoning", "summary": []},
            {
                "id": "msg_1",
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{"type": "output_text", "text": text, "annotations": []}],
            },
        ],
        "usage": {
            "input_tokens": 98,
            "input_tokens_details": {"cache_write_tokens": 0, "cached_tokens": 0},
            "output_tokens": 143,
            "output_tokens_details": {"reasoning_tokens": 72},
            "total_tokens": 241,
        },
    }


def model(respond: Any) -> OpenAiText:
    return OpenAiText(lambda: KEY, httpx.Client(transport=httpx.MockTransport(respond)))


def test_a_task_is_answered_as_json_in_the_asked_shape() -> None:
    seen: dict[str, httpx.Request] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, json=completed('{"grammar":"A1"}'))

    assert model(respond).answer(TASK) == {"grammar": "A1"}

    request = seen["request"]
    assert (request.method, str(request.url)) == ("POST", "https://api.openai.com/v1/responses")
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert json.loads(request.content) == {
        "model": "gpt-6.1-sol",
        "instructions": "You grade language learners.",
        "input": "Learner said: 'Ich habe nach Hause gegangen.'",
        "text": {
            "format": {"type": "json_schema", "name": "estimate", "strict": True, "schema": SCHEMA}
        },
        "store": False,
    }


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"error": {"message": "Incorrect API key provided: sk-test-key"}}),
        httpx.Response(500, text="upstream error"),
        httpx.Response(200, json=completed('{"grammar":"A1"}', status="incomplete")),
        httpx.Response(200, json=completed('{"grammar": ')),
        httpx.Response(200, json=completed('["A1"]')),
        httpx.Response(200, json={"status": "completed", "output": []}),
        httpx.Response(200, text="not json"),
    ],
    ids=[
        "refused",
        "server error",
        "cut short",
        "broken json",
        "not an object",
        "empty",
        "garbage",
    ],
)
def test_an_unusable_answer_is_a_text_model_error_that_never_shows_the_key(
    response: httpx.Response,
) -> None:
    with pytest.raises(TextModelError) as error:
        model(lambda _: response).answer(TASK)

    assert KEY not in str(error.value)


def test_a_connection_failure_is_a_text_model_error() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow", request=request)

    with pytest.raises(TextModelError):
        model(fail).answer(TASK)


def test_a_task_waits_for_its_own_time_limit_and_no_longer() -> None:
    seen: dict[str, httpx.Request] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, json=completed('{"grammar":"A1"}'))

    quick = TextTask(
        model="gpt-6-luna",
        instructions="Be quick.",
        content="{}",
        answer_name="estimate",
        answer_schema=SCHEMA,
        max_seconds=20,
    )
    model(respond).answer(quick)

    assert seen["request"].extensions["timeout"]["read"] == 20


def test_a_task_without_a_time_limit_gets_the_background_one() -> None:
    seen: dict[str, httpx.Request] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, json=completed('{"grammar":"A1"}'))

    model(respond).answer(TASK)

    assert seen["request"].extensions["timeout"]["read"] == 90


class RecordingMeter:
    def __init__(self) -> None:
        self.recorded: list[tuple[Any, str, str, dict[str, float]]] = []

    def record(self, charge: Any, provider: str, model: str, units: Any) -> None:
        self.recorded.append((charge, provider, model, dict(units)))


def test_what_an_answer_used_is_metered_for_the_tasks_charge() -> None:
    meter = RecordingMeter()
    answer = completed('{"grammar":"A1"}')
    answer["usage"]["input_tokens_details"]["cached_tokens"] = 64
    respond = lambda _: httpx.Response(200, json=answer)  # noqa: E731
    text = OpenAiText(
        lambda: KEY, httpx.Client(transport=httpx.MockTransport(respond)), meter=meter
    )
    charge = Charge(UUID("11111111-1111-4111-8111-111111111111"), Feature.REPORT)

    text.answer(replace(TASK, charge=charge))

    assert meter.recorded == [
        (
            charge,
            "openai",
            "gpt-6.1-sol",
            {"input_tokens": 34, "cached_input_tokens": 64, "output_tokens": 143},
        )
    ]


def test_an_answer_that_cannot_be_read_is_still_metered() -> None:
    # It was paid for all the same.
    meter = RecordingMeter()
    respond = lambda _: httpx.Response(200, json=completed("not json"))  # noqa: E731
    text = OpenAiText(
        lambda: KEY, httpx.Client(transport=httpx.MockTransport(respond)), meter=meter
    )

    with pytest.raises(TextModelError):
        text.answer(TASK)

    assert [model for _, _, model, _ in meter.recorded] == ["gpt-6.1-sol"]
