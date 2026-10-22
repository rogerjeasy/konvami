# The Konvami API (spec §10): FastAPI on Lambda behind an API Gateway HTTP API.
#
# - Every route requires a Cognito access token. API Gateway verifies it (JWT authorizer) before
#   the function runs; the function only reads the verified subject.
# - The function reaches PostgreSQL through the RDS Data API, so it runs outside any VPC.
# - A second function from the same package applies schema migrations; Terraform invokes it
#   whenever the package changes.
# - A third follows each live voice call from the server (onboarding design O2): the API starts
#   it when it creates a call, and it runs the persona's tools until the call ends. The same
#   function, started once more, writes a practice conversation's Session Report (spec §12.2).

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

locals {
  # API Gateway allows 30 seconds per request; the function stops just before that.
  api_timeout_seconds = 29
  # Long enough for a paused database to wake up (MIGRATION_ATTEMPTS in services/api main.py).
  migrate_timeout_seconds = 180
  # Lambda's maximum. Calls end earlier (var.voice.max_seconds, at most 780), which leaves time
  # to assess a placement test after its call.
  call_worker_timeout_seconds = 900
  call_worker_name            = "${var.name}-call-worker"

  # Names, ARNs and settings only. The OpenAI key itself is read from Secrets Manager at run time.
  environment = {
    KONVAMI_DB_CLUSTER_ARN    = var.database.cluster_arn
    KONVAMI_DB_SECRET_ARN     = var.database.secret_arn
    KONVAMI_DB_NAME           = var.database.database_name
    KONVAMI_USER_POOL_ID      = var.auth.user_pool_id
    KONVAMI_OPENAI_SECRET_ARN = var.openai_secret_arn
    KONVAMI_CALL_WORKER       = local.call_worker_name
    KONVAMI_MEDIA_BUCKET      = var.media_bucket.name
    KONVAMI_VOICE             = jsonencode(var.voice)
    KONVAMI_TEXT_MODELS       = jsonencode(var.text_models)
  }
}

data "archive_file" "package" {
  type        = "zip"
  source_dir  = var.package_dir
  output_path = "${path.root}/.build/${var.name}-api.zip"
}

