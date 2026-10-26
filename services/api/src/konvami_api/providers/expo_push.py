"""Push through Expo's push service, which hands each message on to Apple or Google with the
app's credentials kept by EAS. No key is needed here: a token only reaches the app it was made
for."""

from collections.abc import Sequence
from typing import Any

import httpx

from konvami_api.domain.push import PushError, PushMessage

PUSH_URL = "https://exp.host/--/api/v2/push/send"
# The most messages Expo takes in one request.
BATCH = 100
# How long one request may take before the push is given up.
TIMEOUT_SECONDS = 10
# What Expo answers for a token that no longer reaches a phone (the app was removed).
GONE = "DeviceNotRegistered"


class ExpoPush:
    def __init__(self, http: httpx.Client | None = None) -> None:
        self._http = http or httpx.Client(timeout=TIMEOUT_SECONDS)

    def send(self, messages: Sequence[PushMessage]) -> list[str]:
        gone: list[str] = []
        for start in range(0, len(messages), BATCH):
            batch = messages[start : start + BATCH]
            body = [
                {
                    "to": message.token,
                    "title": message.title,
                    "body": message.body,
                    "data": dict(message.data),
                    "sound": "default",
                    # Android: the channel the app made for reminders.
                    "channelId": "reminders",
                }
                for message in batch
            ]
            try:
                response = self._http.post(PUSH_URL, json=body)
            except httpx.HTTPError as error:
                raise PushError("unreachable") from error
            if response.status_code != httpx.codes.OK:
                raise PushError(f"refused: {response.status_code}")
            tickets: list[dict[str, Any]] = response.json().get("data", [])
            gone += [
                message.token
                for message, ticket in zip(batch, tickets, strict=False)
                if ticket.get("status") == "error"
                and (ticket.get("details") or {}).get("error") == GONE
            ]
        return gone
