# CallMissed AI Workspace [![CI](https://github.com/Aoun62336/CallMissed-Ai-Workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/Aoun62336/CallMissed-Ai-Workspace/actions/workflows/ci.yml)

Independent take-home assessment project by **Aoun Md.**

CallMissed AI Workspace is a small web application that exposes three CallMissed capabilities through one responsive interface:

- multi-turn AI chat;
- image generation and download;
- browser voice conversation.

The project focuses on a small application with reproducible builds, automated validation, secure runtime configuration, AWS deployment, operational health checks, and rollback.

This repository is an independent assessment project. It is not an official CallMissed product.

---

## Live demo

**Application:** `https://h3t6ek3ebsysq7yfx2f3aoqjve0uqrsr.lambda-url.us-east-1.on.aws/`

The deployed application is protected by a reviewer passcode to prevent unintended use of the supplied API budget. The reviewer passcode is shared privately and is never stored in this repository.

> **Cold start:** The first request after a period of inactivity may take 3–8 seconds while Lambda initialises the container. Subsequent requests within the same warm window are fast.

---

## Features

### Chat

- multi-turn conversation;
- bounded conversation context;
- fixed tested CallMissed chat model;
- loading and error states;
- copy response;
- new chat;
- browser-memory-only conversation state;
- no permanent conversation storage.

### Images

- one generated image per request;
- fixed tested CallMissed image model;
- 1024 × 1024 output;
- prompt validation;
- generated image preview;
- local browser download;
- no permanent image gallery.

### Voice

- browser microphone permission;
- CallMissed voice-session creation;
- provider-issued WebRTC connection details;
- mute and unmute;
- explicit call termination;
- local microphone cleanup;
- signed application lease for session ownership;
- 180-second maximum voice-session duration.

The application does not use a separate LiveKit account or API. CallMissed returns the WebRTC URL and temporary token required by its documented browser voice flow.

---

## Provider boundary

All user-facing AI functionality uses the **CallMissed API only**. The application does not use OpenAI, Anthropic, Google AI, Stability AI, or any other external AI API.

AWS services are used only for hosting, container storage, secrets, logs, IAM, and Terraform state.

---

## Architecture

```text
Reviewer browser
      |
      | HTTPS
      v
AWS Lambda Function URL
      |
      v
FastAPI + built React application
      |
      +-----------------------------+
      |                             |
      v             v               v
    Chat          Images           Voice
      |                             |
      +--------------+--------------+
                     |
                     v
              CallMissed API
                     |
           +---------+---------+
           |         |         |
         Chat     Images    Voice session
                               |
                               v
                  Provider-issued WebRTC
```

AWS deployment:

```text
GitHub
  |
  | OIDC
  v
AWS deployment IAM role
  |
  +--> Amazon ECR
  +--> AWS Lambda
  +--> AWS Secrets Manager
  +--> Amazon CloudWatch Logs
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the complete design.

---

## Technology

### Application

| Layer | Technology |
|-------|------------|
| Frontend framework | React + TypeScript |
| Frontend build | Vite |
| Backend framework | FastAPI |
| Validation | Pydantic |
| Provider HTTP | httpx |
| Voice client | livekit-client |

### Delivery and infrastructure

| Concern | Technology |
|---------|------------|
| Container | Docker multi-stage build |
| CI/CD | GitHub Actions |
| Security scanning | Trivy |
| Infrastructure as code | Terraform |
| Container registry | Amazon ECR |
| Compute | AWS Lambda |
| Lambda HTTP adapter | AWS Lambda Web Adapter |
| Public endpoint | Lambda Function URL |
| Secrets | AWS Secrets Manager |
| Logs | Amazon CloudWatch Logs |
| Terraform state | Amazon S3 |
| AWS authentication | GitHub OIDC |

---

## Repository structure

```text
.
├── backend/
│   ├── app/
│   │   ├── config.py
│   │   ├── errors.py
│   │   ├── main.py
│   │   ├── schemas.py
│   │   ├── security.py
│   │   └── services/
│   │       └── callmissed.py
│   └── tests/
│
├── frontend/
│   └── src/
│       ├── components/
│       ├── features/
│       │   ├── chat/
│       │   ├── images/
│       │   └── voice/
│       └── lib/
│
├── infrastructure/
│   └── terraform/
│
├── scripts/
│   └── smoke.sh
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── RUNBOOK.md
│   ├── TEST_EVIDENCE.md
│   ├── COSTS.md
│   └── AI_ASSISTANCE.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── Dockerfile
└── docker-compose.yaml
```

---

## Local development

### Requirements

- Python 3.13
- Node.js 22
- npm
- Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
python -m pip install -r requirements-dev.txt
cp .env.example .env
```

Set the local CallMissed API key only in `backend/.env`. Never commit this file.

```bash
ruff check app tests
python -m pytest -q
python -m uvicorn app.main:app \
  --host 127.0.0.1 \
  --port 8000
```

### Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/chat`. The Vite development server proxies application API requests to FastAPI.

### Local Docker run

```bash
cp backend/.env.example backend/.env
# Fill in CALLMISSED_API_KEY in backend/.env
docker compose up --build
```

Open `http://127.0.0.1:8000/chat`.

```bash
docker compose down
```

The same application container is used for local Docker execution and AWS Lambda deployment.

