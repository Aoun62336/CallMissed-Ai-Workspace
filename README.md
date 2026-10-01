# CallMissed AI Workspace

Independent CallMissed internship-assessment application by Aoun Md.

The application provides three reviewer-facing features: **Chat, Images and Voice**. Stage 1 verified the real CallMissed integrations locally. Stage 2 froze the API contracts and AWS hosting decision. Stage 3 replaces the temporary integration harness with the actual responsive React interface and production-oriented FastAPI contracts.

## Current status

- Stage 1 real provider proof: Chat, image generation and browser voice worked locally.
- Stage 2: application contracts and AWS Lambda Function URL hosting direction frozen.
- Stage 3 source implementation: complete.
- Backend mocked suite: **17 passed**.
- Frontend TypeScript check: **passed**.
- Stage 3 real browser/provider re-verification on Aoun's Windows laptop: pending.
- Docker, GitHub Actions, Terraform and AWS deployment: next after Stage 3 verification.

Read:

- `docs/STAGE_2_DECISIONS.md` — hosting/contracts decision.
- `docs/STAGE_3_IMPLEMENTATION.md` — what Stage 3 changed and exact acceptance checks.
- `docs/START_HERE.md` — local run steps.
- `docs/RESULTS.md` — verified evidence only.
- `docs/ROADMAP.md` — remaining delivery sequence.

## Application routes

- `/chat` — temporary multi-turn text conversation.
- `/images` — one image generation and local download.
- `/voice` — browser microphone conversation, mute/unmute and explicit termination.

No permanent database/history, CRM, phone calling, billing, admin dashboard, RAG or fabricated system metrics are included.

## Local setup

Backend:

```bash
cd backend
py -3 -m venv .venv
source .venv/Scripts/activate
python -m pip install -r requirements.txt
cp -n .env.example .env
# Edit .env manually and enter the real CALLMISSED_API_KEY privately.
python -m pytest -q
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/chat`.

Before moving on, also run:

```bash
npm run build
```

## Secret boundary

The CallMissed credential belongs only in `backend/.env` locally and a server-side secret store in deployment. Do not put it in Vite variables, browser code, Git, Docker build arguments, Terraform state or screenshots.

The clean Stage 3 package intentionally contains no `.env`, `.venv`, `node_modules`, `dist` or `.git` directory.

## Deployment direction

Stage 2 selected an AWS Lambda container image exposed by a Lambda Function URL, with ECR, Terraform, runtime secrets, CloudWatch logs and an application reviewer gate. No cloud resource is created by Stage 3.
