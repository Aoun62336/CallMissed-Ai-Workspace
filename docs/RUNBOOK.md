# Operations Runbook

## 1. Scope

This runbook covers the deployed CallMissed AI Workspace assessment environment.

```text
AWS region:           us-east-1
Lambda function:      callmissed-ai-workspace
ECR repository:       callmissed-ai-workspace
Secrets Manager:      callmissed-ai-workspace/runtime
CloudWatch log group: /aws/lambda/callmissed-ai-workspace
Lambda Function URL:  https://h3t6ek3ebsysq7yfx2f3aoqjve0uqrsr.lambda-url.us-east-1.on.aws/
```

---

## 2. Local AWS authentication

Verify credentials before any AWS operation:

```bash
aws sts get-caller-identity
```

Do not continue with deployment or Terraform operations if the identity is unexpected.

---

## 3. Application URL

From the Terraform directory:

```bash
cd infrastructure/terraform
terraform output -raw app_url
```

Or:

```bash
export APP_URL="$(terraform output -raw app_url)"
```

Return to repository root:

```bash
cd ../..
```

---

## 4. Standard health check

Run:

```bash
export APP_URL="<application-url>"
./scripts/smoke.sh
```

Expected:

```
[1/3] Liveness
{"status":"ok"}
PASS

[2/3] Readiness
{"status":"ready"}
PASS

[3/3] Frontend
PASS

Smoke test passed.
```

These checks do not intentionally consume CallMissed API credits.

---

## 5. Lambda status

```bash
aws lambda get-function-configuration \
  --function-name callmissed-ai-workspace \
  --region us-east-1 \
  --query '{
    State:State,
    LastUpdateStatus:LastUpdateStatus,
    MemorySize:MemorySize,
    Timeout:Timeout,
    PackageType:PackageType
  }'
```

Healthy deployment:

```
State:            Active
LastUpdateStatus: Successful
```

---

## 6. Current deployed image

```bash
aws lambda get-function \
  --function-name callmissed-ai-workspace \
  --region us-east-1 \
  --query 'Code.ResolvedImageUri' \
  --output text
```

Record this value before manual deployment or rollback work.

---

## 7. Application logs

Recent logs:

```bash
MSYS_NO_PATHCONV=1 aws logs tail \
  /aws/lambda/callmissed-ai-workspace \
  --since 15m \
  --region us-east-1
```

Follow logs:

```bash
MSYS_NO_PATHCONV=1 aws logs tail \
  /aws/lambda/callmissed-ai-workspace \
  --follow \
  --region us-east-1
```

Normal request logs should contain operational metadata such as:

```
request_id  method  route  status  elapsed_ms
```

Routine logs should not contain:

- CallMissed API key
- Authorization header
- reviewer passcode
- voice token
- signed voice lease
- generated image base64

---

## 8. Application unavailable

Symptoms:

- Function URL does not answer.
- `/health/live` fails.
- browser reports server failure.

Check:

```bash
aws lambda get-function-configuration \
  --function-name callmissed-ai-workspace \
  --region us-east-1
```

Then:

```bash
MSYS_NO_PATHCONV=1 aws logs tail \
  /aws/lambda/callmissed-ai-workspace \
  --since 30m \
  --region us-east-1
```

Check the latest GitHub Deploy workflow.

If the most recent release introduced the failure, restore the previous known-good ECR image.

---

## 9. Readiness fails

Symptoms:

```
/health/live  = 200
/health/ready = 503
```

Likely causes:

- runtime secret cannot be loaded;
- required provider key missing;
- application session secret missing;
- reviewer passcode hash missing.

Check that the secret exists without retrieving its value:

```bash
aws secretsmanager describe-secret \
  --secret-id callmissed-ai-workspace/runtime \
  --region us-east-1
```

Check Lambda execution-role permissions if Secrets Manager access is denied.

Do not print the secret value during troubleshooting unless absolutely necessary.

---

## 10. Provider authentication failure

Application error: `provider_auth`

Meaning: CallMissed rejected the configured provider credential.

Actions:

- confirm the secret exists;
- confirm the deployed Lambda can read it;
- verify the CallMissed key status through the appropriate provider process;
- rotate the credential if required;
- redeploy or restart the Lambda execution environment if the application has cached an old secret.

Do not expose the key in logs, screenshots, chat, or GitHub.

---

## 11. Provider permission failure

Application error: `provider_permission`

Meaning: The provider credential does not permit the configured model or capability.

Actions:

- confirm the configured model;
- do not switch to an untested model without a requirement;
- if the supplied assignment key should permit the request, contact the assignment contact with the safe error details.

---

## 12. Provider budget exhausted

Application error: `provider_credits`

The company supplied a USD 20 CallMissed budget.

Actions:

- stop repeated testing;
- disable new paid application requests;
- record the safe error code and time;
- contact the supplied assignment contact if the budget appears incorrect or prematurely exhausted.

Do not repeatedly retry provider requests.

---

## 13. Provider rate limit

Application error: `provider_rate_limit`

Actions:

