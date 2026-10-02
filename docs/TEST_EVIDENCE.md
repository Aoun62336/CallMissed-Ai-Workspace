# Test Evidence

## Purpose

This document records verification performed against the CallMissed AI Workspace release.

Only observed results are recorded as Passed. Routine automated testing uses mocked CallMissed responses. Real provider testing is intentionally small because the take-home API budget is USD 20.

---

## Release identity

| Field | Value |
|-------|-------|
| Release tag | `v1.0.0` |
| AWS region | `us-east-1` |
| Lambda function | `callmissed-ai-workspace` |
| ECR repository | `callmissed-ai-workspace` |
| Environment | AWS demo |
| Provider | CallMissed only |
| Test date | `<YYYY-MM-DD>` |

The Git tag identifies the exact submitted source commit.

---

## Automated checks

| Check | Expected | Observed | Status |
|-------|----------|----------|--------|
| Ruff | No lint failures | `<record>` | `<Pass/Fail>` |
| Backend pytest | 19 tests pass | `<record>` | `<Pass/Fail>` |
| Frontend production build | Build succeeds | `<record>` | `<Pass/Fail>` |
| Repository Trivy scan | No blocking High/Critical finding | `<record>` | `<Pass/Fail>` |
| Docker build | Image builds | `<record>` | `<Pass/Fail>` |
| Container smoke check | live/ready/chat route pass | `<record>` | `<Pass/Fail>` |
| Container Trivy scan | No blocking High/Critical finding | `<record>` | `<Pass/Fail>` |
| Terraform format | Clean | `<record>` | `<Pass/Fail>` |
| Terraform validate | Valid | `<record>` | `<Pass/Fail>` |

---

## Backend behavior tests

The automated backend test suite covers:

- missing provider configuration;
- error-envelope structure;
- request-size rejection;
- bounded chat history;
- system-role rejection;
- blank and oversized chat rejection;
- reasoning-only provider response rejection;
- provider 401 mapping;
- provider 402 credit mapping;
- provider 403 permission mapping;
- provider 429 mapping;
- provider service failure mapping;
- provider timeout without automatic retry;
- image response validation;
- voice lease creation;
- voice termination ownership;
- foreign voice-session rejection;
- reviewer gate login/logout;
- soft application throttling;
- paid-request kill switch;
- AWS Secrets Manager configuration loading.

Observed:

```
19 passed
```

---

## Production health

Command:

```bash
./scripts/smoke.sh
```

| Endpoint | Expected | Observed | Status |
|----------|----------|----------|--------|
| `/health/live` | HTTP 200 | `<record>` | `<Pass/Fail>` |
| `/health/ready` | HTTP 200 | `<record>` | `<Pass/Fail>` |
| `/chat` | HTTP 200 HTML | `<record>` | `<Pass/Fail>` |

These checks make no intentional provider request.

---

## Reviewer access

Test: Open the deployment in an incognito/private browser window.

Expected:

- reviewer-access screen appears before paid features can be used;
- incorrect passcode is rejected;
- correct passcode opens the application.

Observed: `<record>`

Status: `<Pass/Fail>`

---

## Unauthenticated paid endpoint

Test:

```bash
curl \
  -i \
  -X POST \
  "${APP_URL%/}/api/chat" \
  -H "Content-Type: application/json" \
  --data '{"messages":[{"role":"user","content":"Access-gate verification"}]}'
```

Expected: `HTTP 401 reviewer_access_required`. The provider should not be called.

Observed: `<record>`

Status: `<Pass/Fail>`

---

## Paid-request kill switch

This is tested without a real provider call.

Expected when `PAID_REQUESTS_ENABLED=false`: paid endpoints return `HTTP 503 paid_requests_disabled`.

Observed: `<record>`

Status: `<Pass/Fail>`

---

## Chat live-provider smoke test

Provider usage is deliberately limited.

- **Test 1:** Explain Docker in one sentence.
- **Test 2:** Why is it useful for DevOps?

Expected:

- first answer succeeds;
- follow-up uses bounded conversation context;
- response is displayed;
- no provider-internal reasoning content is displayed.

Observed:

| | |
|-|-|
| First response | `<record>` |
| Follow-up | `<record>` |
| Elapsed values | `<record>` |

Status: `<Pass/Fail>`

---

## Image live-provider smoke test

Prompt: A small green tree on a plain white background.

Expected:

- one image appears;
- output can be downloaded;
- application reports real elapsed time;
- no permanent gallery is created.

Observed:

| | |
|-|-|
| Image displayed | `<yes/no>` |
| Download | `<yes/no>` |
| Elapsed | `<record>` |
| Decoded size | `<record>` |

Status: `<Pass/Fail>`

---

## Voice live-provider smoke test

Steps:

1. open Voice;
2. select **Start conversation**;
3. allow microphone access;
4. say: *Hello. Explain Docker in one sentence.*
5. confirm audible response;
6. mute;
7. unmute;
8. end;
9. confirm browser microphone indicator stops.

Expected:

- session connects;
- response is audible;
- mute/unmute work;
- End releases local microphone;
- provider termination is requested.

Observed: `<record>`

Status: `<Pass/Fail>`

---

## Voice navigation cleanup

Steps:

1. start one short voice session;
2. confirm it is connected;
3. navigate to Chat;
4. inspect the browser microphone indicator.

Expected: Microphone use stops after leaving Voice.

Observed: `<record>`

Status: `<Pass/Fail>`

---

## Logging and redaction

Recent logs inspected with:

```bash
aws logs tail \
  /aws/lambda/callmissed-ai-workspace \
  --since 15m \
  --region us-east-1
```

Expected: Operational request metadata is visible.

The review should not reveal:

- provider API key;
- Authorization header;
- reviewer passcode;
- voice token;
- voice lease;
- generated-image base64;
- full chat prompt or answer in routine request logs.

Observed: `<record>`

Status: `<Pass/Fail>`

---

## Rollback drill

Current image captured before the test. A previous known-good ECR image was deployed. Health checks were run. The original current image was then restored and health checks were repeated.

| Step | Status |
|------|--------|
| Current image recorded | `<Pass/Fail>` |
| Previous known-good image selected | `<Pass/Fail>` |
| Lambda updated to previous image | `<Pass/Fail>` |
| Health after rollback | `<Pass/Fail>` |
| Original release restored | `<Pass/Fail>` |
| Health after restore | `<Pass/Fail>` |

Notes: `<record>`

---

## Security scan

Final checks:

```bash
git status
git check-ignore backend/.env
git ls-files backend/.env
```

Expected:

- working tree clean;
- `backend/.env` ignored;
- `git ls-files backend/.env` returns no output.

Trivy CI results: `<record>`

Status: `<Pass/Fail>`

---

## Final reviewer verification

Performed from a private/incognito browser:

| Check | Status |
|-------|--------|
| HTTPS URL opens | `<Pass/Fail>` |
| Reviewer gate opens | `<Pass/Fail>` |
| Chat works | `<Pass/Fail>` |
| Chat follow-up works | `<Pass/Fail>` |
| Image generation works | `<Pass/Fail>` |
| Image download works | `<Pass/Fail>` |
| Voice works | `<Pass/Fail>` |
| Voice End releases microphone | `<Pass/Fail>` |
| Narrow/mobile layout usable | `<Pass/Fail>` |

---

## Result

**Final assessment result:** `<PASS / BLOCKED>`

**Blocking issue, if any:** `<none or factual description>`
