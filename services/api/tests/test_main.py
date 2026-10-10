"""The Lambda entry point: settings from the environment, wired to the real Data API client."""

import json
from collections.abc import Iterator
from typing import Any

import boto3
import pytest
from botocore.stub import ANY, Stubber

from konvami_api import main
from tests.api.conftest import USER, http_api_event

ENVIRONMENT = {
    "KONVAMI_DB_CLUSTER_ARN": "arn:aws:rds:eu-central-1:503002144480:cluster:kv-dev-db",
    "KONVAMI_DB_SECRET_ARN": "arn:aws:secretsmanager:eu-central-1:503002144480:secret:rds!x",
    "KONVAMI_DB_NAME": "konvami",
}


@pytest.fixture
def stub() -> Iterator[Stubber]:
    rds_data = boto3.client(
        "rds-data",
        region_name="eu-central-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",  # noqa: S106
    )
    with Stubber(rds_data) as stubber:
        yield stubber


class Unused:
    """Stands in for an AWS client these tests must never reach."""

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"unexpected AWS call: {name}")


def clients(stub: Stubber) -> main.Clients:
    return main.Clients(
        rds_data=stub.client, cognito=Unused(), functions=Unused(), secrets=Unused()
    )


def invoke(stub: Stubber, method: str, path: str) -> dict[str, Any]:
    handler = main.build_handler(ENVIRONMENT, clients(stub), sleep=lambda _: None)
    result: dict[str, Any] = handler(http_api_event(method, path, None, USER), None)  # type: ignore[arg-type]
    return result


def test_a_request_is_answered_from_the_configured_database(stub: Stubber) -> None:
    stub.add_response(
        "execute_statement",
        {
            "formattedRecords": json.dumps(
                [
                    {
                        "scope": "global",
                        "field": "target_language",
                        "value": '"de"',
                        "source": "asked",
                        "updated_at": 1791547200000000,
                    }
                ]
            )
        },
        {
            "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
            "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
            "database": "konvami",
            "sql": ANY,
            "parameters": [{"name": "user_id", "value": {"stringValue": USER}}],
            "formatRecordsAs": "JSON",
        },
    )

    result = invoke(stub, "GET", "/v1/profile")

    assert result["statusCode"] == 200
    assert json.loads(result["body"])["targetLanguage"] == "de"


def test_a_database_that_is_still_waking_up_asks_the_app_to_try_again(stub: Stubber) -> None:
    for _ in range(9):
        stub.add_client_error(
            "execute_statement",
            service_error_code="DatabaseResumingException",
            http_status_code=400,
        )

    result = invoke(stub, "GET", "/v1/profile")

    assert result["statusCode"] == 503
    assert json.loads(result["body"]) == {"error": {"code": "waking_up", "field": None}}
    assert result["headers"]["retry-after"] == "5"


def test_a_missing_setting_is_named_at_start_up(stub: Stubber) -> None:
    incomplete = {key: value for key, value in ENVIRONMENT.items() if key != "KONVAMI_DB_NAME"}

    with pytest.raises(RuntimeError, match="KONVAMI_DB_NAME"):
        main.build_handler(incomplete, clients(stub))


def test_without_voice_settings_a_call_is_refused_before_any_provider_is_asked(
    stub: Stubber,
) -> None:
    handler = main.build_handler(ENVIRONMENT, clients(stub), sleep=lambda _: None)
    event = http_api_event("POST", "/v1/voice/calls", {"purpose": "onboarding", "sdp": "v=0"}, USER)

    result = handler(event, None)  # type: ignore[arg-type]

    assert result["statusCode"] == 503
    assert json.loads(result["body"]) == {"error": {"code": "voice_unavailable", "field": None}}


def test_the_library_is_read_from_the_database(stub: Stubber) -> None:
    stub.add_response(
        "execute_statement",
        {"formattedRecords": "[]"},
        {
            "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
            "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
            "database": "konvami",
            "sql": ANY,
            "parameters": [
                {"name": "user_id", "value": {"stringValue": USER}},
                # One more than the page, to know whether another page follows.
                {"name": "limit", "value": {"longValue": 21}},
                {"name": "before", "value": {"isNull": True}},
            ],
            "formatRecordsAs": "JSON",
        },
    )

    result = invoke(stub, "GET", "/v1/conversations")

    assert result["statusCode"] == 200
    assert json.loads(result["body"]) == {"conversations": [], "next": None}
    stub.assert_no_pending_responses()
