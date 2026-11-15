"""In-store point of sale (POS).

A POS sale is an ordinary Order with channel="pos", so it shares stock, reports, invoices,
backups and the dashboard order list with the online shop. The differences:

* no delivery: the customer takes the items home, so a paid sale goes straight to Delivered;
* Cash (and bank transfer the cashier has checked) is paid on the spot: stock is deducted at once;
* KHQR shows a QR for the amount. Stock is held while the customer pays; the sale completes when
  the payment is confirmed - automatically by the ABA PayWay listener, or by the cashier.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.models import (Order, OrderItem, OrderStatus, Payment, PaymentMethod, PaymentStatus, Product, ProductVariant,
                        User)
from app.serializers import dt
from app.services import inventory
from app.services import orders as svc
from app.services.pricing import unit_price
from app.services.settings_store import get_setting
from app.utils import money, new_order_number, utcnow

S = OrderStatus
CAMBODIA = timezone(timedelta(hours=7))
WALK_IN = "Walk-in customer"


def catalog(db: Session) -> list[dict]:
    """Everything sellable, with live stock: products -> colour/size variants (SKU = barcode)."""
    products = (db.query(Product).filter(Product.is_active.is_(True))
                .options(selectinload(Product.variants), selectinload(Product.images))
                .order_by(Product.name).all())
    out = []
    for p in products:
        imgs = sorted(p.images, key=lambda i: (not i.is_primary, i.sort_order, i.id))
        variants = [v for v in p.variants if v.is_active]
        if not variants:
            continue
        out.append({
            "id": p.id, "name": p.name, "brand": p.brand.name if p.brand else "",
            "category": p.category.name if p.category else "", "image": imgs[0].url if imgs else None,
            "price": float(money(p.effective_price)),
            "variants": [{"id": v.id, "sku": v.sku, "color": v.color.name if v.color else "",
                          "size": v.size.label if v.size else "", "available": v.available,
                          "price": float(unit_price(v)),
                          "image": next((i.url for i in imgs if i.color_id == v.color_id), imgs[0].url if imgs else None)}
                         for v in sorted(variants, key=lambda v: (v.color_id or 0, v.size.sort_order if v.size else 0))],
        })
    return out


def _tax(db: Session, after_discount: Decimal) -> tuple[Decimal, Decimal]:
    """(tax shown, tax added to total) using the same rules as the online shop."""
    cfg = get_setting(db, "tax")
    if not cfg.get("enabled") or float(cfg.get("rate_percent") or 0) <= 0:
        return money(0), money(0)
    rate = Decimal(str(cfg["rate_percent"])) / 100
    if cfg.get("inclusive", True):
        return money(after_discount - after_discount / (1 + rate)), money(0)
    tax = money(after_discount * rate)
    return tax, tax


def create_sale(db: Session, body, staff: User) -> Order:
    if not body.items:
        raise HTTPException(400, "The sale is empty")
    rate = int(get_setting(db, "currency").get("khr_rate", 4100))
    qty_by_variant: dict[int, int] = {}
    for line in body.items:
        qty_by_variant[line.variant_id] = qty_by_variant.get(line.variant_id, 0) + line.quantity
    variants = {v.id: v for v in db.query(ProductVariant).filter(ProductVariant.id.in_(qty_by_variant)).all()}
    if len(variants) != len(qty_by_variant):
        raise HTTPException(404, "One of the items no longer exists")

    subtotal = money(sum((unit_price(variants[vid]) * q for vid, q in qty_by_variant.items()), Decimal(0)))
    discount = money(body.discount_amount or 0)
    if body.discount_percent:
        discount = money(subtotal * Decimal(str(body.discount_percent)) / 100)
    discount = min(discount, subtotal)
    after = subtotal - discount
    tax_shown, tax_added = _tax(db, after)
    total = money(after + tax_added)

    store = get_setting(db, "store")
    method = body.payment_method
    order = Order(
        order_number=new_order_number(), idempotency_key=body.idempotency_key, channel="pos", user_id=None,
        status=S.pending, payment_method=method, payment_status=PaymentStatus.unpaid,
        customer_name=(body.customer_name or "").strip() or WALK_IN, customer_phone=(body.customer_phone or "").strip(),
        customer_email=(body.customer_email or None), province=store.get("city") or "Phnom Penh", district="",
        address_line="In-store purchase", delivery_note=(body.note or "")[:500],
        subtotal=subtotal, discount_code=("POS" if discount else None), discount_amount=discount, delivery_fee=money(0),
        tax_amount=tax_shown, total=total, currency="USD", khr_rate=rate,
        admin_note=f"POS sale by {staff.full_name or staff.email}",
    )
    db.add(order)
    db.flush()
    for vid, qty in qty_by_variant.items():
        v = variants[vid]
        p = v.product
        img = next((i.url for i in sorted(p.images, key=lambda i: (not i.is_primary, i.sort_order)) if i.color_id == v.color_id), None)
        db.add(OrderItem(order_id=order.id, product_id=p.id, variant_id=v.id, product_name=p.name, sku=v.sku,
                         brand_name=p.brand.name if p.brand else "", product_slug=p.slug,
                         color=v.color.name if v.color else "", size=v.size.label if v.size else "", image_url=img,
                         unit_price=unit_price(v), quantity=qty, line_total=money(unit_price(v) * qty)))
        inventory.reserve(db, v, qty, order.order_number)   # 409 with a clear message when stock is short
    db.flush()
    db.refresh(order)
    svc.add_event(db, order, "pending", f"In-store sale started by {staff.full_name or staff.email}", staff.id)

    if method == PaymentMethod.khqr:
        svc.create_khqr_payment(db, order)
        if not svc.latest_payment(order).khqr_payload:
            raise HTTPException(400, "KHQR isn't set up yet: upload your bank QR in Settings > Payments")
        return order

    pay = Payment(method=method, amount=total, currency="USD", status=PaymentStatus.unpaid)
    if method == PaymentMethod.cash:
        tendered = money(Decimal(str(body.cash_usd or 0)) + Decimal(str(body.cash_khr or 0)) / rate)
        if tendered + Decimal("0.005") < total:
            raise HTTPException(400, f"Cash received is less than the total (${total})")
        change = money(tendered - total)
        change_khr = int((change * rate / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP) * 100)
        pay.gateway_response = {"cash_usd": str(body.cash_usd or 0), "cash_khr": int(body.cash_khr or 0),
                                "tendered_usd": str(tendered), "change_usd": str(change), "change_khr": change_khr}
    order.payments.append(pay)
    db.flush()
    finish(db, order, staff, paid_note=("Cash received" if method == PaymentMethod.cash else "Bank transfer checked by cashier"))
    return order


def finish(db: Session, order: Order, staff: User, *, paid_note: str | None = None) -> None:
    """Mark paid (when needed) and hand the items over: ... -> Delivered, stock deducted."""
    if order.status in (S.cancelled, S.refunded):
        raise HTTPException(400, f"This sale is {order.status.value}")
    if order.payment_status != PaymentStatus.paid:
        svc.mark_paid(db, order, source="pos", user_id=staff.id, note=paid_note or "Paid in store")
    for step in (S.confirmed, S.shipped, S.delivered):
        if order.status == S.processing and step == S.confirmed:
            continue
        if order.status != step and step in svc.ALLOWED[order.status]:
            svc.change_status(db, order, step, note="Handed over in store" if step == S.delivered else "", user_id=staff.id)


def cancel(db: Session, order: Order, staff: User) -> None:
    if order.payment_status == PaymentStatus.paid:
        raise HTTPException(400, "This sale is already paid - refund it from the order page instead")
    if order.status != S.cancelled:
        svc.change_status(db, order, S.cancelled, note="POS sale cancelled", user_id=staff.id)


def summary(db: Session, day: str | None) -> dict:
    """Totals for one Cambodia day (default today): sales, money by method, cash drawer."""
    d = datetime.strptime(day, "%Y-%m-%d").date() if day else datetime.now(CAMBODIA).date()
    start = datetime(d.year, d.month, d.day, tzinfo=CAMBODIA)
    end = start + timedelta(days=1)
    orders = (db.query(Order).filter(Order.channel == "pos", Order.created_at >= start.astimezone(timezone.utc),
                                     Order.created_at < end.astimezone(timezone.utc))
              .order_by(Order.created_at.desc()).all())
    done = [o for o in orders if o.payment_status == PaymentStatus.paid and o.status != S.refunded]
    by_method: dict[str, Decimal] = {}
    cash_usd, cash_khr, change_usd = Decimal(0), 0, Decimal(0)
    for o in done:
        by_method[o.payment_method.value] = by_method.get(o.payment_method.value, Decimal(0)) + o.total
        if o.payment_method == PaymentMethod.cash:
            g = (svc.latest_payment(o).gateway_response or {}) if svc.latest_payment(o) else {}
            cash_usd += Decimal(str(g.get("cash_usd", 0)))
            cash_khr += int(g.get("cash_khr", 0))
            change_usd += Decimal(str(g.get("change_usd", 0)))
    items = sum(i.quantity for o in done for i in o.items)
    return {
        "day": d.isoformat(), "sales": len(done), "items": items,
        "revenue": float(sum((o.total for o in done), Decimal(0))),
        "by_method": {k: float(v) for k, v in by_method.items()},
        "cash": {"received_usd": float(cash_usd), "received_khr": cash_khr, "change_usd": float(change_usd)},
        "open": len([o for o in orders if o.payment_status != PaymentStatus.paid and o.status != S.cancelled]),
        "orders": [{"id": o.id, "order_number": o.order_number, "invoice_number": svc.invoice_number(o),
                    "created_at": dt(o.created_at), "total": float(o.total), "method": o.payment_method.value,
                    "status": o.status.value, "payment_status": o.payment_status.value,
                    "customer_name": o.customer_name, "items": sum(i.quantity for i in o.items)} for o in orders],
    }

