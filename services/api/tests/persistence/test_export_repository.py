"""Reading a learner's rows for their copy of their data (6.19), against a real PostgreSQL."""

import datetime as dt
from uuid import UUID

import pytest

from konvami_api.persistence import export_repository
from konvami_api.persistence.export_repository import (
    EXPORTED,
    NOT_EXPORTED,
    SqlExportRepository,
)
from konvami_api.persistence.sql import SqlClient

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
NOW = dt.datetime(2026, 11, 6, 12, 0, tzinfo=dt.UTC)


def tables(db: SqlClient) -> set[str]:
    rows = db.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
    )
    return {row["table_name"] for row in rows}


def add_field(db: SqlClient, user: UUID, field: str, value: str) -> None:
    db.execute(
        "INSERT INTO app_user (id) VALUES (CAST(:user AS uuid)) ON CONFLICT (id) DO NOTHING",
        {"user": str(user)},
    )
    db.execute(
        "INSERT INTO profile_field (user_id, scope, field, value, source, updated_at) "
        "VALUES (CAST(:user AS uuid), 'global', :field, CAST(:value AS jsonb), 'asked', "
        "CAST(:at AS timestamptz))",
        {"user": str(user), "field": field, "value": value, "at": NOW.isoformat()},
    )


def test_every_table_is_either_part_of_the_copy_or_left_out_for_a_reason(db: SqlClient) -> None:
    """A feature that adds a table has to decide whether a learner's rows in it are theirs to
    take with them: this fails until the table is in `EXPORTED` or `NOT_EXPORTED`."""
    decided = {table.name for table in EXPORTED} | set(NOT_EXPORTED)

    assert tables(db) - decided == set()
    assert decided - tables(db) == set()
    assert not {table.name for table in EXPORTED} & set(NOT_EXPORTED)


def test_the_copy_holds_the_learners_rows_and_no_one_elses(db: SqlClient) -> None:
    add_field(db, USER, "target_language", '"de"')
    add_field(db, OTHER_USER, "target_language", '"fr"')

    rows = SqlExportRepository(db).rows(USER)

    assert [row["value"] for row in rows["profile_field"]] == ["de"]
    assert [row["id"] for row in rows["app_user"]] == [str(USER)]
    assert all(
        row.get("user_id", str(USER)) == str(USER) for table in rows.values() for row in table
    )


def test_every_exported_table_can_be_read(db: SqlClient) -> None:
    rows = SqlExportRepository(db).rows(USER)

    assert set(rows) == {table.name for table in EXPORTED}
    assert all(table == [] for table in rows.values())


def test_a_table_longer_than_a_page_is_read_whole_and_once(
    db: SqlClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(export_repository, "PAGE_SIZE", 2)
    for number in range(5):
        add_field(db, USER, f"field_{number}", str(number))

    fields = SqlExportRepository(db).rows(USER)["profile_field"]

    assert sorted(row["field"] for row in fields) == [f"field_{n}" for n in range(5)]


def test_the_rows_of_a_conversation_are_the_learners_through_the_conversation(
    db: SqlClient,
) -> None:
    for call_id, user in (("rtc_1", USER), ("rtc_2", OTHER_USER)):
        db.execute(
            "INSERT INTO app_user (id) VALUES (CAST(:user AS uuid)) ON CONFLICT (id) DO NOTHING",
            {"user": str(user)},
        )
        db.execute(
            "INSERT INTO voice_session (call_id, user_id, purpose, model, started_at) "
            "VALUES (:call, CAST(:user AS uuid), 'practice', 'm', CAST(:at AS timestamptz))",
            {"call": call_id, "user": str(user), "at": NOW.isoformat()},
        )
        db.execute(
            "INSERT INTO voice_turn (call_id, position, speaker, text) "
            "VALUES (:call, 0, 'learner', :text)",
            {"call": call_id, "text": f"hello from {call_id}"},
        )

    turns = SqlExportRepository(db).rows(USER)["voice_turn"]

    assert [turn["text"] for turn in turns] == ["hello from rtc_1"]


def test_a_phones_push_token_is_not_part_of_the_copy(db: SqlClient) -> None:
    add_field(db, USER, "target_language", '"de"')
    db.execute(
        "INSERT INTO push_device (token, user_id, platform, timezone, language, remind_at, "
        "registered_at) VALUES ('ExponentPushToken[secret]', CAST(:user AS uuid), 'ios', "
        "'Europe/Zurich', 'de', '18:00', CAST(:at AS timestamptz))",
        {"user": str(USER), "at": NOW.isoformat()},
    )

    (device,) = SqlExportRepository(db).rows(USER)["push_device"]

    assert device["platform"] == "ios"
    assert "token" not in device


def test_archives_are_counted_for_a_learner_who_has_stored_nothing_yet(db: SqlClient) -> None:
    records = SqlExportRepository(db)
    first = UUID("aaaaaaaa-aaaa-4aaa-8aaa-000000000001")
    second = UUID("aaaaaaaa-aaaa-4aaa-8aaa-000000000002")
    records.record(first, USER, NOW)
    records.record(second, USER, NOW - dt.timedelta(days=2))

    assert records.made_since(USER, NOW - dt.timedelta(days=1)) == 1
    assert records.made_since(OTHER_USER, NOW - dt.timedelta(days=1)) == 0
    assert {row["id"] for row in records.rows(USER)["data_export"]} == {str(first), str(second)}
