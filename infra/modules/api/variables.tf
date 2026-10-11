variable "name" {
  description = "Resource name prefix, e.g. kv-dev."
  type        = string
}

variable "package_dir" {
  description = "The built Lambda package folder (services/api: poetry run python -m tools.build_lambda)."
  type        = string
}

variable "runtime" {
  description = "Lambda runtime. Must match PYTHON_VERSION in services/api/tools/build_lambda.py."
  type        = string
  default     = "python3.12"
}

variable "database" {
  description = "The database module's outputs."
  type = object({
    cluster_arn   = string
    secret_arn    = string
    database_name = string
    instance_id   = string
  })
}

variable "auth" {
  description = "The Cognito user pool and app client whose access tokens the API accepts. The functions also read accounts from the pool (name, language, AI consent)."
  type = object({
    user_pool_id  = string
    user_pool_arn = string
    client_id     = string
  })
}

variable "openai_secret_arn" {
  description = "The Secrets Manager secret holding the OpenAI API key (modules/secret)."
  type        = string
}

variable "media_bucket" {
  description = "The private bucket for learners' photos and voice samples (modules/media)."
  type = object({
    name = string
    arn  = string
  })
}

variable "voice" {
  description = <<-EOT
    Live voice calls (spec §9, §17.3). models: the voice model per call purpose; a purpose
    without a model cannot be started. max_seconds: the longest a call of that purpose lasts
    (the call worker's limit is 15 minutes). daily_call_limit: calls per learner per 24 hours.
  EOT
  type = object({
    models              = map(string)
    max_seconds         = map(number)
    voice               = string
    transcription_model = string
    daily_call_limit    = number
  })

  validation {
    condition     = alltrue([for seconds in values(var.voice.max_seconds) : seconds <= 780])
    error_message = "A call must end within 780 seconds: the call worker runs for at most 15 minutes, and a placement test is assessed in it after the call (up to 90 seconds)."
  }
}

variable "text_models" {
  description = <<-EOT
    Text models for work that is not live conversation (spec §17.3: the smallest model that does
    the job well). assessment reads a placement test's transcript; personas writes the starter
    partners and drafts a partner from a description in Persona Studio; speech speaks a voice's
    sample there (once per voice and language, then it is read from the media bucket); report
    writes a practice conversation's Session Report and checks each of its corrections a second
    time (two requests per conversation). An empty name turns the job off: it then uses its
    fallback (the examiner's own impression, the language pack's built-in partners) or, for
    drafts, samples and reports, says it is unavailable.
  EOT
  type = object({
    assessment = string
    personas   = string
    speech     = optional(string, "")
    report     = optional(string, "")
  })
}

variable "cors_allowed_origins" {
  description = "Web origins allowed to call the API from a browser (the Expo web preview). Native apps need none."
  type        = list(string)
  default     = []
}

variable "memory_mb" {
  description = "Memory of the API function. More memory also means a faster cold start."
  type        = number
  default     = 512
}

variable "throttle" {
  description = "Requests per second the whole API accepts, and the burst above it."
  type = object({
    rate  = number
    burst = number
  })
  default = {
    rate  = 20
    burst = 40
  }
}

variable "log_retention_days" {
  description = "How long function and access logs are kept."
  type        = number
  default     = 14
}
