"""The server's side of one live voice call (spec §10.2, "sideband").

The learner's audio flows directly between their device and the voice provider. The server
joins the same call over a second connection and, through this class, runs the persona's tools,
keeps what was said and what it cost, and ends the call at its time limit.

This is pure logic: provider events in, actions out. The worker around it owns the connection
and the clock (`konvami_api.worker`), so every rule here is tested without a network.
"""

import json
from dataclasses import dataclass
from typing import Any, Literal

from konvami_api.domain.tools import ToolSet

Speaker = Literal["learner", "persona"]
Outcome = Literal["finished", "timed_out", "closed"]


@dataclass(frozen=True)
class Send:
    """Send this event to the voice provider."""

    event: dict[str, Any]


@dataclass(frozen=True)
class HangUp:
    """End the call."""


Action = Send | HangUp


@dataclass(frozen=True)
class Turn:
    speaker: Speaker
    text: str


_CONTINUE: dict[str, Any] = {"type": "response.create"}
_WRAP_UP = (
    "Time is almost up. In one or two short sentences, tell the learner kindly that you have to "
    "stop here, that everything said so far is saved, and that they can continue any time."
)


class LiveCall:
    def __init__(
        self,
        tools: ToolSet,
        *,
        max_seconds: int,
        wrap_up_seconds: int,
        goodbye_grace_seconds: int,
    ) -> None:
        self._tools = tools
        self._max = max_seconds
        self._wrap_up_at = max_seconds - wrap_up_seconds
        self._grace = goodbye_grace_seconds
        self._warned = False
        # Set when a tool says the purpose is done; the next reply is the goodbye.
        self._finishing = False
        # When the goodbye reply was complete (seconds into the call); its audio may still play.
        self._goodbye_at: float | None = None
        self.turns: list[Turn] = []
        self.usage = {
            "input_text_tokens": 0,
            "input_audio_tokens": 0,
            "cached_input_tokens": 0,
            "output_text_tokens": 0,
            "output_audio_tokens": 0,
        }
        self.outcome: Outcome | None = None

    @property
    def tools(self) -> ToolSet:
        """The tools this call used, with whatever they collected."""
        return self._tools

    @property
    def ended(self) -> bool:
        return self.outcome is not None

    def start(self) -> list[Action]:
        """The persona opens the conversation; the learner does not have to speak first."""
        return [Send(_CONTINUE)]

    def handle(self, event: dict[str, Any], elapsed: float) -> list[Action]:
        if self.ended:
            return []
        kind = event.get("type")
        if kind == "response.done":
            return self._response_done(event.get("response") or {}, elapsed)
        if kind == "conversation.item.input_audio_transcription.completed":
            self._say("learner", event.get("transcript"))
        elif kind == "response.output_audio_transcript.done":
            self._say("persona", event.get("transcript"))
        elif kind == "conversation.item.done":
            self._typed(event.get("item") or {})
        elif kind == "output_audio_buffer.stopped" and self._goodbye_at is not None:
            return self._end("finished")
        return []

    def tick(self, elapsed: float) -> list[Action]:
        """Called about once a second with the time since the call began."""
        if self.ended:
            return []
        if self._goodbye_at is not None and elapsed >= self._goodbye_at + self._grace:
            return self._end("finished")
        if elapsed >= self._max:
            return self._end("timed_out")
        if elapsed >= self._wrap_up_at and not self._warned and not self._finishing:
            self._warned = True
            return [Send({"type": "response.create", "response": {"instructions": _WRAP_UP}})]
        return []

    def closed(self) -> None:
        """The connection ended from the other side (the learner left, or the provider closed)."""
        if not self.ended:
            self.outcome = "closed"

    def _end(self, outcome: Outcome) -> list[Action]:
        self.outcome = outcome
        return [HangUp()]

    def _say(self, speaker: Speaker, text: object) -> None:
        if isinstance(text, str) and text.strip():
            self.turns.append(Turn(speaker, text.strip()))

    def _typed(self, item: dict[str, Any]) -> None:
        """A message the learner typed instead of saying it (speech arrives as a transcript)."""
        if item.get("type") != "message" or item.get("role") != "user":
            return
        for part in item.get("content") or []:
            if part.get("type") == "input_text":
                self._say("learner", part.get("text"))

    def _response_done(self, response: dict[str, Any], elapsed: float) -> list[Action]:
        self._count(response.get("usage") or {})
        calls = [
            item
            for item in response.get("output") or []
            # An interrupted reply can carry half a tool call; only complete ones are run.
            if item.get("type") == "function_call" and item.get("status") == "completed"
        ]
        if not calls:
            if self._finishing and response.get("status") == "completed":
                self._goodbye_at = elapsed
            return []
        actions: list[Action] = []
        for call in calls:
            output = self._run(call.get("name", ""), call.get("arguments", ""))
            item = {
                "type": "function_call_output",
                "call_id": call.get("call_id"),
                "output": json.dumps(output),
            }
            actions.append(Send({"type": "conversation.item.create", "item": item}))
        actions.append(Send(_CONTINUE))
        return actions

    def _run(self, name: str, raw_arguments: str) -> dict[str, Any]:
        try:
            arguments = json.loads(raw_arguments or "{}")
        except json.JSONDecodeError:
            arguments = None
        if not isinstance(arguments, dict):
            return {"saved": False, "reason": "invalid_arguments"}
        result = self._tools.run(name, arguments)
        if result.finished:
            self._finishing = True
        return result.output

    def _count(self, usage: dict[str, Any]) -> None:
        taken = usage.get("input_token_details") or {}
        given = usage.get("output_token_details") or {}
        self.usage["input_text_tokens"] += int(taken.get("text_tokens") or 0)
        self.usage["input_audio_tokens"] += int(taken.get("audio_tokens") or 0)
        self.usage["cached_input_tokens"] += int(taken.get("cached_tokens") or 0)
        self.usage["output_text_tokens"] += int(given.get("text_tokens") or 0)
        self.usage["output_audio_tokens"] += int(given.get("audio_tokens") or 0)
