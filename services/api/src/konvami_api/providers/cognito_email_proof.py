"""Proof of an email address from Amazon Cognito, for deleting an account from the web.

Cognito can email a code to an account's address and check it: that is its forgotten-password
flow, which needs no sign-in, only the app client's id (a public value). Here the code proves who
is asking, and the password it asks for is a random one nobody sees: the account is deleted right
after, so no one will ever sign in with it. If the deletion fails afterwards, the learner simply
resets their password in the app as usual.

The app client has `prevent_user_existence_errors` on (infra/modules/auth), so for an address
without an account Cognito answers as if it had sent the code, and a wrong code and an unknown
address fail the same way. That is what keeps the answers from telling the two apart.
"""

import secrets
from collections.abc import Callable
from typing import Any, Protocol
from uuid import UUID

from botocore.exceptions import ClientError

from konvami_api.domain.web_deletion import CodeRejected, TooManyAttempts
from konvami_api.providers.cognito_accounts import CognitoIdp


class EmailProofIdp(Protocol):
    """The part of boto3's `cognito-idp` client that is used here."""

    def forgot_password(self, **kwargs: Any) -> dict[str, Any]: ...

    def confirm_forgot_password(self, **kwargs: Any) -> dict[str, Any]: ...

    def admin_get_user(self, **kwargs: Any) -> dict[str, Any]: ...


class CognitoClient(CognitoIdp, EmailProofIdp, Protocol):
    """The whole `cognito-idp` client the backend uses: accounts and proof of an address."""


# What Cognito says when it refuses to try again for a while.
_LIMITED = {
    "LimitExceededException",
    "TooManyRequestsException",
    "TooManyFailedAttemptsException",
}
# What Cognito says about a code or an address that cannot be used. All of them look the same to
# the person asking.
_REJECTED = {
    "CodeMismatchException",
    "ExpiredCodeException",
    "UserNotFoundException",
    "UserNotConfirmedException",
    "NotAuthorizedException",
    "InvalidParameterException",
    "InvalidPasswordException",
}
# Rules of the pool's password policy (a number and a symbol), so the random password is accepted.
_PASSWORD_PREFIX = "Kv1!"  # noqa: S105 - the shape of a password nobody sees, not a secret


def _random_password() -> str:
    return _PASSWORD_PREFIX + secrets.token_urlsafe(24)


def _code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", ""))


class CognitoEmailProof:
    def __init__(
        self,
        cognito: EmailProofIdp,
        *,
        user_pool_id: str,
        client_id: str,
        new_password: Callable[[], str] = _random_password,
    ) -> None:
        self._cognito = cognito
        self._user_pool_id = user_pool_id
        self._client_id = client_id
        self._new_password = new_password

    def send_code(self, email: str) -> None:
        try:
            self._cognito.forgot_password(ClientId=self._client_id, Username=email)
        except ClientError as error:
            code = _code(error)
            if code in _LIMITED:
                raise TooManyAttempts from error
            # An address without an account, or one that cannot be emailed, must look like one
            # that was emailed. Anything else is a real fault and is reported as one.
            if code not in _REJECTED and code != "CodeDeliveryFailureException":
                raise

    def verify(self, email: str, code: str) -> UUID:
        try:
            self._cognito.confirm_forgot_password(
                ClientId=self._client_id,
                Username=email,
                ConfirmationCode=code,
                Password=self._new_password(),
            )
        except ClientError as error:
            name = _code(error)
            if name in _LIMITED:
                raise TooManyAttempts from error
            if name in _REJECTED:
                raise CodeRejected from error
            raise
        # The pool signs in with the email address; the account is known by its subject.
        user = self._cognito.admin_get_user(UserPoolId=self._user_pool_id, Username=email)
        attributes = {item["Name"]: item["Value"] for item in user.get("UserAttributes", [])}
        return UUID(attributes["sub"])
