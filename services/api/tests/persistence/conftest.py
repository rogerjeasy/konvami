from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from pixeltable_pgserver.postgres_server import get_server

from konvami_api.persistence.migrations import migrate
from konvami_api.persistence.sql import SqlClient
from tests.persistence.pg import LocalSqlClient


@pytest.fixture(scope="session")
def postgres_uri(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """One embedded PostgreSQL server for the whole test run."""
    data: Path = tmp_path_factory.mktemp("pgdata")
    server = get_server(data, cleanup_mode="delete")
    yield server.get_uri()
    server.cleanup()


@pytest.fixture
def empty_db(postgres_uri: str) -> Iterator[SqlClient]:
    """A client on a fresh, empty schema that disappears after the test."""
    schema = f"test_{uuid4().hex}"
    with psycopg.connect(postgres_uri, autocommit=True) as connection:
        connection.execute(f'CREATE SCHEMA "{schema}"')
        connection.execute(f'SET search_path TO "{schema}"')
        yield LocalSqlClient(connection)
        connection.execute(f'DROP SCHEMA "{schema}" CASCADE')


@pytest.fixture
def db(empty_db: SqlClient) -> SqlClient:
    """A client on a schema with every migration applied."""
    migrate(empty_db)
    return empty_db
