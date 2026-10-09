"""A `SqlClient` on a local PostgreSQL, so SQL is tested for real without AWS.

It accepts the same `:name` placeholders and plain parameter values as the Data API client and
returns rows the same way (a dict per row), so the repositories cannot tell the two apart.
"""

import re
from collections.abc import Mapping
from typing import Any

import psycopg
from psycopg.rows import dict_row

from konvami_api.persistence.sql import Param

# `:name`, but not the second colon of a `::type` cast.
_PLACEHOLDER = re.compile(r"(?<!:):([a-z_][a-z0-9_]*)")


class LocalSqlClient:
    def __init__(self, connection: psycopg.Connection[Any]) -> None:
        self._connection = connection

    def execute(self, sql: str, params: Mapping[str, Param] | None = None) -> list[dict[str, Any]]:
        # A literal % would otherwise be read as a psycopg placeholder.
        query = _PLACEHOLDER.sub(r"%(\1)s", sql.replace("%", "%%"))
        with self._connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query.encode(), dict(params or {}))
            return cursor.fetchall() if cursor.description else []
