# Konvami dev, on top of the NextChronicle nc-dev account.
#
# Reused from NextChronicle (not created here): the AWS account, IAM Identity Center sign-in
# (profile nc-dev), the Terraform state bucket, and the GitHub OIDC identity provider.
# Everything below is Konvami's own, named kv-<env>-*, tagged Project=konvami.
#
# Build order as features arrive (spec §10): budget alerts (now) → cognito (2 · Create account)
# → database (RDS PostgreSQL + pgvector) → api (FastAPI on Lambda + API Gateway) → s3 audio +
# CloudFront → secrets (OpenAI, ElevenLabs) → sqs/step functions (post-session pipeline).

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
