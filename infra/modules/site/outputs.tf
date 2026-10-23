output "url" {
  description = "The website's address, without a trailing slash."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "bucket" {
  description = "The bucket holding the built site."
  value       = aws_s3_bucket.site.bucket
}
