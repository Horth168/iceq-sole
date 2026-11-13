"""Password hashing, JWT access/refresh tokens and permission dependencies."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import RefreshToken, Role, User

ALGORITHM = "HS256"
_bearer = HTTPBearer(auto_error=False)


# ------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; pre-hash so long passphrases are fully used.
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest().encode()
    return bcrypt.hashpw(digest, bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        digest = hashlib.sha256(password.encode("utf-8")).hexdigest().encode()
        return bcrypt.checkpw(digest, password_hash.encode())
    except ValueError:
        return False


# ------------------------------------------------------------- tokens
def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "ver": user.token_version,
        "type": "access",
        "iat": _now(),
        "exp": _now() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(db: Session, user: User) -> str:
    jti = secrets.token_hex(24)
    expires = _now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(user_id=user.id, jti=jti, expires_at=expires))
    payload = {"sub": str(user.id), "jti": jti, "ver": user.token_version, "type": "refresh", "exp": expires}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def issue_tokens(db: Session, user: User) -> dict:
    refresh = create_refresh_token(db, user)
    user.last_login_at = _now()
    db.commit()
    return {
        "access_token": create_access_token(user),
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


def rotate_refresh_token(db: Session, token: str) -> dict:
    """Validate a refresh token, revoke it and issue a fresh pair (rotation).

    Re-use of an already revoked token revokes every session of that user.
    """
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please sign in again")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise invalid
    if payload.get("type") != "refresh":
        raise invalid
    row = db.query(RefreshToken).filter(RefreshToken.jti == payload.get("jti")).first()
    user = db.get(User, int(payload["sub"]))
    if not row or not user or not user.is_active or payload.get("ver") != user.token_version:
        raise invalid
    if row.revoked:  # token re-use => possible theft
        user.token_version += 1
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
        db.commit()
        raise invalid
    row.revoked = True
    return issue_tokens(db, user)


def revoke_refresh_token(db: Session, token: str) -> None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
    except jwt.PyJWTError:
        return
    db.query(RefreshToken).filter(RefreshToken.jti == payload.get("jti")).update({"revoked": True})
    db.commit()


# ------------------------------------------------------------- dependencies
def _decode_access(creds: HTTPAuthorizationCredentials | None, db: Session) -> User | None:
    if creds is None:
        return None
    try:
        payload = jwt.decode(creds.credentials, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired", headers={"WWW-Authenticate": "Bearer"})
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token", headers={"WWW-Authenticate": "Bearer"})
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active or payload.get("ver") != user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session is no longer valid")
    return user


def get_optional_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                      db: Session = Depends(get_db)) -> User | None:
    return _decode_access(creds, db)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     db: Session = Depends(get_db)) -> User:
    user = _decode_access(creds, db)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in", headers={"WWW-Authenticate": "Bearer"})
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role not in (Role.staff, Role.admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff access required")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
