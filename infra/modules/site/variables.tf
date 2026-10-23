variable "name" {
  description = "Resource name prefix, e.g. kv-dev."
  type        = string
}

variable "content_dir" {
  description = "The built site (apps/site/dist, from: pnpm --filter @konvami/site build)."
  type        = string
}

variable "cache_seconds" {
  description = "How long browsers and CloudFront keep a page before asking for it again, so a changed policy is seen within this time."
  type        = number
  default     = 300
}
