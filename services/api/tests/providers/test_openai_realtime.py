import json

import httpx
import pytest

from konvami_api.domain.voice import CreatedCall, VoiceProviderError
from konvami_api.providers.openai_realtime import OpenAiRealtime

KEY = "sk-test-key"
SESSION = {"type": "realtime", "model": "gpt-realtime-2.1-mini", "instructions": "Speak French."}
ANSWER = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n"


def provider(handler: httpx.MockTransport) -> OpenAiRealtime:
    return OpenAiRealtime(lambda: KEY, httpx.Client(transport=handler))


def test_a_call_is_created_from_the_offer_and_the_session() -> None:
    seen: dict[str, httpx.Request] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(
            201, text=ANSWER, headers={"Location": "/v1/realtime/calls/rtc_u1_9c6574da8b8a"}
        )

    created = provider(httpx.MockTransport(respond)).create_call("v=0 offer", SESSION, "hash-1")

    assert created == CreatedCall(call_id="rtc_u1_9c6574da8b8a", sdp_answer=ANSWER)
    request = seen["request"]
    assert (request.method, str(request.url)) == (
        "POST",
        "https://api.openai.com/v1/realtime/calls",
    )
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert request.headers["openai-safety-identifier"] == "hash-1"
    assert request.headers["content-type"].startswith("multipart/form-data")
    body = request.content.decode()
    assert 'name="sdp"' in body
    assert "v=0 offer" in body
    assert 'name="session"' in body
    assert json.dumps(SESSION) in body


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"error": {"message": "Incorrect API key provided: sk-test-key"}}),
        httpx.Response(500, text="upstream error"),
        httpx.Response(201, text=ANSWER),
        httpx.Response(201, text="", headers={"Location": "/v1/realtime/calls/rtc_1"}),
    ],
    ids=["refused", "server error", "no call id", "no answer"],
)
def test_an_unusable_answer_is_a_provider_error_that_never_shows_the_key(
    response: httpx.Response,
) -> None:
    with pytest.raises(VoiceProviderError) as error:
        provider(httpx.MockTransport(lambda _: response)).create_call("offer", SESSION, "hash-1")

    assert KEY not in str(error.value)
    assert KEY not in repr(error.value.__cause__)


def test_a_connection_failure_is_a_provider_error() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    with pytest.raises(VoiceProviderError):
        provider(httpx.MockTransport(fail)).create_call("offer", SESSION, "hash-1")


def test_hanging_up_asks_the_provider_to_end_that_call() -> None:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200)

    provider(httpx.MockTransport(respond)).hang_up("rtc_1")

    assert [(r.method, str(r.url)) for r in seen] == [
        ("POST", "https://api.openai.com/v1/realtime/calls/rtc_1/hangup")
    ]
    assert seen[0].headers["authorization"] == f"Bearer {KEY}"


@pytest.mark.parametrize("status", [404, 500])
def test_hanging_up_a_call_that_is_already_gone_is_not_an_error(status: int) -> None:
    provider(httpx.MockTransport(lambda _: httpx.Response(status))).hang_up("rtc_gone")


def test_the_server_side_connection_is_addressed_by_call_id() -> None:
    realtime = provider(httpx.MockTransport(lambda _: httpx.Response(200)))

    assert realtime.sideband_url("rtc_1") == "wss://api.openai.com/v1/realtime?call_id=rtc_1"
    assert realtime.sideband_headers() == {"Authorization": f"Bearer {KEY}"}
