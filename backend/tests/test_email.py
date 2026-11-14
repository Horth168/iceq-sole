"""Email delivery: Brevo over HTTPS first, SMTP as the fallback. No real network is used."""
import httpx

from app.config import settings
from app.services import email as mail


class FakeResponse:
    def __init__(self, status, text=""):
        self.status_code, self.text = status, text


def _configure(monkeypatch, brevo="", smtp=False):
    monkeypatch.setattr(settings, "BREVO_API_KEY", brevo)
    monkeypatch.setattr(settings, "EMAIL_FROM", "shop@example.com")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com" if smtp else "")
    monkeypatch.setattr(settings, "SMTP_USER", "user@example.com" if smtp else "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "x" if smtp else "")


def test_brevo_sends_expected_request(monkeypatch):
    _configure(monkeypatch, brevo="test-key")
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, json=json, headers=headers)
        return FakeResponse(201, '{"messageId":"1"}')

    monkeypatch.setattr(httpx, "post", fake_post)
    assert mail.send_email("buyer@example.com", "Hello", "plain", "<b>html</b>") is True
    assert seen["url"] == "https://api.brevo.com/v3/smtp/email"
    assert seen["headers"]["api-key"] == "test-key"
    assert seen["json"]["sender"] == {"name": settings.SMTP_FROM_NAME, "email": "shop@example.com"}
    assert seen["json"]["to"] == [{"email": "buyer@example.com"}]
    assert seen["json"]["htmlContent"] == "<b>html</b>" and seen["json"]["textContent"] == "plain"


def test_brevo_rejection_falls_back_to_smtp(monkeypatch):
    _configure(monkeypatch, brevo="test-key", smtp=True)
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse(400, '{"message":"sender not valid"}'))
    used = []
    monkeypatch.setattr(mail, "_send_smtp", lambda *a: used.append(a) or True)
    assert mail.send_email("buyer@example.com", "Hi", "t") is True
    assert used


def test_brevo_network_error_without_smtp_returns_false(monkeypatch):
    _configure(monkeypatch, brevo="test-key")

    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    assert mail.send_email("buyer@example.com", "Hi", "t") is False


def test_nothing_configured(monkeypatch):
    _configure(monkeypatch)
    assert mail.email_configured() is False
    assert mail.send_email("buyer@example.com", "Hi", "t") is False


def test_password_reset_goes_through_brevo(monkeypatch):
    _configure(monkeypatch, brevo="test-key")
    seen = {}
    monkeypatch.setattr(httpx, "post", lambda url, json, headers, timeout: seen.update(json) or FakeResponse(201))
    assert mail.send_password_reset("buyer@example.com", "Dara", "https://shop/reset?t=abc") is True
    assert "https://shop/reset?t=abc" in seen["htmlContent"] and "https://shop/reset?t=abc" in seen["textContent"]
