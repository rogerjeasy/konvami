"""Crash reporting is off by default and never carries what a learner said (spec §6.21.4)."""

from uuid import UUID

from konvami_api import observability
from konvami_api.observability import DSN_VARIABLE, MAX_MESSAGE_LENGTH, USER_HASH_LENGTH

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("22222222-2222-4222-8222-222222222222")


def test_it_is_off_without_a_dsn() -> None:
    assert observability.options({}) is None
    assert observability.options({DSN_VARIABLE: ""}) is None
    assert observability.init({}) is False


def test_it_sends_no_personal_data_when_a_dsn_is_set() -> None:
    settings = observability.options({DSN_VARIABLE: "https://key@sentry.example/1"})

    assert settings is not None
    assert settings["dsn"] == "https://key@sentry.example/1"
    assert settings["environment"] == "dev"
    assert settings["send_default_pii"] is False
    assert settings["include_local_variables"] is False
    assert settings["max_breadcrumbs"] == 0
    assert settings["max_request_body_size"] == "never"
    assert settings["traces_sample_rate"] == 0
    assert settings["before_send"] is observability.scrub


def test_a_learner_is_known_only_by_a_stable_hash() -> None:
    first = observability.user_hash(USER)

    assert first == observability.user_hash(USER)
    assert first != observability.user_hash(OTHER)
    assert len(first) == USER_HASH_LENGTH
    assert str(USER) not in first


def test_an_event_loses_what_a_learner_said_or_wrote() -> None:
    event = {
        "request": {
            "url": "https://api.example/v1/tutor/questions",
            "method": "POST",
            "data": {"question": "Wie sage ich ..."},
            "headers": {"authorization": "Bearer secret"},
            "cookies": {"a": "b"},
            "query_string": "q=hallo",
        },
        "user": {"id": "abc", "email": "amara@example.com", "username": "Amara"},
        "breadcrumbs": [{"message": "Ich habe gestern ..."}],
        "extra": {"transcript": "Hallo"},
        "server_name": "ip-10-0-0-1",
        "exception": {
            "values": [
                {
                    "type": "ValidationError",
                    "value": "amara@example.com wrote: " + "x" * 500,
                    "stacktrace": {"frames": [{"function": "tutor", "vars": {"text": "Hallo"}}]},
                }
            ]
        },
    }

    scrubbed = observability.scrub(event)

    assert scrubbed is not None
    assert scrubbed["request"] == {
        "url": "https://api.example/v1/tutor/questions",
        "method": "POST",
    }
    assert scrubbed["user"] == {"id": "abc"}
    assert not {"breadcrumbs", "extra", "server_name"} & scrubbed.keys()
    value = scrubbed["exception"]["values"][0]
    assert "amara@example.com" not in value["value"]
    assert len(value["value"]) <= MAX_MESSAGE_LENGTH
    assert value["stacktrace"]["frames"] == [{"function": "tutor"}]
