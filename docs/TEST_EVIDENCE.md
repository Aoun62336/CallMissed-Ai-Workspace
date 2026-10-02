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
| Test date | `2026-10-02` |

The Git tag identifies the exact submitted source commit.

---

## Automated checks

Local runs performed on branch `docs/final-submission` before merge to `main`. Trivy scans verified via GitHub Actions CI run (commit `ed4fa285`).

| Check | Expected | Observed | Status |
|-------|----------|----------|---------|
| Ruff | No lint failures | `All checks passed!` | Pass |
| Backend pytest | 19 tests pass | `19 passed, 1 warning in 0.81s` | Pass |
| Frontend production build | Build succeeds | `✓ built in 476ms` (chunk size advisory — not a build failure) | Pass |
| Repository Trivy scan | No blocking High/Critical finding | No blocking finding — GitHub Actions CI passed | Pass |
| Docker build | Image builds | `FINISHED` in 7.9s — all 25 steps complete | Pass |
| Container smoke check | live/ready/chat route pass | `/health/live` 200 confirmed in container run log | Pass |
| Container Trivy scan | No blocking High/Critical finding | No blocking finding — GitHub Actions CI passed | Pass |
| Terraform format | Clean | No output (clean) | Pass |
| Terraform validate | Valid | `Success! The configuration is valid.` | Pass |

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
19 passed, 1 warning in 0.81s
```

Run locally against mocked provider responses. Real provider not called.

---

## Production health

Command:

```bash
./scripts/smoke.sh
```

| Endpoint | Expected | Observed | Status |
|----------|----------|----------|--------|
| `/health/live` | HTTP 200 | `HTTP 200 {"status":"ok"}` | Pass |
| `/health/ready` | HTTP 200 | `HTTP 200 {"status":"ready"}` | Pass |
| `/chat` | HTTP 200 HTML | `HTTP 200` | Pass |

Raw output:

```
CallMissed AI Workspace smoke test
Target: https://h3t6ek3ebsysq7yfx2f3aoqjve0uqrsr.lambda-url.us-east-1.on.aws

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

These checks make no intentional provider request.

---

## Reviewer access

Test: Open the deployment in an incognito/private browser window.

Expected:

- reviewer-access screen appears before paid features can be used;
- incorrect passcode is rejected;
- correct passcode opens the application.

Observed: Reviewer gate screen appeared before any paid feature was accessible. The correct passcode opened the application. Chat, Images, and Voice all became available after login.

Status: Pass

---

## Unauthenticated paid endpoint

Access status check:

```bash
curl -s "${APP_URL%/}/api/access/status"
```

Observed:

```json
{"required":true,"authenticated":false}
```

Unauthenticated paid endpoint:

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json
x-request-id: 3e7815df3a40
cache-control: no-store

{"error":{"code":"reviewer_access_required","message":"Enter the reviewer passcode to use AI features.","request_id":"3e7815df3a40","retryable":false}}
```

Expected: `HTTP 401 reviewer_access_required`. The provider should not be called.

Observed: `HTTP 401 reviewer_access_required`. Provider was not called.

Status: Pass

---

## Paid-request kill switch

Tested by running the final container image locally with `PAID_REQUESTS_ENABLED=false`:

```
docker run --rm \
  -e PAID_REQUESTS_ENABLED=false \
  -e CALLMISSED_API_KEY=ci-placeholder \
  -e APP_ENV=local \
  -e REVIEWER_GATE_ENABLED=false \
  -p 8001:8000 callmissed-ai-workspace:final-check
```

Request:

```
POST http://127.0.0.1:8001/api/chat
```

Observed:

```
HTTP/1.1 503 Service Unavailable
content-type: application/json
cache-control: no-store
x-request-id: b32398713db3

{"error":{"code":"paid_requests_disabled","message":"AI requests are temporarily disabled.","request_id":"b32398713db3","retryable":false}}
```

All three paid endpoints (`/api/chat`, `/api/images`, `/api/voice/sessions`) return `HTTP 503 paid_requests_disabled` when the kill switch is active. Verified for all three in the automated test suite (`test_paid_requests_kill_switch`).

Status: Pass

---

## Chat live-provider smoke test

Provider usage is deliberately limited.

- **Test 1:** Explain Docker in one sentence.
- **Test 2:** give 3 daily devops operations commands of docker

Model: `sarvam-105b-conversations` (confirmed in UI)
Context: up to 4 recent messages reused (UI display label; schema maximum is 12 messages)

Expected:

- first answer succeeds;
- follow-up uses bounded conversation context;
- response is displayed;
- no provider-internal reasoning content is displayed.

Observed:

| | |
|-|-|
| First response | Answered correctly. "Docker is a tool that lets you package and run applications in isolated containers, making them easy to deploy anywhere." |
| Follow-up | Answered correctly with context. Listed `docker run`, `docker ps`, `docker stop` with descriptions. |
| Elapsed — follow-up | 0.49 s (displayed in UI) |
| Reasoning content visible | No |

Screenshot: `docs/evidence/deployed-chat.png`

Status: Pass

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
| Image displayed | yes |
| Download | yes |
| Elapsed | not recorded |
| Decoded size | not recorded |

Screenshot: `docs/evidence/deployed-image.png`

Status: Pass

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

Observed: Session connected. Audible response received. Mute and unmute worked. End released local microphone. Provider termination completed.

Screenshot: `docs/evidence/deployed-voice.png`

Status: Pass

---

## Voice navigation cleanup

Steps:

1. start one short voice session;
2. confirm it is connected;
3. navigate to Chat;
4. inspect the browser microphone indicator.

Expected: Microphone use stops after leaving Voice.

Observed: Microphone use stopped after navigating away from Voice to Chat. Browser microphone indicator disappeared.

Status: Pass

---

## Logging and redaction

Recent logs inspected with:

```bash
MSYS_NO_PATHCONV=1 aws logs tail \
  /aws/lambda/callmissed-ai-workspace \
  --since 30m \
  --region us-east-1 \
  > /tmp/callmissed-final-logs.txt

