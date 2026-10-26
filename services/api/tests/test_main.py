"""The Lambda entry point: settings from the environment, wired to the real Data API client."""

import json
from collections.abc import Iterator
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import ANY, Stubber

from konvami_api import main
from konvami_api.providers.s3_store import s3_client
from tests.api.conftest import USER, http_api_event

ENVIRONMENT = {
    "KONVAMI_DB_CLUSTER_ARN": "arn:aws:rds:eu-central-1:503002144480:cluster:kv-dev-db",
    "KONVAMI_DB_SECRET_ARN": "arn:aws:secretsmanager:eu-central-1:503002144480:secret:rds!x",
    "KONVAMI_DB_NAME": "konvami",
    "KONVAMI_MEDIA_BUCKET": "kv-dev-media-503002144480",
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


def clients(stub: Stubber, s3: Any = None) -> main.Clients:
    return main.Clients(
        rds_data=stub.client,
        cognito=Unused(),
        functions=Unused(),
        secrets=Unused(),
        s3=s3 or Unused(),
        sns=Unused(),
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
    # Before anything is changed for a caller: was their account deleted? (It was not.)
    stub.add_response(
        "execute_statement",
        {"formattedRecords": "[]"},
        {
            "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
            "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
            "database": "konvami",
            "sql": ANY,
            "parameters": [{"name": "user_id", "value": {"stringValue": USER}}],
            "formatRecordsAs": "JSON",
        },
    )

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


def test_a_photo_is_read_from_the_configured_bucket(stub: Stubber) -> None:
    key = f"users/{USER}/picture/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.jpg"
    stub.add_response(
        "execute_statement",
        {"formattedRecords": json.dumps([{"picture_key": key}])},
        {
            "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
            "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
            "database": "konvami",
            "sql": ANY,
            "parameters": [{"name": "user_id", "value": {"stringValue": USER}}],
            "formatRecordsAs": "JSON",
        },
    )
    # Signing an address needs credentials but no request to S3.
    s3 = s3_client(
        region_name="eu-central-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",  # noqa: S106
    )
    handler = main.build_handler(ENVIRONMENT, clients(stub, s3), sleep=lambda _: None)

    result = handler(http_api_event("GET", "/v1/account", None, USER), None)  # type: ignore[arg-type]

    assert result["statusCode"] == 200
    address: str = json.loads(result["body"])["picture"]["url"]
    assert address.startswith(
        f"https://kv-dev-media-503002144480.s3.eu-central-1.amazonaws.com/{key}?"
    )


def test_a_partner_can_be_drafted_and_a_voice_sampled_with_the_configured_models(
    stub: Stubber,
) -> None:
    """The entry point builds the studio's services; here only that their routes answer."""
    handler = main.build_handler(ENVIRONMENT, clients(stub), sleep=lambda _: None)
    stub.add_response(
        "execute_statement",
        {"formattedRecords": "[]"},
        {
            "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
            "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
            "database": "konvami",
            "sql": ANY,
            "parameters": [{"name": "user_id", "value": {"stringValue": USER}}],
            "formatRecordsAs": "JSON",
        },
    )

    # A learner without a language yet: the profile is read, and no model or bucket is asked.
    result = handler(http_api_event("GET", "/v1/voices/coral/sample", None, USER), None)  # type: ignore[arg-type]

    assert result["statusCode"] == 409
    assert json.loads(result["body"]) == {"error": {"code": "no_language", "field": None}}
    stub.assert_no_pending_responses()


def test_the_worker_writes_a_report_when_that_is_what_it_is_started_for(stub: Stubber) -> None:
    """The same function follows calls and writes reports. Asked for a report, it looks the
    call up in the database (here: no such call), for the verbatim pass, the report and the
    level, and never reaches for the voice provider."""
    backend = main.build_backend(ENVIRONMENT, clients(stub), sleep=lambda _: None)
    for _ in range(4):
        stub.add_response(
            "execute_statement",
            {"formattedRecords": "[]"},
            {
                "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
                "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
                "database": "konvami",
                "sql": ANY,
                "parameters": [{"name": "call_id", "value": {"stringValue": "rtc_ghost"}}],
                "formatRecordsAs": "JSON",
            },
        )

    main.run_worker(backend, {"report": "rtc_ghost"})

    stub.assert_no_pending_responses()


def test_the_worker_fills_in_new_cards_when_that_is_what_it_is_started_for(stub: Stubber) -> None:
    """Asked to fill in a learner's cards, it reads their language and claims their cards (here:
    none), and asks no model."""
    with_cards = {
        **ENVIRONMENT,
        "KONVAMI_TEXT_MODELS": json.dumps(
            {"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna", "cards": "gpt-6.1-sol"}
        ),
    }
    backend = main.build_backend(with_cards, clients(stub), sleep=lambda _: None)
    for _ in range(2):
        stub.add_response("execute_statement", {"formattedRecords": "[]"})

    main.run_worker(backend, {"card_details": USER})

    stub.assert_no_pending_responses()


def test_the_worker_writes_a_weekly_check_in_when_that_is_what_it_is_started_for(
    stub: Stubber,
) -> None:
    """Asked to write a learner's check-in, it reads their profile and the check-in (here: none
    is waiting), and asks no model."""
    backend = main.build_backend(ENVIRONMENT, clients(stub), sleep=lambda _: None)
    for _ in range(2):
        stub.add_response("execute_statement", {"formattedRecords": "[]"})

    main.run_worker(backend, {"week_review": USER, "week": "2026-10-05"})

    stub.assert_no_pending_responses()


def test_the_worker_scores_an_exam_simulation_when_that_is_what_it_is_started_for(
    stub: Stubber,
) -> None:
    """Asked to score a simulation, it reads the call (here: none), and asks no model."""
    backend = main.build_backend(ENVIRONMENT, clients(stub), sleep=lambda _: None)
    stub.add_response("execute_statement", {"formattedRecords": "[]"})

    main.run_worker(backend, {"exam": "rtc_ghost"})

    stub.assert_no_pending_responses()


def test_the_worker_nudges_quiet_learners_when_the_schedule_starts_it(stub: Stubber) -> None:
    """Started by the hourly schedule, it reads the registered phones (here: none) and sends
    nothing."""
    backend = main.build_backend(ENVIRONMENT, clients(stub), sleep=lambda _: None)
    stub.add_response("execute_statement", {"formattedRecords": "[]"})

    main.run_worker(backend, {"nudges": True})

    stub.assert_no_pending_responses()


def test_a_report_is_read_from_the_database(stub: Stubber) -> None:
    """The entry point builds the report service; here only that its route answers."""
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
                {"name": "call_id", "value": {"stringValue": "rtc_ghost"}},
            ],
            "formatRecordsAs": "JSON",
        },
    )

    result = invoke(stub, "GET", "/v1/conversations/rtc_ghost/report")

    assert result["statusCode"] == 404
    stub.assert_no_pending_responses()


