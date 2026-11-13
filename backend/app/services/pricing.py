"""Server-side price calculation. The client never sends prices; everything is recomputed here."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Discount, DiscountType, ProductVariant
from app.services.settings_store import get_setting
from app.utils import as_aware, money, utcnow


@dataclass
class Line:
    variant: ProductVariant
    quantity: int
    unit_price: Decimal

    @property
    def line_total(self) -> Decimal:
        return money(self.unit_price * self.quantity)


@dataclass
class Quote:
    lines: list[Line]
    subtotal: Decimal
    discount_amount: Decimal
    discount_code: str | None
    delivery_fee: Decimal
    tax_amount: Decimal
    total: Decimal
    khr_rate: int
    messages: list[str] = field(default_factory=list)

    @property
    def total_khr(self) -> int:
        return int(round(float(self.total) * self.khr_rate, -2))


def unit_price(variant: ProductVariant) -> Decimal:
    if variant.price_override is not None:
        return money(variant.price_override)
    return money(variant.product.effective_price)


def find_discount(db: Session, code: str) -> Discount | None:
    return db.query(Discount).filter(func.upper(Discount.code) == code.strip().upper()).first()


def validate_discount(discount: Discount | None, subtotal: Decimal) -> Decimal:
    """Return the discount amount, or raise 400 with a customer-friendly reason."""
    if discount is None or not discount.is_active:
        raise HTTPException(400, "This discount code is not valid")
    now = utcnow()
    if discount.starts_at and as_aware(discount.starts_at) > now:
        raise HTTPException(400, "This discount code is not active yet")
    if discount.expires_at and as_aware(discount.expires_at) < now:
        raise HTTPException(400, "This discount code has expired")
    if discount.usage_limit is not None and discount.used_count >= discount.usage_limit:
        raise HTTPException(400, "This discount code has reached its usage limit")
    if subtotal < money(discount.min_subtotal or 0):
        raise HTTPException(400, f"Spend at least ${money(discount.min_subtotal)} to use this code")
    if discount.type == DiscountType.percent:
        amount = money(subtotal * Decimal(discount.value) / 100)
        if discount.max_discount is not None:
            amount = min(amount, money(discount.max_discount))
    else:
        amount = money(discount.value)
    return min(amount, subtotal)


def delivery_fee(db: Session, province: str | None, subtotal_after_discount: Decimal) -> Decimal:
    cfg = get_setting(db, "delivery")
    threshold = cfg.get("free_shipping_threshold")
    if threshold and subtotal_after_discount >= money(threshold):
        return money(0)
    if not province:
        return money(cfg.get("phnom_penh_fee", 0))
    zone = (cfg.get("zone_fees") or {}).get(province)
    if zone is not None:
        return money(zone)
    if province == "Phnom Penh":
        return money(cfg.get("phnom_penh_fee", 0))
    return money(cfg.get("province_fee", 0))


def build_quote(db: Session, items: list[tuple[ProductVariant, int]], *, discount_code: str | None,
                province: str | None, strict_discount: bool = False) -> Quote:
    lines = [Line(v, q, unit_price(v)) for v, q in items]
    subtotal = money(sum((l.line_total for l in lines), Decimal(0)))
    messages: list[str] = []
    discount_amount = money(0)
    applied_code = None
    if discount_code:
        try:
            discount_amount = validate_discount(find_discount(db, discount_code), subtotal)
            applied_code = discount_code.strip().upper()
        except HTTPException as e:
            if strict_discount:
                raise
            messages.append(str(e.detail))
    after_discount = subtotal - discount_amount
    fee = delivery_fee(db, province, after_discount) if lines else money(0)

    tax_cfg = get_setting(db, "tax")
    tax = money(0)
    if tax_cfg.get("enabled") and float(tax_cfg.get("rate_percent") or 0) > 0:
        rate = Decimal(str(tax_cfg["rate_percent"])) / 100
        if tax_cfg.get("inclusive", True):
            tax = money(after_discount - after_discount / (1 + rate))  # informational, already in price
        else:
            tax = money(after_discount * rate)
    total = after_discount + fee + (tax if not tax_cfg.get("inclusive", True) and tax_cfg.get("enabled") else 0)
    rate = int(get_setting(db, "currency").get("khr_rate", 4100))
    return Quote(lines, subtotal, discount_amount, applied_code, fee, tax, money(total), rate, messages)
