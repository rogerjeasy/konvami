# Konvami dev, on top of the NextChronicle nc-dev account.
#
# Reused from NextChronicle (not created here): the AWS account, IAM Identity Center sign-in
# (profile nc-dev), the Terraform state bucket, and the GitHub OIDC identity provider.
# Everything below is Konvami's own, named kv-<env>-*, tagged Project=konvami.
#
# Build order as features arrive (spec §10): budget alerts → cognito (2 · Create account) →
# database (Aurora PostgreSQL) and api (FastAPI on Lambda + API Gateway) (4 · Onboarding) →
# secrets (OpenAI, ElevenLabs) and voice calls → media bucket (6 · Profile: photos, voice
# samples) → s3 audio + CloudFront → sqs/step functions (post-session pipeline).

locals {
  name = "kv-${var.environment}"
  tags = {
    Project     = "konvami"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "budget" {
  source = "../../modules/budget"
  count  = length(var.budget_alert_emails) > 0 ? 1 : 0

  name         = local.name
  project_tag  = local.tags.Project
  target_usd   = var.budget.target_usd
  ceiling_usd  = var.budget.ceiling_usd
  alert_emails = var.budget_alert_emails
}

# Accounts: email sign-up with a 6-digit verification code (screens 2 · Create account).
module "auth" {
  source = "../../modules/auth"

  name = local.name
}

# PostgreSQL for the profile and everything after it. Pauses when idle (onboarding design O1).
module "database" {
  source = "../../modules/database"

  name = local.name
}

# The OpenAI API key, read by the API and the call worker at run time.
module "openai_key" {
  source = "../../modules/secret"

  name          = "${local.name}-openai-api-key"
  description   = "OpenAI API key for Konvami's voice calls and text models (${var.environment})"
  value         = var.openai_api_key
  value_version = var.openai_api_key_version
}

# Private files: learners' photos and the voices' samples (profile design P2–P4, P9).
module "media" {
  source = "../../modules/media"

  name                 = local.name
  cors_allowed_origins = var.web_preview_origins
}

# The API: FastAPI on Lambda behind API Gateway, accepting the user pool's access tokens.
# Build the package first: cd services/api && poetry run python -m tools.build_lambda
module "api" {
  source = "../../modules/api"

  name        = local.name
  package_dir = "${path.root}/../../../services/api/dist/lambda"
  database    = module.database
  auth = {
    user_pool_id  = module.auth.user_pool_id
    user_pool_arn = module.auth.user_pool_arn
    client_id     = module.auth.client_id
  }
  openai_secret_arn = module.openai_key.arn
  media_bucket = {
    name = module.media.bucket
    arn  = module.media.arn
  }
  voice       = var.voice
  text_models = var.text_models
  costs = {
    prices      = var.prices
    target_usd  = var.budget.target_usd
    ceiling_usd = var.budget.ceiling_usd
    owners      = var.cost_owners
  }
  alert_topic_arn      = try(module.budget[0].alert_topic_arn, "")
  cors_allowed_origins = var.web_preview_origins
}
