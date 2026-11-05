"""Deleting an account from the web, for someone who no longer has the app (spec §6.21.3: "in the
app, plus a web form for users who have uninstalled"; Google Play requires the form).

The proof that the account is theirs is a code sent to the account's own email address, the same
way a forgotten password is proved. Nothing is deleted without it, and nothing in an answer says
whether an address has an account: asking for a code always looks the same.

The email itself is sent by the identity provider (`EmailProof`), because Konvami has no email
sender of its own yet (Amazon SES, infra/README.md). Deleting is the same `AccountService.delete`
as in the app.
"""

import re
from typing import Protocol
from uuid import UUID

from konvami_api.domain.accounts import AccountService

# The longest an email address can be (RFC 5321).
MAX_EMAIL_LENGTH = 254
# One "@" with something on both sides and a dot in the domain. Whether the address is real is
# for the provider to find out; this only turns away what cannot be an address.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# The code the identity provider sends.
_CODE = re.compile(r"^\d{6}$")


class WebDeletionError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class CodeRejected(Exception):  # noqa: N818 - a fact about the code, not a fault
    """The code is wrong, expired or was never sent, or there is no such account: the provider
    answers all of these the same way, and so does this service."""


class TooManyAttempts(Exception):  # noqa: N818 - a limit, not a fault
    """The provider refuses more tries for now (it limits requests and wrong codes)."""


class EmailProof(Protocol):
    def send_code(self, email: str) -> None:
        """Emails a code to the address when it belongs to an account, and does nothing visible
        when it does not. Raises `TooManyAttempts`."""

    def verify(self, email: str, code: str) -> UUID:
        """The id of the account whose address this is, when `code` is the one sent to it.
        Raises `CodeRejected` or `TooManyAttempts`."""


def clean_email(email: str) -> str:
    """The address as the provider knows it, or `WebDeletionError("invalid_email")`."""
    address = email.strip().lower()
    if len(address) > MAX_EMAIL_LENGTH or not _EMAIL.match(address):
        raise WebDeletionError("invalid_email")
    return address


class WebDeletionService:
    def __init__(self, *, proof: EmailProof, accounts: AccountService) -> None:
        self._proof = proof
        self._accounts = accounts

    def request(self, email: str) -> None:
        """Sends the code. The answer is the same for an address with an account and for one
        without. Raises `WebDeletionError` (`invalid_email`, `too_many_attempts`)."""
        address = clean_email(email)
        try:
            self._proof.send_code(address)
        except TooManyAttempts as limited:
            raise WebDeletionError("too_many_attempts") from limited

    def confirm(self, email: str, code: str) -> None:
        """Deletes the account whose address this is, when `code` is the one sent to it.
        Raises `WebDeletionError`: `invalid_email`, `invalid_code` (also for an address with no
        account) and `too_many_attempts`."""
        address = clean_email(email)
        digits = code.strip()
        if not _CODE.match(digits):
            raise WebDeletionError("invalid_code")
        try:
            user_id = self._proof.verify(address, digits)
        except CodeRejected as rejected:
            raise WebDeletionError("invalid_code") from rejected
        except TooManyAttempts as limited:
            raise WebDeletionError("too_many_attempts") from limited
        self._accounts.delete(user_id)
