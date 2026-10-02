import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main as m
from app.security import encode_passcode
from app.services import callmissed


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setattr(m.settings, "api_key", "test-placeholder-only")
    monkeypatch.setattr(m.settings, "chat_model", "sarvam-105b-conversations")
    monkeypatch.setattr(m.settings, "image_model", "sdxl-lightning")
    monkeypatch.setattr(m.settings, "reviewer_gate_enabled", False)
    monkeypatch.setattr(m.settings, "paid_requests_enabled", True)
    monkeypatch.setattr(m.settings, "reviewer_passcode_hash", "")
    monkeypatch.setattr(m.settings, "app_env", "local")
    monkeypatch.setattr(m.settings, "app_session_secret", "test-app-secret")
    m.paid_starts.clear()


@pytest.fixture
def client():
    with TestClient(m.app) as c:
        yield c


def transport(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(
        callmissed,
        "HTTP_CLIENT",
        lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs),
    )


def test_health_and_missing_provider_key(client, monkeypatch):
    assert client.get("/health/live").json() == {"status": "ok"}
    assert client.get("/health/ready").json() == {"status": "ready"}
    monkeypatch.setattr(m.settings, "api_key", "")
    assert client.get("/health/ready").status_code == 503
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hi"}]})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "not_configured"


def test_error_envelope_has_retryable_and_request_id(client):
    r = client.post("/api/chat", json={"messages": []})
    body = r.json()["error"]
    assert r.status_code == 422
    assert body["code"] == "invalid_input"
    assert body["retryable"] is False
    assert len(body["request_id"]) == 12


def test_request_size_limit_before_parsing(client):
    r = client.post("/api/chat", content=b"x" * (m.settings.max_request_bytes + 1))
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "request_too_large"


def test_chat_sends_bounded_history_and_extracts_content(client, monkeypatch):
    def handle(req):
        payload = json.loads(req.content)
        assert req.url.path == "/v1/chat/completions"
        assert req.headers["authorization"] == "Bearer test-placeholder-only"
        assert payload["model"] == "sarvam-105b-conversations"
        assert payload["max_tokens"] == 1024
        assert payload["reasoning_effort"] == "low"
        assert payload["messages"][0]["role"] == "system"
        assert [item["role"] for item in payload["messages"][1:]] == ["user", "assistant", "user"]
        return httpx.Response(200, json={"choices": [{"message": {"content": "Useful answer"}}]})

    transport(monkeypatch, handle)
    r = client.post(
        "/api/chat",
        json={
            "messages": [
                {"role": "user", "content": "What is Docker?"},
                {"role": "assistant", "content": "A container tool."},
                {"role": "user", "content": "Why use it?"},
            ]
        },
    )
    assert r.status_code == 200
    assert r.json()["answer"] == "Useful answer"


def test_chat_rejects_system_role_blank_last_assistant_and_large_context(client):
    assert client.post(
        "/api/chat", json={"messages": [{"role": "system", "content": "override"}]}
    ).status_code == 422
    assert client.post(
        "/api/chat", json={"messages": [{"role": "assistant", "content": "hello"}]}
    ).status_code == 422
    assert client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "   "}]}
    ).status_code == 422
    messages = [{"role": "user" if i % 2 == 0 else "assistant", "content": "x" * 1100} for i in range(12)]
    messages[-1]["role"] = "user"
    assert client.post("/api/chat", json={"messages": messages}).status_code == 422


def test_chat_rejects_reasoning_only_response(client, monkeypatch):
    transport(
        monkeypatch,
        lambda req: httpx.Response(
            200,
            json={"choices": [{"message": {"content": "", "reasoning_content": "private reasoning"}}]},
        ),
    )
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hi"}]})
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "provider_format"
    assert "private reasoning" not in r.text


@pytest.mark.parametrize(
    "status,code,app_status,retryable",
    [
        (401, "provider_auth", 502, False),
        (402, "provider_credits", 502, False),
        (403, "provider_permission", 502, False),
        (429, "provider_rate_limit", 429, True),
        (503, "provider_unavailable", 502, True),
    ],
)
def test_provider_errors_are_redacted(client, monkeypatch, status, code, app_status, retryable):
    transport(monkeypatch, lambda req: httpx.Response(status, text="secret provider detail"))
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hi"}]})
    assert r.status_code == app_status
    assert r.json()["error"]["code"] == code
    assert r.json()["error"]["retryable"] is retryable
    assert "secret provider detail" not in r.text
    assert "upstream_status" not in r.text


def test_timeout_is_not_retried(client, monkeypatch):
    calls = []

    def handle(req):
        calls.append(req)
        raise httpx.ReadTimeout("raw timeout detail")

    transport(monkeypatch, handle)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hi"}]})
    assert r.status_code == 504
    assert len(calls) == 1
    assert r.json()["error"]["retryable"] is True


