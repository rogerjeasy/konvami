variable "name" {
  description = "Resource name prefix, e.g. kv-dev."
  type        = string
}

variable "database_name" {
  description = "The database created inside the cluster."
  type        = string
  default     = "konvami"
}

variable "engine_version" {
  description = "Aurora PostgreSQL version. Keep the major version equal to the PostgreSQL the backend tests run on (services/api)."
  type        = string
  default     = "18.6"
}

variable "min_capacity" {
  description = "Smallest capacity in ACUs. 0 lets the database pause when idle (about 15 seconds to wake); use 0.5 or more for an environment that must always answer at once."
  type        = number
  default     = 0
}

variable "max_capacity" {
  description = "Largest capacity in ACUs the database may scale to. This caps its hourly cost."
  type        = number
  default     = 2
}

variable "seconds_until_auto_pause" {
  description = "Idle time before the database pauses (only when min_capacity is 0)."
  type        = number
  default     = 300

  validation {
    condition     = var.seconds_until_auto_pause >= 300 && var.seconds_until_auto_pause <= 86400
    error_message = "seconds_until_auto_pause must be between 300 and 86400."
  }
}

variable "backup_retention_days" {
  description = "How many days of automatic backups are kept."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Refuse to delete the cluster (it holds user data). Turn off only to tear an environment down."
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  description = "Address range of the database's private network."
  type        = string
  default     = "10.42.0.0/24"
}
