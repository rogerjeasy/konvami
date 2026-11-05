"""The routes anyone can reach without signing in (API Gateway lets `/public/*` through without a
token, infra/modules/api): the web page for deleting an account and the two requests it makes.

They are left out of the schema the app's client is generated from: the app never calls them.
Every answer is the same for an address with an account and one without.
"""

import secrets
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Header, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field

from konvami_api.api.deletion_page import pick_language, render
from konvami_api.domain.web_deletion import WebDeletionService


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


# The service decides what an address or a code may look like and answers with a code of its own;
# these bounds only keep a request from being large.
MAX_FIELD_LENGTH = 512


class DeletionRequestIn(_Body):
    email: Annotated[str, Field(max_length=MAX_FIELD_LENGTH)]


class DeletionConfirmIn(_Body):
    email: Annotated[str, Field(max_length=MAX_FIELD_LENGTH)]
    code: Annotated[str, Field(max_length=MAX_FIELD_LENGTH)]


class SentOut(BaseModel):
    sent: bool = True


class DeletedOut(BaseModel):
    deleted: bool = True


def public_router(web_deletion: Callable[[], WebDeletionService]) -> APIRouter:
    """`web_deletion` is looked up when a request arrives, so the schema can be built without any
    service (tools/export_openapi.py)."""
    router = APIRouter(prefix="/public", include_in_schema=False)

    @router.get("/delete-account", response_class=HTMLResponse)
    def deletion_page(
        lang: Annotated[str | None, Query(max_length=8)] = None,
        accept_language: Annotated[str | None, Header(max_length=200)] = None,
    ) -> HTMLResponse:
        nonce = secrets.token_urlsafe(16)
        page = render(pick_language(lang, accept_language), nonce)
        return HTMLResponse(
            page,
            headers={
                # Only this page's own script and style, and requests to its own address.
                "Content-Security-Policy": (
                    f"default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; "
                    "connect-src 'self'; base-uri 'none'; form-action 'none'; "
                    "frame-ancestors 'none'"
                ),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            },
        )

    @router.post("/delete-account/request", status_code=202)
    def ask_for_code(body: DeletionRequestIn) -> SentOut:
        web_deletion().request(body.email)
        return SentOut()

    @router.post("/delete-account/confirm")
    def confirm_deletion(body: DeletionConfirmIn) -> DeletedOut:
        web_deletion().confirm(body.email, body.code)
        return DeletedOut()

    return router
