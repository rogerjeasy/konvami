from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest

from konvami_api.domain.errors import ServiceUnavailable
from konvami_api.persistence.migrations import (
    MigrationError,
    migrate,
    migrate_when_awake,
    split_statements,
)
from konvami_api.persistence.sql import Param, SqlClient


def tables(db: SqlClient) -> set[str]:
    rows = db.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
    )
    return {row["table_name"] for row in rows}


def test_migrating_an_empty_database_creates_the_tables(empty_db: SqlClient) -> None:
    applied = migrate(empty_db)

    assert applied[0] == "0001_profile"
    assert applied == [
        "0001_profile",
        "0002_voice",
        "0003_placement",
        "0004_personas",
        "0005_conversations",
        "0006_profile",
        "0007_account_safety",
        "0008_deletion_lock",
        "0009_session_report",
        "0010_cards",
        "0011_memory",
        "0012_memory_permission",
        "0013_recordings",
        "0014_tutor",
    ]
    assert {
        "app_user",
        "profile_field",
        "profile_change",
        "onboarding",
        "voice_session",
        "voice_turn",
        "placement_result",
        "persona",
        "session_report",
        "card",
        "card_review",
        "memory",
        "memory_extraction",
    } <= tables(empty_db)


def test_migrating_again_applies_nothing(empty_db: SqlClient) -> None:
    migrate(empty_db)

    assert migrate(empty_db) == []


def test_only_new_migrations_are_applied_in_name_order(empty_db: SqlClient, tmp_path: Path) -> None:
    (tmp_path / "0002_second.sql").write_text("CREATE TABLE second (id int);")
    (tmp_path / "0001_first.sql").write_text("CREATE TABLE first (id int);")
    assert migrate(empty_db, tmp_path) == ["0001_first", "0002_second"]

    (tmp_path / "0003_third.sql").write_text(
        "CREATE TABLE third (id int);\nINSERT INTO third SELECT count(*) FROM first;"
    )

    assert migrate(empty_db, tmp_path) == ["0003_third"]
    assert empty_db.execute("SELECT id FROM third") == [{"id": 0}]


def test_a_failing_migration_is_not_recorded_and_stops_the_run(
    empty_db: SqlClient, tmp_path: Path
) -> None:
    (tmp_path / "0001_good.sql").write_text("CREATE TABLE good (id int);")
    (tmp_path / "0002_bad.sql").write_text("CREATE TABLE bad (id no_such_type);")
    (tmp_path / "0003_never.sql").write_text("CREATE TABLE never (id int);")

    with pytest.raises(MigrationError) as error:
        migrate(empty_db, tmp_path)

    assert error.value.migration == "0002_bad"
    assert "never" not in tables(empty_db)
    (tmp_path / "0002_bad.sql").write_text("CREATE TABLE bad (id int);")
    assert migrate(empty_db, tmp_path) == ["0002_bad", "0003_never"]


def test_a_file_is_split_into_single_statements() -> None:
    sql = """
        -- A comment with a semicolon; it is not a statement.
        CREATE TABLE a (id int);

        CREATE INDEX a_idx
            ON a (id);
    """

    assert split_statements(sql) == [
        "CREATE TABLE a (id int)",
        "CREATE INDEX a_idx\n            ON a (id)",
    ]


class SleepyClient:
    """Answers "still waking up" a number of times before passing statements on."""

    def __init__(self, inner: SqlClient, asleep_for: int) -> None:
        self._inner = inner
        self.remaining = asleep_for

    def execute(self, sql: str, params: Mapping[str, Param] | None = None) -> list[dict[str, Any]]:
        if self.remaining > 0:
            self.remaining -= 1
            raise ServiceUnavailable("waking_up", 5)
        return self._inner.execute(sql, params)


def test_a_deploy_waits_for_a_paused_database(empty_db: SqlClient) -> None:
    applied = migrate_when_awake(SleepyClient(empty_db, asleep_for=2), attempts=3)

    assert applied[0] == "0001_profile"


def test_a_deploy_gives_up_on_a_database_that_never_wakes(empty_db: SqlClient) -> None:
    with pytest.raises(ServiceUnavailable):
        migrate_when_awake(SleepyClient(empty_db, asleep_for=3), attempts=3)

    assert "app_user" not in tables(empty_db)


def test_a_function_body_stays_one_statement() -> None:
    sql = """
        CREATE TABLE a (id int);

        CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            NEW.id = NEW.id + 1;
            RETURN NEW;
        END
        $$;

        CREATE TRIGGER a_bump BEFORE INSERT ON a FOR EACH ROW EXECUTE FUNCTION bump();
    """

    statements = split_statements(sql)

    assert len(statements) == 3
    assert statements[1].startswith("CREATE FUNCTION bump()")
    assert statements[1].endswith("$$")
    assert "RETURN NEW;" in statements[1]


def test_a_migration_with_a_function_can_be_applied(empty_db: SqlClient, tmp_path: Path) -> None:
    (tmp_path / "0001_bump.sql").write_text(
        "CREATE TABLE a (id int);\n\n"
        "CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$\n"
        "BEGIN\n    NEW.id = NEW.id + 1;\n    RETURN NEW;\nEND\n$$;\n\n"
        "CREATE TRIGGER a_bump BEFORE INSERT ON a FOR EACH ROW EXECUTE FUNCTION bump();\n"
    )

    migrate(empty_db, tmp_path)
    empty_db.execute("INSERT INTO a (id) VALUES (1)")

    assert empty_db.execute("SELECT id FROM a") == [{"id": 2}]
