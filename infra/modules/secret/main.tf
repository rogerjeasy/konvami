# One secret in AWS Secrets Manager (spec §10.2: provider keys stay server-side only).
#
# The value passes through Terraform without being kept: `secret_string_wo` is write-only, and
# the variable feeding it is ephemeral, so the key is in neither the state nor a saved plan.
# It comes from the gitignored terraform.tfvars (or TF_VAR_...) of whoever applies.

resource "aws_secretsmanager_secret" "this" {
  name                    = var.name
  description             = var.description
  recovery_window_in_days = var.recovery_days
}

resource "aws_secretsmanager_secret_version" "this" {
  secret_id                = aws_secretsmanager_secret.this.id
  secret_string_wo         = var.value
  secret_string_wo_version = var.value_version
}
