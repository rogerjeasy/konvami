variable "name" {
  description = "Resource name prefix, e.g. kv-dev."
  type        = string
}

variable "app_name" {
  description = "Product name shown in the verification email."
  type        = string
  default     = "Konvami"
}

variable "password_min_length" {
  description = "Minimum password length. Must match PASSWORD_MIN_LENGTH in apps/mobile/src/lib/validation.ts."
  type        = number
  default     = 8

  validation {
    condition     = var.password_min_length >= 8
    error_message = "password_min_length must be at least 8."
  }
}

variable "refresh_token_days" {
  description = "How long a device stays signed in without signing in again."
  type        = number
  default     = 30
}

variable "deletion_protection" {
  description = "Refuse to delete the user pool (it holds real accounts). Turn off only to tear an environment down."
  type        = bool
  default     = true
}

variable "password_history_size" {
  description = "How many of a user's previous passwords cannot be reused (0 turns the check off)."
  type        = number
  default     = 5

  validation {
    condition     = var.password_history_size >= 0 && var.password_history_size <= 24
    error_message = "password_history_size must be between 0 and 24."
  }
}
