import json

import httpx
import pytest

from konvami_api.domain.push import PushError, PushMessage
from konvami_api.providers.expo_push import BATCH, ExpoPush

MESSAGE = PushMessage(
    "ExponentPushToken[1]", "Lena", "Ton bilan est prêt.", {"open": "report", "id": "rtc_1"}
)


def push(respond: object) -> ExpoPush:
    return ExpoPush(httpx.Client(transport=httpx.MockTransport(respond)))  # type: ignore[arg-type]


def test_messages_go_to_expo_with_what_a_tap_opens() -> None:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"data": [{"status": "ok", "id": "t1"}]})

    gone = push(respond).send([MESSAGE])

    assert gone == []
    assert str(seen[0].url) == "https://exp.host/--/api/v2/push/send"
    assert json.loads(seen[0].content) == [
        {
            "to": "ExponentPushToken[1]",
            "title": "Lena",
            "body": "Ton bilan est prêt.",
            "data": {"open": "report", "id": "rtc_1"},
            "sound": "default",
            "channelId": "reminders",
        }
    ]


def test_a_token_that_no_longer_reaches_a_phone_is_reported() -> None:
    second = PushMessage("ExponentPushToken[2]", "Lena", "…", {})

    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [
                    {"status": "ok", "id": "t1"},
                    {"status": "error", "details": {"error": "DeviceNotRegistered"}},
                ]
            },
        )

    assert push(respond).send([MESSAGE, second]) == ["ExponentPushToken[2]"]


def test_many_messages_are_sent_in_batches() -> None:
    sizes: list[int] = []

    def respond(request: httpx.Request) -> httpx.Response:
        sizes.append(len(json.loads(request.content)))
        return httpx.Response(200, json={"data": []})

    push(respond).send([MESSAGE] * (BATCH + 1))

    assert sizes == [BATCH, 1]


@pytest.mark.parametrize("status", [400, 429, 500])
def test_a_refusal_is_a_push_error(status: int) -> None:
    with pytest.raises(PushError):
        push(lambda _: httpx.Response(status)).send([MESSAGE])


def test_a_service_that_cannot_be_reached_is_a_push_error() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    with pytest.raises(PushError):
        push(respond).send([MESSAGE])
