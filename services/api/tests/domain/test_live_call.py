"""The server's side of a live voice call, driven by the provider's events as they really look."""

import base64
import json
from typing import Any

import pytest

from konvami_api.domain.live_call import (
    AUDIO_DRAIN_SECONDS,
    HangUp,
    KeepAudio,
    LiveCall,
    Send,
    Turn,
    TurnAudio,
)
from konvami_api.domain.tools import ToolResult

MAX = 480
WRAP_UP = 45
GRACE = 8


class ScriptedTools:
    """Answers each tool call from a script and records what it was asked."""

    def __init__(self, results: dict[str, ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def definitions(self) -> list[dict[str, Any]]:
        return []

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        self.calls.append((name, arguments))
        return self.results.get(name, ToolResult({"saved": True, "still_open": []}))


def function_call(name: str, arguments: str, call_id: str = "call_1") -> dict[str, Any]:
    return {
        "id": f"item_{call_id}",
        "object": "realtime.item",
        "type": "function_call",
        "status": "completed",
        "name": name,
        "call_id": call_id,
        "arguments": arguments,
    }


def spoken(text: str) -> dict[str, Any]:
    return {
        "id": "item_msg",
        "object": "realtime.item",
        "type": "message",
        "status": "completed",
        "role": "assistant",
        "content": [{"type": "output_audio", "transcript": text}],
    }


def response_done(*output: dict[str, Any], status: str = "completed") -> dict[str, Any]:
    return {
        "type": "response.done",
        "event_id": "event_1",
        "response": {
            "object": "realtime.response",
            "id": "resp_1",
            "status": status,
            "status_details": None,
            "output": list(output),
            "usage": {
                "total_tokens": 253,
                "input_tokens": 132,
                "output_tokens": 121,
                "input_token_details": {
                    "text_tokens": 119,
                    "audio_tokens": 13,
                    "cached_tokens": 64,
                    "cached_tokens_details": {"text_tokens": 64, "audio_tokens": 0},
                },
                "output_token_details": {"text_tokens": 30, "audio_tokens": 91},
            },
        },
    }


LEARNER_SAID = {
    "type": "conversation.item.input_audio_transcription.completed",
    "event_id": "event_2",
    "item_id": "item_2",
    "content_index": 0,
    "transcript": "Ich möchte Deutsch lernen.",
}
PERSONA_SAID = {
    "type": "response.output_audio_transcript.done",
    "event_id": "event_3",
    "response_id": "resp_1",
    "item_id": "item_3",
    "output_index": 0,
    "content_index": 0,
    "transcript": "Hallo Amara! Schön, dass du da bist.",
}
AUDIO_STOPPED = {"type": "output_audio_buffer.stopped", "event_id": "event_4", "response_id": "r"}


@pytest.fixture
def tools() -> ScriptedTools:
    return ScriptedTools()


@pytest.fixture
def call(tools: ScriptedTools) -> LiveCall:
    return LiveCall(tools, max_seconds=MAX, wrap_up_seconds=WRAP_UP, goodbye_grace_seconds=GRACE)


def test_the_persona_speaks_first(call: LiveCall) -> None:
    assert call.start() == [Send({"type": "response.create"})]


def test_a_tool_call_is_run_and_answered_then_the_persona_continues(
    call: LiveCall, tools: ScriptedTools
) -> None:
    actions = call.handle(response_done(function_call("save_level", '{"level": "A2"}')), 30)

    assert tools.calls == [("save_level", {"level": "A2"})]
    assert actions == [
        Send(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": "call_1",
                    "output": json.dumps({"saved": True, "still_open": []}),
                },
            }
        ),
        Send({"type": "response.create"}),
    ]


