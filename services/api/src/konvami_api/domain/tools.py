"""Tools a live voice persona can call. They run on the server (spec §8.4), never in the app:
the app cannot be trusted to validate what gets written to a learner's data.
"""

from dataclasses import dataclass
from typing import Any, Protocol

# Candidate contributions stay short so the learner gets most of the speaking time.
CANDIDATE_TEXT_MAX = 1200


@dataclass(frozen=True)
class ToolResult:
    # What the persona is told back, as JSON. Codes and data only: it decides what to say.
    output: dict[str, Any]
    # True when this call completed the conversation's purpose: the call can end after the goodbye.
    finished: bool = False
    # True when the persona has nothing to say about the result (a cosmetic tool such as
    # `set_expression`): no new reply is asked for, so the call goes on where it was.
    silent: bool = False
    # A paired exam's other candidate speaks this through a separate audio voice.
    candidate: str | None = None


class ToolSet(Protocol):
    def definitions(self) -> list[dict[str, Any]]:
        """The tools as function definitions for the voice model."""

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        """Runs one tool call. Never raises for a bad call: the result says what was wrong."""
