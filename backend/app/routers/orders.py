"""Checkout, guest order access, order tracking and customer-side payments."""
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.services.human import require_human
from app.services import social
from app.database import get_db
from app.limiter import limiter
from app.models import (Address, Discount, Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, User)
from app.schemas import CheckoutIn, TrackIn
from app.security import get_optional_user
from app.serializers import order_out
from app.services import images, inventory, khqr
from app.services import orders as svc
from app.services import telegram as tg
from datetime import timezone

from app.utils import utcnow
from app.services.cart_service import cart_lines, get_cart
from app.services.pricing import build_quote
from app.services.settings_store import available_methods
from app.utils import new_order_number, normalize_kh_phone

router = APIRouter(prefix="/api", tags=["Checkout & orders"])


def _existing_by_key(db: Session, key: str) -> Order | None:
    return db.query(Order).filter(Order.idempotency_key == key).first()


def _checkout_response(db: Session, order: Order) -> dict:
    return {"order": order_out(order), "access_token": svc.access_token(order.order_number),
            "payment": svc.payment_instructions(db, order)}


@router.post("/checkout", status_code=201)
@limiter.limit("20/hour")
def checkout(request: Request, body: CheckoutIn, db: Session = Depends(get_db),
             user: User | None = Depends(get_optional_user), x_cart_token: str | None = Header(None),
             _h: None = Depends(require_human)):
    # 1) Duplicate submit protection (double-click, network retry)
    existing = _existing_by_key(db, body.idempotency_key)
    if existing:
        return _checkout_response(db, existing)

    avail = available_methods(db)
    enabled = {PaymentMethod.khqr: avail["khqr_enabled"], PaymentMethod.bank_transfer: avail["bank_transfer_enabled"],
               PaymentMethod.cod: avail["cod_enabled"]}
    if not enabled.get(body.payment_method):
        raise HTTPException(400, "This payment method is not available")

    cart = get_cart(db, user, x_cart_token, create=False)
    if not cart or not cart.items:
        raise HTTPException(400, "Your bag is empty")
    lines = cart_lines(cart)
    if len(lines) != len(cart.items):
        raise HTTPException(409, "Some items in your bag are no longer available. Please review your bag.")

    discount_code = body.discount_code or cart.discount_code
    quote = build_quote(db, lines, discount_code=discount_code, province=body.province, strict_discount=bool(discount_code))
    order = Order(
        order_number=new_order_number(), idempotency_key=body.idempotency_key, user_id=user.id if user else None,
        status=OrderStatus.pending, payment_method=body.payment_method, payment_status=PaymentStatus.unpaid,
        customer_name=body.full_name, customer_phone=body.phone, customer_email=(body.email or social.real_email(user)),
        province=body.province, district=body.district, address_line=body.address_line, delivery_note=body.delivery_note,
        subtotal=quote.subtotal, discount_code=quote.discount_code, discount_amount=quote.discount_amount,
        delivery_fee=quote.delivery_fee, tax_amount=quote.tax_amount, total=quote.total, khr_rate=quote.khr_rate,
    )
    try:
        db.add(order)
        db.flush()
        # 2) Reserve stock atomically — raises 409 if any line is no longer available
        for line in quote.lines:
            v = line.variant
            inventory.reserve(db, v, line.quantity, order.order_number)
            img = next((i for i in v.product.images if i.color_id == v.color_id), v.product.images[0] if v.product.images else None)
            order.items.append(OrderItem(
                product_id=v.product_id, variant_id=v.id, product_name=v.product.name, brand_name=v.product.brand.name,
                product_slug=v.product.slug, color=v.color.name, size=v.size.label, sku=v.sku,
                image_url=(img.renditions.get(min(img.renditions, key=int), {}).get("url") if img and img.renditions else (img.url if img else None)),
                unit_price=line.unit_price, quantity=line.quantity, line_total=line.line_total))
        # 3) Discount usage, counted atomically against the limit
        if quote.discount_code:
            res = db.execute(update(Discount).where(
                func.upper(Discount.code) == quote.discount_code,
                or_(Discount.usage_limit.is_(None), Discount.used_count < Discount.usage_limit))
                .values(used_count=Discount.used_count + 1).execution_options(synchronize_session=False))
            if res.rowcount != 1:
                raise HTTPException(400, "This discount code has reached its usage limit")
        # 4) Payment record
        if body.payment_method == PaymentMethod.khqr:
            svc.create_khqr_payment(db, order)
        else:
            from app.models import Payment
            order.payments.append(Payment(method=body.payment_method, amount=order.total, currency="USD"))
        svc.add_event(db, order, "pending", "Order placed")
        svc.notify_admins(db, "new_order", f"New order {order.order_number}",
                          f"{order.customer_name} · ${order.total} · {body.payment_method.value.upper()}",
                          f"/orders/{order.id}")
        svc.notify_customer(db, order, f"Order {order.order_number} received", "We'll confirm it shortly.")
        tg.new_order(db, order)
        if user and body.save_address:
            if not any(a.address_line == body.address_line and a.province == body.province for a in user.addresses):
                db.add(Address(user_id=user.id, label="Home", full_name=body.full_name, phone=body.phone,
                               province=body.province, district=body.district, address_line=body.address_line,
                               note=body.delivery_note[:255], is_default=not user.addresses))
        # 5) Empty the bag
        cart.items.clear()
        cart.discount_code = None
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _existing_by_key(db, body.idempotency_key)
        if existing:
            return _checkout_response(db, existing)
        raise HTTPException(409, "Could not place the order, please try again")
    except HTTPException:
        db.rollback()
        raise
    db.refresh(order)
    return _checkout_response(db, order)


