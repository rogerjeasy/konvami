"""The worker that joins a live call: the loop around `LiveCall`, and its WebSocket connection."""

import asyncio
import base64
import json
import threading
import time
from typing import Any

import pytest
from websockets.asyncio.server import ServerConnection, serve

from konvami_api.domain.live_call import (
    LIVE_CORRECTION_NOTE,
    KeepAudio,
    LiveCall,
    LiveCorrection,
    Spot,
    Spotted,
    TurnAudio,
)
from konvami_api.domain.tools import ToolResult
from konvami_api.worker import CallClosed, WebSocketConnection, run_call

MAX = 20


class OneTool:
    def __init__(self, finished: bool = False) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.finished = finished

    def definitions(self) -> list[dict[str, Any]]:
        return []

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        self.calls.append((name, arguments))
        return ToolResult({"done": True}, finished=self.finished)


class ScriptedConnection:
    """Plays a list of incoming events; `None` is a second in which nothing arrives."""

    def __init__(self, script: list[dict[str, Any] | None], then_close: bool = False) -> None:
        self.script = list(script)
        self.then_close = then_close
        self.sent: list[dict[str, Any]] = []
        self.seconds = 0.0

    async def receive(self, timeout: float) -> dict[str, Any] | None:
        self.seconds += timeout
        if not self.script:
            if self.then_close:
                raise CallClosed
            return None
        return self.script.pop(0)

    async def send(self, event: dict[str, Any]) -> None:
        self.sent.append(event)


def tool_reply(name: str) -> dict[str, Any]:
    return {
        "type": "response.done",
        "response": {
            "status": "completed",
            "output": [
                {
                    "type": "function_call",
                    "status": "completed",
                    "name": name,
                    "call_id": "call_1",
                    "arguments": "{}",
                }
            ],
        },
    }


SPOKEN = {
    "type": "response.done",
    "response": {"status": "completed", "output": [{"type": "message", "status": "completed"}]},
}


def live(tools: OneTool) -> LiveCall:
    return LiveCall(tools, max_seconds=MAX, wrap_up_seconds=5, goodbye_grace_seconds=3)


def run(call: LiveCall, connection: ScriptedConnection) -> list[str]:
    hung_up: list[str] = []
    asyncio.run(
        run_call(call, connection, lambda: hung_up.append("hung up"), lambda: connection.seconds)
    )
    return hung_up


def test_the_persona_is_started_and_its_tool_calls_are_answered() -> None:
    tools = OneTool()
    connection = ScriptedConnection([tool_reply("save_level")], then_close=True)

    run(live(tools), connection)

    assert tools.calls == [("save_level", {})]
    assert [event["type"] for event in connection.sent] == [
        "response.create",
        "conversation.item.create",
        "response.create",
    ]


def test_the_call_is_hung_up_at_its_time_limit_even_if_nothing_arrives() -> None:
    call = live(OneTool())
    connection = ScriptedConnection([])

    hung_up = run(call, connection)

    assert hung_up == ["hung up"]
    assert call.outcome == "timed_out"
    assert connection.seconds == MAX
    assert "instructions" in connection.sent[-1]["response"], "the wrap-up request came first"


def test_a_call_the_learner_leaves_ends_without_hanging_up() -> None:
    call = live(OneTool())

    hung_up = run(call, ScriptedConnection([None, None], then_close=True))

    assert hung_up == []
    assert call.outcome == "closed"


def test_the_call_is_hung_up_after_the_goodbye() -> None:
    call = live(OneTool(finished=True))
    connection = ScriptedConnection(
        [tool_reply("finish_setup"), SPOKEN, {"type": "output_audio_buffer.stopped"}]
    )

    hung_up = run(call, connection)

    assert hung_up == ["hung up"]
    assert call.outcome == "finished"


def test_a_call_that_closes_while_the_server_is_answering_ends_quietly() -> None:
    class ClosesOnSecondSend(ScriptedConnection):
        async def send(self, event: dict[str, Any]) -> None:
            if self.sent:
                raise CallClosed
            await super().send(event)

    call = live(OneTool())

    hung_up = run(call, ClosesOnSecondSend([tool_reply("save_level")]))

    assert hung_up == []
    assert call.outcome == "closed"


LEARNER_SAID = {
    "type": "conversation.item.input_audio_transcription.completed",
    "item_id": "item_2",
    "transcript": "Ich habe nach Berlin gefahren.",
}


def learner_audio(pcm: bytes) -> dict[str, Any]:
    return {
        "type": "conversation.item.retrieved",
        "item": {
            "id": "item_2",
            "type": "message",
            "role": "user",
            "content": [{"type": "input_audio", "audio": base64.b64encode(pcm).decode()}],
        },
    }


