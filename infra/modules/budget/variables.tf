variable "name" {
  description = "Resource name prefix, e.g. kv-dev."
  type        = string
}

variable "project_tag" {
  description = "Value of the Project cost-allocation tag this budget counts (the account is shared)."
  type        = string
}

variable "target_usd" {
  description = "Monthly target: alert when actual spend passes it."
  type        = number
}

variable "ceiling_usd" {
  description = "Monthly hard ceiling: alert when spend is forecast to pass it, and when it does."
  type        = number

  validation {
    condition     = var.ceiling_usd > 0
    error_message = "ceiling_usd must be positive."
  }
}

variable "alert_emails" {
  description = "Email addresses that receive the alerts."
  type        = list(string)
}
