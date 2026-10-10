output "url" {
  description = "Base URL of the API (EXPO_PUBLIC_API_URL). Not a secret."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}

output "migrations_applied" {
  description = "What the last migration run answered."
  value       = aws_lambda_invocation.migrate.result
}
