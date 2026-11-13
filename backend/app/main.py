"""IceQ Sole API — FastAPI application factory."""
import logging
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.limiter import limiter
from app.routers import (account, admin_catalog, admin_dashboard, admin_marketing, admin_orders, admin_settings,
                         auth, cart, catalog, orders)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("iceq")

app = FastAPI(
    title="IceQ Sole API",
    version="1.0.0",
    description="REST API for the IceQ Sole sneaker store: storefront, checkout, payments and admin.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
app.state.limiter = limiter

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Cart-Token"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/") and request.method == "GET" and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    elapsed = (time.perf_counter() - start) * 1000
    if elapsed > 1000:
        log.warning("slow request %s %s %.0fms", request.method, request.url.path, elapsed)
    return response


# ------------------------------------------------------------- errors
@app.exception_handler(RateLimitExceeded)
async def rate_limited(request: Request, exc: RateLimitExceeded):
    return JSONResponse({"detail": "Too many requests, please slow down and try again shortly."}, status_code=429)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        field = ".".join(str(x) for x in e.get("loc", [])[1:]) or "body"
        msg = e.get("msg", "Invalid value").replace("Value error, ", "")
        errors.append({"field": field, "message": msg})
    first = errors[0]["message"] if errors else "Invalid input"
    return JSONResponse({"detail": first, "errors": errors}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)


# ------------------------------------------------------------- routes
for r in (auth, account, catalog, cart, orders, admin_dashboard, admin_catalog, admin_orders, admin_marketing,
          admin_settings):
    app.include_router(r.router)


@app.get("/api/health", tags=["System"])
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "service": "IceQ Sole API", "storage": settings.STORAGE_PROVIDER}


if settings.STORAGE_PROVIDER == "local":
    from pathlib import Path

    Path(settings.LOCAL_UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.LOCAL_UPLOAD_DIR), name="uploads")
