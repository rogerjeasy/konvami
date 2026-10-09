"""Writes the API's OpenAPI schema to packages/api-client, where TypeScript types are generated
from it (spec §10.2: one source of truth for Python and TypeScript).

    poetry run python -m tools.export_openapi        # or, from the repo root: pnpm api:generate
"""

import json
from pathlib import Path
from typing import Any, cast

from konvami_api.api.app import Services, create_app

SCHEMA_FILE = Path(__file__).resolve().parents[3] / "packages" / "api-client" / "openapi.json"


def schema() -> dict[str, Any]:
    # The schema depends on the routes and models only; no service is ever called.
    return create_app(cast(Services, None)).openapi()


if __name__ == "__main__":
    SCHEMA_FILE.write_text(json.dumps(schema(), indent=2, sort_keys=True) + "\n")
    print(f"Wrote {SCHEMA_FILE.name}")  # noqa: T201 - a command-line tool