def test_several_tool_calls_in_one_reply_get_one_continuation(
    call: LiveCall, tools: ScriptedTools
) -> None:
    actions = call.handle(
        response_done(
            function_call("save_goals", '{"reasons": ["work"], "note": null}', "call_1"),
            function_call("save_exam", '{"has_exam": false}', "call_2"),
        ),
        30,
    )

    assert [name for name, _ in tools.calls] == ["save_goals", "save_exam"]
    assert [a.event["type"] for a in actions if isinstance(a, Send)] == [
        "conversation.item.create",
        "conversation.item.create",
        "response.create",
    ]


def test_arguments_that_are_not_json_are_reported_back_without_running_the_tool(
    call: LiveCall, tools: ScriptedTools
) -> None:
    actions = call.handle(response_done(function_call("save_level", '{"level": ')), 30)

    assert tools.calls == []
    first = actions[0]
    assert isinstance(first, Send)
    assert json.loads(first.event["item"]["output"]) == {
        "saved": False,
        "reason": "invalid_arguments",
    }


def test_a_reply_without_tool_calls_needs_nothing(call: LiveCall) -> None:
    assert call.handle(response_done(spoken("Hallo!")), 5) == []


def test_a_tool_call_from_an_interrupted_reply_is_not_run(
    call: LiveCall, tools: ScriptedTools
) -> None:
    half = {**function_call("save_level", '{"level": "A2"}'), "status": "incomplete"}

    assert call.handle(response_done(half, status="cancelled"), 30) == []
    assert tools.calls == []


def test_what_was_said_is_kept_in_order(call: LiveCall) -> None:
    call.handle(PERSONA_SAID, 2)
    call.handle(LEARNER_SAID, 6)
    call.handle({**LEARNER_SAID, "transcript": "   "}, 7)

    assert call.turns == [
        Turn("persona", "Hallo Amara! Schön, dass du da bist."),
        Turn("learner", "Ich möchte Deutsch lernen."),
    ]


def typed(text: str, role: str = "user") -> dict[str, Any]:
    return {
        "type": "conversation.item.done",
        "event_id": "event_5",
        "previous_item_id": None,
        "item": {
            "id": "item_5",
            "type": "message",
            "status": "completed",
            "role": role,
            "content": [{"type": "input_text", "text": text}],
        },
    }


def test_what_the_learner_typed_counts_as_said(call: LiveCall) -> None:
    call.handle(typed("Das weiß ich nicht."), 12)

    assert call.turns == [Turn("learner", "Das weiß ich nicht.")]


def test_a_spoken_learner_item_is_not_recorded_twice(call: LiveCall) -> None:
    spoken_item = typed("")
    spoken_item["item"]["content"] = [{"type": "input_audio", "transcript": None}]

    call.handle(spoken_item, 5)
    call.handle(LEARNER_SAID, 6)
    call.handle(typed("System note", role="system"), 7)

    assert call.turns == [Turn("learner", "Ich möchte Deutsch lernen.")]


def test_usage_adds_up_over_the_call(call: LiveCall) -> None:
    call.handle(response_done(spoken("Hallo!")), 5)
    call.handle(response_done(spoken("Und weiter?")), 20)

    assert call.usage == {
        "input_text_tokens": 238,
        "input_audio_tokens": 26,
        "cached_input_tokens": 128,
        "cached_input_text_tokens": 128,
        "cached_input_audio_tokens": 0,
        "output_text_tokens": 60,
        "output_audio_tokens": 182,
    }


def test_the_call_ends_once_the_goodbye_has_been_heard(tools: ScriptedTools) -> None:
    tools.results["finish_setup"] = ToolResult({"done": True}, finished=True)
    call = LiveCall(tools, max_seconds=MAX, wrap_up_seconds=WRAP_UP, goodbye_grace_seconds=GRACE)

    call.handle(response_done(function_call("finish_setup", "{}")), 200)
    assert call.handle(AUDIO_STOPPED, 201) == [], "audio that ended before the goodbye"
    assert call.handle(response_done(spoken("Bis bald!")), 203) == []

    assert call.handle(AUDIO_STOPPED, 206) == [HangUp()]
    assert call.outcome == "finished"


