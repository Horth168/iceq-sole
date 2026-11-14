"""Turnstile bot check and request-size limit. Cloudflare is never contacted."""
import httpx

from app.config import settings


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


def _turn_on(monkeypatch):
    monkeypatch.setattr(settings, "TURNSTILE_SITE_KEY", "site-key")
    monkeypatch.setattr(settings, "TURNSTILE_SECRET_KEY", "secret-key")


BODY = {"email": "nobody@example.com", "password": "x"}


def test_off_without_keys(client):
    # no keys configured: behaves exactly as before
    assert client.post("/api/auth/login", json=BODY).status_code == 404
    assert client.get("/api/settings/public").json()["turnstile_site_key"] == ""


def test_missing_token_is_refused(client, monkeypatch):
    _turn_on(monkeypatch)
    r = client.post("/api/auth/login", json=BODY)
    assert r.status_code == 403 and r.json()["detail"] == "Please complete the security check and try again"
    assert client.get("/api/settings/public").json()["turnstile_site_key"] == "site-key"


def test_valid_and_invalid_tokens(client, monkeypatch):
    _turn_on(monkeypatch)
    seen = {}

    def fake_post(url, data, timeout):
        seen.update(data)
        return FakeResponse({"success": data["response"] == "good"})

    monkeypatch.setattr(httpx, "post", fake_post)
    assert client.post("/api/auth/login", json=BODY, headers={"X-Human-Token": "bad"}).status_code == 403
    # a real person's token gets through to the normal answer
    assert client.post("/api/auth/login", json=BODY, headers={"X-Human-Token": "good"}).status_code == 404
    assert seen["secret"] == "secret-key"
    for path, body in [("/api/auth/register", {}), ("/api/auth/forgot-password", {"email": "a@b.co"}),
                       ("/api/checkout", {}), ("/api/newsletter", {"email": "a@b.co"})]:
        assert client.post(path, json=body, headers={"X-Human-Token": "bad"}).status_code == 403, path


def test_cloudflare_down_lets_customers_through(client, monkeypatch):
    _turn_on(monkeypatch)

    def down(*a, **k):
        raise httpx.ConnectError("unreachable")

    monkeypatch.setattr(httpx, "post", down)
    assert client.post("/api/auth/login", json=BODY, headers={"X-Human-Token": "x"}).status_code == 404


def test_oversized_request_refused(client, monkeypatch):
    monkeypatch.setattr(settings, "MAX_REQUEST_MB", 1)
    r = client.post("/api/auth/login", content=b"x" * (1024 * 1024 + 10), headers={"Content-Type": "application/json"})
    assert r.status_code == 413
