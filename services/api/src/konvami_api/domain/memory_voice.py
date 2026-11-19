"""Forgetting by voice (spec §6.11 "forget that", §8.4): "forget what I told you about my
divorce", "please don't remember that".

The partner repeats back what it understood and asks; only after a yes does it call
`forget_memory`. The call runs here, on the server: the notes the partner names (by the short ref
it was shown beside each one) are hidden at once and deleted for good when the call ends, and the
learner's words keep what they said about it in this call out of the memories written afterwards
(`MemoryService.write`). Until the call ends the app offers Undo.
"""

from typing import Any
from uuid import UUID

from konvami_api.domain.memories import TEXT_MAX, MemoriesError, MemoryService
from konvami_api.domain.tools import ToolResult

FORGET_MEMORY = "forget_memory"
# The most notes one "forget that" names: a topic, not the whole memory.
MAX_REFS = 10

# What the partner is told to do for the rest of the call.
FROM_NOW_ON = (
    "It is forgotten. Do not bring it up again in this conversation, ask nothing more about it, "
    "and if they raise it themselves, answer briefly and move on."
)


class MemoryVoice:
    """The `forget_memory` tool of one learner's call."""

    def __init__(self, memories: MemoryService, user_id: UUID) -> None:
        self._memories = memories
        self._user_id = user_id

    def definition(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": FORGET_MEMORY,
            "description": (
                "Forgets something the learner asked you to forget, after you repeated it back "
                "and they said yes. Never call it before they confirmed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "notes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "maxItems": MAX_REFS,
                        "description": (
                            "The refs in square brackets of the notes from before that it is "
                            "about; empty when it is only about something said in this call."
                        ),
                    },
                    "about": {
                        "type": "string",
                        "description": (
                            "What to forget, in a few words, in the language they said it in."
                        ),
                    },
                    "confirmed": {
                        "type": "boolean",
                        "description": "True only when the learner said yes to your question.",
                    },
                },
                "required": ["notes", "about", "confirmed"],
                "additionalProperties": False,
            },
        }

    def run(self, arguments: dict[str, Any]) -> ToolResult:
        notes, about, confirmed = (
            arguments.get("notes"),
            arguments.get("about"),
            arguments.get("confirmed"),
        )
        if (
            not isinstance(notes, list)
            or not all(isinstance(ref, str) for ref in notes)
            or not isinstance(about, str)
            or len(about) > TEXT_MAX * 2
        ):
            return _refused("invalid_arguments")
        # As for `update_profile`: the server cannot hear the yes, but it refuses a call that
        # does not even claim it.
        if confirmed is not True:
            return _refused("not_confirmed")
        try:
            forget, hidden = self._memories.forget(self._user_id, notes[:MAX_REFS], about)
        except MemoriesError as error:
            return _refused(error.code)
        return ToolResult(
            {"forgot": True, "forget": str(forget.id), "notes": hidden, "from_now_on": FROM_NOW_ON}
        )


def _refused(reason: str) -> ToolResult:
    return ToolResult({"forgot": False, "reason": reason})
