"""In-store POS endpoints (staff). See services/pos.py."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order, PaymentMethod, PaymentStatus, Role, User
from app.schemas import PosCompleteIn, PosSaleIn
from app.security import require_pos
from app.serializers import order_out
from app.services import orders as svc
from app.services import pos
from app.services.email import send_receipt_later

router = APIRouter(prefix="/api/admin/pos", tags=["Admin · POS"])


def _sale(db: Session, order: Order) -> dict:
    pay = svc.latest_payment(order)
    return {"order": order_out(order, admin=True),
            "payment": {"method": pay.method.value, "status": pay.status.value, "khqr": pay.khqr_payload,
                        "expires_at": pay.expires_at.isoformat() if pay.expires_at else None,
                        "cash": pay.gateway_response if pay.method == PaymentMethod.cash else None} if pay else None,
            "merchant_name": svc.payment_instructions(db, order).get("merchant_name") if pay and pay.khqr_payload else None}


def _get(db: Session, sale_id: int) -> Order:
    o = db.get(Order, sale_id)
    if not o or o.channel != "pos":
        raise HTTPException(404, "Sale not found")
    return o


@router.get("/config")
def config(db: Session = Depends(get_db), user: User = Depends(require_pos)):
    """What the POS screen needs without access to the store settings (cashiers can't read those)."""
    from app.services.settings_store import get_setting
    pay = get_setting(db, "payments")
    return {"khr_rate": int(get_setting(db, "currency").get("khr_rate", 4100)),
            "merchant_name": pay.get("khqr_merchant_name") or "IceQ Sole",
            "can_discount": user.role != Role.cashier, "role": user.role.value}


@router.get("/catalog")
def catalog(db: Session = Depends(get_db), _: User = Depends(require_pos)):
    return pos.catalog(db)


@router.post("/sales", status_code=201)
def create(body: PosSaleIn, db: Session = Depends(get_db), staff: User = Depends(require_pos)):
    if staff.role == Role.cashier and (body.discount_amount or body.discount_percent):
        raise HTTPException(403, "Only a manager can give a discount")
    existing = db.query(Order).filter(Order.idempotency_key == body.idempotency_key).first()
    if existing:  # double tap / network retry: same sale back
        return _sale(db, existing)
    body.payment_method = PaymentMethod(body.payment_method)
    try:
        order = pos.create_sale(db, body, staff)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(Order).filter(Order.idempotency_key == body.idempotency_key).first()
        if existing:
            return _sale(db, existing)
        raise
    db.refresh(order)
    if order.payment_status == PaymentStatus.paid:
        send_receipt_later(order, "paid")
    return _sale(db, order)


@router.get("/sales/{sale_id}")
def read(sale_id: int, db: Session = Depends(get_db), _: User = Depends(require_pos)):
    return _sale(db, _get(db, sale_id))


@router.post("/sales/{sale_id}/complete")
def complete(sale_id: int, body: PosCompleteIn, db: Session = Depends(get_db), staff: User = Depends(require_pos)):
    order = _get(db, sale_id)
    was_paid = order.payment_status == PaymentStatus.paid
    if not was_paid and not body.confirm_received:
        raise HTTPException(400, "Waiting for the payment")
    pos.finish(db, order, staff, paid_note="KHQR payment confirmed by cashier")
    db.commit()
    db.refresh(order)
    if not was_paid:
        send_receipt_later(order, "paid")
    return _sale(db, order)


@router.post("/sales/{sale_id}/cancel")
def cancel(sale_id: int, db: Session = Depends(get_db), staff: User = Depends(require_pos)):
    order = _get(db, sale_id)
    pos.cancel(db, order, staff)
    db.commit()
    return _sale(db, order)


@router.get("/summary")
def summary(day: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), db: Session = Depends(get_db),
            user: User = Depends(require_pos)):
    if user.role == Role.cashier:
        day = None  # a cashier sees today's sales only
    return pos.summary(db, day)
