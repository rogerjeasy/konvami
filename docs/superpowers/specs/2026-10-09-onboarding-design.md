# Konvami — Section 4 · Onboarding (design)

> **Status:** Approved in conversation on 2026-10-09; this file is the written version.
> **Scope:** The whole onboarding of the parent spec §6.1.1: the essential questions by voice (with
> Mia, the setup guide) or by form, the voice placement test, starter personas, on a real backend.
> **Parent spec:** `2026-10-06-language-companion-app-design.md` (§6.1, §6.2, §6.20, §8, §9, §10,
> §11, §12.6, §17; decisions D1–D3, D6, D7, D10, D17, D18).
> **Design source:** none. The canvas stops at section 3, so these screens are built directly in the
> visual language of sections 1–3 and reviewed in the running app (decided 2026-10-09).

---

## 1. Goal and success criteria

After **2.7 All set**, a new user tells Konvami what they need (speaking with Mia, or tapping
through a form), takes or postpones the placement test, chooses starter partners and enters the app.

Done means:

1. Every answer is stored in the Learner Configuration Profile in the database, with its source and
   time, through the API. No sample data stands in for a real value.
2. Closing and reopening the app resumes at the step the user had reached.
3. Speaking and tapping are interchangeable: the user can switch at any question, and nobody has to
   talk to set up the app (§6.1.1 step 7).
4. The OpenAI key never leaves the backend; persona instructions and tools are owned by the server.
5. Typecheck, lint, tests and `terraform validate` pass; screens pass the visual check of AGENTS.md
   rule 2.6 in English, German, French and Italian, light and dark.

## 2. Decisions

| # | Decision | Reason |
| --- | --- | --- |
| O1 | **Aurora Serverless v2 PostgreSQL 18** (pgvector available), pausing to zero, reached through the **RDS Data API** | Your choice. PostgreSQL as in §10.2, without a VPC-attached Lambda or a NAT. Costs about $1–5 a month in dev |
| O2 | **Sideband on Lambda**, not Fargate, for onboarding and placement calls | These calls are capped below Lambda's 15 minutes. Nothing runs, or costs, between calls. Practice sessions will need Fargate later |
| O3 | **Lambda zip packages**, not container images | No Docker or image registry needed. The Terraform module can change packaging later |
| O4 | **Avatars are drawn in code** from a small config of parts and colors | The painterly style of D17 needs a character artist (§21.3). The stored `AvatarConfig` is renderer-neutral, so a Rive renderer can replace the drawing |
| O5 | **Voice needs a development build on phones** (`react-native-webrtc`); the web preview uses the browser's WebRTC | §10.2 already says so. In Expo Go the voice screen offers the form |
| O6 | **One profile row per field**, with `source` and `updated_at`, plus a change log | Matches §11.2 (per-field source, history for undo) and the `update_profile(field, value)` tool of §8.4 |
| O7 | **The consent record stays on the Cognito account** for now; the backend reads it there before creating a voice call | Moving it is its own change; the check itself must be server-side (Apple 5.1.2(i)) |
| O8 | **Voice model per stage is configuration.** The spoken setup and the placement test both run on the flagship model | §17.3 lever 2 routes by measured quality. On the same scripted setup conversation (2026-10-09), the efficient model saved the right answers but narrated its saving and blurred questions; the flagship did neither. A Terraform variable, so it can change without code |

## 3. Architecture

```
app ── HTTPS + Cognito access token ──► API Gateway (JWT check) ──► Lambda: FastAPI
 │                                                                    │  profile · onboarding · catalog
 │  WebRTC offer ─► POST /v1/voice/calls ─────────────────────────────┤  call broker ─► OpenAI Realtime
 │  ◄─ answer                                                         │        │ starts
 │                                                                    │        ▼
 └── audio, directly ◄──────────────► OpenAI Realtime ◄── WebSocket ── Lambda: sideband worker
                                                                      │  runs tools, stores turns,
                                                                      │  meters usage, ends at the cap
                                                         Aurora PostgreSQL (Data API) ◄── all of them
```

**Backend (`services/api`, Python 3.12, Poetry, FastAPI, Pydantic v2, Ruff, mypy, pytest):**

- `api/`: HTTP handlers and request/response models only.
- `domain/`: the profile field registry and validation, onboarding stages, placement, personas.
- `providers/`: interfaces with one implementation each (`VoiceProvider` → OpenAI Realtime,
  `TextModel` → OpenAI, `AccountDirectory` → Cognito). Product logic never imports a vendor SDK.
- `persistence/`: repository interfaces, their SQL implementations on a small `SqlClient`
  (Data API in AWS, a local PostgreSQL in tests), and numbered SQL migrations.

**Shared types:** FastAPI's OpenAPI schema is exported to `packages/api-client`, and TypeScript
types are generated from it. A test fails when the committed schema is stale.

**Infrastructure (`infra/modules`):** `database` (Aurora cluster, Data API, secret managed by RDS),
`api` (Lambda, HTTP API, Cognito JWT authorizer, migration run), `secrets` (provider keys, written
without entering Terraform state), `voice` (sideband and assessment Lambdas). All `kv-<env>-*`,
eu-central-1.

## 4. Data model (first tables)

| Table | Holds |
| --- | --- |
| `app_user` | One row per account, keyed by the Cognito subject |
| `profile_field` | `(user, scope, field)` → value (JSON), `source` (`asked` · `measured` · `inferred_confirmed`), `updated_at`. `scope` is `global` or a target-language code |
| `profile_change` | Every change: old and new value, source, origin (`form` · `voice` · `system`), time |
| `onboarding` | Where the user is: essentials confirmed, placement status and decision, personas confirmed, completed |
| `voice_session`, `turn` | One row per voice call and per spoken turn (text only; audio recording is not in this feature) |
| `placement_result` | Level per skill, weak areas, the evidence it came from |
| `persona`, `avatar_config` | Starter personas and their looks |