grep -Ei \
  'authorization:|bearer |CALLMISSED_API_KEY|APP_SESSION_SECRET|REVIEWER_PASSCODE' \
  /tmp/callmissed-final-logs.txt
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

Observed: Logs contained operational request metadata (request ID, method, route, HTTP status, elapsed ms). No provider API key, Authorization header, passcode, voice token, voice lease, image base64, or full prompt/answer text was visible in routine request logs.

Status: Pass

---

## Rollback drill

Images available in ECR at time of drill (newest first):

```
bootstrap                                sha256:0883143b671ae10e2266daece9e08fe4cf7a72de24b3a9daa3b02e3d4fa55ecb  2026-10-02T16:14
ed4fa285ad8526e1d34a1e07398d255f9c95a077 sha256:01420db9e9c1b6337e1cc949415a634fc22cc6425214bff8754e3fd50702504d  2026-10-02T16:09
5d3938f060c626e929acc3afcbde7f529bd3fa4b sha256:2b9048bbaf53756f797dfadb0f85825e534ce5357480d629f444ae359c0f2528  2026-10-01T23:04
```

Current image before drill: `888284248249.dkr.ecr.us-east-1.amazonaws.com/callmissed-ai-workspace@sha256:0883143b671ae10e2266daece9e08fe4cf7a72de24b3a9daa3b02e3d4fa55ecb`

Previous known-good image used: `888284248249.dkr.ecr.us-east-1.amazonaws.com/callmissed-ai-workspace@sha256:01420db9e9c1b6337e1cc949415a634fc22cc6425214bff8754e3fd50702504d` (commit `ed4fa285`, deployed 5 minutes before current)

| Step | Status |
|------|--------|
| Current image recorded | Pass |
| Previous known-good image selected | Pass |
| Lambda updated to previous image | Pass |
| Health after rollback | Pass |
| Original release restored | Pass |
| Health after restore | Pass |

Health after rollback (raw):

```
[1/3] Liveness   {"status":"ok"}    PASS
[2/3] Readiness  {"status":"ready"} PASS
[3/3] Frontend                      PASS
Smoke test passed.
```

Health after restore (raw):

```
[1/3] Liveness   {"status":"ok"}    PASS
[2/3] Readiness  {"status":"ready"} PASS
[3/3] Frontend                      PASS
Smoke test passed.
```

Notes: Rollback to previous commit image succeeded. Application remained healthy on both the rolled-back image and after restoration of the current release.

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

Git checks observed:

- working tree clean after final commit and push;
- `backend/.env` excluded via `.gitignore` and not tracked;
- `git ls-files backend/.env` returns no output.

Trivy CI results: No blocking High/Critical finding. Repository scan and container scan both passed in GitHub Actions CI (commit `ed4fa285`, visible in CI run that triggered the production deployment).

Status: Pass

---

## Final reviewer verification

Performed from Chrome Incognito on the deployed application.

Screenshots: `docs/evidence/aws-lambda-UI.png`, `docs/evidence/aws-lambda-configuration.png`, `docs/evidence/deployed-chat.png`, `docs/evidence/deployed-image.png`, `docs/evidence/deployed-voice.png`

| Check | Status |
|-------|--------|
| HTTPS URL opens | Pass |
| Reviewer gate opens | Pass |
| Chat works | Pass |
| Chat follow-up works | Pass |
| Image generation works | Pass |
| Image download works | Pass |
| Voice works | Pass |
| Voice End releases microphone | Pass |
| Narrow/mobile layout usable | Pass |

---

## Result

**Final assessment result:** PASS

**Blocking issue, if any:** None.

---

## Evidence screenshots

| File | Contents |
|------|----------|
| [`ci-green.png`](evidence/ci-green.png) | GitHub Actions CI run — all checks green |
| [`deployed-chat.png`](evidence/deployed-chat.png) | Chat feature — first answer and follow-up visible |
| [`deployed-image.png`](evidence/deployed-image.png) | Image feature — generated image displayed and downloaded |
| [`deployed-voice.png`](evidence/deployed-voice.png) | Voice feature — active session |
| [`aws-lambda-UI.png`](evidence/aws-lambda-UI.png) | AWS Lambda console — function overview |
| [`aws-lambda-configuration.png`](evidence/aws-lambda-configuration.png) | AWS Lambda configuration — State: Active, LastUpdateStatus: Successful |
