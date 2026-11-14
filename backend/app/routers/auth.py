import hashlib
import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models import PasswordResetToken, RefreshToken, Role, User
from app.schemas import ForgotPasswordIn, LoginIn, RefreshIn, RegisterIn, ResetPasswordIn
from app.security import hash_password, issue_tokens, revoke_refresh_token, rotate_refresh_token, verify_password
from app.serializers import user_out
from app.services.cart_service import merge_guest_cart
from app.services.email import send_password_reset
from app.services.human import require_human
from app.utils import as_aware, utcnow

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Constant-time-ish defence against user enumeration: always run a bcrypt check.
_DUMMY_HASH = hash_password("dummy-password-123")
NO_ACCOUNT = "No account uses this email yet"
FORGOT_MESSAGE = "If an account exists for that email, we've sent a link to reset your password."


@router.post("/register", status_code=201)
@limiter.limit("10/hour")
def register(request: Request, body: RegisterIn, db: Session = Depends(get_db), _h: None = Depends(require_human)):
    email = body.email.lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name,
                phone=body.phone, role=Role.customer, locale=body.locale, terms_accepted_at=utcnow())
    db.add(user)
    db.flush()
    merge_guest_cart(db, user, request.headers.get("X-Cart-Token"))
    tokens = issue_tokens(db, user, remember=body.remember)
    return {**tokens, "user": user_out(user)}


def _login(request: Request, body: LoginIn, db: Session, staff_only: bool):
    user = db.query(User).filter(func.lower(User.email) == body.email.strip().lower()).first()
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user and not staff_only:
        # The shop prefers telling customers to register over a vague error. Enumeration is limited by the
        # bot check and the per-IP rate limit; the dashboard keeps the generic message.
        raise HTTPException(404, NO_ACCOUNT)
    if not user or not ok:
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled")
    if staff_only and not user.is_staff:
        raise HTTPException(403, "This account does not have dashboard access")
    if not staff_only:
        merge_guest_cart(db, user, request.headers.get("X-Cart-Token"))
    tokens = issue_tokens(db, user, remember=body.remember)
    return {**tokens, "user": user_out(user)}


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db), _h: None = Depends(require_human)):
    return _login(request, body, db, staff_only=False)


@router.post("/admin/login")
@limiter.limit("5/minute")
def admin_login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    return _login(request, body, db, staff_only=True)


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh(request: Request, body: RefreshIn, db: Session = Depends(get_db)):
    return rotate_refresh_token(db, body.refresh_token)


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    revoke_refresh_token(db, body.refresh_token)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/forgot-password")
@limiter.limit("5/hour")
def forgot_password(request: Request, body: ForgotPasswordIn, tasks: BackgroundTasks, db: Session = Depends(get_db),
                    _h: None = Depends(require_human)):
    """Sends a reset link, or says the email has no account so the customer can register instead."""
    user = db.query(User).filter(func.lower(User.email) == body.email.lower(), User.is_active.is_(True)).first()
    if user:
        token = secrets.token_urlsafe(32)
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id,
                                            PasswordResetToken.used_at.is_(None)).update({"used_at": utcnow()})
        db.add(PasswordResetToken(user_id=user.id, token_hash=_hash(token),
                                  expires_at=utcnow() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)))
        db.commit()
        # Staff reset from the dashboard; customers from the storefront.
        origin = request.headers.get("origin", "")
        base = origin if origin and origin in settings.cors_origins else settings.STORE_URL
        link = f"{base.rstrip('/')}/reset-password?token={token}"
        tasks.add_task(send_password_reset, user.email, user.full_name, link, user.locale or "en")
        return {"ok": True, "message": FORGOT_MESSAGE}
    raise HTTPException(404, NO_ACCOUNT)


@router.post("/reset-password")
@limiter.limit("10/hour")
def reset_password(request: Request, body: ResetPasswordIn, db: Session = Depends(get_db)):
    row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == _hash(body.token)).first()
    if not row or row.used_at is not None or as_aware(row.expires_at) < utcnow():
        raise HTTPException(400, "This reset link is invalid or has expired")
    user = db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(400, "This reset link is invalid or has expired")
    user.password_hash = hash_password(body.password)
    user.token_version += 1  # sign out every device
    row.used_at = utcnow()
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    db.commit()
    return {"ok": True, "message": "Your password has been reset. You can sign in now."}
