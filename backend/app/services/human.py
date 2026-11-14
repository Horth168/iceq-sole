"""Bot check with Cloudflare Turnstile (free, usually invisible to real people).

The storefront shows the Turnstile widget on sign-in, register, forgot-password, checkout,
reviews and the newsletter, and sends the resulting one-time token in the X-Human-Token header.
These endpoints verify it with Cloudflare before doing anything.

Off until TURNSTILE_SECRET_KEY is set, so local development and tests need no keys.
If Cloudflare itself can't be reached the request is let through (rate limits still apply):
a Cloudflare outage should not stop real customers from buying.
"""
from __future__ import annotations

import logging

import httpx
from fastapi import HTTPException, Request

from app.config import settings
from app.limiter import client_ip

log = logging.getLogger("iceq.human")

HEADER = "X-Human-Token"
VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
FAILED = "Please complete the security check and try again"


def enabled() -> bool:
    return bool(settings.TURNSTILE_SECRET_KEY and settings.TURNSTILE_SITE_KEY)


def require_human(request: Request) -> None:
    """FastAPI dependency: 403 unless the request carries a valid Turnstile token."""
    if not enabled():
        return
    token = request.headers.get(HEADER, "")
    if not token or len(token) > 2048:
        raise HTTPException(403, FAILED)
    try:
        r = httpx.post(VERIFY_URL, timeout=10, data={
            "secret": settings.TURNSTILE_SECRET_KEY, "response": token, "remoteip": client_ip(request)})
        result = r.json()
    except (httpx.HTTPError, ValueError) as e:
        log.warning("Turnstile unreachable, letting request through: %s", e)
        return
    if not result.get("success"):
        log.info("Turnstile rejected %s %s: %s", request.method, request.url.path, result.get("error-codes"))
        raise HTTPException(403, FAILED)
