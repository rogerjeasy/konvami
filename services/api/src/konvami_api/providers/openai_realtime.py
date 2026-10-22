"""The voice provider: OpenAI's Realtime API (spec §9.1, §10.2).

Calls are created here with the server's API key; the app never sees it. The key is fetched
when first needed (from Secrets Manager, see `main.py`) and is kept out of every error.
"""

import json
from collections.abc import Callable
from typing import Any

import httpx

from konvami_api.domain.voice import CreatedCall, VoiceProviderError

BASE_URL = "https://api.openai.com/v1/realtime"
SIDEBAND_URL = "wss://api.openai.com/v1/realtime"
# Creating a call is one round trip; the app is waiting with a "connecting" state.
TIMEOUT_SECONDS = 15.0


class OpenAiRealtime:
    name = "openai"

    def __init__(self, api_key: Callable[[], str], http: httpx.Client | None = None) -> None:
        self._api_key = api_key
        self._http = http or httpx.Client(timeout=TIMEOUT_SECONDS)

    def _authorization(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key()}"}

    def create_call(
        self, sdp_offer: str, session: dict[str, Any], safety_identifier: str
    ) -> CreatedCall:
        try:
            response = self._http.post(
                f"{BASE_URL}/calls",
                headers={**self._authorization(), "OpenAI-Safety-Identifier": safety_identifier},
                # Multipart form fields (no file names), as the API expects.
                files={"sdp": (None, sdp_offer), "session": (None, json.dumps(session))},
            )
        except httpx.HTTPError as error:
            # Not chained: the request it carries holds the Authorization header.
            raise VoiceProviderError(type(error).__name__) from None
        # The call id comes in the Location header: /v1/realtime/calls/rtc_...
        call_id = response.headers.get("Location", "").rstrip("/").rsplit("/", 1)[-1]
        if not response.is_success or not call_id or not response.text:
            raise VoiceProviderError(f"create call answered {response.status_code}")
        return CreatedCall(call_id=call_id, sdp_answer=response.text)

    def hang_up(self, call_id: str) -> None:
        """Ends a call. A call that is already over is not an error."""
        try:
            self._http.post(f"{BASE_URL}/calls/{call_id}/hangup", headers=self._authorization())
        except httpx.HTTPError:
            return

    def sideband_url(self, call_id: str) -> str:
        """Where the server joins a running call to follow it and run its tools."""
        return f"{SIDEBAND_URL}?call_id={call_id}"

    def sideband_headers(self) -> dict[str, str]:
        return self._authorization()
