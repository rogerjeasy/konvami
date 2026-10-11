import json
from collections.abc import Iterator
from uuid import UUID

import boto3
import pytest
from botocore.stub import Stubber

from konvami_api.domain.voice import CallPurpose
from konvami_api.providers.aws import LambdaCallStarter, LambdaReportStarter, cached_secret

USER = UUID("11111111-1111-4111-8111-111111111111")
SECRET_ARN = "arn:aws:secretsmanager:eu-central-1:503002144480:secret:kv-dev-openai"  # noqa: S105


def client(service: str) -> Iterator[Stubber]:
    aws = boto3.client(
        service,
        region_name="eu-central-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",  # noqa: S106
    )
    with Stubber(aws) as stubber:
        yield stubber
        stubber.assert_no_pending_responses()


@pytest.fixture
def functions() -> Iterator[Stubber]:
    yield from client("lambda")


@pytest.fixture
def secrets() -> Iterator[Stubber]:
    yield from client("secretsmanager")


def test_the_call_worker_is_started_without_waiting_for_it(functions: Stubber) -> None:
    functions.add_response(
        "invoke",
        {"StatusCode": 202},
        {
            "FunctionName": "kv-dev-call-worker",
            "InvocationType": "Event",
            "Payload": json.dumps({"call_id": "rtc_1"}).encode(),
        },
    )

    LambdaCallStarter(functions.client, "kv-dev-call-worker").start(
        "rtc_1", USER, CallPurpose.ONBOARDING
    )


def test_a_report_is_handed_to_the_worker_without_waiting_for_it(functions: Stubber) -> None:
    functions.add_response(
        "invoke",
        {"StatusCode": 202},
        {
            "FunctionName": "kv-dev-call-worker",
            "InvocationType": "Event",
            "Payload": json.dumps({"report": "rtc_1"}).encode(),
        },
    )

    LambdaReportStarter(functions.client, "kv-dev-call-worker").start("rtc_1")


def test_a_secret_is_fetched_once_and_then_remembered(secrets: Stubber) -> None:
    secrets.add_response(
        "get_secret_value",
        {"ARN": SECRET_ARN, "Name": "kv-dev-openai", "SecretString": "sk-live"},
        {"SecretId": SECRET_ARN},
    )
    read = cached_secret(secrets.client, SECRET_ARN)

    assert [read(), read(), read()] == ["sk-live", "sk-live", "sk-live"]


def test_a_secret_is_not_fetched_until_it_is_needed(secrets: Stubber) -> None:
    cached_secret(secrets.client, SECRET_ARN)
