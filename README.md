# CallMissed AI Workspace

A web application that exposes three CallMissed AI features through a responsive React interface backed by a FastAPI service.

## Features

- **Chat** — multi-turn text conversation using `sarvam-105b-conversations`
- **Images** — single image generation and download using `sdxl-lightning`
- **Voice** — browser microphone conversation with mute/unmute and explicit session termination

## Requirements

- Python 3.13
- Node.js 22
- Docker (for container builds)

## Local development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Fill in CALLMISSED_API_KEY in .env
python -m pytest -q
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/chat`. The Vite dev server proxies `/api` and `/health` to FastAPI.

## Running with Docker

```bash
cp backend/.env.example backend/.env
# Fill in CALLMISSED_API_KEY in backend/.env
docker compose up --build
```

Open `http://127.0.0.1:8000/chat`.

## Tests

```bash
cd backend
python -m pytest -q   # 19 tests, all mocked — no provider credentials required
```

## Configuration

Copy `backend/.env.example` to `backend/.env` and set:

| Variable | Description |
|----------|-------------|
| `CALLMISSED_API_KEY` | Provider API key (required) |
| `CALLMISSED_CHAT_MODEL` | Chat model — default `sarvam-105b-conversations` |
| `CALLMISSED_IMAGE_MODEL` | Image model — default `sdxl-lightning` |
| `APP_ENV` | `local` for development, `production` for deployment |
| `REVIEWER_GATE_ENABLED` | `false` locally, `true` in production |
| `PAID_REQUESTS_ENABLED` | `true` (default) — set `false` to disable all AI endpoints instantly |
| `APP_SESSION_SECRET` | Session signing secret (generated automatically if blank locally) |

The API key stays server-side only. It is never placed in Vite environment variables, browser code, Docker build arguments or Git.

## CI

GitHub Actions runs on every push and pull request to `main`:

- Backend lint (`ruff`) and tests (`pytest`)
- Frontend type-check and production build
- Repository security scan (Trivy)
- Container build, smoke-test and image security scan

## Deployment

AWS Lambda container image + Lambda Function URL (`us-east-1`), served from ECR. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for API contracts, error handling, secrets management and infrastructure settings.
