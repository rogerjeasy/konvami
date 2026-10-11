# Konvami API

The backend of the app: FastAPI on AWS Lambda, PostgreSQL through the RDS Data API. Deployed by
Terraform (`infra/modules/api`). Design: `docs/superpowers/specs/2026-10-09-onboarding-design.md`
(onboarding), `2026-10-10-home-design.md` (practice conversations, the library, Today) and
`2026-10-10-profile-design.md` (the photo, account deletion, Persona Studio, voice samples).
Memory (product spec §6.11) is `domain/memories.py`: written down by the call worker after a
conversation's report, told to the partner before the next call, and read, changed and deleted
by the learner through `/v1/memories`.

## Layers

| Folder (`src/konvami_api/`) | Holds                                                             | May import       |
| --------------------------- | ----------------------------------------------------------------- | ---------------- |
| `api/`                      | HTTP handlers, request and response models, the one error shape   | `domain`         |
| `domain/`                   | Rules: profile, accounts, personas, practice, memories, home, …   | nothing above it |
| `persistence/`              | Repositories on PostgreSQL, the Data API client, SQL migrations   | `domain`         |
| `providers/`                | OpenAI (calls, text, speech), Cognito accounts, S3 files, AWS     | `domain`         |
| `worker.py`                 | The loop that follows a live voice call from the server           | `domain`         |
| `main.py`                   | Lambda entry points: builds everything from environment variables | all of them      |

Product logic never imports a vendor SDK; providers sit behind interfaces (spec §15).

## Commands

```bash
poetry install                              # once; Python 3.12
poetry run pytest                           # tests (starts an embedded PostgreSQL, no Docker)
poetry run ruff check . && poetry run ruff format --check .
poetry run mypy
poetry run python -m tools.build_lambda     # the Lambda package, into dist/lambda/
pnpm api:generate                           # from the repo root: schema + TypeScript client
```

## Rules of this service

- **Test first.** Domain rules and handlers are tested against in-memory repositories; the same
  contract tests run those repositories and the PostgreSQL ones (`tests/persistence`).
- **One statement per write.** The Data API has no session, so a repository write is a single
  atomic SQL statement, and SQL casts explicitly (`persistence/sql.py` explains why).
- **Migrations** are numbered `.sql` files that can be run again safely
  (`persistence/migrations/__init__.py` lists the rules). Terraform runs them on every deploy.
- **API changes** go through `pnpm api:generate`; CI fails when the committed schema is stale.
- **Dependencies** must be at least 7 days old (`poetry.toml`), like the pnpm workspace.
- **Errors** leave the server as `{ "error": { "code", "field" } }` and nothing else.