def recorded(tools: OneTool) -> LiveCall:
    return LiveCall(tools, max_seconds=MAX, wrap_up_seconds=5, goodbye_grace_seconds=3, record=True)


def test_a_turns_audio_is_stored_and_becomes_part_of_the_turn() -> None:
    kept: list[KeepAudio] = []

    def keep(audio: KeepAudio) -> TurnAudio:
        kept.append(audio)
        return TurnAudio(f"recordings/{audio.item_id}.wav", 1000)

    call = recorded(OneTool())
    connection = ScriptedConnection([LEARNER_SAID, learner_audio(b"\x01\x00")], then_close=True)

    asyncio.run(run_call(call, connection, lambda: None, lambda: connection.seconds, keep))

    assert kept == [KeepAudio("item_2", "learner", b"\x01\x00")]
    assert call.turns[0].audio == TurnAudio("recordings/item_2.wav", 1000)


def test_audio_that_cannot_be_stored_leaves_the_turn_without_it_and_the_call_goes_on() -> None:
    def keep(audio: KeepAudio) -> TurnAudio:
        raise RuntimeError("bucket unreachable")

    tools = OneTool()
    call = recorded(tools)
    connection = ScriptedConnection(
        [LEARNER_SAID, learner_audio(b"\x01\x00"), tool_reply("save_level")], then_close=True
    )

    asyncio.run(run_call(call, connection, lambda: None, lambda: connection.seconds, keep))

    assert call.turns[0].audio is None
    assert tools.calls == [("save_level", {})]


# --- Checking the learner's turns while the call goes on (the Live Error Spotter) --------------


def spotting(tools: OneTool) -> LiveCall:
    return LiveCall(
        tools,
        max_seconds=MAX,
        wrap_up_seconds=5,
        goodbye_grace_seconds=3,
        record=True,
        spot=True,
    )


PERFEKT = LiveCorrection(
    "Ich habe nach Berlin gefahren",
    "Ich bin nach Berlin gefahren",
    "Avec « fahren » : « sein ».",
    "perfekt_auxiliary",
    False,
)


class Pauses(ScriptedConnection):
    """A quiet second takes a moment of real time, as a check running beside the call does."""

    async def receive(self, timeout: float) -> dict[str, Any] | None:
        if self.script and self.script[0] is None:
            await asyncio.sleep(0.05)
        return await super().receive(timeout)


def test_a_turn_is_checked_and_what_was_found_is_told() -> None:
    checked: list[Spot] = []

    def check(spot: Spot) -> Spotted:
        checked.append(spot)
        return Spotted(spot.item_id, "Ich habe nach Berlin gefahren.", (PERFEKT,))

    call = spotting(OneTool())
    connection = Pauses([LEARNER_SAID, learner_audio(b"\x01\x00"), None, None], then_close=True)

    asyncio.run(run_call(call, connection, lambda: None, lambda: connection.seconds, spot=check))

    assert [spot.item_id for spot in checked] == ["item_2"]
    [note] = [event for event in connection.sent if event["type"] == "conversation.item.create"]
    assert note["item"]["role"] == "system"
    assert note["item"]["content"][0]["text"].startswith(LIVE_CORRECTION_NOTE)
    assert call.turns[0].verbatim == "Ich habe nach Berlin gefahren."


def test_a_slow_check_does_not_hold_up_the_call() -> None:
    answered = threading.Event()
    order: list[str] = []

    class Answers(ScriptedConnection):
        async def send(self, event: dict[str, Any]) -> None:
            await super().send(event)
            if event.get("item", {}).get("type") == "function_call_output":
                order.append("tool answered")
                answered.set()

    def check(spot: Spot) -> Spotted:
        answered.wait(timeout=2)
        order.append("checked")
        return Spotted(spot.item_id, None, ())

    tools = OneTool()
    connection = Answers(
        [LEARNER_SAID, learner_audio(b"\x01\x00"), tool_reply("save_level")], then_close=True
    )

    asyncio.run(run_call(spotting(tools), connection, lambda: None, lambda: 0.0, spot=check))

    assert order == ["tool answered", "checked"]


def test_a_check_that_fails_changes_nothing_and_the_call_goes_on() -> None:
    def check(spot: Spot) -> Spotted:
        raise RuntimeError("model unreachable")

    tools = OneTool()
    call = spotting(tools)
    connection = ScriptedConnection(
        [LEARNER_SAID, learner_audio(b"\x01\x00"), None, tool_reply("save_level")],
        then_close=True,
    )

    asyncio.run(run_call(call, connection, lambda: None, lambda: connection.seconds, spot=check))

    assert tools.calls == [("save_level", {})]
    assert call.turns[0].verbatim is None


