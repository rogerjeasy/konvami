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
