# Technical Decisions

## Purpose

This document records the important implementation decisions for CallMissed AI Workspace and the reason each choice was made.

The project is a take-home assessment. The priority is a small, reproducible, secure, explainable deployment rather than a large production platform.

---

## One application with three routes

**Decision:** Three routes — `/chat`, `/images`, `/voice` — served from one application.

**Reason:** The assessment requires three AI capabilities. They share one frontend, one backend, one deployment, and one navigation system.

**Rejected:** separate applications; dashboards; account pages; billing; CRM features.

---

## No application database

**Decision:** No database is used. Chat history and generated previews are temporary browser state.

**Reason:** The assessment does not require permanent history, accounts, or cross-device synchronisation. A database would add infrastructure, credentials, migrations, backup requirements, and cleanup requirements without solving an assessment requirement.

---

## FastAPI backend

**Decision:** Use FastAPI with Pydantic validation and an httpx provider adapter.

**Reason:** The backend needs request validation, asynchronous provider HTTP requests, bounded request sizes, safe error translation, and server-side credential handling.

---

## Provider isolation

**Decision:** All CallMissed-specific HTTP paths and response parsing are kept in the provider service module (`app/services/callmissed.py`).

**Reason:** The browser interacts with application contracts rather than provider-specific APIs. This also allows routine tests to mock provider responses without consuming API credits.

---

## CallMissed only

**Decision:** All user-facing AI requests use CallMissed. No other external AI API is used. AWS services support hosting and operations only. Browser voice uses the temporary WebRTC connection information returned by the CallMissed Voice Session API.

---

## Browser-memory-only chat

**Decision:** Conversation history is not stored permanently. React state holds the current conversation. Refresh or New Chat clears it.

**Reason:** This keeps privacy behaviour simple and honest. Refreshing the page or starting a new chat clears all history. The implementation matches the behaviour.

---

## Fixed provider models

**Decision:** Use the tested models — Chat: `sarvam-105b-conversations`, Images: `sdxl-lightning`.

**Reason:** The take-home does not require model selection. A model picker could expose untested or unauthorised models and increase provider-budget risk.

---

## No automatic retry of ambiguous paid POST requests

**Decision:** Do not automatically retry Chat, Image, or Voice creation after an ambiguous timeout.

**Reason:** The provider may have completed the original request even when the application timed out. Automatic retry could duplicate provider usage and consume additional budget.

---

## Reviewer gate

**Decision:** Protect deployed paid endpoints with a reviewer passcode.

**Reason:** The Lambda Function URL is publicly reachable and the company supplied a limited API budget. The gate is deliberately smaller than a full account system.

---

## Paid-request kill switch

**Decision:** Support `PAID_REQUESTS_ENABLED=false` to disable all new Chat, Image, and Voice requests instantly.

**Reason:** New provider requests can be disabled quickly if provider credits are exhausted, unexpected usage occurs, or the review window closes. The kill switch acts without requiring a redeployment.

---

## Docker multi-stage build

**Decision:** Build React in a Node stage and run the final application in a Python runtime stage.

**Reason:** Node build tooling is not required in the final runtime image. The final runtime uses a non-root application user.

---

## AWS Lambda instead of a continuously running server

**Decision:** Deploy the application as a Lambda container image.

**Reason:** The expected assessment traffic is low and intermittent. Lambda provides an HTTPS Function URL, request-driven compute, container-image support, CloudWatch integration, and no continuously running VM cost.

---

## No VPC attachment

**Decision:** Lambda is not attached to a VPC.

**Reason:** The application requires outbound HTTPS access to CallMissed and Secrets Manager. It does not require private VPC resources. Avoiding VPC networking avoids NAT-related complexity and cost.

---

## AWS Secrets Manager

**Decision:** Store runtime credentials and application secrets in one Secrets Manager secret.

**Reason:** Secrets remain separate from Git, Docker images, Terraform values, and GitHub repository configuration.

---

## GitHub OIDC

**Decision:** GitHub Actions assumes an AWS IAM role using OpenID Connect.

**Reason:** No long-lived AWS access key needs to be stored as a GitHub secret.

---

## Immutable release images

**Decision:** Use commit-specific ECR image tags and deploy by resolved image digest.

**Reason:** A release can be tied to a specific source commit and container artifact. Lambda resolves a container image deployment to a specific digest.

---

## Deployment rollback

**Decision:** Capture the currently deployed Lambda image before updating the function. If the new deployment fails health checks, restore the previous resolved image.

**Reason:** A failed release should have a defined recovery path without requiring a new build.

---

## Terraform

**Decision:** Provision AWS infrastructure with Terraform.

**Reason:** Infrastructure is reviewable, repeatable, and removable. The Terraform state is kept in a private versioned S3 backend.

---

## Unreserved Lambda concurrency

**Decision:** Do not configure reserved Lambda concurrency.

**Reason:** The AWS account quota did not permit the desired reserved allocation. Other budget controls remain active: reviewer gate, application throttling, paid-request kill switch, bounded provider requests, and provider-side budget.

---

## CloudWatch instead of a separate observability platform

**Decision:** Use CloudWatch Logs and AWS-native Lambda visibility.

**Reason:** The assessment does not require a dedicated metrics or logging stack. Adding an external monitoring service would increase scope without improving the required reviewer flow.
