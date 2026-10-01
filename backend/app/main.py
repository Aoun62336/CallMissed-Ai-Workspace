"""CallMissed AI Workspace application API for local development and the final web UI."""
from __future__ import annotations

import logging
import time
from collections import deque
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .errors import Fault
from .schemas import AccessLoginRequest, ChatRequest, ImageRequest
from .security import (
    COOKIE_NAME,
    SESSION_SECONDS,
    create_session_cookie,
    create_voice_lease,
    require_reviewer,
    valid_session_cookie,
    verify_passcode,
    verify_voice_lease,
)
from .services import callmissed

app = FastAPI(title="CallMissed AI Workspace", docs_url=None, redoc_url=None, openapi_url=None)
logger = logging.getLogger("workspace")
paid_starts: deque[float] = deque()


class _AccessDependency:
    def __call__(self, request: Request) -> None:
        require_reviewer(request)


access_required = _AccessDependency()


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", uuid4().hex[:12])


@app.exception_handler(Fault)
async def fault_handler(request: Request, exc: Fault) -> JSONResponse:
    # Upstream status is intentionally kept out of the browser body.
    return JSONResponse(
        status_code=exc.status,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "request_id": _request_id(request),
                "retryable": exc.retryable,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_input",
                "message": "Check the required fields and input limits.",
                "request_id": _request_id(request),
                "retryable": False,
            }
        },
    )


@app.middleware("http")
async def request_guard(request: Request, call_next):
    request.state.request_id = uuid4().hex[:12]
    if request.method in {"POST", "PUT", "PATCH"}:
        chunks: list[bytes] = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > settings.max_request_bytes:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "request_too_large",
                            "message": "Request is too large.",
                            "request_id": request.state.request_id,
                            "retryable": False,
                        }
                    },
                )
            chunks.append(chunk)
        request._body = b"".join(chunks)
    begin = time.monotonic()
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Request-ID"] = request.state.request_id
    logger.info(
        "request id=%s method=%s route=%s status=%s elapsed_ms=%d",
        request.state.request_id,
        request.method,
        request.url.path,
        response.status_code,
        int((time.monotonic() - begin) * 1000),
    )
    return response


def _soft_paid_limit() -> None:
    now = time.monotonic()
    while paid_starts and now - paid_starts[0] > 60:
        paid_starts.popleft()
    if len(paid_starts) >= settings.soft_paid_requests_per_minute:
        raise Fault(
            "application_rate_limit",
            "Too many AI requests were started recently. Try again in about a minute.",
            429,
            retryable=True,
        )
    paid_starts.append(now)


def _runtime_ready() -> None:
    callmissed.ensure_provider_configured()
    try:
        settings.runtime_secret()
    except RuntimeError as exc:
        raise Fault("not_configured", str(exc), 503) from None
    if settings.reviewer_gate_enabled and not settings.reviewer_passcode_hash:
        raise Fault("not_configured", "REVIEWER_PASSCODE_HASH is required when reviewer access is enabled.", 503)


@app.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
async def ready() -> dict[str, str]:
    _runtime_ready()
    return {"status": "ready"}


@app.get("/api/access/status")
async def access_status(request: Request) -> dict[str, bool]:
    required = settings.reviewer_gate_enabled
    authenticated = not required or valid_session_cookie(request.cookies.get(COOKIE_NAME))
    return {"required": required, "authenticated": authenticated}


@app.post("/api/access/login")
async def access_login(body: AccessLoginRequest, response: Response) -> dict[str, bool]:
    if not settings.reviewer_gate_enabled:
        return {"authenticated": True}
    if not settings.reviewer_passcode_hash or not verify_passcode(body.passcode, settings.reviewer_passcode_hash):
        raise Fault("invalid_passcode", "The reviewer passcode is incorrect.", 401)
    response.set_cookie(
        COOKIE_NAME,
        create_session_cookie(),
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        path="/",
    )
    return {"authenticated": True}


@app.post("/api/access/logout")
async def access_logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"authenticated": False}


@app.post("/api/chat", dependencies=[Depends(access_required)])
async def chat(body: ChatRequest) -> dict[str, str | int]:
    _soft_paid_limit()
    answer, elapsed_ms = await callmissed.chat_completion(
        [{"role": item.role, "content": item.content} for item in body.messages]
    )
    return {"answer": answer, "elapsed_ms": elapsed_ms}


@app.post("/api/images", dependencies=[Depends(access_required)])
async def images(body: ImageRequest) -> dict[str, str | int]:
    _soft_paid_limit()
    encoded, mime, image_bytes, elapsed_ms = await callmissed.generate_image(body.prompt)
    return {
        "image": encoded,
        "mime": mime,
        "image_bytes": image_bytes,
        "elapsed_ms": elapsed_ms,
    }


@app.post("/api/voice/sessions", dependencies=[Depends(access_required)])
async def start_voice() -> dict[str, str | int]:
    _soft_paid_limit()
    session_id, ws_url, token = await callmissed.create_voice_session()
    lease = create_voice_lease(session_id, settings.voice_max_duration_seconds)
    return {
        "id": session_id,
        "ws_url": ws_url,
        "token": token,
        "max_duration_seconds": settings.voice_max_duration_seconds,
        "lease": lease,
    }


@app.delete("/api/voice/sessions/{session_id}", dependencies=[Depends(access_required)])
async def end_voice(session_id: str, x_voice_lease: str | None = Header(default=None)) -> dict[str, bool]:
    try:
        canonical_id = str(UUID(session_id))
    except ValueError:
        raise Fault("invalid_session", "Voice session identifier is invalid.", 404) from None
    if not verify_voice_lease(canonical_id, x_voice_lease):
        raise Fault("invalid_session_lease", "Voice session ownership could not be verified.", 403)
    await callmissed.delete_voice_session(canonical_id)
    return {"ended": True}


# Built React application.
# During local Vite development this directory does not exist,
# so Vite continues to serve the frontend separately.
# In the Docker image, frontend/dist is copied here.
STATIC_DIR = Path(__file__).resolve().parents[1] / "static"

if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"

    if assets_dir.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=assets_dir),
            name="frontend-assets",
        )

    def frontend_index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/", include_in_schema=False)
    async def frontend_root() -> FileResponse:
        return frontend_index()

    @app.get("/chat", include_in_schema=False)
    async def frontend_chat() -> FileResponse:
        return frontend_index()

    @app.get("/images", include_in_schema=False)
    async def frontend_images() -> FileResponse:
        return frontend_index()

    @app.get("/voice", include_in_schema=False)
    async def frontend_voice() -> FileResponse:
        return frontend_index()
