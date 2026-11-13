import json
from dataclasses import replace
from typing import Any, cast

from mangum import Mangum
from mangum.types import LambdaContext

from konvami_api.api.app import Services, create_app
from tests.api.conftest import OTHER_USER, USER, http_api_event
from tests.domain.test_voice_continuation import setup


def test_owned_continuation_waits_for_worker_then_returns_same_logical_call(
    services: Services,
) -> None:
    world, voice, root = setup()
    context = cast(LambdaContext, None)
    handler = Mangum(create_app(replace(services, voice=voice)), lifespan="off")
    body = {"attemptId": "retry_1", "sdpOffer": "v=0 replacement"}
    route = f"/v1/voice/calls/{root}/continue"

    def request(subject: str = USER) -> dict[str, Any]:
        return handler(http_api_event("POST", route, body, subject, 0, None), context)

    assert request(OTHER_USER)["statusCode"] == 409
    pending = request()
    assert pending["statusCode"] == 409
    assert json.loads(pending["body"])["error"]["code"] == "continuation_pending"
    call = voice.live_call(root)
    assert call is not None
    call.closed()
    voice.finished(root, call)
    ready = request()
    assert ready["statusCode"] == 200
    assert json.loads(ready["body"])["callId"] == root
    assert request()["statusCode"] == 200
    assert len(world.provider.created) == 2
    ended = handler(
        http_api_event("POST", f"/v1/voice/calls/{root}/end", None, USER, 0, None), context
    )
    assert ended["statusCode"] == 204


def test_invalid_continuation_attempt_key_is_rejected(services: Services) -> None:
    _, voice, root = setup()
    context = cast(LambdaContext, None)
    handler = Mangum(create_app(replace(services, voice=voice)), lifespan="off")
    for attempt in ["", "contains spaces", "x" * 81]:
        event = http_api_event(
            "POST",
            f"/v1/voice/calls/{root}/continue",
            {"attemptId": attempt, "sdpOffer": "offer"},
            USER,
            0,
            None,
        )
        assert handler(event, context)["statusCode"] == 422
