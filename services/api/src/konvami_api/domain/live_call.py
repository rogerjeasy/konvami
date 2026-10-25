"""The server's side of one live voice call (spec §10.2, "sideband").

The learner's audio flows directly between their device and the voice provider. The server
joins the same call over a second connection and, through this class, runs the persona's tools,
keeps what was said and what it cost, and ends the call at its time limit. A recorded call
(spec §6.6) also asks the provider for the audio of each turn once it is complete, and hands it
on to be stored: the audio itself never passes through the server otherwise.

With the Live Error Spotter (spec §8.2), each of the learner's turns is also handed on to be
checked (`Spot`) once its audio is back; what the check finds comes back (`spotted`) and goes
into the conversation as a system note. The partner reads it and corrects as they were told to;
the app, which sees every item of the conversation, shows it as correction chips (spec §6.4).

This is pure logic: provider events in, actions out. The worker around it owns the connection
and the clock (`konvami_api.worker`), so every rule here is tested without a network.
"""

import base64
import binascii
import json
from dataclasses import dataclass, replace
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


@dataclass(frozen=True)
class KeepAudio:
    """Store the audio of one turn: 16-bit PCM, mono, at `AUDIO_RATE`."""

    item_id: str
    speaker: Speaker
    pcm: bytes


@dataclass(frozen=True)
class Spot:
    """Check one of the learner's turns for mistakes, while the call goes on."""

    item_id: str
    # What the live transcription wrote down.
    text: str
    # The turn's audio (16-bit PCM, mono, at `AUDIO_RATE`); empty when it did not come back.
    pcm: bytes
    # The partner's line before it, which the turn may answer; None when there is none.
    partner: str | None


Action = Send | HangUp | KeepAudio | Spot


@dataclass(frozen=True)
class LiveCorrection:
    """A mistake found in a turn while the call goes on, as the learner sees it."""

    # The learner's words, and the same words put right.
    said: str
    better: str
    # Why, in one short sentence in the learner's explanation language.
    why: str
    # A language pack's kind of mistake.
    topic: str
    # True when it is one of the kinds the conversation's plan practises.
    focus: bool


@dataclass(frozen=True)
class Spotted:
    """What the check of a turn found."""

    item_id: str
    # The turn written down again from its audio, keeping mistakes (spec §9.4); None without.
    verbatim: str | None
    corrections: tuple[LiveCorrection, ...]


@dataclass(frozen=True)
class TurnAudio:
    """Where a turn's recording is stored, and how long it lasts."""

    key: str
    milliseconds: int


@dataclass(frozen=True)
class Turn:
    speaker: Speaker
    text: str
    audio: TurnAudio | None = None
    # The second transcription, made from the audio after the call (spec §9.4); None without it.
    verbatim: str | None = None

    @property
    def said(self) -> str:
        """What was said, as faithfully as it was written down: the verbatim text if there is
        one, the live one otherwise."""
        return self.verbatim or self.text


