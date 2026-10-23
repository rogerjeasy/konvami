# Konvami infrastructure (Terraform)

**Every AWS resource is created, changed and deleted through Terraform. Nothing is clicked in the
AWS console or created with the AWS CLI.** Read-only CLI calls for checking are fine.

## Built on top of NextChronicle's nc-dev

Konvami does not have its own AWS account yet. It runs inside the account that
`../RogerSapta/nextchronicle/infra` set up, and only adds its own resources:

| Shared from NextChronicle (never changed here)                                                     | Konvami's own                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| AWS account `nc-dev` (503002144480) and IAM Identity Center sign-in, profile `nc-dev`              | Resources named `kv-<env>-*`, tagged `Project=konvami`                       |
| Terraform state bucket `nc-terraform-state-503002144480` (versioned, encrypted, S3-native locking) | State under the key prefix `konvami/` (`konvami/envs/dev/terraform.tfstate`) |
| GitHub OIDC identity provider                                                                      | Its own GitHub deploy role, `kv-dev-github-deploy` (when the repo exists)    |
| Region guardrails of the deploy role (EU only)                                                     | Primary region **eu-central-1 (Frankfurt)**, spec §10.2                      |

NextChronicle's VPC, Aurora and Cognito are in Zurich and hold its own (health) data, so Konvami
never shares them: separate tenants, separate data stores.

```
infra/
├─ envs/dev/        Konvami dev: wires the modules (budget, auth, database, secret, media, api, site)
└─ modules/         reusable modules (budget, auth, database, secret, media, api, site, …)
```

## Signing in

```bash
aws sso login --profile nc-dev          # opens the browser; valid 8 hours
export AWS_PROFILE=nc-dev
```

## Everyday workflow

```bash
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars   # once; gitignored, fill in real values
terraform init                                 # once per machine
(cd ../../../services/api && poetry run python -m tools.build_lambda)   # the API package
terraform plan -out=tfplan                     # read what will change
terraform apply tfplan                         # apply exactly that plan
terraform plan -detailed-exitcode              # exit 0 = AWS matches the code (no drift)
```

## What exists now, and what comes next

- **Now:** a monthly cost budget for `Project=konvami` with alerts at the $150 target and the
  $250 ceiling (spec D5, §17). It needs the `Project` tag activated as a cost-allocation tag in the
  Billing console of the management account (707938860881); until then it counts $0.
- **Accounts (`modules/auth`):** the Cognito user pool `kv-dev-users` and its public app client
  `kv-dev-mobile` for screens 2 · Create account and 3 · Sign in: email + password, verified by a
  6-digit code; password reset by emailed code; the last five passwords cannot be reused.
  Cognito's built-in email sender is used (enough for dev; a public launch needs Amazon SES with
  Konvami's own domain). After applying, write the app's settings with
  `terraform output -raw mobile_env > ../../../apps/mobile/.env` and restart the dev server.
- **Database (`modules/database`):** the Aurora Serverless v2 PostgreSQL cluster `kv-dev-db`
  (PostgreSQL 18, pgvector available), in its own private network with no route in or out. It is
  reached only through the RDS Data API, so Lambda needs no VPC and no NAT. In dev it pauses after
  5 idle minutes and costs storage only; the first query afterwards takes about 15 seconds
  (`min_capacity = 0.5` keeps an environment awake). RDS creates and rotates the master password in
  Secrets Manager. Before a public launch, give the API its own database role with fewer rights.
- **API (`modules/api`):** `services/api` (FastAPI) on the Lambda function `kv-dev-api`, behind an
  API Gateway HTTP API that checks the user pool's access token on every route. A second function,
  `kv-dev-api-migrate`, applies the SQL migrations in
  `services/api/src/konvami_api/persistence/migrations/`; Terraform invokes it whenever the package
  changes, and a failing migration fails the apply. Build the package before planning (see above).
- **Voice calls:** the secret `kv-dev-openai-api-key` (`modules/secret`) and the function
  `kv-dev-call-worker` (in `modules/api`). The API creates each live call at OpenAI with the key
  from the secret and starts the worker, which joins the call from the server, runs the persona's
  tools and ends the call at its time limit. The key comes from `openai_api_key` in the gitignored
  `terraform.tfvars`; it is written to Secrets Manager and never to state. To rotate it, change
  the value and raise `openai_api_key_version` by one. Voice models and limits are the `voice`
  variable. After a placement test's call the same worker has the transcript assessed, so a call
  may last 780 seconds at most.
  A practice conversation (`practice` in the same variable) runs on the efficient voice model for
  at most 10 minutes; it is where most voice minutes, and most of the OpenAI bill, will go.
- **Text models:** the `text_models` variable names the model that assesses a placement test and
  the one that writes the starter partners. They use the same OpenAI key. With an empty name a
  job uses its fallback (the examiner's impression, the language pack's built-in partners).
  `text_models.report` names the model that writes a practice conversation's Session Report
  (spec §6.5) and checks each correction a second time. The call worker function does it in an
  invocation of its own (`{"report": "<call id>"}`), started when the call ends or when the
  learner asks for a report again. Without a name, no report is written.
  `text_models.memory` names the model that then reads the conversation once more for what the
  learner's partners should know next time (spec §6.11), in the same invocation, after the
  report. Without a name, nothing is remembered.
- **Files (`modules/media`):** the private bucket `kv-dev-media-<account id>` for learners'
  photos (6.2 Personal) and the voices' samples (6.6 Persona Studio). Nothing in it is public:
  the API signs a short-lived upload form (JPEG only, at most 1 MB) or a short-lived address, so
  the app never holds credentials. A photo is uploaded under `uploads/` and moved under
  `users/<id>/` once the API has checked it; what stays under `uploads/` is deleted after a day.
  No versioning, so deleting an account really deletes its files. The API's role may use this
  bucket and delete a user from the pool (the last step of deleting an account). The web
  preview's origins are allowed to send and read files (CORS); native apps need none.
  `text_models.speech` names the model that speaks a voice's sample.
- **Website (`modules/site`):** the privacy policy in the four UI languages (`apps/site`), in
  the private bucket `kv-dev-site-<account id>` behind a CloudFront distribution on its own
  `*.cloudfront.net` address. Off until `publish_site = true`; the plan stops if the site is not
  built (`pnpm --filter @konvami/site build`, which needs the controller's details in
  `apps/site/site.config.ts`). `terraform output -raw mobile_env` then gives the app
  `EXPO_PUBLIC_PRIVACY_URL`, with `{lang}` in place of the language.
- **Next, in build order (spec §10):** Sign in with Apple and Google on the user pool → S3 audio +
  CloudFront signed URLs → SQS / Step Functions for the rest of the post-session pipeline (the
  report is written by the call worker for now) → CloudWatch dashboards,
  X-Ray. Each arrives as a module in `modules/` plus a few lines in `envs/dev/main.tf`.

## Rules

- `*.tfvars`, state and plan files are gitignored. Commit `*.tfvars.example` only.
- Every root sets `allowed_account_ids`, so Terraform refuses to run against another account.
- Never write to NextChronicle's state keys or modify its resources from here.
- Show the plan before applying; no `-auto-approve` against shared accounts.
