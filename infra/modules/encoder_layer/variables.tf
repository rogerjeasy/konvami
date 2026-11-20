variable "name" {
  description = "Resource name prefix, kv-<env>."
  type        = string
}

variable "zip_path" {
  description = "The layer zip made by infra/scripts/build-encoder-layer.sh."
  type        = string
}
