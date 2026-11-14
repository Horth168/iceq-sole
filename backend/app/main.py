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
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.i18n import translate
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.limiter import limiter
from app.routers import (account, admin_catalog, admin_dashboard, admin_marketing, admin_orders, admin_settings,
                         auth, cart, catalog, orders, telegram)

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
    allow_headers=["Authorization", "Content-Type", "X-Cart-Token", "Accept-Language"],
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
    msg = translate("Too many requests, please slow down and try again shortly.", request.headers.get("accept-language"))
    return JSONResponse({"detail": msg}, status_code=429)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    detail = translate(exc.detail, request.headers.get("accept-language")) if isinstance(exc.detail, str) else exc.detail
    return JSONResponse({"detail": detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        field = ".".join(str(x) for x in e.get("loc", [])[1:]) or "body"
        msg = e.get("msg", "Invalid value").replace("Value error, ", "")
        errors.append({"field": field, "message": translate(msg, request.headers.get("accept-language"))})
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
          admin_settings, telegram):
    app.include_router(r.router)


@app.on_event("startup")
def _telegram_webhook() -> None:
    from app.services import telegram as tg
    tg.register_webhook_async()  # no-op unless TELEGRAM_BOT_TOKEN is set and the API URL is https


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    """XML sitemap for search engines (the storefront rewrites /sitemap.xml here)."""
    from xml.sax.saxutils import escape

    from fastapi.responses import Response

    from app.database import SessionLocal
    from app.models import Brand, Category, Product
    base = settings.STORE_URL.rstrip("/")
    urls = [("/", "1.0"), ("/shop", "0.9"), ("/new-arrivals", "0.8"), ("/best-sellers", "0.8"), ("/sale", "0.7"),
            ("/brands", "0.6"), ("/about", "0.4"), ("/track", "0.3")]
    with SessionLocal() as db:
        urls += [(f"/brands/{b.slug}", "0.6") for b in db.query(Brand).filter(Brand.is_active.is_(True))]
        urls += [(f"/category/{c.slug}", "0.6") for c in db.query(Category).filter(Category.is_active.is_(True))]
        prods = db.query(Product.slug, Product.updated_at).filter(Product.is_active.is_(True)).all()
    body = "".join(f"<url><loc>{escape(base + u)}</loc><priority>{p}</priority></url>" for u, p in urls)
    body += "".join(f"<url><loc>{escape(f'{base}/product/{s}')}</loc><lastmod>{(m.date().isoformat() if m else '')}</lastmod>"
                    f"<priority>0.8</priority></url>" for s, m in prods)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'
    return Response(xml, media_type="application/xml", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/health", tags=["System"])
def health():
    # No database query: Render's health checks and the keep-awake ping hit this often, and
    # Neon's free compute should be allowed to sleep when the store is idle.
    return {"status": "ok", "service": "IceQ Sole API", "storage": settings.STORAGE_PROVIDER}


@app.get("/api/health/db", tags=["System"])
def health_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}


if settings.STORAGE_PROVIDER == "local":
    from pathlib import Path

    Path(settings.LOCAL_UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.LOCAL_UPLOAD_DIR), name="uploads")
