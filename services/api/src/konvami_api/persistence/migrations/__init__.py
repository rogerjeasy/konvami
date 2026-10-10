"""Schema migrations: numbered `.sql` files in this folder, applied once each, in name order.

Rules for a migration file, because the Data API runs one statement per call and has no
transaction around a file:

- every statement ends with `;` at the end of a line, and no line inside a statement ends with
  one, except inside a function body between `$$` and `$$`;
- comments stand on their own lines (`-- ...`);
- statements can be run again safely (`IF NOT EXISTS`), so a migration that failed half-way can
  be fixed and re-run.
"""

from pathlib import Path

from konvami_api.domain.errors import ServiceUnavailable
from konvami_api.persistence.sql import SqlClient

MIGRATIONS_DIR = Path(__file__).parent


class MigrationError(Exception):
    def __init__(self, migration: str) -> None:
        super().__init__(f"Migration {migration} failed")
        self.migration = migration


# Opens and closes a function body, whose commands end with semicolons of their own.
_BODY_QUOTE = "$$"


def split_statements(sql: str) -> list[str]:
    lines = [line for line in sql.splitlines() if not line.strip().startswith("--")]
    statements: list[str] = []
    pending = ""
    for piece in "\n".join(lines).split(";\n"):
        pending = f"{pending};\n{piece}" if pending else piece
        # An odd number of quotes: the piece ended inside a function body.
        if pending.count(_BODY_QUOTE) % 2 == 0:
            statements.append(pending)
            pending = ""
    statements.append(pending)
    return [text for statement in statements if (text := statement.strip().removesuffix(";"))]


def migrate(client: SqlClient, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Applies the migrations that have not run yet and returns their names."""
    client.execute(
        "CREATE TABLE IF NOT EXISTS schema_migration ("
        "name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
    )
    done = {row["name"] for row in client.execute("SELECT name FROM schema_migration")}
    applied: list[str] = []
    for file in sorted(directory.glob("*.sql")):
        name = file.stem
        if name in done:
            continue
        try:
            for statement in split_statements(file.read_text() + "\n"):
                client.execute(statement)
        except Exception as error:
            raise MigrationError(name) from error
        client.execute("INSERT INTO schema_migration (name) VALUES (:name)", {"name": name})
        applied.append(name)
    return applied


def migrate_when_awake(
    client: SqlClient, attempts: int, directory: Path = MIGRATIONS_DIR
) -> list[str]:
    """`migrate`, for a deploy: a paused database gets `attempts` chances to wake up. Each
    chance already includes the client's own waiting.
    """
    for _ in range(attempts - 1):
        try:
            return migrate(client, directory)
        except ServiceUnavailable:
            continue
    return migrate(client, directory)
