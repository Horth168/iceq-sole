"""Google / Telegram sign-in. Signatures are built with a test bot token; Google is mocked."""
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from app.config import settings
from app.models import Role, User
from app.services import social
from tests.conftest import make_user

BOT = "123456:TEST-login-bot-token"


def _widget(user_id=777, **extra):
    data = {"id": user_id, "first_name": "Sokha", "username": "sokha", "auth_date": int(time.time()), **extra}
    check = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    data["hash"] = hmac.new(hashlib.sha256(BOT.encode()).digest(), check.encode(), hashlib.sha256).hexdigest()
    return data


def _init_data(user_id=888, auth_date=None):
    fields = {"auth_date": str(auth_date or int(time.time())), "query_id": "AAE",
              "user": json.dumps({"id": user_id, "first_name": "Dara", "language_code": "km"})}
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", BOT.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_off_until_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_LOGIN_BOT_TOKEN", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    s = client.get("/api/settings/public").json()
    assert s["google_client_id"] == "" and s["telegram_login_bot"] == ""
    assert client.post("/api/auth/telegram", json=_widget()).status_code == 404


def test_telegram_widget_creates_then_reuses_account(client, db, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_LOGIN_BOT_TOKEN", BOT)
    r = client.post("/api/auth/telegram", json=_widget())
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["full_name"] == "Sokha" and u["email"] is None and u["telegram"] and not u["has_password"]
    assert r.json()["access_token"]
    # same Telegram user again -> same account
    again = client.post("/api/auth/telegram", json=_widget())
    assert again.json()["user"]["id"] == u["id"]
    assert db.query(User).filter(User.telegram_id == 777).count() == 1


def test_telegram_widget_rejects_tampering_and_old_data(client, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_LOGIN_BOT_TOKEN", BOT)
    forged = _widget()
    forged["id"] = 1  # someone else's id with the original signature
    assert client.post("/api/auth/telegram", json=forged).status_code == 401
    old = _widget(auth_date=int(time.time()) - 3 * 24 * 3600)
    assert client.post("/api/auth/telegram", json=old).status_code == 401


def test_telegram_mini_app(client, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_LOGIN_BOT_TOKEN", BOT)
    r = client.post("/api/auth/telegram-app", json={"init_data": _init_data()})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["full_name"] == "Dara" and r.json()["user"]["locale"] == "km"
    bad = _init_data().replace("Dara", "Mallory")
    assert client.post("/api/auth/telegram-app", json={"init_data": bad}).status_code == 401


def test_google_links_existing_account_by_verified_email(client, db, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com")
    make_user(db, "Buyer@Example.com", Role.customer)
    info = {"iss": "https://accounts.google.com", "sub": "g-123", "email": "buyer@example.com",
            "email_verified": True, "name": "Buyer"}
    monkeypatch.setattr(social, "verify_google", lambda credential: info)
    r = client.post("/api/auth/google", json={"credential": "x" * 40})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"].lower() == "buyer@example.com" and r.json()["user"]["google"]
    assert db.query(User).count() >= 1 and db.query(User).filter(User.google_sub == "g-123").count() == 1


def test_google_unverified_email_refused(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com")
    monkeypatch.setattr(social, "verify_google", lambda c: {"sub": "g-9", "email": "x@example.com", "email_verified": False})
    assert client.post("/api/auth/google", json={"credential": "x" * 40}).status_code == 401


def test_real_google_check_rejects_garbage(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com")
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        social.verify_google("not-a-real-token-" * 3)
    assert e.value.status_code == 401


def test_telegram_user_adds_email_and_first_password(client, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_LOGIN_BOT_TOKEN", BOT)
    tokens = client.post("/api/auth/telegram", json=_widget(user_id=999)).json()
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    r = client.put("/api/account/me", json={"full_name": "Sokha Chan", "email": "sokha@example.com"}, headers=h)
    assert r.status_code == 200 and r.json()["email"] == "sokha@example.com"
    r = client.post("/api/account/password", headers=h,
                    json={"current_password": "", "new_password": "NewPass123"})
    assert r.status_code == 200, r.text
    assert client.post("/api/auth/login", json={"email": "sokha@example.com", "password": "NewPass123"}).status_code == 200