# ---------------------------------------------------------------- order access
def _load_order(db: Session, number: str, user: User | None, token: str | None) -> Order:
    o = db.query(Order).filter(Order.order_number == number).first()
    if not o:
        raise HTTPException(404, "Order not found")
    owner = user is not None and (o.user_id == user.id or user.is_staff)
    if not owner and not svc.check_access_token(number, token):
        raise HTTPException(404, "Order not found")
    return o


@router.get("/orders/{number}")
def get_order(number: str, t: str | None = Query(None, max_length=64), db: Session = Depends(get_db),
              user: User | None = Depends(get_optional_user)):
    o = _load_order(db, number, user, t)
    return {"order": order_out(o), "payment": svc.payment_instructions(db, o)}


@router.post("/orders/track")
@limiter.limit("20/hour")
def track(request: Request, body: TrackIn, db: Session = Depends(get_db)):
    o = db.query(Order).filter(Order.order_number == body.order_number.strip().upper()).first()
    contact = body.contact.strip().lower()
    match = False
    if o:
        try:
            match = normalize_kh_phone(contact) == o.customer_phone
        except ValueError:
            match = bool(o.customer_email) and o.customer_email.lower() == contact
    if not o or not match:
        raise HTTPException(404, "We couldn't find an order with those details")
    return {"order": order_out(o), "access_token": svc.access_token(o.order_number)}


@router.post("/orders/{number}/cancel")
def cancel_order(number: str, t: str | None = Query(None, max_length=64), db: Session = Depends(get_db),
                 user: User | None = Depends(get_optional_user)):
    o = _load_order(db, number, user, t)
    if o.status != OrderStatus.pending or o.payment_status in (PaymentStatus.paid, PaymentStatus.submitted):
        raise HTTPException(400, "This order can no longer be cancelled online. Please contact us.")
    svc.change_status(db, o, OrderStatus.cancelled, note="Cancelled by customer")
    db.commit()
    return {"order": order_out(o)}