def test_the_deck_is_read_from_the_database(stub: Stubber) -> None:
    """The entry point builds the card service; here only that its route answers."""
    statement = {
        "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
        "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
        "database": "konvami",
        "sql": ANY,
        "parameters": ANY,
        "formatRecordsAs": "JSON",
    }
    # The learner's language, their cards, and how many there are.
    stub.add_response("execute_statement", {"formattedRecords": "[]"}, statement)
    stub.add_response("execute_statement", {"formattedRecords": "[]"}, statement)
    stub.add_response(
        "execute_statement", {"formattedRecords": '[{"total": 0, "due": 0}]'}, statement
    )

    result = invoke(stub, "GET", "/v1/cards")

    assert result["statusCode"] == 200
    assert json.loads(result["body"]) == {"cards": [], "next": None, "total": 0, "due": 0}
    stub.assert_no_pending_responses()


WITH_MEMORY = {
    **ENVIRONMENT,
    "KONVAMI_TEXT_MODELS": json.dumps(
        {"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna", "memory": "gpt-6-luna"}
    ),
}
CALL_LOOKUP = {
    "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
    "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
    "database": "konvami",
    "sql": ANY,
    "parameters": [{"name": "call_id", "value": {"stringValue": "rtc_ghost"}}],
    "formatRecordsAs": "JSON",
}


def test_after_the_report_the_worker_writes_down_what_the_conversation_told(stub: Stubber) -> None:
    """Every job looks the call up in the database (here: no such call), one after the other:
    the verbatim pass, the words used, the report, the level, the memories."""
    backend = main.build_backend(WITH_MEMORY, clients(stub), sleep=lambda _: None)
    for _ in range(5):
        stub.add_response("execute_statement", {"formattedRecords": "[]"}, CALL_LOOKUP)

    main.run_worker(backend, {"report": "rtc_ghost"})

    stub.assert_no_pending_responses()


def test_a_report_that_cannot_be_written_does_not_cost_the_memories(stub: Stubber) -> None:
    """Spec §12.2: a failure in one step does not block the others."""
    backend = main.build_backend(WITH_MEMORY, clients(stub), sleep=lambda _: None)
    for _ in range(2):
        stub.add_response("execute_statement", {"formattedRecords": "[]"}, CALL_LOOKUP)
    stub.add_client_error("execute_statement", service_error_code="InternalServerErrorException")
    for _ in range(2):
        stub.add_response("execute_statement", {"formattedRecords": "[]"}, CALL_LOOKUP)

    with pytest.raises(ClientError):
        main.run_worker(backend, {"report": "rtc_ghost"})

    stub.assert_no_pending_responses()


def test_a_verbatim_pass_that_fails_does_not_cost_the_report(stub: Stubber) -> None:
    backend = main.build_backend(WITH_MEMORY, clients(stub), sleep=lambda _: None)
    stub.add_client_error("execute_statement", service_error_code="InternalServerErrorException")
    for _ in range(4):
        stub.add_response("execute_statement", {"formattedRecords": "[]"}, CALL_LOOKUP)

    with pytest.raises(ClientError):
        main.run_worker(backend, {"report": "rtc_ghost"})

    stub.assert_no_pending_responses()


def test_what_partners_know_is_read_from_the_database(stub: Stubber) -> None:
    """The entry point builds the memory service; here only that its route answers."""
    statement = {
        "resourceArn": ENVIRONMENT["KONVAMI_DB_CLUSTER_ARN"],
        "secretArn": ENVIRONMENT["KONVAMI_DB_SECRET_ARN"],
        "database": "konvami",
        "sql": ANY,
        "parameters": ANY,
        "formatRecordsAs": "JSON",
    }
    # The learner's settings and their memories. Their partners are not read: no memory names
    # one.
    for _ in range(2):
        stub.add_response("execute_statement", {"formattedRecords": "[]"}, statement)

    result = invoke(stub, "GET", "/v1/memories")

    assert result["statusCode"] == 200
    assert json.loads(result["body"]) == {"enabled": True, "avoidTopics": [], "memories": []}
    stub.assert_no_pending_responses()
