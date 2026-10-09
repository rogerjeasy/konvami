import json

from tools.export_openapi import SCHEMA_FILE, schema


def test_the_committed_schema_matches_the_api() -> None:
    """The TypeScript client is generated from this file. If this fails, run `pnpm api:generate`."""
    assert json.loads(SCHEMA_FILE.read_text()) == schema()


def test_every_operation_has_a_name_for_the_generated_client() -> None:
    operations = [operation for path in schema()["paths"].values() for operation in path.values()]

    assert operations
    assert all(operation.get("operationId") for operation in operations)
