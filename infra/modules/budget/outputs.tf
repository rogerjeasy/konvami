output "budget_name" {
  value = aws_budgets_budget.monthly.name
}

output "alert_topic_arn" {
  description = "The SNS topic the API publishes its spending alerts to."
  value       = aws_sns_topic.alerts.arn
}
