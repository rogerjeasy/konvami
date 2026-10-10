"""Who is calling. API Gateway has already verified the Cognito access token (a JWT authorizer
on every route) and passes its claims in the Lambda event; this only reads the subject.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request

from konvami_api.api.errors import ApiError


def current_user(request: Request) -> UUID:
    event = request.scope.get("aws.event", {})
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    try:
        # A Cognito subject is a UUID; it is the user's id everywhere in the backend.
        return UUID(claims["sub"])
    except (KeyError, TypeError, ValueError):
        raise ApiError(401, "not_authenticated") from None


CurrentUser = Annotated[UUID, Depends(current_user)]

# How long ago the caller may have typed their password for an action that cannot be undone.
RECENT_SIGN_IN_SECONDS = 300
# The identity provider's clock and the gateway's may differ by a little.
CLOCK_SKEW_SECONDS = 60


def recently_signed_in(request: Request) -> None:
    """Refuses a caller who did not sign in with their password moments ago. A token that was
    stolen, or kept alive by refreshing, carries the time of the original sign-in (`auth_time`)
    and is not enough for what cannot be undone."""
    context = request.scope.get("aws.event", {}).get("requestContext", {})
    claims = context.get("authorizer", {}).get("jwt", {}).get("claims", {})
    try:
        signed_in_at = int(float(claims["auth_time"]))
        # When API Gateway received the request, in milliseconds.
        now = int(context["timeEpoch"]) // 1000
    except (KeyError, TypeError, ValueError):
        raise ApiError(403, "recent_sign_in_required") from None
    if not -CLOCK_SKEW_SECONDS <= now - signed_in_at <= RECENT_SIGN_IN_SECONDS:
        raise ApiError(403, "recent_sign_in_required")