def test_a_check_still_running_when_the_call_ends_keeps_its_verbatim_text() -> None:
    def check(spot: Spot) -> Spotted:
        time.sleep(0.1)
        return Spotted(spot.item_id, "Ich habe nach Berlin gefahren.", (PERFEKT,))

    call = spotting(OneTool())
    connection = ScriptedConnection([LEARNER_SAID, learner_audio(b"\x01\x00")], then_close=True)

    asyncio.run(run_call(call, connection, lambda: None, lambda: connection.seconds, spot=check))

    assert call.outcome == "closed"
    assert call.turns[0].verbatim == "Ich habe nach Berlin gefahren."


# --- The real WebSocket connection, against a local server ------------------------------------


async def _with_server(handler: Any, use: Any) -> Any:
    async with serve(handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        connection = await WebSocketConnection.open(
            f"ws://127.0.0.1:{port}/v1/realtime?call_id=rtc_1", {"Authorization": "Bearer k"}
        )
        try:
            return await use(connection)
        finally:
            await connection.close()


def test_events_travel_both_ways_as_json() -> None:
    seen: dict[str, Any] = {}

    async def handler(websocket: ServerConnection) -> None:
        assert websocket.request is not None
        seen["path"] = websocket.request.path
        seen["authorization"] = websocket.request.headers["Authorization"]
        await websocket.send(json.dumps({"type": "session.created"}))
        seen["received"] = json.loads(await websocket.recv())

    async def use(connection: WebSocketConnection) -> dict[str, Any] | None:
        first = await connection.receive(timeout=2)
        await connection.send({"type": "response.create"})
        await asyncio.sleep(0.1)
        return first

    assert asyncio.run(_with_server(handler, use)) == {"type": "session.created"}
    assert seen == {
        "path": "/v1/realtime?call_id=rtc_1",
        "authorization": "Bearer k",
        "received": {"type": "response.create"},
    }


def test_a_long_turns_audio_fits_in_one_message() -> None:
    # A minute of speech: 24 kHz, 16-bit, in base64 (about 3.8 MB).
    audio = "A" * (24_000 * 2 * 60 * 4 // 3)

    async def handler(websocket: ServerConnection) -> None:
        await websocket.send(json.dumps({"type": "conversation.item.retrieved", "audio": audio}))
        await asyncio.sleep(0.5)

    async def use(connection: WebSocketConnection) -> dict[str, Any] | None:
        return await connection.receive(timeout=5)

    event = asyncio.run(_with_server(handler, use))
    assert event is not None
    assert event["audio"] == audio


def test_a_quiet_second_is_reported_as_nothing_not_as_an_error() -> None:
    async def handler(websocket: ServerConnection) -> None:
        await asyncio.sleep(1)

    async def use(connection: WebSocketConnection) -> dict[str, Any] | None:
        return await connection.receive(timeout=0.05)

    assert asyncio.run(_with_server(handler, use)) is None


def test_a_closed_connection_is_reported_as_the_call_having_closed() -> None:
    async def handler(websocket: ServerConnection) -> None:
        await websocket.close()

    async def use(connection: WebSocketConnection) -> None:
        with pytest.raises(CallClosed):
            await connection.receive(timeout=2)

    asyncio.run(_with_server(handler, use))


# --- Following a recorded call end to end -----------------------------------------------------


def test_a_recorded_call_is_followed_and_its_end_is_stored() -> None:
    from datetime import UTC, datetime
    from uuid import UUID

    from konvami_api.domain.accounts import Account
    from konvami_api.domain.catalog import CATALOG
    from konvami_api.domain.host import HostScript
    from konvami_api.domain.profile import ProfileService
    from konvami_api.domain.voice import CallPurpose, VoiceCallService, VoiceSettings
    from konvami_api.worker import follow_call
    from tests.fakes import (
        FakeAccountDirectory,
        FakeVoiceProvider,
        FixedClock,
        InMemoryProfileRepository,
        InMemoryVoiceSessionRepository,
        RecordingCallStarter,
    )

    user = UUID("11111111-1111-4111-8111-111111111111")
    clock = FixedClock(datetime(2026, 10, 9, 12, 0, tzinfo=UTC))
    profiles = ProfileService(InMemoryProfileRepository(), CATALOG, clock)
    sessions = InMemoryVoiceSessionRepository()
    provider = FakeVoiceProvider()
    voice = VoiceCallService(
        settings=VoiceSettings(
            models={CallPurpose.ONBOARDING: "gpt-realtime-2.1-mini"},
            max_seconds={CallPurpose.ONBOARDING: 480},
            voice="marin",
            transcription_model="gpt-transcribe",
            weekly_seconds=3600,
        ),
        scripts={CallPurpose.ONBOARDING: HostScript(CATALOG, profiles)},
        accounts=FakeAccountDirectory({user: Account("Amara", "fr", voice_consent=True)}),
        provider=provider,
        sessions=sessions,
        starter=RecordingCallStarter(),
        clock=clock,
    )
    call_id = voice.start(user, CallPurpose.ONBOARDING, "v=0 offer").call_id
    received: list[dict[str, Any]] = []

    async def provider_side(websocket: ServerConnection) -> None:
        received.append(json.loads(await websocket.recv()))
        reply = tool_reply("save_target_language")
        reply["response"]["output"][0]["arguments"] = '{"language": "de"}'
        await websocket.send(json.dumps(reply))
        received.append(json.loads(await websocket.recv()))
        await websocket.send(
            json.dumps(
                {"type": "response.output_audio_transcript.done", "transcript": "Très bien !"}
            )
        )
        await asyncio.sleep(0.05)

    class LocalRealtime:
        def __init__(self, port: int) -> None:
            self.port = port

        def sideband_url(self, call: str) -> str:
            return f"ws://127.0.0.1:{self.port}/v1/realtime?call_id={call}"

        def sideband_headers(self) -> dict[str, str]:
            return {"Authorization": "Bearer k"}

        def hang_up(self, call: str) -> None:
            provider.hang_up(call)

    async def scenario() -> None:
        async with serve(provider_side, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            await follow_call(voice, LocalRealtime(port), call_id)

    asyncio.run(scenario())

    assert received[0] == {"type": "response.create"}
    assert received[1]["item"]["type"] == "function_call_output"
    assert profiles.get(user).target_language == "de"
    finished = sessions.finished[call_id]
    assert finished.outcome == "closed"
    assert [(turn.speaker, turn.text) for turn in finished.turns] == [("persona", "Très bien !")]


def test_an_unknown_call_is_not_followed() -> None:
    from konvami_api.worker import follow_call

    class NoCalls:
        def live_call(self, call_id: str) -> None:
            return None

    class NeverUsed:
        def sideband_url(self, call: str) -> str:
            raise AssertionError("must not connect")

        def sideband_headers(self) -> dict[str, str]:
            raise AssertionError("must not connect")

        def hang_up(self, call: str) -> None:
            raise AssertionError("must not hang up")

    asyncio.run(follow_call(NoCalls(), NeverUsed(), "rtc_ghost"))  # type: ignore[arg-type]


def test_a_practice_calls_audio_is_stored_as_the_call_goes() -> None:
    from konvami_api.domain.voice import CallPurpose
    from konvami_api.worker import follow_call
    from tests.world import USER, World

    world = World()
    lena, _ = world.onboard()
    call_id = world.voice.start(USER, CallPurpose.PRACTICE, "v=0 offer", lena.id).call_id
    asked: list[dict[str, Any]] = []
    # The turn is checked as well, from its audio.
    world.live_transcriber.answers.append("Ich habe nach Berlin gefahren.")
    world.text.answers.append({"mistakes": []})

    async def provider_side(websocket: ServerConnection) -> None:
        await websocket.recv()  # the persona is started
        await websocket.send(json.dumps(LEARNER_SAID))
        asked.append(json.loads(await websocket.recv()))
        await websocket.send(json.dumps(learner_audio(b"\x01\x00" * 2_400)))
        await asyncio.sleep(0.2)

    class LocalRealtime:
        def __init__(self, port: int) -> None:
            self.port = port

        def sideband_url(self, call: str) -> str:
            return f"ws://127.0.0.1:{self.port}/v1/realtime?call_id={call}"

        def sideband_headers(self) -> dict[str, str]:
            return {}

        def hang_up(self, call: str) -> None:
            world.provider.hang_up(call)

    async def scenario() -> None:
        async with serve(provider_side, "127.0.0.1", 0) as server:
            await follow_call(
                world.voice, LocalRealtime(server.sockets[0].getsockname()[1]), call_id
            )

    asyncio.run(scenario())

    assert asked[0]["type"] == "conversation.item.retrieve"
    [turn] = world.sessions.finished[call_id].turns
    assert turn.audio is not None
    assert turn.audio.milliseconds == 100
    assert world.files.keys() == [turn.audio.key]
    assert turn.verbatim == "Ich habe nach Berlin gefahren."
