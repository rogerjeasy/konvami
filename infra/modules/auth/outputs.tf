output "user_pool_id" {
  description = "The user pool (needed by the backend later, to verify tokens)."
  value       = aws_cognito_user_pool.users.id
}

output "client_id" {
  description = "Public app-client id for the mobile app (EXPO_PUBLIC_AUTH_CLIENT_ID). Not a secret."
  value       = aws_cognito_user_pool_client.mobile.id
}

output "user_pool_arn" {
  description = "The user pool's ARN, for IAM policies of functions that read accounts."
  value       = aws_cognito_user_pool.users.arn
}
