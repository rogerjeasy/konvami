from collections.abc import Iterator
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import Stubber

from konvami_api.persistence.data_api import DataApiClient, DatabaseWakingUp

CLUSTER = "arn:aws:rds:eu-central-1:503002144480:cluster:kv-dev-db"
SECRET = "arn:aws:secretsmanager:eu-central-1:503002144480:secret:rds!cluster-abc"  # noqa: S105
SQL = "SELECT field FROM profile_field WHERE user_id = CAST(:user_id AS uuid)"


def request(sql: str, parameters: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "resourceArn": CLUSTER,
        "secretArn": SECRET,
        "database": "konvami",
        "sql": sql,
        "parameters": parameters,
        "formatRecordsAs": "JSON",
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
        stubber.assert_no_pending_responses()


@pytest.fixture
def sleeps() -> list[float]:
    return []


@pytest.fixture
def client(stub: Stubber, sleeps: list[float]) -> DataApiClient:
    return DataApiClient(
        stub.client, cluster_arn=CLUSTER, secret_arn=SECRET, database="konvami", sleep=sleeps.append
    )


def test_rows_come_back_as_one_dict_each(client: DataApiClient, stub: Stubber) -> None:
    stub.add_response(
        "execute_statement",
        {
            "numberOfRecordsUpdated": 0,
            "formattedRecords": (
                '[{"field":"goals","updated_at":1791547200123456},'
                '{"field":"exam","updated_at":null}]'
            ),
        },
        request(SQL, [{"name": "user_id", "value": {"stringValue": "u-1"}}]),
    )

    assert client.execute(SQL, {"user_id": "u-1"}) == [
        {"field": "goals", "updated_at": 1791547200123456},
        {"field": "exam", "updated_at": None},
    ]


def test_each_kind_of_value_is_sent_in_its_data_api_form(
    client: DataApiClient, stub: Stubber
) -> None:
    stub.add_response(
        "execute_statement",
        {"numberOfRecordsUpdated": 1, "generatedFields": []},
        request(
            "UPDATE t SET a = :text, b = :whole, c = :real, d = :flag, e = :nothing",
            [
                {"name": "text", "value": {"stringValue": "Grüezi"}},
                {"name": "whole", "value": {"longValue": 7}},
                {"name": "real", "value": {"doubleValue": 0.5}},
                {"name": "flag", "value": {"booleanValue": True}},
                {"name": "nothing", "value": {"isNull": True}},
            ],
        ),
    )

    rows = client.execute(
        "UPDATE t SET a = :text, b = :whole, c = :real, d = :flag, e = :nothing",
        {"text": "Grüezi", "whole": 7, "real": 0.5, "flag": True, "nothing": None},
    )

    assert rows == []


def test_a_paused_database_is_retried_until_it_has_woken_up(
    client: DataApiClient, stub: Stubber, sleeps: list[float]
) -> None:
    for _ in range(3):
        stub.add_client_error(
            "execute_statement",
            service_error_code="DatabaseResumingException",
            service_message="The Aurora DB instance is resuming after being auto-paused.",
            http_status_code=400,
        )
    stub.add_response(
        "execute_statement", {"formattedRecords": '[{"n":1}]'}, request("SELECT 1 AS n", [])
    )

    assert client.execute("SELECT 1 AS n") == [{"n": 1}]
    assert sleeps == [1, 2, 2]


def test_a_database_that_stays_asleep_is_reported_as_waking_up(
    client: DataApiClient, stub: Stubber, sleeps: list[float]
) -> None:
    for _ in range(9):
        stub.add_client_error(
            "execute_statement",
            service_error_code="DatabaseResumingException",
            http_status_code=400,
        )

    with pytest.raises(DatabaseWakingUp):
        client.execute("SELECT 1 AS n")

    # The waits stay under API Gateway's 30-second limit for one request.
    assert sleeps == [1, 2, 2, 3, 3, 3, 3, 3]


def test_any_other_failure_is_not_retried(
    client: DataApiClient, stub: Stubber, sleeps: list[float]
) -> None:
    stub.add_client_error(
        "execute_statement", service_error_code="DatabaseErrorException", http_status_code=400
    )

    with pytest.raises(ClientError):
        client.execute("SELECT nonsense")

    assert sleeps == []
