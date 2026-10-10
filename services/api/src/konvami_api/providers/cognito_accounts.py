"""Accounts as Amazon Cognito holds them (infra/modules/auth)."""

from dataclasses import replace
from typing import Any, Protocol
from uuid import UUID

from botocore.exceptions import ClientError

from konvami_api.domain.accounts import Account, AccountNotFound, account_from_attributes


class CognitoIdp(Protocol):
    """The part of boto3's `cognito-idp` client that is used here."""

    def admin_get_user(self, **kwargs: Any) -> dict[str, Any]: ...


class CognitoAccounts:
    def __init__(self, cognito: CognitoIdp, user_pool_id: str) -> None:
        self._cognito = cognito
        self._user_pool_id = user_pool_id

    def get(self, user_id: UUID) -> Account:
        try:
            # In this pool the subject can be used as the username for admin calls.
            user = self._cognito.admin_get_user(
                UserPoolId=self._user_pool_id, Username=str(user_id)
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "UserNotFoundException":
                raise AccountNotFound from error
            raise
        attributes = {item["Name"]: item["Value"] for item in user.get("UserAttributes", [])}
        account = account_from_attributes(attributes)
        # A disabled account keeps its consent record but may not start anything.
        return account if user.get("Enabled", True) else replace(account, voice_consent=False)
