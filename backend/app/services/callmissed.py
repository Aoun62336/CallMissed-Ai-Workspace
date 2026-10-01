from __future__ import annotations

import base64
import binascii
import json
import time
from uuid import UUID

import httpx

from ..config import settings
from ..errors import Fault

HTTP_CLIENT = httpx.AsyncClient


def ensure_provider_configured() -> None:
    if not settings.api_key or settings.api_key == "replace_me":
        raise Fault(
            "not_configured",
            "The server is missing its CallMissed credential.",
            503,
        )


def _upstream_fault(status: int) -> None:
    mapping: dict[int, tuple[str, str, int, bool]] = {
        400: ("provider_input", "The AI provider rejected the configured request.", 502, False),
        401: ("provider_auth", "The AI provider rejected the server credential.", 502, False),
        402: ("provider_credits", "The AI provider reports insufficient credits.", 502, False),
        403: ("provider_permission", "The server credential does not permit this AI feature or model.", 502, False),
        404: ("provider_not_found", "The configured AI model or resource was not found.", 502, False),
        429: ("provider_rate_limit", "The AI provider rate limit was reached. Try again later.", 429, True),
    }
    code, message, app_status, retryable = mapping.get(
        status,
        ("provider_unavailable", "The AI provider could not complete this request.", 502, True),
    )
    raise Fault(code, message, app_status, retryable=retryable, upstream_status=status)


async def request_provider(
    method: str,
    path: str,
    payload: dict | None = None,
    *,
    timeout: float,
) -> dict:
    ensure_provider_configured()
    kwargs: dict = {
        "headers": {"Authorization": f"Bearer {settings.api_key}"},
    }
    if payload is not None:
        kwargs["json"] = payload
    try:
        async with (
            HTTP_CLIENT(
                timeout=httpx.Timeout(timeout, connect=10),
                follow_redirects=False,
            ) as client,
            client.stream(method, settings.api_root + path, **kwargs) as response,
        ):
            if not 200 <= response.status_code < 300:
                _upstream_fault(response.status_code)
            if response.status_code == 204:
                return {}
            parts: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > settings.max_provider_response_bytes:
                    raise Fault(
                        "response_too_large",
                        "The AI provider response exceeded the application limit.",
                        502,
                    )
                parts.append(chunk)
            data = json.loads(b"".join(parts))
            if not isinstance(data, dict):
                raise TypeError()
            return data
    except httpx.TimeoutException:
        raise Fault(
            "provider_timeout",
            "The request timed out. It may have completed upstream; retry only if you choose to.",
            504,
            retryable=True,
        ) from None
    except httpx.RequestError:
        raise Fault(
            "provider_network",
            "The server could not reach the AI provider.",
            502,
            retryable=True,
        ) from None
    except (ValueError, UnicodeError):
        raise Fault("provider_format", "The AI provider returned an unexpected response format.", 502) from None


async def chat_completion(messages: list[dict[str, str]]) -> tuple[str, int]:
    begin = time.monotonic()
    data = await request_provider(
        "POST",
        "/chat/completions",
        {
            "model": settings.chat_model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful AI assistant. Answer clearly and concisely in simple English unless the user asks for another style.",
                },
                *messages,
            ],
            "stream": False,
            "max_tokens": 1024,
            "reasoning_effort": "low",
        },
        timeout=settings.chat_timeout_seconds,
    )
    try:
        message = data["choices"][0]["message"]
        if not isinstance(message, dict):
            raise TypeError()
        answer = message.get("content")
        if not isinstance(answer, str):
            raise TypeError()
        answer = answer.strip()
        if not answer or len(answer) > 40_000:
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError):
        raise Fault("provider_format", "Chat response did not contain a usable answer.", 502) from None
    return answer, round((time.monotonic() - begin) * 1000)


async def generate_image(prompt: str) -> tuple[str, str, int, int]:
    begin = time.monotonic()
    data = await request_provider(
        "POST",
        "/images/generations",
        {
            "model": settings.image_model,
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "response_format": "b64_json",
        },
        timeout=settings.image_timeout_seconds,
    )
    try:
        encoded = data["data"][0]["b64_json"]
        if not isinstance(encoded, str):
            raise TypeError()
        raw = base64.b64decode(encoded, validate=True)
        mime = (
            "image/png"
            if raw.startswith(b"\x89PNG\r\n\x1a\n")
            else "image/jpeg"
            if raw.startswith(b"\xff\xd8\xff")
            else None
        )
        if mime is None or len(raw) > settings.max_image_bytes:
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError, binascii.Error):
        raise Fault(
            "provider_format",
            "Image response was invalid or exceeded the 4 MiB application limit.",
            502,
        ) from None
    return encoded, mime, len(raw), round((time.monotonic() - begin) * 1000)


async def create_voice_session() -> tuple[str, str, str]:
    data = await request_provider(
        "POST",
        "/voice/sessions",
        {
            "system_prompt": "You are a helpful AI assistant. Answer briefly and clearly in simple English.",
            "greeting": "Hello. How can I help?",
            "voice": "shubh",
            "language": "en-IN",
            "max_duration_seconds": settings.voice_max_duration_seconds,
        },
        timeout=settings.voice_create_timeout_seconds,
    )
    try:
        session_id = str(UUID(data["id"]))
        ws_url = data["ws_url"]
        token = data["token"]
        if not isinstance(ws_url, str) or not ws_url.startswith("wss://"):
            raise ValueError()
        if not isinstance(token, str) or not token:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise Fault("provider_format", "Voice session response was incomplete.", 502) from None
    return session_id, ws_url, token


async def delete_voice_session(session_id: str) -> None:
    await request_provider(
        "DELETE",
        f"/voice/sessions/{session_id}",
        timeout=settings.voice_delete_timeout_seconds,
    )
