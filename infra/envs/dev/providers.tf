# Konvami runs in Frankfurt (spec §10.2: EU hosting, Bedrock model availability, latency to
# Europe and North/West Africa), inside the nc-dev account it shares with NextChronicle.
provider "aws" {
  region = var.region

  # Refuse to run against any other account.
  allowed_account_ids = [var.account_id]

  # Project=konvami separates Konvami's costs from NextChronicle's in the shared account.
  default_tags {
    tags = local.tags
  }
}
