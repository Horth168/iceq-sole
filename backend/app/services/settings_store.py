"""Store settings with safe defaults. Values are editable from the admin dashboard."""
import copy

from sqlalchemy.orm import Session

from app.models import StoreSetting

DEFAULTS: dict[str, dict] = {
    "store": {
        "name": "IceQ Sole",
        "tagline": "Cold-blooded style. Built for the street.",
        "email": "hello@iceqsole.com",
        "phone": "012 345 678",
        "address": "Street 240, Daun Penh, Phnom Penh, Cambodia",
        "opening_hours": "Mon–Sun · 9:00–21:00",
        "logo_url": "",
        "social": {"facebook": "", "instagram": "", "tiktok": "", "telegram": ""},
    },
    "delivery": {
        "phnom_penh_fee": 1.50,
        "province_fee": 3.00,
        "free_shipping_threshold": 100.00,
        "zone_fees": {},          # optional per-province override, e.g. {"Siem Reap": 2.5}
        "estimated_days_phnom_penh": "Same / next day",
        "estimated_days_province": "1–3 days",
    },
    "payments": {
        "khqr_enabled": True,
        "bank_transfer_enabled": True,
        "cod_enabled": True,
        "khqr_merchant_name": "IceQ Sole",
        "khqr_merchant_city": "Phnom Penh",
        "khqr_static_image_url": "",   # optional: upload your printed ABA KHQR as fallback
        "khqr_template": "",           # your bank KHQR code (read from the uploaded QR); per-order QRs are built from it
        "bank_name": "ABA Bank",
        "bank_account_name": "",
        "bank_account_number": "",
        "instructions": "Pay the exact amount and include your order number in the remark.",
    },
    "currency": {"primary": "USD", "secondary": "KHR", "khr_rate": 4100, "show_secondary": True},
    "tax": {"enabled": False, "rate_percent": 0.0, "label": "VAT", "inclusive": True},
    "inventory": {"low_stock_threshold": 3},
}

PUBLIC_KEYS = ("store", "delivery", "currency", "tax")


def get_setting(db: Session, key: str) -> dict:
    base = copy.deepcopy(DEFAULTS.get(key, {}))
    row = db.get(StoreSetting, key)
    if row and isinstance(row.value, dict):
        _deep_merge(base, row.value)
    return base


def set_setting(db: Session, key: str, value: dict) -> dict:
    if key not in DEFAULTS:
        raise KeyError(key)
    merged = get_setting(db, key)
    _deep_merge(merged, value)
    row = db.get(StoreSetting, key)
    if row:
        row.value = merged
    else:
        db.add(StoreSetting(key=key, value=merged))
    db.commit()
    return merged


def all_settings(db: Session) -> dict:
    return {k: get_setting(db, k) for k in DEFAULTS}


def public_settings(db: Session) -> dict:
    data = {k: get_setting(db, k) for k in PUBLIC_KEYS}
    data["payments"] = available_methods(db)
    return data


def available_methods(db: Session) -> dict:
    """A method is only offered when it is switched on AND actually payable."""
    from app.config import settings

    pay = get_setting(db, "payments")
    has_bank = bool((pay.get("bank_account_number") or "").strip())
    has_qr = bool(pay.get("khqr_template") or settings.BAKONG_ACCOUNT_ID or pay.get("khqr_static_image_url"))
    return {
        "khqr_enabled": bool(pay["khqr_enabled"] and has_qr),
        "bank_transfer_enabled": bool(pay["bank_transfer_enabled"] and has_bank),
        "cod_enabled": bool(pay["cod_enabled"]),
    }


def _deep_merge(base: dict, extra: dict) -> None:
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict) and k != "zone_fees":
            _deep_merge(base[k], v)
        else:
            base[k] = v