# ---------------------------------------------------------------- payments
@router.post("/orders/{number}/payment/check")
@limiter.limit("30/minute")
def check_payment(request: Request, number: str, t: str | None = Query(None, max_length=64),
                  db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """Ask the Bakong API whether the KHQR was paid. Never trusts the client."""
    o = _load_order(db, number, user, t)
    if o.payment_status == PaymentStatus.paid:
        return {"paid": True, "payment_status": o.payment_status.value}
    p = svc.latest_payment(o)
    if o.payment_method != PaymentMethod.khqr or not p or not p.khqr_md5:
        return {"paid": False, "payment_status": o.payment_status.value, "auto_verify": False}
    if o.status in (OrderStatus.cancelled, OrderStatus.refunded):
        return {"paid": False, "payment_status": o.payment_status.value}
    result = khqr.check_payment(p.khqr_md5)
    if result["paid"]:
        data = result["data"] or {}
        amount_ok = abs(float(data.get("amount", 0)) - float(o.total)) < 0.01
        currency_ok = str(data.get("currency", "USD")).upper() in ("USD", "840")
        if amount_ok and currency_ok:
            svc.mark_paid(db, o, source="gateway", gateway=data, note=f"Bakong hash {data.get('hash', '')[:16]}")
            db.commit()
            return {"paid": True, "payment_status": o.payment_status.value}
        p.gateway_response = data
        p.note = "Gateway reported a payment with a different amount/currency — needs manual review"
        svc.notify_admins(db, "payment_mismatch", f"Payment mismatch on {o.order_number}", p.note, f"/orders/{o.id}")
        db.commit()
    return {"paid": False, "payment_status": o.payment_status.value, "error": result.get("error")}


@router.post("/orders/{number}/payment/renew")
@limiter.limit("12/hour")
def renew_payment(request: Request, number: str, t: str | None = Query(None, max_length=64),
                  db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """A new KHQR for an unpaid order: after the old one expired or was marked as not received."""
    o = _load_order(db, number, user, t)
    if o.payment_method != PaymentMethod.khqr:
        raise HTTPException(400, "Only KHQR orders can get a new QR")
    if o.payment_status == PaymentStatus.paid or o.status != OrderStatus.pending:
        raise HTTPException(400, "This order does not need a new payment")
    p = svc.latest_payment(o)
    exp = p.expires_at if p else None
    if exp is not None and exp.tzinfo is None:  # SQLite returns naive UTC datetimes
        exp = exp.replace(tzinfo=timezone.utc)
    fresh = p and p.status == PaymentStatus.unpaid and exp and exp > utcnow()
    if not fresh:
        svc.renew_khqr(db, o)
        svc.add_event(db, o, "payment_renewed", "Customer requested a new QR")
        db.commit()
    return {"order": order_out(o), "payment": svc.payment_instructions(db, o)}


@router.post("/orders/{number}/payment/submit")
@limiter.limit("10/hour")
async def submit_payment(request: Request, number: str, t: str | None = Query(None, max_length=64),
                         reference: str = Form("", max_length=120), screenshot: UploadFile | None = File(None),
                         db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """Customer submits a transfer reference and/or screenshot. An admin must verify it."""
    o = _load_order(db, number, user, t)
    if o.payment_method == PaymentMethod.cod:
        raise HTTPException(400, "Cash on delivery orders are paid to the courier")
    if o.payment_status == PaymentStatus.paid or o.status in (OrderStatus.cancelled, OrderStatus.refunded):
        raise HTTPException(400, "This order does not need a payment submission")
    if not reference.strip() and screenshot is None:
        raise HTTPException(400, "Add a transaction reference or a screenshot")
    p = svc.latest_payment(o)
    if screenshot is not None:
        data = await images.read_upload(screenshot)
        stored = images.store_raw_proof(data, f"payment-proofs/{o.order_number}")
        if p.proof_key:
            images.delete_stored(p.proof_key)
        p.proof_url, p.proof_key = stored.url, stored.key
    p.reference = reference.strip()[:120]
    p.status = PaymentStatus.submitted
    o.payment_status = PaymentStatus.submitted
    svc.add_event(db, o, "payment_submitted", f"Customer submitted payment proof {p.reference}".strip())
    svc.notify_admins(db, "payment_submitted", f"Payment to verify: {o.order_number}",
                      f"${o.total} via {o.payment_method.value}", f"/orders/{o.id}")
    tg.payment_submitted(db, o, p)
    db.commit()
    return {"order": order_out(o), "payment": svc.payment_instructions(db, o)}
