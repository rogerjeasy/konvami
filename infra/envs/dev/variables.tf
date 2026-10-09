variable "account_id" {
  description = "The nc-dev AWS account (shared with NextChronicle). Terraform refuses to run anywhere else."
  type        = string
  default     = "503002144480"
}

variable "region" {
  description = "Primary AWS region for Konvami."
  type        = string
  default     = "eu-central-1"

  validation {
    # The nc-dev deploy role's guardrail only allows these two EU regions; never us-east-1.
    condition     = contains(["eu-central-1", "eu-central-2"], var.region)
    error_message = "Konvami runs in the EU: eu-central-1 (Frankfurt) or eu-central-2 (Zurich)."
  }
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "dev"
}

variable "budget" {
  description = "Monthly operating budget in USD (spec D5): alerts at the target and at the hard ceiling."
  type = object({
    target_usd  = number
    ceiling_usd = number
  })
  default = {
    target_usd  = 150
    ceiling_usd = 250
  }
}

variable "budget_alert_emails" {
  description = "Who receives budget alerts. Set in terraform.tfvars (gitignored); empty creates no budget."
  type        = list(string)
  default     = []
}

variable "github_deploy" {
  description = <<-EOT
    GitHub Actions deploys of the Konvami repository through OIDC (no stored AWS keys). null until
    the repository exists. subject_prefix is GitHub's immutable form, read it with:
    gh api repos/<owner>/<repo>/actions/oidc/customization/sub
  EOT
  type = object({
    repository     = string
    subject_prefix = string
    environment    = string
  })
  default = null
}
