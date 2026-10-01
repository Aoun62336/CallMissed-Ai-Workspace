from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time

from fastapi import Request

from .config import settings
from .errors import Fault

COOKIE_NAME = "workspace_session"
SESSION_SECONDS = 60 * 60 * 4
PASSCODE_ITERATIONS = 210_000


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(value: str) -> str:
    return _b64(hmac.new(settings.runtime_secret(), value.encode("utf-8"), hashlib.sha256).digest())


def create_session_cookie() -> str:
    expires = int(time.time()) + SESSION_SECONDS
    nonce = _b64(secrets.token_bytes(12))
    payload = f"{expires}.{nonce}"
    return f"{payload}.{_sign(payload)}"


def valid_session_cookie(value: str | None) -> bool:
    if not value:
        return False
    try:
        expires_text, nonce, signature = value.split(".", 2)
        payload = f"{expires_text}.{nonce}"
        if not hmac.compare_digest(_sign(payload), signature):
            return False
        return int(expires_text) >= int(time.time())
    except (ValueError, TypeError, RuntimeError):
        return False


def require_reviewer(request: Request) -> None:
    if not settings.reviewer_gate_enabled:
        return
    if not valid_session_cookie(request.cookies.get(COOKIE_NAME)):
        raise Fault("reviewer_access_required", "Enter the reviewer passcode to use AI features.", 401)


def encode_passcode(passcode: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", passcode.encode("utf-8"), salt, PASSCODE_ITERATIONS)
    return f"pbkdf2_sha256${PASSCODE_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_passcode(passcode: str, encoded: str) -> bool:
    try:
        algorithm, rounds_text, salt_text, expected_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_text)
        if rounds < 100_000 or rounds > 1_000_000:
            return False
        salt = _unb64(salt_text)
        expected = _unb64(expected_text)
        actual = hashlib.pbkdf2_hmac("sha256", passcode.encode("utf-8"), salt, rounds)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_voice_lease(session_id: str, duration_seconds: int) -> str:
    # Give cleanup a short grace period after the provider duration cap.
    expires = int(time.time()) + duration_seconds + 120
    payload = f"{session_id}.{expires}"
    return f"{expires}.{_sign(payload)}"


def verify_voice_lease(session_id: str, lease: str | None) -> bool:
    if not lease:
        return False
    try:
        expires_text, signature = lease.split(".", 1)
        if int(expires_text) < int(time.time()):
            return False
        payload = f"{session_id}.{expires_text}"
        return hmac.compare_digest(_sign(payload), signature)
    except (ValueError, TypeError):
        return False
