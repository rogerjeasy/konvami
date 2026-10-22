# Konvami's private files (profile design P2–P4, P9): learners' photos, the voices' samples and
# the recordings of practice conversations (spec §6.6, under users/<id>/recordings/).
#
# - Nothing in the bucket is public. The API hands the app a short-lived signed upload form or
#   a short-lived signed address; the app never has credentials of its own.
# - A photo is uploaded under uploads/ and moved under users/<id>/ once the API has checked it.
#   What stays under uploads/ was never confirmed and is deleted after a day.
# - No versioning: deleting a photo or an account must really delete the file (spec §6.19).

data "aws_caller_identity" "current" {}

locals {
  # Where the API's signed upload forms store a file until it is confirmed. The same prefix as
  # in services/api (domain/accounts.py).
  upload_prefix = "uploads/"
}

resource "aws_s3_bucket" "media" {
  # Bucket names are shared by all of AWS; the account id makes this one unique.
  bucket        = "${var.name}-media-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# No access control lists at all: only IAM and the bucket policy decide who may read.
resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "delete-unconfirmed-uploads"
    status = "Enabled"

    filter {
      prefix = local.upload_prefix
    }

    expiration {
      days = var.upload_expiry_days
    }
  }

  rule {
    id     = "abort-unfinished-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# A browser (the web preview) sends the upload form and reads photos and samples from another
# origin than the bucket's, so it needs permission. Native apps do not ask.
resource "aws_s3_bucket_cors_configuration" "media" {
  count  = length(var.cors_allowed_origins) > 0 ? 1 : 0
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_origins = var.cors_allowed_origins
    allowed_methods = ["GET", "POST"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

data "aws_iam_policy_document" "tls_only" {
  statement {
    sid       = "RefuseUnencryptedConnections"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]

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

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.media]
}
