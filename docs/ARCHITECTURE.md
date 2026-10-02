# Architecture

## Application scope

Three routes, one application:

- `/chat` — multi-turn text conversation
- `/images` — single image generation with download
- `/voice` — browser microphone conversation with explicit start/mute/end

No permanent database, chat history, image gallery, billing page, admin dashboard, RAG, CRM or phone calling.

## API contracts

### Health

`GET /health/live` — confirms the process can answer HTTP. No provider call.

```json
{"status": "ok"}
```

`GET /health/ready` — confirms required runtime configuration is loaded. No provider call.

```json
{"status": "ready"}
```

Missing required secret returns HTTP 503 with the error envelope below.

---

### Chat — `POST /api/chat`

Request:

```json
{
  "messages": [
    {"role": "user", "content": "Explain Docker simply."},
    {"role": "assistant", "content": "Docker packages an application..."},
    {"role": "user", "content": "Why is that useful?"}
  ]
}
```

Rules:

- Browser sends only `user` and `assistant` roles. Backend owns the system prompt.
- Maximum 12 messages per request, 2,000 characters per message, 12,000 characters total.
- Last message must be a non-empty user message.
- Model: `sarvam-105b-conversations`, `reasoning_effort=low`, `max_tokens=1024`, non-streaming.
- Only `message.content` is returned. Provider `reasoning_content` is never exposed.
- No automatic retry after ambiguous timeout.

Success:

```json
{"answer": "...", "elapsed_ms": 1516}
```

---

### Images — `POST /api/images`

Request:

```json
{"prompt": "A small green tree on a plain white background."}
```

Rules:

- Prompt: 1–1,000 characters after trimming.
- Model: `sdxl-lightning`, one 1024×1024 image, base64 response.
- Decoded image limit: 4 MiB (below Lambda Function URL's 6 MiB ceiling after base64 expansion).
- PNG/JPEG only. No automatic retry after ambiguous timeout.

Success:

```json
{
  "image": "<base64>",
  "mime": "image/png",
  "image_bytes": 87127,
  "elapsed_ms": 4922
}
```

---

### Voice — `POST /api/voice/sessions`

Creates a bounded CallMissed voice session. The browser connects directly to LiveKit; audio does not pass through FastAPI.

Fixed settings: `voice=meera`, `language=en-IN`, `max_duration_seconds=180`.

Success:

```json
{
  "id": "<uuid>",
  "ws_url": "wss://...",
  "token": "<short-lived provider connection token>",
  "max_duration_seconds": 180,
  "lease": "<application-signed session ownership token>"
}
```

### Voice — `DELETE /api/voice/sessions/{id}`

Requires the application-signed `lease` from session creation. Proves the browser ending the session is the browser that created it, without a server-side session database.

---

## Error envelope

All application errors:

```json
{
  "error": {
    "code": "provider_timeout",
    "message": "The request timed out. It may have completed upstream; retry only if you choose to.",
    "request_id": "abc123...",
    "retryable": true
  }
}
```

No stack traces, API keys, provider tokens, raw provider bodies, prompts, transcripts or base64 image data in errors or routine logs.

| Status | Meaning |
|--------|---------|
| 400/422 | Invalid user input |
| 401/403 | Reviewer gate failure (when enabled) |
| 409 | Conflicting active voice state |
| 413 | Request or response size exceeded |
| 429 | Application/provider throttling |
| 502 | Upstream authentication, permission or format failure |
| 504 | Provider timeout |

---

## Provider timeouts

| Endpoint | Timeout |
|----------|---------|
| Chat | 60 s |
| Images | 90 s |
| Voice create | 30 s |
| Voice delete | 15 s |

---

## Reviewer gate

The application includes an optional access gate for public deployment, disabled locally by default (`REVIEWER_GATE_ENABLED=false`).

When enabled:

- Reviewer submits a passcode compared with a PBKDF2-SHA256 stored hash.
- Plaintext passcode is never stored or logged.
- Successful login sets a short-lived signed `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
- All paid AI endpoints require that cookie.

This is deployment protection, not a user-account system.

---

## Secrets

Local development: `backend/.env` (gitignored).

Production (AWS): AWS Secrets Manager secret `callmissed-ai-workspace/runtime`:

- `CALLMISSED_API_KEY`
- `APP_SESSION_SECRET`
- `REVIEWER_PASSCODE_HASH`

The backend reads secrets via `boto3.client("secretsmanager")` at Lambda cold-start and caches the result for the process lifetime. Secret values are never in Git, Docker build arguments or Terraform state.

---

## Hosting

**AWS Lambda container image + Lambda Function URL**, region `us-east-1`, deployed from ECR.

The container is a standard FastAPI/uvicorn application. AWS Lambda Web Adapter allows the same HTTP application to run locally as Docker and on Lambda without rewriting routes.

Lambda settings:

| Setting | Value |
|---------|-------|
| Architecture | x86_64 |
| Memory | 1024 MB |
| Function timeout | 120 s |
| Reserved concurrency | Unreserved (`-1`); account quota did not permit a reserved allocation |
| Function URL auth | NONE (protected by reviewer gate) |
| Invoke mode | BUFFERED |
| VPC | None (outbound internet only) |

Logging: CloudWatch log group with finite retention. Logs record only operational metadata — timestamp, level, request ID, route, status, duration, safe error code. No prompts, responses, keys or tokens.

---

## Provider budget and usage controls

The take-home CallMissed API budget is USD 20. The application limits usage through:

- reviewer passcode protection on deployed paid endpoints;
- fixed tested CallMissed models;
- one image per request;
- bounded chat input and output;
- a maximum 180-second voice session;
- application request throttling (soft rate limit);
- no automatic retry of ambiguous paid POST requests;
- a server-side paid-request kill switch (`PAID_REQUESTS_ENABLED`).

Routine CI uses mocked provider responses and consumes no CallMissed API budget.

If the supplied budget is exhausted or appears incorrect, the assignment contact requested that issues be reported to karan@callmissed.com.

---

## LiveKit client

The application does not use a separate LiveKit account or API integration. CallMissed's Voice Session API returns a temporary WebRTC URL and token, and the browser consumes those values with `livekit-client`, as described in CallMissed's official voice-client documentation. No separate LiveKit API key or credential is used.
