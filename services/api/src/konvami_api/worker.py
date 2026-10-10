"""The worker that joins a live call from the server (spec §10.2, "sideband").

`run_call` is the loop: it feeds the provider's events and the passing seconds to a `LiveCall`
and carries out what it decides. `WebSocketConnection` is the connection it runs on. A call of
this kind lasts minutes, so the worker runs in its own Lambda invocation (onboarding design O2).
"""

import asyncio
import json
import time
from collections.abc import Callable, Mapping
from typing import Any, Protocol

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed

from konvami_api.domain.live_call import HangUp, LiveCall
from konvami_api.domain.voice import VoiceCallService

# How often the call's clock is checked when no event arrives.
TICK_SECONDS = 1.0
OPEN_TIMEOUT_SECONDS = 10.0


class CallClosed(Exception):  # noqa: N818 - an expected end, not a fault
    """The connection ended: the learner left, or the provider closed the call."""


class Connection(Protocol):
    async def receive(self, timeout: float) -> dict[str, Any] | None:
        """The next event, or None when none arrived in time. Raises `CallClosed`."""

    async def send(self, event: dict[str, Any]) -> None: ...


async def run_call(
    call: LiveCall,
    connection: Connection,
    hang_up: Callable[[], object],
    monotonic: Callable[[], float],
) -> None:
    """Follows one call until it ends. `call.outcome` says how it ended."""
    started = monotonic()
    actions = call.start()
    while True:
        try:
            for action in actions:
                if isinstance(action, HangUp):
                    hang_up()
                else:
                    await connection.send(action.event)
            if call.ended:
                return
            event = await connection.receive(TICK_SECONDS)
        except CallClosed:
            call.closed()
            return
        elapsed = monotonic() - started
        actions = call.handle(event, elapsed) if event is not None else []
        actions += call.tick(elapsed)


class WebSocketConnection:
    def __init__(self, websocket: ClientConnection) -> None:
        self._websocket = websocket

    @classmethod
    async def open(cls, url: str, headers: Mapping[str, str]) -> "WebSocketConnection":
        websocket = await connect(
            url, additional_headers=dict(headers), open_timeout=OPEN_TIMEOUT_SECONDS
        )
        return cls(websocket)

    async def receive(self, timeout: float) -> dict[str, Any] | None:
        try:
            message = await asyncio.wait_for(self._websocket.recv(), timeout)
        except TimeoutError:
            return None
        except ConnectionClosed as error:
            raise CallClosed from error
        event = json.loads(message)
        return event if isinstance(event, dict) else None

    async def send(self, event: dict[str, Any]) -> None:
        try:
            await self._websocket.send(json.dumps(event))
        except ConnectionClosed as error:
            raise CallClosed from error

    async def close(self) -> None:
        await self._websocket.close()


class Sideband(Protocol):
    """Where and how to join a call from the server, and how to end it."""

    def sideband_url(self, call_id: str) -> str: ...

    def sideband_headers(self) -> dict[str, str]: ...

    def hang_up(self, call_id: str) -> None: ...


async def follow_call(voice: VoiceCallService, provider: Sideband, call_id: str) -> None:
    """Joins a recorded call, follows it to its end, and stores how it went."""
    call = voice.live_call(call_id)
    if call is None:
        return
    try:
        connection = await WebSocketConnection.open(
            provider.sideband_url(call_id), provider.sideband_headers()
        )
    except Exception:
        # Without its server side the call cannot do its job: end it rather than leave it open.
        provider.hang_up(call_id)
        call.closed()
        voice.finished(call_id, call)
        raise
    try:
        await run_call(call, connection, lambda: provider.hang_up(call_id), time.monotonic)
    finally:
        await connection.close()
        voice.finished(call_id, call)
