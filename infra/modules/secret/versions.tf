terraform {
  # Write-only arguments (a value that is sent to AWS but never stored in state) need 1.11.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
  }
}
