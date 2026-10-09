# Monthly cost budget for one project in a shared account (spec §17: $150 target, $250 ceiling).
#
# It counts only resources tagged Project=<project_tag>. AWS counts a tag only after it is
# activated as a cost-allocation tag (Billing → Cost allocation tags, in the management account
# for an Organization); until then this budget sees $0.

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.ceiling_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$${var.project_tag}"]
  }

  # Actual spend passed the target.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.target_usd / var.ceiling_usd * 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alert_emails
  }

  # Spend is on course to pass the ceiling this month.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }

  # Actual spend passed the ceiling.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alert_emails
  }
}