**Essential profile fields:** `target_language` (global); per target language: `explanation_language`,
`explanation_usage`, `goals`, `exam`, `self_assessed_level`, `course`; later `measured_levels` and
`starting_level`.

## 5. API (v1)

| Route | Purpose |
| --- | --- |
| `GET /v1/catalog` | Available language packs, exams, levels and the option lists the form shows |
| `GET /v1/profile` · `PATCH /v1/profile` | Read the profile; apply validated changes (`source = asked`) |
| `GET /v1/onboarding` | The current stage and what is still missing. Also wakes a paused database |
| `POST /v1/onboarding/essentials/confirm` | The review screen was confirmed |
| `POST /v1/voice/calls` | The call broker: purpose (`onboarding` · `placement`) and WebRTC offer in, answer out |
| `GET /v1/placement` | Where the test stands and, once assessed, its result |
| `POST /v1/placement/skip` · `POST /v1/placement/decision` | Postpone the test; choose the starting level |
| `POST /v1/personas/starter` · `GET /v1/personas` · `PATCH`/`DELETE /v1/personas/{id}` | Propose starter personas; read them; rename, restyle or remove one |
| `POST /v1/onboarding/partners/confirm` · `POST /v1/onboarding/complete` | Keep the chosen partners; finish |

Errors carry a stable code and no internal detail; the app maps codes to translated messages.

## 6. Voice

- **Broker:** checks the OpenAI consent on the account and a per-user daily call limit, builds
  Mia's instructions from the profile and the app language, creates the call with the server key and
  starts the sideband worker with the call id.
- **Sideband worker:** joins the call, executes data tools (`update_profile`, the placement tools),
  stores turns and usage, and ends the call at a hard cap (essentials 8 minutes, placement
  12 minutes) or after a long silence.
- **Essentials:** Mia confirms the conversation language, then asks the five questions. Each answer
  is saved at once; the app ticks its checklist from the call's events and re-reads the profile.
- **Placement:** starts at the self-assessed level, adapts up or down, mixes listening checks, a
  description task and an opinion question; "I don't know" is always fine, and a button says it
  for the learner (a typed line in the call). Afterwards, in the same worker, a text model
  combines the transcript with the live model's listening and pronunciation notes into a CEFR
  level per skill and the top five weak areas; if it fails, the examiner's own impression is the
  result. When the result differs from the self-assessment, the user chooses the starting level;
  when it matches, the level is settled without a question. A test that ends too early is
  "inconclusive": it can be taken again or postponed.
- **Starter partners:** a small text model writes two partners (three with an exam) for the
  learner's goals, in about 7 seconds, inside the API request. Past 20 seconds, or on any
  failure, the language pack's built-in partners are offered instead.
- **App:** a `VoiceEngine` interface (start, stop, mute, events for state, captions and tool
  calls) with a WebRTC implementation and a test fake.

## 7. Screens

| Screen | Route | Content |
| --- | --- | --- |
| 4.1 Talk with Mia | `/onboarding/talk` | Avatar, live captions, checklist of the five questions, mute, "Type instead" |
| 4.2 Form | `/onboarding/language`, `…/explanations`, `…/goals`, `…/level`, `…/course` | Five steps: language to learn · explanation language · goals and exam · level · course or textbook |
| 4.3 Review | `/onboarding/review` | "Here's what I noted": every field editable, with its source |
| 4.4 Placement intro | `/onboarding/placement` | What the test is, how long, start or later |
| 4.5 Placement test | `/onboarding/placement/talk` | The live test, progress, "I don't know" |
| 4.6 Placement result | `/onboarding/placement/result` | Level per skill, weak areas, choice of starting level |
| 4.7 Starter partners | `/onboarding/partners`, `/onboarding/partners/[id]` | Persona cards with avatars: keep or remove; a second screen renames one and changes their look |
| 4.8 Ready | `/onboarding/ready` | Summary, then into the app |

They reuse `StepLayout`, `HeroLayout`, `Button`, `Text`, the motion blocks and the tokens. The
avatar component (idle, listening, thinking, speaking; the mouth follows the audio level) replaces
the initial-letter placeholder everywhere.

## 8. Not in this feature

Starting the 7-day trial (RevenueCat and store accounts), audio recordings and the library, voice
previews, full persona editing (Persona Studio), progressive profiling, the home screen and tabs.
Onboarding ends on the existing home placeholder.

## 9. Build order

Each slice is built test-first and leaves the app working.

1. Backend foundation: profile and onboarding API, database, Terraform, Python job in CI, generated
   client.
2. Form onboarding, review, resume routing.
3. Voice with Mia: broker, sideband worker, voice engine, avatar, conversation screen.
4. Placement test and result.
5. Starter partners and the ready screen.

## 10. Testing

- **Backend:** domain rules and API handlers against in-memory repositories; SQL repositories and
  migrations against a local PostgreSQL; provider clients against recorded response shapes. A
  small set of checks runs against the deployed dev stack after each apply.
- **App:** unit tests for pure logic (`src/lib`, the voice event reducer), behavior tests per screen
  with a fake API and a fake voice engine, and the visual check of rule 2.6.
- **Voice end to end:** a browser run with a recorded audio file as the microphone, against dev.

## 11. Cost

- AWS: about $1–5 a month in dev. The database pauses when idle; the first request afterwards takes
  about 15 seconds, so the app wakes it from the All set screen.
- OpenAI: roughly $0.10–0.25 per spoken setup and $1–3 per placement test, both on the flagship
  tier (see O8; the efficient tier would be about a third). Both models are Terraform variables.
