"""Small adapters over AWS services the backend uses besides the database."""

import datetime as dt
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


class LambdaDetailsStarter:
    """Has a learner's new word cards filled in with their forms by the worker function, in an
    invocation of its own, so saving a card does not wait for the text model."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, user_id: UUID) -> None:
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"card_details": str(user_id)}).encode(),
        )


class LambdaFitStarter:
    """Has a learner's review log fitted (their own card schedule) by the worker function, in an
    invocation of its own: a fit takes longer than an API request may."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, user_id: UUID) -> None:
        # The worker reads only this learner's own log.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"card_schedule": str(user_id)}).encode(),
        )


class LambdaExamStarter:
    """Has an exam simulation scored by the worker function, in an invocation of its own: the
    scoring takes longer than an API request may, and must not hold up the end of the call."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, call_id: str) -> None:
        # The worker reads whose simulation it is from the database.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"exam": call_id}).encode(),
        )


class LambdaHalvesStarter:
    """Has the worker check a Two Halves move, play the AI stand-in or write a recap, in an
    invocation of its own: each is a few requests to a model and a sound."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, job: str, item_id: UUID) -> None:
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"halves": job, "id": str(item_id)}).encode(),
        )


class LambdaPenPalStarter:
    """Has a pen-pal note or answer written by the worker function, in an invocation of its own:
    writing and speaking it takes longer than an API request may."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, note_id: UUID) -> None:
        # The worker writes only a note that is waiting in the database, for the learner it
        # belongs to.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"pen_pal": str(note_id)}).encode(),
        )


class LambdaCoachStarter:
    """Has a learner's suggestions of the day worded by the worker function, in an invocation of
    its own, so opening Today does not wait for the text model (`domain/coach.py`)."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, user_id: UUID, day: dt.date) -> None:
        # The worker words only a day whose brief is waiting in the database for this learner.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"coach": str(user_id), "day": day.isoformat()}).encode(),
        )


class LambdaStoryStarter:
    """Has a listening story's episode written by the worker function, in an invocation of its
    own: writing it and speaking its lines takes longer than an API request may (5.29)."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, episode_id: UUID) -> None:
        # The worker writes only an episode that is waiting in the database.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"story": str(episode_id)}).encode(),
        )


class LambdaWeekReviewStarter:
    """Has a learner's weekly check-in written by the worker function, in an invocation of its
    own, so opening Progress does not wait for the text model."""

    def __init__(self, functions: LambdaClient, function_name: str) -> None:
        self._functions = functions
        self._function_name = function_name

    def start(self, user_id: UUID, week: dt.date) -> None:
        # The worker writes only a check-in that is waiting in the database for this learner.
        self._functions.invoke(
            FunctionName=self._function_name,
            InvocationType="Event",
            Payload=json.dumps({"week_review": str(user_id), "week": week.isoformat()}).encode(),
        )


def cached_secret(secrets: SecretsClient, secret_id: str) -> Callable[[], str]:
    """A reader for one secret: fetched on first use, then kept for the life of the container."""
    cache: list[str] = []

    def read() -> str:
        if not cache:
            cache.append(secrets.get_secret_value(SecretId=secret_id)["SecretString"])
        return cache[0]

    return read