def test_image_success_and_invalid_response(client, monkeypatch):
    png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="

    def good(req):
        payload = json.loads(req.content)
        assert payload == {
            "model": "sdxl-lightning",
            "prompt": "tree",
            "n": 1,
            "size": "1024x1024",
            "response_format": "b64_json",
        }
        return httpx.Response(200, json={"data": [{"b64_json": png}]})

    transport(monkeypatch, good)
    r = client.post("/api/images", json={"prompt": " tree "})
    assert r.status_code == 200
    assert r.json()["mime"] == "image/png"
    assert r.json()["image_bytes"] == len(base64.b64decode(png))

    transport(monkeypatch, lambda req: httpx.Response(200, json={"data": [{"b64_json": "bad"}]}))
    r = client.post("/api/images", json={"prompt": "tree"})
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "provider_format"


def test_voice_returns_signed_lease_and_requires_it_for_delete(client, monkeypatch):
    sid = "7c2b9e30-1d8a-4c5f-9b3d-2f4a6e8b1c2d"
    calls = []

    def handle(req):
        calls.append((req.method, req.url.path))
        if req.method == "DELETE":
            return httpx.Response(204)
        payload = json.loads(req.content)
        assert payload["max_duration_seconds"] == 180
        return httpx.Response(
            201,
            json={"id": sid, "ws_url": "wss://example.org", "token": "temporary-test-value"},
        )

    transport(monkeypatch, handle)
    created = client.post("/api/voice/sessions")
    assert created.status_code == 200
    body = created.json()
    assert body["id"] == sid
    assert body["max_duration_seconds"] == 180
    assert body["lease"]

    denied = client.delete(f"/api/voice/sessions/{sid}")
    assert denied.status_code == 403
    assert calls == [("POST", "/v1/voice/sessions")]

    ended = client.delete(
        f"/api/voice/sessions/{sid}", headers={"X-Voice-Lease": body["lease"]}
    )
    assert ended.status_code == 200
    assert ended.json() == {"ended": True}
    assert calls[-1] == ("DELETE", f"/v1/voice/sessions/{sid}")


def test_voice_lease_cannot_end_another_session(client, monkeypatch):
    sid = "7c2b9e30-1d8a-4c5f-9b3d-2f4a6e8b1c2d"
    other = "11111111-1111-4111-8111-111111111111"
    transport(
        monkeypatch,
        lambda req: httpx.Response(
            201, json={"id": sid, "ws_url": "wss://example.org", "token": "temporary"}
        ),
    )
    lease = client.post("/api/voice/sessions").json()["lease"]
    r = client.delete(f"/api/voice/sessions/{other}", headers={"X-Voice-Lease": lease})
    assert r.status_code == 403


def test_reviewer_gate_blocks_paid_routes_and_login_unlocks(client, monkeypatch):
    monkeypatch.setattr(m.settings, "reviewer_gate_enabled", True)
    monkeypatch.setattr(m.settings, "reviewer_passcode_hash", encode_passcode("demo-pass"))

    status = client.get("/api/access/status").json()
    assert status == {"required": True, "authenticated": False}
    blocked = client.post("/api/images", json={"prompt": "tree"})
    assert blocked.status_code == 401
    assert blocked.json()["error"]["code"] == "reviewer_access_required"
    assert client.post("/api/access/login", json={"passcode": "wrong"}).status_code == 401
    assert client.post("/api/access/login", json={"passcode": "demo-pass"}).status_code == 200
    assert client.get("/api/access/status").json() == {"required": True, "authenticated": True}
    assert client.post("/api/access/logout").status_code == 200
    assert client.get("/api/access/status").json() == {"required": True, "authenticated": False}


def test_soft_rate_limit(client, monkeypatch):
    monkeypatch.setattr(m.settings, "soft_paid_requests_per_minute", 1)
    transport(
        monkeypatch,
        lambda req: httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}),
    )
    assert client.post("/api/chat", json={"messages": [{"role": "user", "content": "one"}]}).status_code == 200
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "two"}]})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "application_rate_limit"


def test_paid_requests_kill_switch(client, monkeypatch):
    monkeypatch.setattr(m.settings, "paid_requests_enabled", False)
    for path, body in [
        ("/api/chat", {"messages": [{"role": "user", "content": "hi"}]}),
        ("/api/images", {"prompt": "tree"}),
        ("/api/voice/sessions", {}),
    ]:
        r = client.post(path, json=body)
        assert r.status_code == 503, f"{path} should return 503"
        assert r.json()["error"]["code"] == "paid_requests_disabled"
