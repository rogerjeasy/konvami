"""Text models for work that is not live conversation: assessing a transcript, writing personas
(spec §8.2 cold path, §17.3 "split the intelligence"). The provider sits behind `TextModel`.
"""

from dataclasses import dataclass
from typing import Any, Protocol

from konvami_api.domain.costs import Charge


@dataclass(frozen=True)
class TextTask:
    """One question to a text model, answered as JSON in a given shape."""

    model: str
    # Who the model is and what it must do.
    instructions: str
    # What it works on (a transcript, a profile).
    content: str
    # A short name and the JSON schema of the answer.
    answer_name: str
    answer_schema: dict[str, Any]
    # How long to wait for the answer, when someone is waiting for it. None: a background job,
    # which gets the provider's own, longer limit.
    max_seconds: float | None = None
    # Who the request is for and why, for metering; None: not metered.
    charge: Charge | None = None


class TextModelError(Exception):
    """The text model could not be reached or did not answer in the asked shape."""


class TextModel(Protocol):
    def answer(self, task: TextTask) -> dict[str, Any]:
        """The answer as a JSON object matching the task's schema. Raises `TextModelError`."""


def familiar_address(language: str) -> str:
    """How a model is to address the learner in `language` (an English name): as the app does,
    with the familiar form where the language has one (French "tu", German "du")."""
    return f"Where {language} has a familiar form of address, use it, as the app does."


def answer_object(properties: dict[str, Any]) -> dict[str, Any]:
    """The schema of a JSON object in which every property is required, as a text model's strict
    answers need."""
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def answer_list(items: dict[str, Any], most: int) -> dict[str, Any]:
    return {"type": "array", "items": items, "maxItems": most}
