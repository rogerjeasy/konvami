"""The moderation check: OpenAI's moderation endpoint, which is free of charge."""

from collections.abc import Callable, Sequence

import httpx

from konvami_api.domain.costs import Charge, UsageMeter
from konvami_api.domain.moderation import ModeratorError, Verdict

URL = "https://api.openai.com/v1/moderations"
PROVIDER = "openai"
MODEL = "omni-moderation-latest"
# A person is waiting to save what they wrote.
TIMEOUT_SECONDS = 10.0


class OpenAiModerator:
    def __init__(
        self,
        api_key: Callable[[], str],
        http: httpx.Client | None = None,
        meter: UsageMeter | None = None,
    ) -> None:
        self._api_key = api_key
        self._http = http or httpx.Client()
        self._meter = meter

    def check(self, texts: Sequence[str], charge: Charge) -> Verdict:
        try:
            response = self._http.post(
                URL,
                headers={"Authorization": f"Bearer {self._api_key()}"},
                json={"model": MODEL, "input": list(texts)},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            # Not chained: the request it carries holds the Authorization header.
            raise ModeratorError(type(error).__name__) from None
        if not response.is_success:
            raise ModeratorError(f"moderation answered {response.status_code}")
        try:
            results = response.json()["results"]
            flagged = any(bool(result["flagged"]) for result in results)
            if len(results) != len(texts):
                raise ValueError("one result per text expected")
        except (ValueError, KeyError, TypeError) as error:
            raise ModeratorError("answer could not be read") from error
        if self._meter is not None:
            # Free, but counted: the owner sees how often learners write for their partners.
            self._meter.record(charge, PROVIDER, MODEL, {"requests": 1})
        return Verdict(flagged=flagged)