- wait before retrying;
- do not add automatic retry logic;
- verify no accidental scripted traffic is reaching the application;
- use the reviewer gate and paid-request kill switch if unexpected usage is suspected.

---

## 14. Provider timeout

Application error: `provider_timeout`

**Important:** Do not automatically repeat the request. The original provider operation may have completed upstream even though the application stopped waiting. Allow a deliberate reviewer retry only when appropriate.

---

## 15. Disable new paid requests

Emergency control: `PAID_REQUESTS_ENABLED=false`

This blocks:

```
POST /api/chat
POST /api/images
POST /api/voice/sessions
```

Existing provider voice sessions must still be ended separately.

For an emergency operational shutdown, update the Lambda environment configuration through AWS, or apply the corresponding Terraform configuration change.

Verify afterward that a paid endpoint returns: `paid_requests_disabled`

Restore `PAID_REQUESTS_ENABLED=true` only after the reason for the shutdown is resolved.

---

## 16. Voice microphone remains active

First check the browser.

Actions:

- use **End conversation**;
- navigate away from Voice;
- confirm the browser microphone indicator disappears;
- close the tab if necessary.

The browser stops local microphone tracks independently of successful provider termination.

The provider session also has a 180-second maximum duration as a backstop.

---

## 17. Voice provider termination failure

The UI retains the session lease and exposes a retry action after local microphone release.

Actions:

- confirm the local microphone is already released;
- retry provider termination once;
- do not start multiple overlapping test sessions;
- rely on the provider duration cap if termination remains unavailable.

---

## 18. Deployment failure

Open: GitHub → Actions → Deploy

Check:

- OIDC authentication;
- ECR push;
- resolved image digest;
- Lambda update;
- health verification;
- rollback step.

Do not manually replace a failed deployment until the reason is understood.

---

## 19. Manual rollback

List recent images:

```bash
aws ecr describe-images \
  --repository-name callmissed-ai-workspace \
  --region us-east-1 \
  --query 'reverse(sort_by(imageDetails,&imagePushedAt))[:5].[imageTags[0],imageDigest,imagePushedAt]' \
  --output table
```

Capture the current release:

```bash
CURRENT_IMAGE="$(
  aws lambda get-function \
    --function-name callmissed-ai-workspace \
    --region us-east-1 \
    --query 'Code.ResolvedImageUri' \
    --output text
)"
echo "${CURRENT_IMAGE}"
```

Choose a known-good previous ECR digest and construct:

```
<account>.dkr.ecr.us-east-1.amazonaws.com/callmissed-ai-workspace@sha256:<digest>
```

Deploy it:

```bash
aws lambda update-function-code \
  --function-name callmissed-ai-workspace \
  --region us-east-1 \
  --image-uri "<previous-image-uri>" \
  > /dev/null
```

Wait:

```bash
aws lambda wait function-updated \
  --function-name callmissed-ai-workspace \
  --region us-east-1
```

Run:

```bash
./scripts/smoke.sh
```

If the rollback drill is successful, restore the original current image:

```bash
aws lambda update-function-code \
  --function-name callmissed-ai-workspace \
  --region us-east-1 \
  --image-uri "${CURRENT_IMAGE}" \
  > /dev/null

aws lambda wait function-updated \
  --function-name callmissed-ai-workspace \
  --region us-east-1

./scripts/smoke.sh
```

Only use a previous image that was previously known to be healthy.

---

## 20. Secret rotation

Update the existing Secrets Manager secret rather than creating a second application secret.

After rotation, remember that the running application caches runtime secrets for the process lifetime.

Deploying or updating the Lambda creates new execution environments that load the new value.

Verify:

```bash
./scripts/smoke.sh
```

Then perform one controlled application request if required.

---

## 21. AWS cost concern

Check: AWS Console → Billing and Cost Management

Review:

- Free Tier and credits;
- month-to-date charges;
- budget alerts.

Assessment resources expected to produce cost include:

- Secrets Manager secret storage and API calls;
- ECR image storage;
- Lambda usage beyond applicable free allowance;
- CloudWatch log ingestion/storage;
- S3 state storage and requests.

IAM roles and GitHub OIDC provider do not have a direct hourly runtime charge.

---

## 22. Teardown

Only perform teardown after the review window.

First:

- disable new paid requests;
- record final evidence;
- record Terraform outputs;
- confirm the repository and release tag are safely stored remotely.

Then:

```bash
cd infrastructure/terraform
terraform plan -destroy
```

Review carefully. Then:

```bash
terraform destroy
```

Terraform removes only resources it manages. The S3 Terraform-state bucket was bootstrapped separately and is deleted separately after Terraform-managed resources are gone.

After destroy:

- verify Lambda is absent;
- verify ECR repository is absent;
- verify the runtime secret is scheduled for deletion;
- verify assessment IAM roles are removed;
- empty and delete the Terraform state bucket when state is no longer required;
- remove temporary administrative IAM access that is no longer required;
- inspect Billing again.

AWS Secrets Manager does not charge for secrets that are marked for deletion.
