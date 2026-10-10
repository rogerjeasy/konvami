variable "name" {
  description = "Resource name prefix, e.g. kv-dev."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Web origins allowed to send and read files from a browser (the Expo web preview). Native apps need none."
  type        = list(string)
  default     = []
}

variable "upload_expiry_days" {
  description = "Days after which a file that was uploaded but never confirmed is deleted. S3 counts in whole days."
  type        = number
  default     = 1
}

variable "force_destroy" {
  description = "Let Terraform delete the bucket while it still holds files. Turn on only to tear an environment down."
  type        = bool
  default     = false
}
