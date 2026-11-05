from collections.abc import Iterator
from uuid import UUID

import boto3
import pytest
from botocore.stub import Stubber

from konvami_api.domain.web_deletion import CodeRejected, TooManyAttempts
from konvami_api.providers.cognito_email_proof import CognitoEmailProof

POOL = "eu-central-1_LBWRtKNjl"
CLIENT = "7bajnk3j61g3rdsf5ate1t2ah7"
USER = UUID("11111111-1111-4111-8111-111111111111")
EMAIL = "amara.diallo@mail.com"
PASSWORD = "Kv1!not-a-real-one"  # noqa: S105 - a stand-in, never used


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


def proof(stub: Stubber) -> CognitoEmailProof:
    return CognitoEmailProof(
        stub.client, user_pool_id=POOL, client_id=CLIENT, new_password=lambda: PASSWORD
    )


def test_the_provider_emails_a_code_to_the_address(stub: Stubber) -> None:
    stub.add_response(
        "forgot_password",
        {"CodeDeliveryDetails": {"Destination": "a***@m***", "DeliveryMedium": "EMAIL"}},
        {"ClientId": CLIENT, "Username": EMAIL},
    )

    proof(stub).send_code(EMAIL)


@pytest.mark.parametrize(
    "error",
    [
        "UserNotFoundException",
        "InvalidParameterException",
        "NotAuthorizedException",
        "CodeDeliveryFailureException",
    ],
)
def test_an_address_that_cannot_be_emailed_looks_like_one_that_was(
    stub: Stubber, error: str
) -> None:
    stub.add_client_error("forgot_password", service_error_code=error, http_status_code=400)

    proof(stub).send_code(EMAIL)


@pytest.mark.parametrize("error", ["LimitExceededException", "TooManyRequestsException"])
def test_the_providers_limit_on_codes_is_reported(stub: Stubber, error: str) -> None:
    stub.add_client_error("forgot_password", service_error_code=error, http_status_code=400)

    with pytest.raises(TooManyAttempts):
        proof(stub).send_code(EMAIL)


def test_a_real_fault_is_not_hidden(stub: Stubber) -> None:
    stub.add_client_error(
        "forgot_password", service_error_code="InternalErrorException", http_status_code=500
    )

    with pytest.raises(Exception, match="InternalErrorException"):
        proof(stub).send_code(EMAIL)


def test_the_right_code_names_the_account_by_its_subject(stub: Stubber) -> None:
    stub.add_response(
        "confirm_forgot_password",
        {},
        {
            "ClientId": CLIENT,
            "Username": EMAIL,
            "ConfirmationCode": "123456",
            "Password": PASSWORD,
        },
    )
    stub.add_response(
        "admin_get_user",
        {
            "Username": "an-internal-name",
            "UserAttributes": [
                {"Name": "email", "Value": EMAIL},
                {"Name": "sub", "Value": str(USER)},
            ],
        },
        {"UserPoolId": POOL, "Username": EMAIL},
    )

    assert proof(stub).verify(EMAIL, "123456") == USER


@pytest.mark.parametrize(
    "error",
    [
        "CodeMismatchException",
        "ExpiredCodeException",
        "UserNotFoundException",
        "NotAuthorizedException",
    ],
)
def test_a_code_that_does_not_fit_is_rejected_the_same_way(stub: Stubber, error: str) -> None:
    stub.add_client_error("confirm_forgot_password", service_error_code=error, http_status_code=400)

    with pytest.raises(CodeRejected):
        proof(stub).verify(EMAIL, "123456")


def test_too_many_wrong_codes_are_reported_as_a_limit(stub: Stubber) -> None:
    stub.add_client_error(
        "confirm_forgot_password",
        service_error_code="TooManyFailedAttemptsException",
        http_status_code=400,
    )

    with pytest.raises(TooManyAttempts):
        proof(stub).verify(EMAIL, "123456")


def test_the_password_set_for_the_proof_is_random_and_fits_the_pools_rules() -> None:
    from konvami_api.providers.cognito_email_proof import _random_password

    first, second = _random_password(), _random_password()

    assert first != second
    assert len(first) >= 8
    assert any(character.isdigit() for character in first)
    assert any(not character.isalnum() for character in first)
