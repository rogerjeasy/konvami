import json
from collections.abc import Iterator
from datetime import date
from typing import Any
from uuid import UUID

import boto3
import pytest
from botocore.stub import Stubber

from konvami_api.domain.voice import CallPurpose
from konvami_api.providers.aws import (
    LambdaCallStarter,
    LambdaDetailsStarter,
    LambdaExamStarter,
    LambdaReportStarter,
    LambdaWeekReviewStarter,
    SnsNotifier,
    cached_secret,
)

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


def test_new_cards_are_handed_to_the_worker_to_be_filled_in(functions: Stubber) -> None:
    functions.add_response(
        "invoke",
        {"StatusCode": 202},
        {
            "FunctionName": "kv-dev-call-worker",
            "InvocationType": "Event",
            "Payload": json.dumps({"card_details": str(USER)}).encode(),
        },
    )

    LambdaDetailsStarter(functions.client, "kv-dev-call-worker").start(USER)


def test_a_weekly_check_in_is_handed_to_the_worker_to_be_written(functions: Stubber) -> None:
    functions.add_response(
        "invoke",
        {"StatusCode": 202},
        {
            "FunctionName": "kv-dev-call-worker",
            "InvocationType": "Event",
            "Payload": json.dumps({"week_review": str(USER), "week": "2026-10-05"}).encode(),
        },
    )

    LambdaWeekReviewStarter(functions.client, "kv-dev-call-worker").start(USER, date(2026, 10, 5))


def test_an_exam_simulation_is_handed_to_the_worker_to_be_scored(functions: Stubber) -> None:
    functions.add_response(
        "invoke",
        {"StatusCode": 202},
        {
            "FunctionName": "kv-dev-call-worker",
            "InvocationType": "Event",
            "Payload": json.dumps({"exam": "rtc_1"}).encode(),
        },
    )

    LambdaExamStarter(functions.client, "kv-dev-call-worker").start("rtc_1")


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


class RecordingSns:
    def __init__(self) -> None:
        self.published: list[dict[str, Any]] = []

    def publish(self, **kwargs: Any) -> dict[str, Any]:
        self.published.append(kwargs)
        return {"MessageId": "m-1"}


def test_a_budget_alert_is_published_to_the_owners_topic() -> None:
    sns = RecordingSns()
    topic = "arn:aws:sns:eu-central-1:503002144480:kv-dev-budget-alerts"

    SnsNotifier(sns, topic).notify("Konvami: passed the $150 target", "Spend is $151.20.")

    assert sns.published == [
        {
            "TopicArn": topic,
            "Subject": "Konvami: passed the $150 target",
            "Message": "Spend is $151.20.",
        }
    ]


def test_without_a_topic_an_alert_cannot_be_sent() -> None:
    # The guard then tries again with the next request.
    with pytest.raises(RuntimeError):
        SnsNotifier(RecordingSns(), "").notify("subject", "message")
