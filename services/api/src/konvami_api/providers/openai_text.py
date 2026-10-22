"""The text model: OpenAI's Responses API with a JSON-schema answer."""

import json
from collections.abc import Callable
from typing import Any

import httpx

from konvami_api.domain.costs import UsageMeter
from konvami_api.domain.text import TextModelError, TextTask

URL = "https://api.openai.com/v1/responses"
PROVIDER = "openai"
# For tasks without a limit of their own: a transcript assessment takes a while, and its caller
# is a background step, not a person waiting.
TIMEOUT_SECONDS = 90.0


class OpenAiText:
    def __init__(
        self,
        api_key: Callable[[], str],
        http: httpx.Client | None = None,
        meter: UsageMeter | None = None,
    ) -> None:
        self._api_key = api_key
        self._http = http or httpx.Client()
        self._meter = meter

    def answer(self, task: TextTask) -> dict[str, Any]:
        body = {
            "model": task.model,
            "instructions": task.instructions,
            "input": task.content,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": task.answer_name,
                    "strict": True,
                    "schema": task.answer_schema,
                }
            },
            # Learner data is not kept by the provider beyond the request.
            "store": False,
        }
        try:
            response = self._http.post(
                URL,
                headers={"Authorization": f"Bearer {self._api_key()}"},
                json=body,
                timeout=task.max_seconds or TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            # Not chained: the request it carries holds the Authorization header.
            raise TextModelError(type(error).__name__) from None
        if not response.is_success:
            raise TextModelError(f"text model answered {response.status_code}")
        try:
            answer = response.json()
            self._metered(task, answer.get("usage"))
            if answer.get("status") != "completed":
                raise TextModelError(f"answer was {answer.get('status')}")
            # The output lists reasoning items and the message; the message holds the JSON text.
            text = next(
                part["text"]
                for item in answer["output"]
                if item.get("type") == "message"
                for part in item.get("content", [])
                if part.get("type") == "output_text"
            )
            result = json.loads(text)
        except (ValueError, KeyError, StopIteration, AttributeError, TypeError) as error:
            raise TextModelError("answer could not be read") from error
        if not isinstance(result, dict):
            raise TextModelError("answer was not a JSON object")
        return result

    def _metered(self, task: TextTask, usage: Any) -> None:
        """Reports what an answer used, readable or not: it was paid for either way. Cached
        input tokens are billed instead of, not on top of, the others."""
        if self._meter is None or not isinstance(usage, dict):
            return
        given = int(usage.get("input_tokens") or 0)
        cached = int((usage.get("input_tokens_details") or {}).get("cached_tokens") or 0)
        units = {
            "input_tokens": max(0, given - cached),
            "cached_input_tokens": cached,
            "output_tokens": int(usage.get("output_tokens") or 0),
        }
        self._meter.record(task.charge, PROVIDER, task.model, units)
