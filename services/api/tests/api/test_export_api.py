"""The learner's copy of their data (6.19, spec §6.21.3)."""

import json
from datetime import UTC, datetime
from uuid import UUID

from konvami_api.domain.accounts import Account
from tests.api.conftest import OTHER_USER, USER, Call
from tests.fakes import FakeAccountDirectory, InMemoryExportRepository, InMemoryFileStore

EXPORT = "/v1/account/export"


def archive_of(files: InMemoryFileStore) -> dict[str, object]:
    (key,) = [key for key in files.files if key.startswith(f"exports/{USER}/")]
    return json.loads(files.files[key][0])  # type: ignore[no-any-return]


def test_the_export_writes_the_learners_data_and_says_where_to_read_it(
    call: Call, files: InMemoryFileStore, export_records: InMemoryExportRepository
) -> None:
    export_records.tables[UUID(USER)] = {
        "memory": [{"id": 1, "text": "Has a job interview"}],
        "voice_turn": [
            {"call_id": "rtc_1", "position": 0, "text": "Hallo", "audio_key": "users/x/a.wav"},
            {"call_id": "rtc_1", "position": 1, "text": "Hi", "audio_key": None},
        ],
    }
    export_records.tables[UUID(OTHER_USER)] = {"memory": [{"id": 2, "text": "Someone else"}]}

    response = call("POST", EXPORT)

    assert response.status == 200
    assert response.body["expiresInSeconds"] == 3600
    assert response.body["url"].startswith("https://")
    archive = archive_of(files)
    assert response.body["sizeBytes"] == len(files.files[files.keys()[-1]][0])
    assert archive["format"] == "konvami-export/1"
    assert archive["account"] == {
        "first_name": "Amara",
        "language": "fr",
        "ai_consent_for_voice": True,
    }
    data = archive["data"]
    assert isinstance(data, dict)
    assert data["memory"] == [{"id": 1, "text": "Has a job interview"}]


def test_a_recording_is_a_link_in_the_archive_not_a_key_of_the_bucket(
    call: Call, files: InMemoryFileStore, export_records: InMemoryExportRepository
) -> None:
    export_records.tables[UUID(USER)] = {
        "voice_turn": [
            {"call_id": "rtc_1", "position": 0, "text": "Hallo", "audio_key": "users/x/a.wav"},
            {"call_id": "rtc_1", "position": 1, "text": "Hi", "audio_key": None},
        ]
    }

    call("POST", EXPORT)

    turns = archive_of(files)["data"]["voice_turn"]  # type: ignore[index]
    assert "audio_key" not in turns[0]
    assert turns[0]["audio_url"].endswith("users/x/a.wav?expires=3600")
    assert turns[1]["audio_url"] is None


def test_a_learner_can_make_three_archives_a_day(
    call: Call, export_records: InMemoryExportRepository
) -> None:
    for _ in range(3):
        assert call("POST", EXPORT).status == 200

    refused = call("POST", EXPORT)

    assert refused.status == 429
    assert refused.body == {"error": {"code": "export_limit", "field": None}}
    assert len(export_records.made) == 3


def test_the_limit_is_per_learner_and_per_day(
    call: Call, export_records: InMemoryExportRepository
) -> None:
    # Yesterday's archives and someone else's do not count.
    long_ago = datetime(2026, 10, 7, 12, 0, tzinfo=UTC)
    export_records.made += [(UUID(USER), long_ago)] * 3 + [
        (UUID(OTHER_USER), datetime.now(UTC))
    ] * 3

    assert call("POST", EXPORT).status == 200


def test_the_export_needs_a_signed_in_user(call: Call) -> None:
    assert call("POST", EXPORT, subject=None).status == 401


def test_deleting_the_account_deletes_its_archives(call: Call, files: InMemoryFileStore) -> None:
    call("POST", EXPORT)
    assert any(key.startswith(f"exports/{USER}/") for key in files.files)

    call("DELETE", "/v1/account")

    assert files.keys() == []


def test_the_learners_email_address_is_in_their_own_copy(
    call: Call, files: InMemoryFileStore, directory: FakeAccountDirectory
) -> None:
    directory.accounts[UUID(USER)] = Account(
        "Amara", "fr", voice_consent=True, email="amara.diallo@mail.com"
    )

    call("POST", EXPORT)

    account = archive_of(files)["account"]
    assert account["email"] == "amara.diallo@mail.com"  # type: ignore[index]
