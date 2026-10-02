locals {
  lambda_arn = format(
    "arn:%s:lambda:%s:%s:function:%s",
    data.aws_partition.current.partition,
    var.aws_region,
    data.aws_caller_identity.current.account_id,
    var.project_name,
  )

  github_oidc_provider_arn = (
    var.github_oidc_provider_arn != null
    ? var.github_oidc_provider_arn
    : aws_iam_openid_connect_provider.github[0].arn
  )
}

# ---------------------------------------------------------
# ECR
# ---------------------------------------------------------
resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the newest five images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Allow Lambda to pull this repository image.
data "aws_iam_policy_document" "ecr_lambda" {
  statement {
    sid = "LambdaImagePull"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "aws:SourceArn"
      values   = [local.lambda_arn]
    }
  }
}

resource "aws_ecr_repository_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy     = data.aws_iam_policy_document.ecr_lambda.json
}

# ---------------------------------------------------------
# Runtime secret
# ---------------------------------------------------------
resource "aws_secretsmanager_secret" "runtime" {
  name                    = "${var.project_name}/runtime"
  description             = "Runtime secrets for the CallMissed AI Workspace."
  recovery_window_in_days = 7
}

# ---------------------------------------------------------
# CloudWatch
# ---------------------------------------------------------
resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${var.project_name}"
  retention_in_days = 14
}

# ---------------------------------------------------------
# Lambda execution role
# ---------------------------------------------------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project_name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_runtime" {
  statement {
    sid = "ApplicationLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      "${aws_cloudwatch_log_group.app.arn}:*",
    ]
  }

  statement {
    sid = "ReadRuntimeSecret"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.runtime.arn,
    ]
  }
}

resource "aws_iam_role_policy" "lambda_runtime" {
  name   = "${var.project_name}-runtime"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_runtime.json
}

# ---------------------------------------------------------
# Lambda
# ---------------------------------------------------------
resource "aws_lambda_function" "app" {
  count = var.image_digest == null ? 0 : 1

  function_name = var.project_name
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"

  image_uri = format(
    "%s@%s",
    aws_ecr_repository.app.repository_url,
    var.image_digest,
  )

  architectures                  = ["x86_64"]
  memory_size                    = 1024
  timeout                        = 120
  reserved_concurrent_executions = -1

  environment {
    variables = {
      APP_ENV                                = "production"
      REVIEWER_GATE_ENABLED                  = "true"
      PAID_REQUESTS_ENABLED                  = "true"
      CALLMISSED_CHAT_MODEL                  = "sarvam-105b-conversations"
      CALLMISSED_IMAGE_MODEL                 = "sdxl-lightning"
      AWS_SECRET_ID                          = aws_secretsmanager_secret.runtime.arn
      PORT                                   = "8000"
      AWS_LWA_PORT                           = "8000"
      AWS_LWA_READINESS_CHECK_PATH           = "/health/live"
      AWS_LWA_READINESS_CHECK_HEALTHY_STATUS = "200-399"
      AWS_LWA_INVOKE_MODE                    = "buffered"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.app,
    aws_ecr_repository_policy.app,
    aws_iam_role_policy.lambda_runtime,
  ]

  # Application releases are handled by GitHub Actions
  # after Terraform creates the function.
  lifecycle {
    ignore_changes = [
      image_uri,
    ]
  }
}

# ---------------------------------------------------------
# HTTPS Function URL
# ---------------------------------------------------------
resource "aws_lambda_function_url" "app" {
  count = var.image_digest == null ? 0 : 1

  function_name      = aws_lambda_function.app[0].function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"
}

# ---------------------------------------------------------
# GitHub OIDC provider
# ---------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  count = var.github_oidc_provider_arn == null ? 1 : 0

  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com",
  ]
}

# ---------------------------------------------------------
# GitHub deployment role
# ---------------------------------------------------------
data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type = "Federated"
      identifiers = [
        local.github_oidc_provider_arn,
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values = [
        "sts.amazonaws.com",
      ]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_owner}/${var.github_repository}:ref:refs/heads/main",
        # Repositories using GitHub's newer repository-ID subject format.
        "repo:${var.github_owner}@*/${var.github_repository}@*:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${var.project_name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_assume.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid = "ECRLogin"
    actions = [
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }

  statement {
    sid = "PushApplicationImage"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [
      aws_ecr_repository.app.arn,
    ]
  }

  statement {
    sid = "DeployLambdaImage"
    actions = [
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:UpdateFunctionCode",
    ]
    resources = [
      local.lambda_arn,
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${var.project_name}-deployment"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
