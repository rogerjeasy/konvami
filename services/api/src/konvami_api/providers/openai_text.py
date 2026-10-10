"""The text model: OpenAI's Responses API with a JSON-schema answer."""

import json
from collections.abc import Callable
from typing import Any

import httpx

from konvami_api.domain.text import TextModelError, TextTask

URL = "https://api.openai.com/v1/responses"
# For tasks without a limit of their own: a transcript assessment takes a while, and its caller
# is a background step, not a person waiting.
TIMEOUT_SECONDS = 90.0


class OpenAiText:
    def __init__(self, api_key: Callable[[], str], http: httpx.Client | None = None) -> None:
        self._api_key = api_key
        self._http = http or httpx.Client()

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