def test_the_call_ends_after_a_pause_when_the_end_of_the_goodbye_is_never_reported(
    tools: ScriptedTools,
) -> None:
    tools.results["finish_setup"] = ToolResult({"done": True}, finished=True)
    call = LiveCall(tools, max_seconds=MAX, wrap_up_seconds=WRAP_UP, goodbye_grace_seconds=GRACE)
    call.handle(response_done(function_call("finish_setup", "{}")), 200)
    call.handle(response_done(spoken("Bis bald!")), 203)

    assert call.tick(203 + GRACE - 1) == []
    assert call.tick(203 + GRACE) == [HangUp()]
    assert call.outcome == "finished"


def test_shortly_before_the_time_limit_the_persona_is_told_to_wrap_up_once(
    call: LiveCall,
) -> None:
    assert call.tick(MAX - WRAP_UP - 1) == []

    actions = call.tick(MAX - WRAP_UP)

    assert len(actions) == 1
    wrap_up = actions[0]
    assert isinstance(wrap_up, Send)
    assert wrap_up.event["type"] == "response.create"
    assert "instructions" in wrap_up.event["response"]
    assert call.tick(MAX - WRAP_UP + 5) == []


def test_the_call_is_hung_up_at_the_time_limit(call: LiveCall) -> None:
    call.tick(MAX - WRAP_UP)

    assert call.tick(MAX) == [HangUp()]
    assert call.outcome == "timed_out"


def test_nothing_happens_after_the_call_has_ended(call: LiveCall, tools: ScriptedTools) -> None:
    call.tick(MAX)

    assert call.tick(MAX + 5) == []
    assert call.handle(response_done(function_call("save_level", '{"level": "A2"}')), MAX + 6) == []
    assert tools.calls == []


def test_a_call_closed_by_the_learner_is_recorded_as_closed(call: LiveCall) -> None:
    call.closed()

    assert call.outcome == "closed"
    assert call.tick(10) == []


def test_closing_does_not_overwrite_how_the_call_already_ended(call: LiveCall) -> None:
    call.tick(MAX)
    call.closed()

    assert call.outcome == "timed_out"


# --- Recording (spec §6.6): the server asks for each turn's audio and hands it on -------------


def retrieve(item_id: str) -> Send:
    return Send(
        {
            "type": "conversation.item.retrieve",
            "event_id": f"retrieve_{item_id}",
            "item_id": item_id,
        }
    )


def retrieved(item_id: str, role: str, pcm: bytes | None) -> dict[str, Any]:
    kind = "input_audio" if role == "user" else "output_audio"
    part: dict[str, Any] = {"type": kind, "transcript": "…"}
    if pcm is not None:
        part["audio"] = base64.b64encode(pcm).decode()
    return {
        "type": "conversation.item.retrieved",
        "event_id": "event_9",
        "item": {
            "id": item_id,
            "object": "realtime.item",
            "type": "message",
            "status": "completed",
            "role": role,
            "content": [part],
        },
    }


def retrieve_failed(item_id: str) -> dict[str, Any]:
    return {
        "type": "error",
        "event_id": "event_10",
        "error": {
            "type": "invalid_request_error",
            "code": "item_not_found",
            "message": "Item not found",
            "event_id": f"retrieve_{item_id}",
        },
    }


@pytest.fixture
def recorded(tools: ScriptedTools) -> LiveCall:
    return LiveCall(
        tools,
        max_seconds=MAX,
        wrap_up_seconds=WRAP_UP,
        goodbye_grace_seconds=GRACE,
        record=True,
    )


def persona_reply(item_id: str = "item_3") -> dict[str, Any]:
    return response_done({**spoken("Hallo Amara! Schön, dass du da bist."), "id": item_id})


def test_an_unrecorded_call_asks_for_no_audio(call: LiveCall) -> None:
    assert call.handle(LEARNER_SAID, 6) == []
    call.handle(PERSONA_SAID, 8)
    assert call.handle(persona_reply(), 9) == []


