"""Bakong KHQR (the national QR standard used by ABA Bank and every Bakong member bank).

* `build_khqr()` creates a dynamic EMVCo-compliant KHQR string for an exact amount.
  Any Cambodian banking app (ABA, ACLEDA, Wing, ...) can scan it.
* `check_payment()` asks the official Bakong Open API whether a transaction with the QR's
  MD5 hash has been completed. Only a confirmed server-side response marks a payment as paid.

Requires BAKONG_ACCOUNT_ID (e.g. yourname@abaa) and BAKONG_API_TOKEN
(register at https://api-bakong.nbc.gov.kh). Without them the store falls back to
manual verification (customer submits reference/screenshot, admin verifies).
"""
from __future__ import annotations

import hashlib
import logging
import time
from decimal import Decimal

import httpx

from app.config import settings

log = logging.getLogger("iceq.khqr")

CURRENCY_CODES = {"USD": "840", "KHR": "116"}


def _tlv(tag: str, value: str) -> str:
    if not value:
        return ""
    return f"{tag}{len(value):02d}{value}"


def crc16_ccitt(data: str) -> str:
    crc = 0xFFFF
    for byte in data.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def _ascii(value: str, max_len: int) -> str:
    return "".join(ch for ch in value if 32 <= ord(ch) < 127)[:max_len]


def build_khqr(*, account_id: str, merchant_name: str, merchant_city: str, amount: Decimal,
               currency: str = "USD", bill_number: str = "", store_label: str = "",
               expiry_minutes: int = 30) -> str:
    if currency not in CURRENCY_CODES:
        raise ValueError("KHQR supports USD or KHR")
    amount_str = f"{amount:.2f}" if currency == "USD" else str(int(amount))
    now_ms = int(time.time() * 1000)
    parts = [
        _tlv("00", "01"),
        _tlv("01", "12"),  # dynamic QR (amount included)
        _tlv("29", _tlv("00", account_id)),
        _tlv("52", "5999"),
        _tlv("53", CURRENCY_CODES[currency]),
        _tlv("54", amount_str),
        _tlv("58", "KH"),
        _tlv("59", _ascii(merchant_name, 25)),
        _tlv("60", _ascii(merchant_city, 15)),
        _tlv("62", _tlv("01", _ascii(bill_number, 25)) + _tlv("03", _ascii(store_label, 25))),
        _tlv("99", _tlv("00", str(now_ms)) + _tlv("01", str(now_ms + expiry_minutes * 60_000))),
    ]
    payload = "".join(parts) + "6304"
    return payload + crc16_ccitt(payload)


def md5(payload: str) -> str:
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def check_payment(payload_md5: str) -> dict:
    """Return {"paid": bool, "data": ..., "error": str|None} from the Bakong Open API."""
    if not settings.bakong_enabled:
        return {"paid": False, "data": None, "error": "Bakong API is not configured"}
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{settings.BAKONG_API_URL.rstrip('/')}/v1/check_transaction_by_md5",
                json={"md5": payload_md5},
                headers={"Authorization": f"Bearer {settings.BAKONG_API_TOKEN}"},
            )
        body = resp.json() if resp.content else {}
    except (httpx.HTTPError, ValueError) as e:
        log.warning("Bakong check failed: %s", e)
        return {"paid": False, "data": None, "error": "Payment network unavailable, try again shortly"}
    # responseCode 0 => a completed transaction exists for this md5
    if resp.status_code == 200 and body.get("responseCode") == 0 and body.get("data"):
        return {"paid": True, "data": body.get("data"), "error": None}
    return {"paid": False, "data": body, "error": None if resp.status_code == 200 else f"HTTP {resp.status_code}"}
