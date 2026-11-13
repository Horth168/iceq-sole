from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models import Role, User
from app.schemas import LoginIn, RefreshIn, RegisterIn
from app.security import hash_password, issue_tokens, revoke_refresh_token, rotate_refresh_token, verify_password
from app.serializers import user_out
from app.services.cart_service import merge_guest_cart

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Constant-time-ish defence against user enumeration: always run a bcrypt check.
_DUMMY_HASH = hash_password("dummy-password-123")


@router.post("/register", status_code=201)
@limiter.limit("10/hour")
def register(request: Request, body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name,
                phone=body.phone, role=Role.customer)
    db.add(user)
    db.flush()
    merge_guest_cart(db, user, request.headers.get("X-Cart-Token"))
    tokens = issue_tokens(db, user)
    return {**tokens, "user": user_out(user)}


def _login(request: Request, body: LoginIn, db: Session, staff_only: bool):
    user = db.query(User).filter(func.lower(User.email) == body.email.lower()).first()
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled")
    if staff_only and not user.is_staff:
        raise HTTPException(403, "This account does not have dashboard access")
    if not staff_only:
        merge_guest_cart(db, user, request.headers.get("X-Cart-Token"))
    tokens = issue_tokens(db, user)
    return {**tokens, "user": user_out(user)}


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    return _login(request, body, db, staff_only=False)


@router.post("/admin/login")
@limiter.limit("5/minute")
def admin_login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    return _login(request, body, db, staff_only=True)


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh(request: Request, body: RefreshIn, db: Session = Depends(get_db)):
    tokens = rotate_refresh_token(db, body.refresh_token)
    return tokens


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    revoke_refresh_token(db, body.refresh_token)
