# Cost and Resource Lifecycle

## Purpose

This document records expected cost drivers, budget controls, review-window policy, and teardown steps for CallMissed AI Workspace.

This is an assessment environment and is not intended to run indefinitely.

---

## Provider budget

CallMissed supplied a maximum API budget of USD 20.

Real-provider testing is intentionally limited. Routine CI uses mocked provider responses.

Provider-budget controls:

- reviewer passcode;
- fixed provider models;
- bounded chat context and output;
- one image per request;
- 180-second voice cap;
- application throttling;
- no automatic paid-request retry;
- paid-request kill switch.

---

## AWS account

The deployment currently uses region `us-east-1`.

Actual AWS Billing remains the source of truth for incurred charges.

---

## AWS resources

### Lambda

Compute is request-driven. There is no continuously running EC2 instance. The assessment workload is expected to be small.

Lambda has an ongoing free allowance that includes one million requests and up to 400,000 GB-seconds per month for eligible usage. The application must still be treated as billable infrastructure because actual account eligibility and usage determine the final charge.

### Lambda Function URL

Used as the HTTPS entry point. Normal Lambda request and compute pricing applies to invocations.

### Amazon ECR

Stores immutable application container images. The repository lifecycle policy limits retained images. Storage grows with number of images × image size × retention time.

### AWS Secrets Manager

One secret is used: `callmissed-ai-workspace/runtime`.

Secrets Manager pricing includes secret storage and API requests (approximately USD 0.40 per stored secret per month, plus request charges). The application caches the loaded secret for the process lifetime instead of retrieving it for every application request.

### CloudWatch Logs

CloudWatch stores Lambda and application logs. The configured log group uses finite retention. Cost depends on log ingestion and retained log volume. The application deliberately avoids verbose provider-payload logging.

### S3 Terraform state

The Terraform state bucket stores a very small state file and historical versions. Expected cost is low, but the bucket remains an AWS resource until it is manually removed.

### IAM and GitHub OIDC

IAM roles and the IAM OIDC provider do not create an hourly compute resource.

---

## Services intentionally not used

The project does not create:

- EC2;
- NAT Gateway;
- Application Load Balancer;
- RDS;
- EKS or ECS;
- API Gateway;
- CloudFront;
- permanent image-storage bucket.

This keeps the assessment architecture and cost surface small.

---

## Review window

Recommended policy:

```text
Submission day
      ↓
Keep demo available for approximately 14 days
      ↓
Extend only if review is still active
      ↓
Disable paid requests
      ↓
Preserve evidence
      ↓
Destroy assessment infrastructure
```

Do not destroy the application immediately after sending the submission because the reviewer needs the hosted URL.

Do not leave the assessment infrastructure running indefinitely.

---

## Cost monitoring

During the review window check: AWS Console → Billing and Cost Management

Review:

- remaining AWS credits;
- month-to-date cost;
- active budget alerts.

Also monitor remaining CallMissed assignment budget if provider visibility is available.

---

## Shutdown sequence

Before teardown:

- disable new paid provider requests;
- save final test evidence;
- save the final application URL for documentation;
- save the release tag and deployed image digest;
- confirm the GitHub repository contains the final source;
- verify that no further reviewer access is expected.

Terraform teardown:

```bash
cd infrastructure/terraform
terraform plan -destroy
```

Review. Then:

```bash
terraform destroy
```

After Terraform-managed resources are gone:

- empty the manually created Terraform-state S3 bucket;
- delete the state bucket;
- remove temporary administrative IAM access that is no longer needed;
- verify Billing and active resources again.

AWS Secrets Manager does not charge for secrets marked for deletion.

---

## What remains after teardown

The following remain:

- GitHub source repository;
- Dockerfile;
- Terraform configuration;
- CI workflow;
- deployment workflow;
- architecture documentation;
- runbook;
- test evidence;
- release tag.

The infrastructure can therefore be recreated if a later reviewer requests another demonstration.
