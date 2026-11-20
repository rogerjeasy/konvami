output "arn" {
  description = "The layer version, for the API function's layers."
  value       = aws_lambda_layer_version.encoder.arn
}

output "binary_path" {
  description = "Where the ffmpeg executable is inside the function."
  value       = "/opt/bin/ffmpeg"
}
