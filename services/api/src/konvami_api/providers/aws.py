"""Small adapters over AWS services the backend uses besides the database."""

import json
from collections.abc import Callable
from typing import Any, Protocol
from uuid import UUID

from konvami_api.domain.voice import CallPurpose


class LambdaClient(Protocol):
    def invoke(self, **kwargs: Any) -> dict[str, Any]: ...


class SecretsClient(Protocol):
    def get_secret_value(self, **kwargs: Any) -> dict[str, Any]: ...


class SnsClient(Protocol):
    def publish(self, **kwargs: Any) -> dict[str, Any]: ...


class SnsNotifier:
    """Emails the owner through an SNS topic with their address subscribed (the budget alerts,
    infra/modules/budget)."""

    def __init__(self, sns: SnsClient, topic_arn: str) -> None:
        self._sns = sns
        self._topic_arn = topic_arn

    def notify(self, subject: str, message: str) -> None:
        if not self._topic_arn:
            raise RuntimeError("no alert topic is configured")
        self._sns.publish(TopicArn=self._topic_arn, Subject=subject, Message=message)


class LambdaCallStarter:
    """Starts the call worker as its own Lambda invocation, which outlives the API request."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, call_id: str, user_id: UUID, purpose: CallPurpose) -> None:
        # The worker reads the learner and the purpose from the recorded session, so a forged
        # invocation cannot point a call at someone else's data.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"call_id": call_id}).encode(),
        )


class LambdaReportStarter:
    """Has a conversation's report written by the same worker function, in an invocation of its
    own: writing takes longer than an API request may, and must not hold up the end of a call."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, call_id: str) -> None:
        # As for a call: the worker reads whose conversation it is from the database.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"report": call_id}).encode(),
        )


def cached_secret(secrets: SecretsClient, secret_id: str) -> Callable[[], str]:
    """A reader for one secret: fetched on first use, then kept for the life of the container."""
    cache: list[str] = []

    def read() -> str:
        if not cache:
            cache.append(secrets.get_secret_value(SecretId=secret_id)["SecretString"])
        return cache[0]

    return read
