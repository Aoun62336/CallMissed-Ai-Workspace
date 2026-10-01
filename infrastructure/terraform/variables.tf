variable "aws_region" {
  description = "AWS region for the deployment."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Stable AWS resource/application name."
  type        = string
  default     = "callmissed-ai-workspace"
}

variable "github_owner" {
  description = "GitHub repository owner."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name."
  type        = string
}

variable "github_oidc_provider_arn" {
  description = <<EOT
Existing GitHub OIDC provider ARN, if this AWS account already has one.
Leave null and Terraform creates it.
EOT
  type        = string
  default     = null
  nullable    = true
}

variable "image_digest" {
  description = <<EOT
ECR image digest used only for the initial Lambda creation.
Example: sha256:abcd...
Leave null during the foundation apply.
EOT
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.image_digest == null ||
      can(regex("^sha256:[0-9a-f]{64}$", var.image_digest))
    )
    error_message = "image_digest must be null or a valid sha256 digest."
  }
}
