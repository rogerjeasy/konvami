output "arn" {
  description = "The secret's ARN, for IAM policies and for the functions that read it."
  value       = aws_secretsmanager_secret.this.arn

  # Readers must not run before the value exists.
  depends_on = [aws_secretsmanager_secret_version.this]
}
