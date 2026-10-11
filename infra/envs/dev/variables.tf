variable "account_id" {
  description = "The nc-dev AWS account (shared with NextChronicle). Terraform refuses to run anywhere else."
  type        = string
  default     = "503002144480"
}

variable "region" {
  description = "Primary AWS region for Konvami."
  type        = string
  default     = "eu-central-1"

  validation {
    # The nc-dev deploy role's guardrail only allows these two EU regions; never us-east-1.
    condition     = contains(["eu-central-1", "eu-central-2"], var.region)
    error_message = "Konvami runs in the EU: eu-central-1 (Frankfurt) or eu-central-2 (Zurich)."
  }
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "dev"
}

variable "budget" {
  description = "Monthly operating budget in USD (spec D5): alerts at the target and at the hard ceiling."
  type = object({
    target_usd  = number
    ceiling_usd = number
  })
  default = {
    target_usd  = 150
    ceiling_usd = 250
  }
}

variable "budget_alert_emails" {
  description = "Who receives budget alerts. Set in terraform.tfvars (gitignored); empty creates no budget."
  type        = list(string)
  default     = []
}

variable "github_deploy" {
  description = <<-EOT
    GitHub Actions deploys of the Konvami repository through OIDC (no stored AWS keys). null until
    the repository exists. subject_prefix is GitHub's immutable form, read it with:
    gh api repos/<owner>/<repo>/actions/oidc/customization/sub
  EOT
  type = object({
    repository     = string
    subject_prefix = string
    environment    = string
  })
  default = null
}

variable "web_preview_origins" {
  description = "Browser origins allowed to call the API: the Expo web preview used for development and visual checks."
  type        = list(string)
  default     = ["http://localhost:8081"]
}

variable "openai_api_key" {
  description = "The OpenAI API key. Set it in terraform.tfvars (gitignored) or TF_VAR_openai_api_key. It goes to Secrets Manager and is never written to state or plans."
  type        = string
  sensitive   = true
  ephemeral   = true
}

variable "openai_api_key_version" {
  description = "Increase by one after changing openai_api_key, so the new key is stored."
  type        = number
  default     = 1
}

variable "voice" {
  description = <<-EOT
    Voice models and limits for live calls (see modules/api). The spoken setup and the placement
    test run on the flagship model: on the same scripted setup conversation (2026-10-09) the
    efficient model (gpt-realtime-2.1-mini) narrated its saving and blurred questions, the
    flagship did neither, and a test's result depends on the examiner's ear. It costs about
    three times as much per call (roughly $0.10–0.25 per setup, $1–3 per test); change a model
    to the mini one to trade that quality for cost.
    A practice conversation runs on the efficient model (spec §17.3 lever 2: the default for a
    buddy's free conversation), roughly $0.20–0.80 for its 10 minutes. It is where most voice
    minutes go, so this choice decides most of the bill. On the same scripted A2 conversation
    (2026-10-10) the efficient model followed its role and kept the learner talking, but spoke
    about 60% more than the flagship and, as a teacher, got one grammar explanation wrong; the
    flagship kept to two short sentences and made no such mistake.
  EOT
  type = object({
    models              = map(string)
    max_seconds         = map(number)
    voice               = string
    transcription_model = string
    daily_call_limit    = number
  })
  default = {
    models = {
      onboarding = "gpt-realtime-2.1"
      placement  = "gpt-realtime-2.1"
      practice   = "gpt-realtime-2.1-mini"
    }
    max_seconds         = { onboarding = 480, placement = 720, practice = 600 }
    voice               = "marin"
    transcription_model = "gpt-transcribe"
    daily_call_limit    = 10
  }
}

variable "text_models" {
  description = <<-EOT
    Text models for background work (see modules/api): the stronger one reads a placement
    test's transcript, where accuracy decides the learner's level; the small one writes the
    starter partners (about 7 seconds on 2026-10-09) and drafts a partner from a description.
    speech is the model that speaks a voice's sample in Persona Studio: one sentence per voice
    and language, once, a fraction of a cent each.
    report writes the Session Report after a practice conversation and checks its corrections a
    second time. It is the stronger model, as for the placement test: a wrong correction costs
    the learner's trust (spec §16.1), and text costs little next to the call it reports on
    (spec §17.3 lever 1).
    memory reads a practice conversation for what the learner's partners should know next time
    (spec §6.11). It is the small model (spec §17.3 lever 5): the learner sees every memory and
    can put it right, and what a partner said about their own life cannot be stored as a fact
    about the learner whatever the model answers.
  EOT
  type = object({
    assessment = string
    personas   = string
    speech     = optional(string, "gpt-4o-mini-tts")
    report     = optional(string, "gpt-6.1-sol")
    memory     = optional(string, "gpt-6-luna")
  })
  default = {
    assessment = "gpt-6.1-sol"
    personas   = "gpt-6-luna"
    speech     = "gpt-4o-mini-tts"
    report     = "gpt-6.1-sol"
    memory     = "gpt-6-luna"
  }
}