def test_the_learners_audio_is_asked_for_once_their_turn_is_written_down(
    recorded: LiveCall,
) -> None:
    assert recorded.handle(LEARNER_SAID, 6) == [retrieve("item_2")]


def test_the_partners_audio_is_asked_for_once_their_reply_is_done(recorded: LiveCall) -> None:
    assert recorded.handle(PERSONA_SAID, 8) == []

    assert recorded.handle(persona_reply(), 9) == [retrieve("item_3")]


def test_a_reply_that_was_not_spoken_is_not_asked_for(recorded: LiveCall) -> None:
    assert recorded.handle(response_done(spoken("Nur Text")), 9) == []


def test_the_audio_that_comes_back_is_handed_on_with_the_turn_it_belongs_to(
    recorded: LiveCall,
) -> None:
    recorded.handle(LEARNER_SAID, 6)

    actions = recorded.handle(retrieved("item_2", "user", b"\x01\x00\x02\x00"), 7)

    assert actions == [KeepAudio("item_2", "learner", b"\x01\x00\x02\x00")]


def test_audio_nobody_asked_for_is_ignored(recorded: LiveCall) -> None:
    assert recorded.handle(retrieved("item_7", "user", b"\x01\x00"), 7) == []


def test_an_item_without_audio_needs_nothing(recorded: LiveCall) -> None:
    recorded.handle(LEARNER_SAID, 6)

    assert recorded.handle(retrieved("item_2", "user", None), 7) == []


def test_kept_audio_is_part_of_the_turn(recorded: LiveCall) -> None:
    recorded.handle(PERSONA_SAID, 2)
    recorded.handle(LEARNER_SAID, 6)

    recorded.audio_kept("item_2", TurnAudio("users/u/recordings/c/item_2.wav", 1500))

    assert recorded.turns == [
        Turn("persona", "Hallo Amara! Schön, dass du da bist."),
        Turn(
            "learner",
            "Ich möchte Deutsch lernen.",
            audio=TurnAudio("users/u/recordings/c/item_2.wav", 1500),
        ),
    ]


def test_at_the_time_limit_the_call_waits_briefly_for_audio_still_on_its_way(
    recorded: LiveCall,
) -> None:
    recorded.handle(LEARNER_SAID, MAX - 2)

    assert recorded.tick(MAX) == []
    assert not recorded.ended

    actions = recorded.handle(retrieved("item_2", "user", b"\x01\x00"), MAX + 1)

    assert actions == [KeepAudio("item_2", "learner", b"\x01\x00"), HangUp()]
    assert recorded.outcome == "timed_out"


def test_the_wait_for_audio_has_a_limit(recorded: LiveCall) -> None:
    recorded.handle(LEARNER_SAID, MAX - 2)
    recorded.tick(MAX)

    assert recorded.tick(MAX + AUDIO_DRAIN_SECONDS - 1) == []
    assert recorded.tick(MAX + AUDIO_DRAIN_SECONDS) == [HangUp()]
    assert recorded.outcome == "timed_out"


def test_audio_that_cannot_be_retrieved_is_no_longer_waited_for(recorded: LiveCall) -> None:
    recorded.handle(LEARNER_SAID, MAX - 2)
    recorded.tick(MAX)

    assert recorded.handle(retrieve_failed("item_2"), MAX + 1) == [HangUp()]


def test_while_waiting_for_audio_nothing_else_is_done(
    recorded: LiveCall, tools: ScriptedTools
) -> None:
    recorded.handle(LEARNER_SAID, MAX - 2)
    recorded.tick(MAX)

    assert recorded.handle(response_done(function_call("save_level", "{}")), MAX + 1) == []
    assert tools.calls == []


def test_with_no_audio_on_its_way_the_call_ends_at_once(recorded: LiveCall) -> None:
    assert recorded.tick(MAX) == [HangUp()]
