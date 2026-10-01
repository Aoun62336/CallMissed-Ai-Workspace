output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "runtime_secret_arn" {
  value = aws_secretsmanager_secret.runtime.arn
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "lambda_function_name" {
  value = var.image_digest == null ? null : aws_lambda_function.app[0].function_name
}

output "app_url" {
  value = var.image_digest == null ? null : aws_lambda_function_url.app[0].function_url
}