# --- Permissions: logs, and this one database through the Data API ------------------------------

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${var.name}-api"
  description        = "Konvami API and migration functions"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "api" {
  statement {
    sid     = "WriteOwnLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "${aws_cloudwatch_log_group.api.arn}:*",
      "${aws_cloudwatch_log_group.migrate.arn}:*",
      "${aws_cloudwatch_log_group.call_worker.arn}:*",
    ]
  }

  statement {
    sid       = "RunSqlThroughTheDataApi"
    actions   = ["rds-data:ExecuteStatement"]
    resources = [var.database.cluster_arn]
  }

  # The Data API reads the database credentials on the caller's behalf.
  statement {
    sid       = "ReadDatabaseCredentials"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.database.secret_arn]
  }

  # The API creates voice calls and the call worker joins them, both with the server's key.
  statement {
    sid       = "ReadOpenAiKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.openai_secret_arn]
  }

  # Name, language and AI consent of the caller, before a voice call is created; and the last
  # step of deleting an account (profile design P5).
  statement {
    sid       = "ReadAndDeleteAccounts"
    actions   = ["cognito-idp:AdminGetUser", "cognito-idp:AdminDeleteUser"]
    resources = [var.auth.user_pool_arn]
  }

  # Photos, voice samples and recordings (the call worker stores each turn's audio). The
  # functions sign the upload forms and addresses the app uses, so what they may do here is also
  # the most the app can ever do.
  statement {
    sid       = "UseMediaFiles"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.media_bucket.arn}/*"]
  }

  # Listing finds every file of an account that is deleted. It also makes S3 answer "not
  # found" for a missing file; without it the answer is "forbidden", which would be an error.
  statement {
    sid       = "ListMediaFiles"
    actions   = ["s3:ListBucket"]
    resources = [var.media_bucket.arn]
  }

  statement {
    sid       = "StartCallWorker"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:aws:lambda:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:function:${local.call_worker_name}"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${var.name}-api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# --- Functions ----------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/aws/lambda/${var.name}-api-migrate"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = "${var.name}-api"
  description   = "Konvami API (FastAPI)"
  role          = aws_iam_role.api.arn

  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  handler          = "konvami_api.main.handler"
  runtime          = var.runtime
  architectures    = ["arm64"]
  memory_size      = var.memory_mb
  timeout          = local.api_timeout_seconds

  environment {
    variables = local.environment
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.api]
}

resource "aws_lambda_function" "migrate" {
  function_name = "${var.name}-api-migrate"
  description   = "Applies Konvami's database migrations"
  role          = aws_iam_role.api.arn

  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  handler          = "konvami_api.main.migrate_handler"
  runtime          = var.runtime
  architectures    = ["arm64"]
  memory_size      = var.memory_mb
  timeout          = local.migrate_timeout_seconds

  environment {
    variables = local.environment
  }

  depends_on = [aws_cloudwatch_log_group.migrate, aws_iam_role_policy.api]
}

resource "aws_cloudwatch_log_group" "call_worker" {
  name              = "/aws/lambda/${local.call_worker_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "call_worker" {
  function_name = local.call_worker_name
  description   = "Follows one live Konvami voice call (tools, time limit), or writes a conversation's report"
  role          = aws_iam_role.api.arn

  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  handler          = "konvami_api.main.call_worker_handler"
  runtime          = var.runtime
  architectures    = ["arm64"]
  memory_size      = var.memory_mb
  timeout          = local.call_worker_timeout_seconds

  environment {
    variables = local.environment
  }

  depends_on = [aws_cloudwatch_log_group.call_worker, aws_iam_role_policy.api]
}

# A worker that failed is not started again: the call it belonged to is over by then, and a
# report that was not written can be asked for again from the app.
resource "aws_lambda_function_event_invoke_config" "call_worker" {
  function_name                = aws_lambda_function.call_worker.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 60
}

# Runs the migrations on every deploy of a changed package, before the API is used with it.
# A failing migration fails the apply.
resource "aws_lambda_invocation" "migrate" {
  function_name = aws_lambda_function.migrate.function_name
  input         = jsonencode({ instance = var.database.instance_id })

  triggers = {
    package = data.archive_file.package.output_base64sha256
  }
}

# --- HTTP API -----------------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.name}-api"
  description   = "Konvami API"
  protocol_type = "HTTP"

  dynamic "cors_configuration" {
    for_each = length(var.cors_allowed_origins) > 0 ? [1] : []
    content {
      allow_origins = var.cors_allowed_origins
      allow_methods = ["GET", "POST", "PATCH", "DELETE"]
      allow_headers = ["authorization", "content-type"]
      max_age       = 3600
    }
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.http.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${var.auth.user_pool_id}"
    audience = [var.auth.client_id]
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# One catch-all route per HTTP method the API uses: the function does the routing, and no path
# can skip the token check.
#
# OPTIONS has no route on purpose. A browser asks permission before each call (a CORS preflight,
# sent without the token); with no route matching it, API Gateway answers it itself from the
# CORS settings above. A `$default` route, or any route that matches OPTIONS, would take the
# preflight to the token check or the function instead, and the browser would refuse the call.
resource "aws_apigatewayv2_route" "api" {
  for_each = toset(["GET", "POST", "PATCH", "DELETE"])

  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "${each.key} /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.throttle.rate
    throttling_burst_limit = var.throttle.burst
  }

  # No headers, tokens or bodies: only what is needed to see load and failures.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      time      = "$context.requestTime"
      method    = "$context.httpMethod"
      path      = "$context.path"
      status    = "$context.status"
      latencyMs = "$context.responseLatency"
      authError = "$context.authorizer.error"
    })
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
