"""Crash reporting for the API and the call worker (spec §6.21.4: Sentry).

Off unless `KONVAMI_SENTRY_DSN` is set (Terraform variable `sentry_dsn`, empty by default). A
report carries the error's type, its stack and the function that failed, and nothing a learner
said or wrote: no request bodies or headers, no local variables, no breadcrumbs, no tags. Every
piece of free text, such as an exception message that quotes a validated value, is replaced: no
pattern can tell which messages hold a sentence or a name. Only a short machine code
(`not_found`) is kept as it is. The learner appears only as a hash of their id, so a crash can
be matched to a report of the same learner's without knowing who they are.
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
# What stands in for a message that is not a plain code.
REDACTED = "[redacted]"
# Characters of the user hash kept; enough to tell learners apart, too short to look one up.
USER_HASH_LENGTH = 16

# An error code such as `not_found`: lowercase words joined by underscores. It needs an
# underscore, because a single lowercase word is as likely to be something a learner said.
_CODE = re.compile(r"[a-z]+(_[a-z0-9]+)+")
# The few codes that are one word, spelled out so nothing else passes as one.
_SINGLE_WORD_CODES = frozenset({"unsure", "unavailable", "forbidden"})
# The parts of an event's `contexts` that describe the runtime, not the person.
_SAFE_CONTEXTS = ("runtime", "os", "device", "app")
# What a request carries that can hold a learner's words or credentials.
_REQUEST_FIELDS = ("data", "headers", "cookies", "query_string", "env")


def user_hash(user_id: UUID) -> str:
    """A stable, one-way name for a learner."""
    return hashlib.sha256(f"konvami:{user_id}".encode()).hexdigest()[:USER_HASH_LENGTH]


def _text(text: str) -> str:
    return text if _CODE.fullmatch(text) or text in _SINGLE_WORD_CODES else REDACTED


def scrub(event: dict[str, Any], hint: object = None) -> dict[str, Any] | None:
    """Removes what must not leave the service from an event (Sentry's `before_send`)."""
    request = event.get("request")
    if isinstance(request, dict):
        for field in _REQUEST_FIELDS:
            request.pop(field, None)
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {"id": user["id"]} if "id" in user else {}
    for key in ("breadcrumbs", "extra", "tags", "logentry", "server_name"):
        event.pop(key, None)
    contexts = event.get("contexts")
    if isinstance(contexts, dict):
        event["contexts"] = {name: contexts[name] for name in _SAFE_CONTEXTS if name in contexts}
    exception = event.get("exception")
    values = exception.get("values", []) if isinstance(exception, dict) else []
    for value in values:
        if isinstance(value.get("value"), str):
            value["value"] = _text(value["value"])
        if isinstance(value.get("mechanism"), dict):
            value["mechanism"].pop("data", None)
        for frame in (value.get("stacktrace") or {}).get("frames", []):
            frame.pop("vars", None)
    message = event.get("message")
    if isinstance(message, str):
        event["message"] = _text(message)
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
