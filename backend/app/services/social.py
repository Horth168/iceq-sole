"""Sign in with Google and Telegram (both free).

* Google: the storefront gets an ID token from Google Identity Services; we check its signature,
  audience (GOOGLE_CLIENT_ID) and expiry with google-auth before trusting the email in it.
* Telegram Login Widget (website): Telegram signs the user data with a key derived from the bot
  token; we recompute the HMAC (https://core.telegram.org/widgets/login#checking-authorization).
* Telegram Mini App: Telegram signs `initData` the same way with the "WebAppData" key
  (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

Both Telegram flows use TELEGRAM_LOGIN_BOT_TOKEN: the customer-facing Mini App bot, not the
admin-alerts bot. Telegram never shares an email, so Telegram-only accounts get a placeholder
address on the reserved .invalid domain that can never receive mail (see is_placeholder_email).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from urllib.parse import parse_qsl

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Role, User
from app.utils import utcnow

log = logging.getLogger("iceq.social")

PLACEHOLDER_DOMAIN = "@telegram.invalid"
MAX_AGE = 24 * 3600  # Telegram sign-in data older than a day is refused (replay protection)
FAILED = "Sign-in could not be verified, please try again"


def is_placeholder_email(email: str | None) -> bool:
    return bool(email) and email.endswith(PLACEHOLDER_DOMAIN)


def real_email(user: User | None) -> str | None:
    return None if not user or is_placeholder_email(user.email) else user.email


# ------------------------------------------------------------------ availability
def google_enabled() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID)


def telegram_enabled() -> bool:
    return bool(settings.TELEGRAM_LOGIN_BOT_TOKEN)


_bot_username: str | None = None
_retry_at = 0.0


def telegram_bot_username() -> str:
    """The login bot's @username (the website widget needs it). Looked up once with getMe;
    after a failure it waits 5 minutes before asking Telegram again, so pages never stall on it."""
    global _bot_username, _retry_at
    if not telegram_enabled():
        return ""
    if _bot_username is None and time.time() >= _retry_at:
        try:
            r = httpx.get(f"https://api.telegram.org/bot{settings.TELEGRAM_LOGIN_BOT_TOKEN}/getMe", timeout=8)
            name = r.json().get("result", {}).get("username", "") if r.status_code == 200 else ""
        except (httpx.HTTPError, ValueError):
            name = ""
        if name:
            _bot_username = name
        else:
            log.warning("Telegram getMe failed for the login bot - check TELEGRAM_LOGIN_BOT_TOKEN")
            _retry_at = time.time() + 300
    return _bot_username or ""


# ------------------------------------------------------------------ verification
def verify_google(credential: str) -> dict:
    if not google_enabled():
        raise HTTPException(404, "Google sign-in is not available")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
    try:
        info = id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID,
                                            clock_skew_in_seconds=10)
    except Exception as e:  # invalid signature, wrong audience, expired, network...
        log.info("Google token rejected: %s", e)
        raise HTTPException(401, FAILED) from e
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or not info.get("sub"):
        raise HTTPException(401, FAILED)
    return info


def _check_hash(fields: dict[str, str], received: str, secret: bytes) -> None:
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not received or not hmac.compare_digest(expected, received):
        raise HTTPException(401, FAILED)


def _check_age(auth_date) -> None:
    try:
        age = time.time() - int(auth_date)
    except (TypeError, ValueError) as e:
        raise HTTPException(401, FAILED) from e
    if age > MAX_AGE or age < -300:
        raise HTTPException(401, FAILED)


def verify_telegram_widget(data: dict) -> dict:
    """Data from the Telegram Login Widget: id, first_name, last_name, username, photo_url, auth_date, hash."""
    if not telegram_enabled():
        raise HTTPException(404, "Telegram sign-in is not available")
    fields = {k: str(v) for k, v in data.items() if k != "hash" and v is not None}
    _check_hash(fields, str(data.get("hash", "")), hashlib.sha256(settings.TELEGRAM_LOGIN_BOT_TOKEN.encode()).digest())
    _check_age(fields.get("auth_date"))
    return {"id": int(fields["id"]), "first_name": fields.get("first_name", ""),
            "last_name": fields.get("last_name", ""), "username": fields.get("username", "")}


def verify_telegram_webapp(init_data: str) -> dict:
    """Raw `Telegram.WebApp.initData` from inside the Mini App."""
    if not telegram_enabled():
        raise HTTPException(404, "Telegram sign-in is not available")
    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received = fields.pop("hash", "")  # every other field (including 'signature') is part of the checked string
    secret = hmac.new(b"WebAppData", settings.TELEGRAM_LOGIN_BOT_TOKEN.encode(), hashlib.sha256).digest()
    _check_hash(fields, received, secret)
    _check_age(fields.get("auth_date"))
    try:
        user = json.loads(fields.get("user", ""))
        user["id"] = int(user["id"])
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(401, FAILED) from e
    return user


# ------------------------------------------------------------------ accounts
def _new_customer(db: Session, *, email: str, full_name: str, locale: str) -> User:
    user = User(email=email, password_hash="",  # no password yet: verify_password always fails on ""
                full_name=(full_name or "IceQ customer")[:120], role=Role.customer,
                locale=locale if locale in ("en", "km") else "en", terms_accepted_at=utcnow())
    db.add(user)
    return user


def _usable(user: User) -> User:
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled")
    return user


def user_from_google(db: Session, info: dict, locale: str = "en") -> User:
    sub = str(info["sub"])
    user = db.query(User).filter(User.google_sub == sub).first()
    if user:
        return _usable(user)
    email = (info.get("email") or "").lower()
    if not email or not info.get("email_verified"):
        raise HTTPException(401, FAILED)
    # an existing account with the same (Google-verified) email gets Google linked to it
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user:
        _usable(user)
    else:
        user = _new_customer(db, email=email, full_name=info.get("name") or email.split("@")[0], locale=locale)
    user.google_sub = sub
    db.flush()
    return user


def user_from_telegram(db: Session, tg: dict, locale: str = "en") -> User:
    tid = int(tg["id"])
    user = db.query(User).filter(User.telegram_id == tid).first()
    if user:
        return _usable(user)
    name = " ".join(x for x in (tg.get("first_name"), tg.get("last_name")) if x).strip() or tg.get("username") or ""
    lang = "km" if str(tg.get("language_code", "")).startswith("km") else locale
    user = _new_customer(db, email=f"tg{tid}{PLACEHOLDER_DOMAIN}", full_name=name, locale=lang)
    user.telegram_id = tid
    db.flush()
    return user
