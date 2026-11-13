"""Small helpers: Cambodian phone validation, provinces, slugs, order numbers, time zone."""
import re
import secrets
import unicodedata
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from app.config import settings

LOCAL_TZ = ZoneInfo(settings.TIMEZONE)

# 24 provinces + the capital (official English spellings)
CAMBODIA_PROVINCES = [
    "Phnom Penh", "Banteay Meanchey", "Battambang", "Kampong Cham", "Kampong Chhnang",
    "Kampong Speu", "Kampong Thom", "Kampot", "Kandal", "Kep", "Koh Kong", "Kratie",
    "Mondulkiri", "Oddar Meanchey", "Pailin", "Preah Sihanouk", "Preah Vihear", "Prey Veng",
    "Pursat", "Ratanakiri", "Siem Reap", "Stung Treng", "Svay Rieng", "Takeo", "Tbong Khmum",
]

# Cambodian mobile + Phnom Penh landline prefixes (without leading 0)
_KH_PREFIXES = (
    "10", "11", "12", "13", "14", "15", "16", "17", "18", "23", "31", "38", "60", "61", "66", "67", "68",
    "69", "70", "71", "76", "77", "78", "79", "81", "85", "86", "87", "88", "89", "90", "92", "93", "95",
    "96", "97", "98", "99",
)
_PHONE_RE = re.compile(r"^(?:\+?855|0)?(\d{8,9})$")


def normalize_kh_phone(raw: str) -> str:
    """Return the phone in local format `0XXXXXXXX` or raise ValueError.

    Accepts: 012345678, 012 345 678, +855 12 345 678, 85512345678, 097-123-4567
    """
    digits = re.sub(r"[\s\-().]", "", raw or "")
    m = _PHONE_RE.match(digits)
    if not m:
        raise ValueError("Enter a valid Cambodian phone number, e.g. 012 345 678")
    national = m.group(1)
    if national.startswith("0"):
        raise ValueError("Enter a valid Cambodian phone number, e.g. 012 345 678")
    if not national.startswith(_KH_PREFIXES):
        raise ValueError("This does not look like a Cambodian phone number")
    return "0" + national


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[-\s_]+", "-", value).strip("-") or secrets.token_hex(3)


def new_order_number() -> str:
    local = datetime.now(LOCAL_TZ)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    suffix = "".join(secrets.choice(alphabet) for _ in range(5))
    return f"IQ{local:%y%m%d}-{suffix}"


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def clean_text(value: str | None, max_len: int = 2000) -> str:
    """Strip control characters and HTML angle brackets from free text."""
    if not value:
        return ""
    value = "".join(ch for ch in value if ch == "\n" or unicodedata.category(ch)[0] != "C")
    return value.replace("<", "").replace(">", "").strip()[:max_len]
