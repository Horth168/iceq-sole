"""Admin: store settings, logo / KHQR image uploads, staff accounts, storage status."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Role, User
from app.schemas import StaffIn, UserUpdateIn
from app.security import hash_password, require_admin, require_staff
from app.serializers import user_out
from app.services import images
from app.services.settings_store import DEFAULTS, all_settings, get_setting, set_setting
from app.services.storage import get_storage

from app.services.email import smtp_configured  # noqa: E402

router = APIRouter(prefix="/api/admin", tags=["Admin · settings"])


@router.get("/settings")
def read_settings(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return {**all_settings(db), "system": {
        "storage_provider": get_storage().name,
        "bakong_auto_verify": settings.bakong_enabled,
        "bakong_account_id": settings.BAKONG_ACCOUNT_ID or None,
        "environment": settings.ENVIRONMENT,
        "timezone": settings.TIMEZONE,
        "email_configured": smtp_configured(),
        "telegram_configured": bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_ADMIN_CHAT_IDS.strip()),
    }}


@router.put("/settings/{key}")
def write_settings(key: str, value: dict, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if key not in DEFAULTS:
        raise HTTPException(404, "Unknown settings group")
    allowed = set(DEFAULTS[key])
    unknown = set(value) - allowed
    if unknown:
        raise HTTPException(400, f"Unknown fields: {', '.join(sorted(unknown))}")
    if key == "currency" and "khr_rate" in value:
        rate = int(value["khr_rate"])
        if not 1000 <= rate <= 10000:
            raise HTTPException(400, "KHR rate looks wrong (expected 1000–10000)")
    if key == "tax" and "rate_percent" in value and not 0 <= float(value["rate_percent"]) <= 30:
        raise HTTPException(400, "Tax rate must be between 0 and 30%")
    if key == "delivery":
        for k in ("phnom_penh_fee", "province_fee", "free_shipping_threshold"):
            if k in value and value[k] is not None and float(value[k]) < 0:
                raise HTTPException(400, "Fees cannot be negative")
    return set_setting(db, key, value)


@router.post("/settings/upload/{kind}")
async def upload_setting_image(kind: str, file: UploadFile = File(...), db: Session = Depends(get_db),
                               _: User = Depends(require_admin)):
    """kind = logo | khqr  (store logo, or a static printed KHQR used as fallback)."""
    if kind not in ("logo", "khqr"):
        raise HTTPException(404, "Unknown upload")
    stored = images.store_image(await images.read_upload(file), f"settings/{kind}", widths=(512,) if kind == "logo" else (900,))
    if kind == "logo":
        return set_setting(db, "store", {"logo_url": stored.url})
    return set_setting(db, "payments", {"khqr_static_image_url": stored.url})


# ================================================================ staff
@router.get("/staff")
def list_staff(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return [user_out(u) for u in db.query(User).filter(User.role.in_([Role.staff, Role.admin])).order_by(User.id)]


@router.post("/staff", status_code=201)
def create_staff(body: StaffIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if body.role == Role.customer:
        raise HTTPException(400, "Use staff or admin")
    u = User(email=body.email.lower(), full_name=body.full_name, password_hash=hash_password(body.password), role=body.role)
    db.add(u)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email already in use")
    return user_out(u)


@router.patch("/staff/{user_id}")
def update_staff(user_id: int, body: UserUpdateIn, db: Session = Depends(get_db), me: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if not u or u.role == Role.customer:
        raise HTTPException(404, "Staff member not found")
    if u.id == me.id:
        raise HTTPException(400, "You cannot change your own role or status")
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.role is not None:
        u.role = body.role
    u.token_version += 1
    db.commit()
    return user_out(u)
