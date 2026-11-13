"""API rate limiting (slowapi). Keyed by client IP; honours X-Forwarded-For behind a proxy."""
from slowapi import Limiter
from starlette.requests import Request

from app.config import settings


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=client_ip, default_limits=["300/minute"], enabled=settings.RATE_LIMIT_ENABLED)
