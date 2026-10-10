"""The one way the backend talks to PostgreSQL.

`SqlClient` is deliberately small so it fits the RDS Data API, which is stateless HTTP: one
statement per call, named `:parameters`, plain values in, a dict per row out. Repositories
therefore:

- cast in SQL instead of relying on driver types: `CAST(:id AS uuid)`, `CAST(:data AS jsonb)`,
  `CAST(:at AS timestamptz)`;
- select values in a form every driver returns alike: JSON as text (`CAST(value AS text)`) and
  times as whole microseconds (`epoch_micros(column)`);
- write `CAST(x AS type)` rather than `x::type`, and keep colons out of SQL text, so nothing can
  be mistaken for a `:parameter`;
- make each write one atomic statement, since there is no session to hold a transaction.
"""

import datetime as dt
from collections.abc import Mapping
from typing import Any, Protocol

type Param = str | int | float | bool | None


class SqlClient(Protocol):
    def execute(self, sql: str, params: Mapping[str, Param] | None = None) -> list[dict[str, Any]]:
        """Runs one statement and returns its rows (none for a statement without a result)."""


_EPOCH = dt.datetime(1970, 1, 1, tzinfo=dt.UTC)


def epoch_micros(column: str) -> str:
    """SQL for a timestamptz as microseconds since 1970 (PostgreSQL's own precision)."""
    return f"CAST(round(extract(epoch FROM {column}) * 1000000) AS bigint)"


def from_epoch_micros(micros: int) -> dt.datetime:
    return _EPOCH + dt.timedelta(microseconds=micros)
