"""Push over HTTP (spec §6.18): a phone is registered, and removed."""

from urllib.parse import quote
from uuid import UUID

import pytest

from konvami_api.api.app import Services
from tests.api.conftest import USER, Call

PHONE = "ExponentPushToken[abc123]"
DEVICE = {
    "token": PHONE,
    "platform": "android",
    "timeZone": "Europe/Zurich",
    "language": "de",
    "time": "18:00",
}


def test_a_phone_is_registered_and_removed(call: Call, services: Services) -> None:
    registered = call("PUT", "/v1/push/device", DEVICE)
    kept = services.push._repository.of(UUID(USER))
    removed = call("DELETE", f"/v1/push/devices/{quote(PHONE)}")

    assert (registered.status, registered.body) == (200, {"registered": True})
    assert [(d.token, d.platform, d.language, d.time) for d in kept] == [
        (PHONE, "android", "de", "18:00")
    ]
    assert removed.body == {"registered": False}
    assert services.push._repository.of(UUID(USER)) == []


@pytest.mark.parametrize(
    "change",
    [
        {"token": "not-a-push-token"},
        {"platform": "web"},
        {"language": "es"},
        {"time": "25:00"},
        {"timeZone": ""},
    ],
)
def test_what_is_not_a_phone_is_refused(call: Call, change: dict[str, str]) -> None:
    assert call("PUT", "/v1/push/device", {**DEVICE, **change}).status == 422
