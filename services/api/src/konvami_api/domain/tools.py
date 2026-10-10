"""Tools a live voice persona can call. They run on the server (spec §8.4), never in the app:
the app cannot be trusted to validate what gets written to a learner's data.
"""

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ToolResult:
    # What the persona is told back, as JSON. Codes and data only: it decides what to say.
    output: dict[str, Any]
    # True when this call completed the conversation's purpose: the call can end after the goodbye.
    finished: bool = False


class ToolSet(Protocol):
    def definitions(self) -> list[dict[str, Any]]:
        """The tools as function definitions for the voice model."""

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        """Runs one tool call. Never raises for a bad call: the result says what was wrong."""
