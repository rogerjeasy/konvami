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
├─ envs/dev/        Konvami dev: wires the modules (budget, auth; more per feature)
└─ modules/         reusable modules (budget, auth, …)
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
- **Next, in build order (spec §10):** Sign in with Apple and Google on the user pool → RDS PostgreSQL +
  pgvector → FastAPI on Lambda + API Gateway → S3 audio + CloudFront signed URLs → Secrets
  Manager (OpenAI, ElevenLabs) → SQS / Step Functions post-session pipeline → CloudWatch, X-Ray.
  Each arrives as a module in `modules/` plus a few lines in `envs/dev/main.tf`.

## Rules

- `*.tfvars`, state and plan files are gitignored. Commit `*.tfvars.example` only.
- Every root sets `allowed_account_ids`, so Terraform refuses to run against another account.
- Never write to NextChronicle's state keys or modify its resources from here.
- Show the plan before applying; no `-auto-approve` against shared accounts.
