# Lets the Konvami repository's GitHub Actions deploy to this account without stored keys, like
# NextChronicle's deploy role. The OIDC identity provider itself belongs to NextChronicle's
# bootstrap and is only read here. Created once var.github_deploy is set.

data "aws_iam_openid_connect_provider" "github" {
  count = var.github_deploy == null ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_trust" {
  count = var.github_deploy == null ? 0 : 1

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github[0].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only jobs in the named GitHub environment of this exact repository.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${var.github_deploy.subject_prefix}:environment:${var.github_deploy.environment}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count                = var.github_deploy == null ? 0 : 1
  name                 = "${local.name}-github-deploy"
  description          = "GitHub Actions deploys of ${var.github_deploy.repository}"
  assume_role_policy   = data.aws_iam_policy_document.github_trust[0].json
  max_session_duration = 3600
}

# Least privilege grows with the stack: each module that a deploy must manage adds its own policy
# here. No AdministratorAccess.
