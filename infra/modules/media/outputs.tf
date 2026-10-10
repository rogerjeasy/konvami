output "bucket" {
  description = "The bucket's name (KONVAMI_MEDIA_BUCKET)."
  value       = aws_s3_bucket.media.bucket
}

output "arn" {
  description = "The bucket's ARN, for the IAM policy of the functions that use it."
  value       = aws_s3_bucket.media.arn
}
