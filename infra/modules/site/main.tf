# Konvami's public website (apps/site): the privacy policy in the four UI languages, linked from
# the app (2.2 Create account, 2.5 AI data consent, 6.7 Privacy and AI) and the store listings.
#
# - The bucket is private; only this CloudFront distribution may read it (origin access control).
# - The pages are uploaded by Terraform from the built site, like the API's Lambda package.
# - Served on CloudFront's own domain until Konvami has one of its own.

data "aws_caller_identity" "current" {}

locals {
  # What the site is made of (apps/site/src/site.ts); anything else is not served.
  content_types = {
    html = "text/html; charset=utf-8"
    css  = "text/css; charset=utf-8"
    svg  = "image/svg+xml"
    ttf  = "font/ttf"
  }
  files = fileset(var.content_dir, "**")
}

resource "aws_s3_bucket" "site" {
  # Bucket names are shared by all of AWS; the account id makes this one unique.
  bucket        = "${var.name}-site-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # It only holds the built site, which can be published again.

  lifecycle {
    # Checked at plan time: publishing an empty or half-built site would remove the pages.
    precondition {
      condition     = fileexists("${var.content_dir}/index.html")
      error_message = "The site is not built. Fill in apps/site/site.config.ts, then run: pnpm --filter @konvami/site build"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_object" "file" {
  for_each = local.files

  bucket        = aws_s3_bucket.site.id
  key           = each.value
  source        = "${var.content_dir}/${each.value}"
  source_hash   = filemd5("${var.content_dir}/${each.value}")
  content_type  = local.content_types[reverse(split(".", each.value))[0]]
  cache_control = "public, max-age=${var.cache_seconds}"

  lifecycle {
    precondition {
      condition     = contains(keys(local.content_types), reverse(split(".", each.value))[0])
      error_message = "The site holds a file of a type it does not serve: ${each.value}."
    }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-site"
  description                       = "Konvami website: CloudFront reads the private bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# HSTS, nosniff, frame denial and a strict referrer policy.
data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "Konvami website (${var.name})"
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  # Europe and North America only: the readers are in Europe, and it is the cheapest class.
  price_class = "PriceClass_100"

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    sid       = "CloudFrontReadsTheSite"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }

  statement {
    sid       = "RefuseUnencryptedConnections"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json

  depends_on = [aws_s3_bucket_public_access_block.site]
}
