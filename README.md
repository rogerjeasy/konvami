# Konvami

Konvami is a voice-first language partner for iOS and Android. Learners hold live spoken conversations with AI partners (personas they can shape themselves), then get a written report of their mistakes, flashcards from what they choose to keep, and a weekly plan built around their goals. The name joins German _Konversation_ and French _ami_.

The repository holds the Expo / React Native app, a Python FastAPI backend on AWS Lambda, a small static site for the privacy policy, shared packages and the Terraform infrastructure.

## Status

In active development and running in a development AWS environment. It is not published on the App Store or Google Play. German is the only target language available so far; the app's interface is in English, German, French and Italian.

Built (see `docs/design/README.md` for a per-screen record, including where the app differs from the design and why):

- First launch, account creation with email and password (Amazon Cognito, emailed code), sign-in, password reset, age check, AI data consent, account deletion
- Onboarding: a spoken or form-based intake, a spoken placement test with an assessed level, and generated starter partners
- Live voice conversations through the OpenAI Realtime API over WebRTC, joined from the server by a call worker that runs the partner's tools and the time limit
- Live correction chips during a call, a session plan from recent mistakes and due words, and a "Help" sheet
- Session reports written after each conversation, with each correction checked a second time; "Say it better" retries
- Recordings and transcripts library, flashcards with FSRS scheduling (answerable out loud), a grammar map, Ask-the-Tutor, eight German role-play scenarios
- A basic level engine, progress charts, a weekly plan (the "Learning Director"), and exam simulations for Goethe A1 to B2, telc B1 and the DTZ
- Partner memory (what partners remember about the learner, viewable and editable), Persona Studio, profile photo
- On-device reminders and server push through Expo's push service; per-learner voice minutes and cost controls

Not built yet: Sign in with Apple and Google, emailed sign-in links (need Amazon SES), subscriptions and trials (RevenueCat), ElevenLabs voices, pen-pal mode, and the phrasebook. Voice does not work in Expo Go because WebRTC is a native module; it needs a development or store build, or the web preview.

## Tech stack

- **Monorepo:** pnpm 12 workspaces and Turborepo, Node 24, TypeScript 6
- **Mobile (`apps/mobile`):** Expo SDK 57, Expo Router, NativeWind, Reanimated, i18next, `react-native-webrtc`, EAS Build
- **Backend (`services/api`):** Python 3.12, Poetry, FastAPI with Mangum on AWS Lambda; Ruff, mypy and pytest
- **AI:** OpenAI Realtime (voice calls), OpenAI text, transcription and speech models
- **Data and AWS:** Aurora Serverless v2 PostgreSQL through the RDS Data API, Cognito, S3, Secrets Manager, API Gateway HTTP API, EventBridge, CloudFront
- **Infrastructure:** Terraform (`infra/`)
- **Shared packages:** `@konvami/design-tokens` (colours, type, spacing, motion, logo geometry) and `@konvami/api-client` (TypeScript client generated from the API's OpenAPI schema)

## Project structure

```
apps/
  mobile/         Expo app: routes in src/app, screen bodies in src/screens, shared UI in src/components
  site/           static privacy-policy site in four languages
services/
  api/            FastAPI backend: api/, domain/, persistence/ (SQL migrations), providers/, worker.py
packages/
  design-tokens/  single source of design values
  api-client/     generated OpenAPI client
infra/
  envs/dev/       the dev environment
  modules/        budget, auth, database, secret, media, api, site
design/brand/     logo and brand assets
docs/
  superpowers/specs/  product spec and per-feature design notes
  design/             design canvas index and local copy
  evals/              transcription fidelity evaluations
```

`AGENTS.md` and `apps/mobile/AGENTS.md` hold the engineering and UI rules.

## Getting started

### Prerequisites

- Node.js 24 (see `.nvmrc`) and pnpm 12
- Python 3.12 and Poetry, for the backend
- Xcode or Android Studio for a native development build, or use the web preview
- Terraform and AWS access, only to deploy the backend

### Install

```bash
pnpm install
cd services/api && poetry install
```

### Run the app

```bash
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @konvami/mobile dev        # Expo dev server
pnpm --filter @konvami/mobile web        # web preview in the browser
pnpm --filter @konvami/mobile ios        # native development build (also: android)
```

The first-launch screens work without configuration. Signing in and everything after it need a deployed backend. The app's settings are public identifiers, never secrets:

| Variable                                                | Purpose                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                                   | The API Gateway address                                                |
| `EXPO_PUBLIC_AUTH_REGION`, `EXPO_PUBLIC_AUTH_CLIENT_ID` | The Cognito user pool's region and app client                          |
| `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL`      | Legal pages (`{lang}` is replaced by the app language)                 |
| `APPLE_TEAM_ID`                                         | Only for `pnpm --filter @konvami/mobile device:ios` on your own iPhone |

After a Terraform apply, `terraform output -raw mobile_env` in `infra/envs/dev` prints the values for `apps/mobile/.env`.

### Backend

The backend reads its configuration (database cluster, user pool, media bucket, OpenAI key secret, voice and text model settings) from environment variables that Terraform sets on the Lambda functions; see `services/api/src/konvami_api/settings.py`. The OpenAI API key is stored in AWS Secrets Manager and never in the app. `services/api/README.md` describes the layers and rules of the service.

## Tests and checks

```bash
pnpm lint
pnpm typecheck
pnpm test                 # Jest (mobile) and Vitest (packages, site)
pnpm format:check
pnpm check:secrets        # fails if a secret or env file is tracked

cd services/api
poetry run pytest         # starts an embedded PostgreSQL, no Docker needed
poetry run ruff check . && poetry run ruff format --check .
poetry run mypy
```

After changing the API, regenerate the schema and the TypeScript client with `pnpm api:generate`. CI fails when the committed client is stale.

GitHub Actions (`.github/workflows/ci.yml`) runs the secrets check, formatting, lint, typecheck and tests for the TypeScript workspace, the backend checks and the generated-client check, and `terraform fmt` and `terraform validate`.

## Deployment

Every AWS resource is managed by Terraform in `infra/`. The dev environment wires a cost budget, the Cognito user pool, the Aurora database, the OpenAI key secret, the media bucket, the API and call-worker Lambda functions (migrations run on every apply), and the privacy-policy site. Build the Lambda package before planning:

```bash
(cd services/api && poetry run python -m tools.build_lambda)
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars   # gitignored; fill in real values
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

`infra/README.md` describes each module. The privacy site is built with `pnpm --filter @konvami/site build`. Mobile builds use EAS (`apps/mobile/eas.json`).

## Documentation

- `docs/superpowers/specs/2026-10-06-language-companion-app-design.md`: the full product and system specification
- `docs/superpowers/specs/`: design notes per feature
- `docs/design/README.md`: screen-by-screen build status and deviations from the design
- `docs/evals/`: transcription fidelity evaluations
