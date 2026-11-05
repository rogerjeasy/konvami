"""Crash reporting for the API and the call worker (spec §6.21.4: Sentry).

Off unless `KONVAMI_SENTRY_DSN` is set (Terraform variable `sentry_dsn`, empty by default). A
report carries the error, its stack and the function that failed, and nothing a learner said or
wrote: no request bodies or headers, no local variables, no breadcrumbs, no names or emails.
The learner appears only as a hash of their id, so a crash can be matched to a report of the
same learner's without knowing who they are.
"""

import hashlib
import re
from collections.abc import Mapping
from typing import Any
from uuid import UUID

import sentry_sdk
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration

DSN_VARIABLE = "KONVAMI_SENTRY_DSN"
ENVIRONMENT_VARIABLE = "KONVAMI_ENVIRONMENT"
# Letters of an exception message kept: a message can quote a learner's text (a failed
# validation names the value), so only its start is useful and safe to send.
MAX_MESSAGE_LENGTH = 120
# Characters of the user hash kept; enough to tell learners apart, too short to look one up.
USER_HASH_LENGTH = 16

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# What a request carries that can hold a learner's words or credentials.
_REQUEST_FIELDS = ("data", "headers", "cookies", "query_string", "env")


def user_hash(user_id: UUID) -> str:
    """A stable, one-way name for a learner."""
    return hashlib.sha256(f"konvami:{user_id}".encode()).hexdigest()[:USER_HASH_LENGTH]


def _scrubbed(text: str) -> str:
    return _EMAIL.sub("[email]", text)[:MAX_MESSAGE_LENGTH]


def scrub(event: dict[str, Any], hint: object = None) -> dict[str, Any] | None:
    """Removes what must not leave the service from an event (Sentry's `before_send`)."""
    request = event.get("request")
    if isinstance(request, dict):
        for field in _REQUEST_FIELDS:
            request.pop(field, None)
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {"id": user["id"]} if "id" in user else {}
    for key in ("breadcrumbs", "extra", "contexts", "server_name"):
        event.pop(key, None)
    exception = event.get("exception")
    values = exception.get("values", []) if isinstance(exception, dict) else []
    for value in values:
        if isinstance(value.get("value"), str):
            value["value"] = _scrubbed(value["value"])
        for frame in (value.get("stacktrace") or {}).get("frames", []):
            frame.pop("vars", None)
    message = event.get("message")
    if isinstance(message, str):
        event["message"] = _scrubbed(message)
    return event


def options(environment: Mapping[str, str]) -> dict[str, Any] | None:
    """Sentry's settings, or None when no DSN is set."""
    dsn = environment.get(DSN_VARIABLE, "")
    if not dsn:
        return None
    return {
        "dsn": dsn,
        "environment": environment.get(ENVIRONMENT_VARIABLE) or "dev",
        "integrations": [AwsLambdaIntegration()],
        # No learner data: see the module's note.
        "send_default_pii": False,
        "include_local_variables": False,
        "max_breadcrumbs": 0,
        "max_request_body_size": "never",
        # Crashes only: no performance traces, which would add a cost and a new data flow.
        "traces_sample_rate": 0,
        "before_send": scrub,
    }


def init(environment: Mapping[str, str]) -> bool:
    """Starts crash reporting when it is configured. Returns whether it was."""
    settings = options(environment)
    if settings is None:
        return False
    sentry_sdk.init(**settings)
    return True


def identify(user_id: UUID) -> None:
    """Names the learner of the current request by their hash. Does nothing without Sentry."""
    sentry_sdk.set_user({"id": user_hash(user_id)})
