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
    (the call worker's limit is 15 minutes). weekly_minutes: each learner's voice minutes per
    week, for calls of every purpose (spec §6.19); a call never starts with more time than is
    left. economy_models: the cheaper model per purpose, used once the month's estimated spend
    passes costs.target_usd; a purpose without one keeps its model.
  EOT
  type = object({
    models              = map(string)
    max_seconds         = map(number)
    voice               = string
    transcription_model = string
    weekly_minutes      = number
    economy_models      = optional(map(string), {})
  })

  validation {
    condition     = alltrue([for seconds in values(var.voice.max_seconds) : seconds <= 780])
    error_message = "A call must end within 780 seconds: the call worker runs for at most 15 minutes, and a placement test is assessed in it after the call (up to 90 seconds)."
  }
}

variable "costs" {
  description = <<-EOT
    Cost control (spec §6.19, decision D5). prices: per model, US dollars per million of each
    unit it is billed by; the API estimates every paid request from them, so a price change needs
    no code change. Units: realtime models input_text_tokens, input_audio_tokens,
    cached_input_text_tokens, cached_input_audio_tokens, output_text_tokens,
    output_audio_tokens; text models input_tokens, cached_input_tokens, output_tokens; speech
    characters; transcription audio_seconds. A model without prices is counted as unpriced.
    target_usd: past it, new calls use voice.economy_models. ceiling_usd: at it, new voice calls
    stop. owners: user pool subjects (sub) who may open the costs page in the app.
  EOT
  type = object({
    prices      = map(map(number))
    target_usd  = number
    ceiling_usd = number
    owners      = list(string)
  })

  validation {
    condition     = var.costs.target_usd > 0 && var.costs.ceiling_usd >= var.costs.target_usd
    error_message = "target_usd must be positive and ceiling_usd at least target_usd."
  }
}

variable "alert_topic_arn" {
  description = "The SNS topic the spending alerts are emailed through (modules/budget); empty sends none."
  type        = string
  default     = ""
}

variable "text_models" {
  description = <<-EOT
    Text models for work that is not live conversation (spec §17.3: the smallest model that does
    the job well). assessment reads a placement test's transcript; personas writes the starter
    partners and drafts a partner from a description in Persona Studio; speech speaks a voice's
    sample there (once per voice and language, then it is read from the media bucket); report
    writes a practice conversation's Session Report and checks each of its corrections a second
    time (two requests per conversation); memory reads the conversation once more for what the
    learner's partners should know next time (spec §6.11; one request per conversation, by the
    same worker, after the report); verbatim is a transcription model that writes each recorded
    learner turn down a second time, keeping their mistakes, before the report is written (spec
    §9.4); tutor answers the learner's questions about the language, as text, about a report's
    correction, and for a partner during a call (spec §6.8); spotter checks each learner turn
    during a practice call, so that mistakes show as correction chips and the partner hears of
    them (spec §8.2); cards writes a saved word card's forms (spec §6.7). An empty name turns the job off: it then uses its fallback (the examiner's own
    impression, the language pack's built-in partners, the live transcript) or, for drafts,
    samples and reports, says it is unavailable; without a memory model nothing is remembered.
  EOT
  type = object({
    assessment = string
    personas   = string
    speech     = optional(string, "")
    report     = optional(string, "")
    memory     = optional(string, "")
    verbatim   = optional(string, "")
    tutor      = optional(string, "")
    spotter    = optional(string, "")
    cards      = optional(string, "")
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
