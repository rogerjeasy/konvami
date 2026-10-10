"""One error shape for the whole API: a stable code and, for a refused value, the field.

Nothing else leaves the server: no exception text, no rejected value, no stack trace. The app
turns a code into a translated message.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException

from konvami_api.domain.conversations import ConversationError
from konvami_api.domain.errors import ServiceUnavailable
from konvami_api.domain.onboarding import OnboardingError
from konvami_api.domain.personas import PersonaError
from konvami_api.domain.profile import ProfileError
from konvami_api.domain.voice import VoiceError


class ErrorDetail(BaseModel):
    code: str
    field: str | None = None


class ErrorBody(BaseModel):
    error: ErrorDetail


class ApiError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


_HTTP_CODES = {404: "not_found", 405: "method_not_allowed"}
# Why a voice call cannot start, as HTTP: not allowed, too many, or not possible right now.
_VOICE_STATUS = {"not_authenticated": 401, "consent_required": 403, "call_limit": 429}
_VOICE_UNAVAILABLE = 503
_PERSONA_STATUS = {"invalid_value": 422, "not_found": 404, "no_partners": 409}


def _response(
    status: int, code: str, field: str | None = None, headers: dict[str, str] | None = None
) -> JSONResponse:
    body = ErrorBody(error=ErrorDetail(code=code, field=field))
    return JSONResponse(body.model_dump(), status_code=status, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, error: ApiError) -> JSONResponse:
        return _response(error.status, error.code)

    @app.exception_handler(ProfileError)
    async def _profile_error(_: Request, error: ProfileError) -> JSONResponse:
        return _response(422, error.code, error.field)

    @app.exception_handler(OnboardingError)
    async def _onboarding_error(_: Request, error: OnboardingError) -> JSONResponse:
        return _response(409, error.code)

    @app.exception_handler(PersonaError)
    async def _persona_error(_: Request, error: PersonaError) -> JSONResponse:
        return _response(_PERSONA_STATUS.get(error.code, 422), error.code)

    @app.exception_handler(ConversationError)
    async def _conversation_error(_: Request, error: ConversationError) -> JSONResponse:
        return _response(404, error.code)

    @app.exception_handler(VoiceError)
    async def _voice_error(_: Request, error: VoiceError) -> JSONResponse:
        return _response(_VOICE_STATUS.get(error.code, _VOICE_UNAVAILABLE), error.code)

    @app.exception_handler(ServiceUnavailable)
    async def _unavailable(_: Request, error: ServiceUnavailable) -> JSONResponse:
        headers = {"Retry-After": str(error.retry_after_seconds)}
        return _response(503, error.code, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _invalid_request(_: Request, __: RequestValidationError) -> JSONResponse:
        return _response(422, "invalid_request")

    @app.exception_handler(HTTPException)
    async def _http_error(_: Request, error: HTTPException) -> JSONResponse:
        return _response(error.status_code, _HTTP_CODES.get(error.status_code, "http_error"))
