import time

import pytest
from fastapi.testclient import TestClient

from remixweb import auth, config
from remixweb.server import app

client = TestClient(app)

@pytest.fixture(autouse=True)
def _fresh_limiter(monkeypatch):
    monkeypatch.setattr(config, "ACCESS_KEY", "right-key")
    auth._FAILS.clear()
    yield
    auth._FAILS.clear()

def test_correct_key_passes():
    r = client.get("/auth-check", headers={"Authorization": "Bearer right-key"})
    assert r.status_code == 200

def test_wrong_key_401():
    r = client.get("/auth-check", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401

def test_eleventh_failure_is_429():
    for _ in range(10):
        assert client.get("/auth-check", headers={"Authorization": "Bearer wrong"}).status_code == 401
    r = client.get("/auth-check", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 429

def test_throttled_ip_blocks_even_correct_key():
    for _ in range(10):
        client.get("/auth-check", headers={"Authorization": "Bearer wrong"})
    r = client.get("/auth-check", headers={"Authorization": "Bearer right-key"})
    assert r.status_code == 429

def test_success_does_not_count_toward_limit():
    for _ in range(10):
        assert client.get("/auth-check", headers={"Authorization": "Bearer right-key"}).status_code == 200
    assert client.get("/auth-check", headers={"Authorization": "Bearer right-key"}).status_code == 200

def test_window_expiry_unblocks():
    # Patching the global time.monotonic would also intercept anyio/starlette's
    # own internal timing calls and exhaust a finite fake clock. Instead, seed
    # the limiter's queue directly with timestamps older than the window.
    for _ in range(10):
        client.get("/auth-check", headers={"Authorization": "Bearer wrong"})
    ip = next(iter(auth._FAILS))
    expired = time.monotonic() - (auth._WINDOW_SEC + 1)
    auth._FAILS[ip] = type(auth._FAILS[ip])([expired] * 10)
    assert client.get("/auth-check", headers={"Authorization": "Bearer right-key"}).status_code == 200

def test_spoofed_forwarded_for_does_not_evade_limit():
    # Our proxy (cloudflared or tailscaled) appends the real client IP last;
    # anything before it is client-supplied and must not pick the bucket.
    for i in range(10):
        hdr = {"Authorization": "Bearer wrong", "X-Forwarded-For": f"10.0.0.{i}, 203.0.113.7"}
        assert client.get("/auth-check", headers=hdr).status_code == 401
    hdr = {"Authorization": "Bearer wrong", "X-Forwarded-For": "10.0.0.99, 203.0.113.7"}
    assert client.get("/auth-check", headers=hdr).status_code == 429
