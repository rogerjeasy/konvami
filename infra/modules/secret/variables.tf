variable "name" {
  description = "Name of the secret, e.g. kv-dev-openai-api-key."
  type        = string
}

variable "description" {
  description = "What the secret is and who reads it."
  type        = string
}

variable "value" {
  description = "The secret value. Sent to Secrets Manager and never written to Terraform state or plans."
  type        = string
  sensitive   = true
  ephemeral   = true
}

variable "value_version" {
  description = "Increase by one to store a new value (a rotated key). Terraform cannot see the value itself, so this number is what tells it to write."
  type        = number
  default     = 1
}

variable "recovery_days" {
  description = "Days a deleted secret can still be restored (0 deletes at once; 7 to 30 otherwise)."
  type        = number
  default     = 7
}