# The audio the provider hands back: what it heard and what it said, as it has it.
AUDIO_RATE = 24_000
# How long a call that is to end waits for audio it asked for and has not received yet. A turn's
# audio comes back within a second or so; the wait must not keep a learner on much longer.
AUDIO_DRAIN_SECONDS = 3
_RETRIEVE_PREFIX = "retrieve_"
# How the spotter's findings are told: a system note `live_correction: <JSON>`. The partner's
# instructions say what it means (`domain/practice.py`); the app reads the same JSON.
LIVE_CORRECTION_NOTE = "live_correction: "
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
        record: bool = False,
        spot: bool = False,
    ) -> None:
        self._tools = tools
        self._record = record
        self._spot = spot
        self._max = max_seconds
        self._wrap_up_at = max_seconds - wrap_up_seconds
        self._grace = goodbye_grace_seconds
        self._warned = False
        # Set when a tool says the purpose is done; the next reply is the goodbye.
        self._finishing = False
        # When the goodbye reply was complete (seconds into the call); its audio may still play.
        self._goodbye_at: float | None = None
        self.turns: list[Turn] = []
        # Which turn each of the provider's items is (by its id), and the audio still awaited.
        self._items: dict[str, int] = {}
        self._awaited: set[str] = set()
        # Set when the call is to end but audio is still on its way: how, and the last moment.
        self._ending: tuple[Outcome, float] | None = None
        self.usage = {
            "input_text_tokens": 0,
            "input_audio_tokens": 0,
            "cached_input_tokens": 0,
            # The cached tokens split by kind: cached audio and text cost differently.
            "cached_input_text_tokens": 0,
            "cached_input_audio_tokens": 0,
            "output_text_tokens": 0,
            "output_audio_tokens": 0,
        }
        self.outcome: Outcome | None = None

    @property
    def max_seconds(self) -> int:
        """The longest the call may last."""
        return self._max

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
        if kind == "conversation.item.retrieved":
            return self._retrieved(event.get("item") or {})
        if kind == "error":
            return self._not_retrieved(event.get("error") or {})
        if self._ending is not None:
            # Only the audio still on its way matters now.
            return []
        if kind == "response.done":
            return self._response_done(event.get("response") or {}, elapsed)
        if kind == "conversation.item.input_audio_transcription.completed":
            item_id = event.get("item_id")
            if self._say("learner", event.get("transcript"), item_id):
                if not self._record and isinstance(item_id, str):
                    # No audio is asked for, so the turn is checked from its text alone.
                    return self._check(item_id, b"")
                return self._retrieve(item_id)
        elif kind == "response.output_audio_transcript.done":
            self._say("persona", event.get("transcript"), event.get("item_id"))
        elif kind == "conversation.item.done":
            self._typed(event.get("item") or {})
        elif kind == "output_audio_buffer.stopped" and self._goodbye_at is not None:
            return self._end("finished", elapsed)
        return []

    def spotted(self, found: Spotted) -> list[Action]:
        """What the check of a turn found. Its verbatim text is kept even after the call; a
        correction is only told while the conversation is still going."""
        position = self._items.get(found.item_id)
        if position is None:
            return []
        if found.verbatim:
            self.turns[position] = replace(self.turns[position], verbatim=found.verbatim)
        if not found.corrections or self.ended or self._ending is not None:
            return []
        note = {
            "turn": found.item_id,
            "corrections": [
                {
                    "said": correction.said,
                    "better": correction.better,
                    "why": correction.why,
                    "topic": correction.topic,
                    "focus": correction.focus,
                }
                for correction in found.corrections
            ],
        }
        text = LIVE_CORRECTION_NOTE + json.dumps(note, ensure_ascii=False)
        item = {
            "type": "message",
            "role": "system",
            "content": [{"type": "input_text", "text": text}],
        }
        return [Send({"type": "conversation.item.create", "item": item})]

    def audio_kept(self, item_id: str, audio: TurnAudio) -> None:
        """The audio of an item was stored (see `KeepAudio`)."""
        position = self._items.get(item_id)
        if position is not None:
            self.turns[position] = replace(self.turns[position], audio=audio)

    def tick(self, elapsed: float) -> list[Action]:
        """Called about once a second with the time since the call began."""
        if self.ended:
            return []
        if self._ending is not None:
            outcome, last = self._ending
            return self._finish(outcome) if elapsed >= last else []
        if self._goodbye_at is not None and elapsed >= self._goodbye_at + self._grace:
            return self._end("finished", elapsed)
        if elapsed >= self._max:
            return self._end("timed_out", elapsed)
        if elapsed >= self._wrap_up_at and not self._warned and not self._finishing:
            self._warned = True
            return [Send({"type": "response.create", "response": {"instructions": _WRAP_UP}})]
        return []

    def closed(self) -> None:
        """The connection ended from the other side (the learner left, or the provider closed)."""
        if not self.ended:
            self.outcome = "closed"

    def _end(self, outcome: Outcome, elapsed: float) -> list[Action]:
        if self._awaited:
            self._ending = (outcome, elapsed + AUDIO_DRAIN_SECONDS)
            return []
        self.outcome = outcome
        return [HangUp()]

    def _finish(self, outcome: Outcome) -> list[Action]:
        """Ends a call that was waiting for its audio."""
        self.outcome = outcome
        return [HangUp()]

    def _say(self, speaker: Speaker, text: object, item_id: object = None) -> bool:
        if not isinstance(text, str) or not text.strip():
            return False
        if isinstance(item_id, str):
            self._items[item_id] = len(self.turns)
        self.turns.append(Turn(speaker, text.strip()))
        return True

    def _retrieve(self, item_id: object) -> list[Action]:
        if not self._record or not isinstance(item_id, str) or item_id in self._awaited:
            return []
        self._awaited.add(item_id)
        # The id comes back with an error about this request, so a failed one is not awaited.
        event = {
            "type": "conversation.item.retrieve",
            "event_id": f"{_RETRIEVE_PREFIX}{item_id}",
            "item_id": item_id,
        }
        return [Send(event)]

    def _retrieved(self, item: dict[str, Any]) -> list[Action]:
        item_id = item.get("id")
        if item_id not in self._awaited:
            return []
        self._awaited.discard(item_id)
        position = self._items[item_id]
        actions: list[Action] = []
        pcm = _audio(item)
        if pcm:
            actions.append(KeepAudio(item_id, self.turns[position].speaker, pcm))
        return actions + self._check(item_id, pcm) + self._after_answer()

    def _not_retrieved(self, error: dict[str, Any]) -> list[Action]:
        event_id = error.get("event_id")
        if not isinstance(event_id, str) or not event_id.startswith(_RETRIEVE_PREFIX):
            return []
        item_id = event_id.removeprefix(_RETRIEVE_PREFIX)
        self._awaited.discard(item_id)
        return self._check(item_id, b"") + self._after_answer()

    def _check(self, item_id: str, pcm: bytes) -> list[Action]:
        """Hands a learner's turn on to the spotter, with the partner's line before it."""
        position = self._items.get(item_id)
        if not self._spot or position is None or self.turns[position].speaker != "learner":
            return []
        partner = next(
            (turn.text for turn in reversed(self.turns[:position]) if turn.speaker == "persona"),
            None,
        )
        return [Spot(item_id, self.turns[position].text, pcm, partner)]

    def _after_answer(self) -> list[Action]:
        """An awaited answer came: a call that was waiting for its last one can end now."""
        if self._ending is None or self._awaited:
            return []
        return self._finish(self._ending[0])

    def _typed(self, item: dict[str, Any]) -> None:
        """A message the learner typed instead of saying it (speech arrives as a transcript)."""
        if item.get("type") != "message" or item.get("role") != "user":
            return
        for part in item.get("content") or []:
            if part.get("type") == "input_text":
                self._say("learner", part.get("text"))

    def _response_done(self, response: dict[str, Any], elapsed: float) -> list[Action]:
        self._count(response.get("usage") or {})
        # A spoken reply is complete now, its audio with it. One without a transcript was not
        # spoken (and is not a turn).
        retrievals = [
            action
            for item in response.get("output") or []
            if item.get("type") == "message" and item.get("id") in self._items
            for action in self._retrieve(item.get("id"))
        ]
        return retrievals + self._tool_calls(response, elapsed)

    def _tool_calls(self, response: dict[str, Any], elapsed: float) -> list[Action]:
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
        cached = taken.get("cached_tokens_details") or {}
        self.usage["cached_input_text_tokens"] += int(cached.get("text_tokens") or 0)
        self.usage["cached_input_audio_tokens"] += int(cached.get("audio_tokens") or 0)
        self.usage["output_text_tokens"] += int(given.get("text_tokens") or 0)
        self.usage["output_audio_tokens"] += int(given.get("audio_tokens") or 0)


def _audio(item: dict[str, Any]) -> bytes:
    """The audio of a retrieved item; empty when it has none or it cannot be read."""
    for part in item.get("content") or []:
        encoded = part.get("audio")
        if isinstance(encoded, str) and encoded:
            try:
                return base64.b64decode(encoded, validate=True)
            except (binascii.Error, ValueError):
                return b""
    return b""
