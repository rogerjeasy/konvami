output "region" {
  description = "Konvami's primary region."
  value       = var.region
}

output "github_deploy_role_arn" {
  description = "Set as AWS_ROLE_ARN in the GitHub environment (null until github_deploy is set)."
  value       = try(aws_iam_role.github_deploy[0].arn, null)
}

output "user_pool_id" {
  description = "Konvami's Cognito user pool."
  value       = module.auth.user_pool_id
}

output "api_url" {
  description = "Base URL of the Konvami API."
  value       = module.api.url
}

output "migrations_applied" {
  description = "Database migrations applied by the last deploy."
  value       = module.api.migrations_applied
}

# Public values for the app, never secrets (EXPO_PUBLIC_* ships inside the app):
#   terraform output -raw mobile_env > ../../../apps/mobile/.env
output "mobile_env" {
  description = "The contents of apps/mobile/.env for this environment."
  value       = <<-EOT
    # Written by: terraform output -raw mobile_env (infra/envs/${var.environment}). Public values.
    EXPO_PUBLIC_API_URL=${module.api.url}
    EXPO_PUBLIC_AUTH_REGION=${var.region}
    EXPO_PUBLIC_AUTH_CLIENT_ID=${module.auth.client_id}
    EXPO_PUBLIC_TERMS_URL=
    EXPO_PUBLIC_PRIVACY_URL=
  EOT
}
