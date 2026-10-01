from __future__ import annotations

import functools
import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

import boto3
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _value(name: str, default: str = "") -> str:
    """Return the environment variable stripped, or *default* if absent/blank."""
    return os.getenv(name, default).strip()


@functools.lru_cache(maxsize=1)
def _runtime_secret_values() -> dict[str, str]:
    """Fetch secrets from AWS Secrets Manager when AWS_SECRET_ID is set.

    The result is cached for the lifetime of the process.  Call
    ``_runtime_secret_values.cache_clear()`` in tests to reset between runs.
    """
    secret_id = os.environ.get("AWS_SECRET_ID", "").strip()
    if not secret_id:
        return {}
    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_id)
    return json.loads(response["SecretString"])


def _secret_value(name: str, default: str = "") -> str:
    """Return the env var if set, otherwise fall through to Secrets Manager.

    Priority: env var → Secrets Manager → default.
    This allows local development via a .env file while Lambda reads
    sensitive values from Secrets Manager at cold-start without storing
    them as plaintext Lambda environment variables.
    """
    env_val = os.getenv(name, "").strip()
    if env_val:
        return env_val
    return _runtime_secret_values().get(name, default)


@dataclass
class Settings:
    api_root: str = os.getenv("CALLMISSED_API_ROOT", "https://api.callmissed.com/v1").rstrip("/")
    api_key: str = _secret_value("CALLMISSED_API_KEY")
    chat_model: str = _value("CALLMISSED_CHAT_MODEL", "sarvam-105b-conversations")
    image_model: str = _value("CALLMISSED_IMAGE_MODEL", "sdxl-lightning")
    app_env: str = os.getenv("APP_ENV", "local").strip().lower()
    reviewer_gate_enabled: bool = _bool("REVIEWER_GATE_ENABLED", False)
    app_session_secret: str = _secret_value("APP_SESSION_SECRET")
    reviewer_passcode_hash: str = _secret_value("REVIEWER_PASSCODE_HASH")
    chat_timeout_seconds: float = 60.0
    image_timeout_seconds: float = 90.0
    voice_create_timeout_seconds: float = 30.0
    voice_delete_timeout_seconds: float = 15.0
    voice_max_duration_seconds: int = 180
    max_request_bytes: int = 20 * 1024
    max_provider_response_bytes: int = 8 * 1024 * 1024
    max_image_bytes: int = 4 * 1024 * 1024
    soft_paid_requests_per_minute: int = 12

    def runtime_secret(self) -> bytes:
        if self.app_session_secret:
            return self.app_session_secret.encode("utf-8")
        if self.app_env == "production" or self.reviewer_gate_enabled:
            raise RuntimeError(
                "APP_SESSION_SECRET is required for "
                "production/reviewer access."
            )
        return _LOCAL_EPHEMERAL_SECRET


_LOCAL_EPHEMERAL_SECRET = secrets.token_bytes(32)
settings = Settings()