---

## Tests

### Backend

```bash
cd backend
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
ruff check app tests
python -m pytest -q
```

Current backend suite: **19 tests**. Routine automated tests use provider mocks and do not consume CallMissed API credits.

### Frontend

```bash
cd frontend
npm ci
npm run build
```

### Infrastructure

```bash
cd infrastructure/terraform
terraform fmt -check -recursive .
terraform init -backend=false
terraform validate
```

---

## CI

GitHub Actions validates each change before release. The CI workflow performs:

- Python linting with Ruff;
- backend tests with mocked provider responses;
- frontend dependency installation and production build;
- repository vulnerability, secret, and configuration scanning with Trivy;
- Docker image build;
- container startup, liveness and readiness checks, frontend route smoke check;
- container vulnerability scan;
- Terraform formatting and validation.

Real provider credentials are not supplied to normal CI.

---

## Deployment

The application is deployed in AWS region `us-east-1`. Application container images are stored in a private Amazon ECR repository.

GitHub Actions authenticates to AWS using OpenID Connect. Long-lived AWS access keys are not stored in GitHub.

A successful `main` CI run triggers deployment:

```text
main commit
    ↓
CI passes
    ↓
GitHub OIDC
    ↓
build immutable image
    ↓
Amazon ECR
    ↓
AWS Lambda
    ↓
health verification
```

If the newly deployed image fails health verification, the deployment workflow restores the previous known-good Lambda image.

---

## Runtime secrets

| Environment | Storage |
|-------------|---------|
| Local development | `backend/.env` |
| AWS production | AWS Secrets Manager `callmissed-ai-workspace/runtime` |

The production secret contains: `CALLMISSED_API_KEY`, `APP_SESSION_SECRET`, `REVIEWER_PASSCODE_HASH`.

The secret value is not stored in Terraform state, GitHub, the Docker image, or frontend code.

---

## API-budget controls

The company-provided CallMissed API budget is USD 20. The application limits provider usage with:

- reviewer passcode protection;
- fixed tested models;
- bounded chat input and output;
- one image per request;
- 180-second maximum voice sessions;
- application request throttling;
- no automatic retry after ambiguous paid requests;
- a server-side paid-request kill switch.

The deployment uses unreserved Lambda concurrency because the AWS account quota did not permit a reserved allocation.

`PAID_REQUESTS_ENABLED=false` disables creation of new paid Chat, Image, and Voice requests.

---

## Security controls

- provider credentials remain server-side;
- `.env` files are excluded from Git and Docker build context;
- production secrets are read from AWS Secrets Manager;
- reviewer passcodes are stored as PBKDF2 hashes;
- reviewer sessions use signed `HttpOnly` cookies;
- voice-session termination requires a signed application lease;
- provider errors are converted to safe application errors;
- raw provider bodies are not returned to users;
- prompts, responses, API keys, voice tokens, and image base64 are not intentionally written to routine application logs;
- GitHub uses OIDC for AWS deployment;
- CI includes repository and container security scans.

---

## Health endpoints

```
GET /health/live
GET /health/ready
```

Neither endpoint intentionally performs a paid provider request.

```bash
export APP_URL="https://h3t6ek3ebsysq7yfx2f3aoqjve0uqrsr.lambda-url.us-east-1.on.aws/"
./scripts/smoke.sh
```

---

## Reliability

The project includes:

- bounded request sizes;
- provider-specific request timeouts;
- safe timeout handling;
- no automatic retry after ambiguous provider POST requests;
- provider error translation;
- voice cleanup on explicit End and navigation;
- provider-side voice duration cap;
- immutable container releases;
- deployment health verification;
- previous-image rollback.

See [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## Known limitations

This is an assessment application, not a production service. Known limitations:

- one deployed demo environment;
- no permanent application database;
- no account system;
- no distributed/global rate limiter — application throttling is process-local;
- Lambda reserved concurrency is not configured because the current AWS account quota did not permit it;
- Lambda Function URL is publicly reachable at the network level; paid endpoints are protected by the application reviewer gate;
- provider availability is not tested by normal health checks because doing so could consume provider credits;
- generated images and chat history are intentionally temporary.

---

## Documentation

| Document | Contents |
|----------|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, flows, API contracts, hosting, secrets, CI/CD |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Key implementation decisions and rationale |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Operational procedures, diagnosis, kill switch, teardown |
| [`docs/TEST_EVIDENCE.md`](docs/TEST_EVIDENCE.md) | Test output and coverage evidence |
| [`docs/COSTS.md`](docs/COSTS.md) | AWS cost estimates and provider budget tracking |
| [`docs/AI_ASSISTANCE.md`](docs/AI_ASSISTANCE.md) | AI tool usage disclosure |

---

## Review window and cleanup

The AWS demo is intended to remain available for a limited review period.

After the review period:

- disable new paid provider requests (`PAID_REQUESTS_ENABLED=false`);
- preserve final evidence;
- destroy Terraform-managed infrastructure (`terraform destroy`);
- remove the manually created Terraform state bucket after state is no longer required;
- remove temporary administrative AWS access that is no longer needed;
- verify that assessment resources no longer generate ongoing charges.

The source code, Terraform configuration, Docker configuration, CI/CD workflows, and documentation remain in GitHub so the environment can be recreated.
