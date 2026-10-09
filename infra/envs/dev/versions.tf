terraform {
  required_version = ">= 1.14"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
  }

  # Shared with NextChronicle: the same nc-dev state bucket (managed by
  # nextchronicle/infra/bootstrap), under Konvami's own key prefix. The bucket lives in Zurich.
  backend "s3" {
    bucket       = "nc-terraform-state-503002144480"
    key          = "konvami/envs/dev/terraform.tfstate"
    region       = "eu-central-2"
    encrypt      = true
    use_lockfile = true
  }
}
