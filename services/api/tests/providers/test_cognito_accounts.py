from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import Stubber

from konvami_api.domain.accounts import Account, AccountNotFound
from konvami_api.providers.cognito_accounts import CognitoAccounts

POOL = "eu-central-1_LBWRtKNjl"
USER = UUID("11111111-1111-4111-8111-111111111111")


@pytest.fixture
def stub() -> Iterator[Stubber]:
    cognito = boto3.client(
        "cognito-idp",
        region_name="eu-central-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",  # noqa: S106
    )
    with Stubber(cognito) as stubber:
        yield stubber
        stubber.assert_no_pending_responses()


def test_an_account_is_read_from_the_user_pool_by_its_subject(stub: Stubber) -> None:
    stub.add_response(
        "admin_get_user",
        {
            "Username": str(USER),
            "UserAttributes": [
                {"Name": "sub", "Value": str(USER)},
                {"Name": "email", "Value": "amara.diallo@mail.com"},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "given_name", "Value": "Amara"},
                {"Name": "locale", "Value": "fr"},
                {
                    "Name": "custom:ai_consent",
                    "Value": "v1|2026-10-09T12:30:00.000Z|openai=1,elevenlabs=0,bedrock=0",
                },
            ],
            "UserCreateDate": datetime(2026, 10, 9, tzinfo=UTC),
            "UserLastModifiedDate": datetime(2026, 10, 9, tzinfo=UTC),
            "Enabled": True,
            "UserStatus": "CONFIRMED",
        },
        {"UserPoolId": POOL, "Username": str(USER)},
    )

    account = CognitoAccounts(stub.client, POOL).get(USER)

    assert account == Account(first_name="Amara", language="fr", voice_consent=True)


def test_a_disabled_account_has_no_voice_consent(stub: Stubber) -> None:
    stub.add_response(
        "admin_get_user",
        {
            "Username": str(USER),
            "UserAttributes": [
                {"Name": "given_name", "Value": "Amara"},
                {
                    "Name": "custom:ai_consent",
                    "Value": "v1|2026-10-09T12:30:00.000Z|openai=1,elevenlabs=0,bedrock=0",
                },
            ],
            "Enabled": False,
            "UserStatus": "CONFIRMED",
        },
        {"UserPoolId": POOL, "Username": str(USER)},
    )

    assert CognitoAccounts(stub.client, POOL).get(USER).voice_consent is False


def test_a_deleted_account_is_reported_as_not_found(stub: Stubber) -> None:
    stub.add_client_error(
        "admin_get_user", service_error_code="UserNotFoundException", http_status_code=400
    )

    with pytest.raises(AccountNotFound):
        CognitoAccounts(stub.client, POOL).get(USER)


def test_an_account_is_deleted_from_the_user_pool_by_its_subject(stub: Stubber) -> None:
    stub.add_response("admin_delete_user", {}, {"UserPoolId": POOL, "Username": str(USER)})

    CognitoAccounts(stub.client, POOL).delete(USER)


def test_deleting_an_account_that_is_already_gone_is_not_an_error(stub: Stubber) -> None:
    stub.add_client_error(
        "admin_delete_user", service_error_code="UserNotFoundException", http_status_code=400
    )

    CognitoAccounts(stub.client, POOL).delete(USER)


def test_a_deletion_the_user_pool_refuses_is_reported(stub: Stubber) -> None:
    stub.add_client_error(
        "admin_delete_user", service_error_code="TooManyRequestsException", http_status_code=400
    )

    with pytest.raises(ClientError):
        CognitoAccounts(stub.client, POOL).delete(USER)
