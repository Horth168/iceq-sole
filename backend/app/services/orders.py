"""Order lifecycle: status transitions, stock effects, payments, notifications."""
from __future__ import annotations

import hashlib
import hmac
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (Notification, Order, OrderStatus, OrderStatusEvent, Payment, PaymentMethod,
                        PaymentStatus)
from app.services import inventory, khqr
from app.services.settings_store import get_setting
from app.utils import utcnow

S = OrderStatus
ALLOWED: dict[OrderStatus, set[OrderStatus]] = {
    S.pending: {S.confirmed, S.cancelled},
    S.confirmed: {S.processing, S.shipped, S.cancelled},
    S.processing: {S.shipped, S.cancelled},
    S.shipped: {S.delivered, S.cancelled},
    S.delivered: {S.refunded},
    S.cancelled: {S.refunded},  # only meaningful when money was received
    S.refunded: set(),
}

CUSTOMER_MESSAGES = {
    S.confirmed: "Your order is confirmed and your pairs are reserved.",
    S.processing: "We're packing your order.",
    S.shipped: "Your order is on its way.",
    S.delivered: "Delivered. Enjoy your new kicks!",
    S.cancelled: "Your order was cancelled.",
    S.refunded: "Your refund has been processed.",
}


def access_token(order_number: str) -> str:
    """Unguessable token that lets a guest view their own order."""
    return hmac.new(settings.SECRET_KEY.encode(), f"order:{order_number}".encode(), hashlib.sha256).hexdigest()[:32]


def check_access_token(order_number: str, token: str | None) -> bool:
    return bool(token) and hmac.compare_digest(access_token(order_number), token)


def add_event(db: Session, order: Order, status: str, note: str = "", user_id: int | None = None) -> None:
    order.history.append(OrderStatusEvent(status=status, note=note, user_id=user_id))


def notify_customer(db: Session, order: Order, title: str, message: str) -> None:
    if order.user_id:
        db.add(Notification(user_id=order.user_id, type="order", title=title, message=message,
                            link=f"/account/orders/{order.order_number}"))


def notify_admins(db: Session, type_: str, title: str, message: str, link: str) -> None:
    db.add(Notification(user_id=None, type=type_, title=title, message=message, link=link))


def change_status(db: Session, order: Order, new: OrderStatus, *, note: str = "", user_id: int | None = None,
                  restock: bool = True) -> Order:
    if new == order.status:
        return order
    if new not in ALLOWED[order.status]:
        raise HTTPException(400, f"Cannot change an order from {order.status.value} to {new.value}")
    if order.status == S.cancelled and new == S.refunded and order.payment_status != PaymentStatus.paid:
        raise HTTPException(400, "Only paid orders can be refunded")

    if new == S.confirmed or (new in (S.processing, S.shipped) and not order.stock_committed):
        inventory.commit_order(db, order, user_id)
    if new == S.cancelled:
        inventory.release_order(db, order, user_id)
        for p in order.payments:
            if p.status in (PaymentStatus.unpaid, PaymentStatus.submitted):
                p.status = PaymentStatus.failed
                p.note = (p.note + " | order cancelled").strip(" |")
        if order.payment_status != PaymentStatus.paid:
            order.payment_status = PaymentStatus.failed if order.payment_status == PaymentStatus.submitted else order.payment_status
    if new == S.refunded:
        inventory.release_order(db, order, user_id, restock=restock)
        order.payment_status = PaymentStatus.refunded
        for p in order.payments:
            if p.status == PaymentStatus.paid:
                p.status = PaymentStatus.refunded
    if new == S.delivered and order.payment_method == PaymentMethod.cod and order.payment_status != PaymentStatus.paid:
        # Cash collected by the courier on delivery
        mark_paid(db, order, source="admin", user_id=user_id, note="Cash collected on delivery")

    order.status = new
    add_event(db, order, new.value, note, user_id)
    notify_customer(db, order, f"Order {order.order_number}: {new.value.title()}", CUSTOMER_MESSAGES.get(new, ""))
    return order


def mark_paid(db: Session, order: Order, *, source: str, user_id: int | None = None, note: str = "",
              gateway: dict | None = None) -> None:
    payment = latest_payment(order)
    if payment is None:
        payment = Payment(method=order.payment_method, amount=order.total, currency=order.currency)
        order.payments.append(payment)
    payment.status = PaymentStatus.paid
    payment.verified_at = utcnow()
    payment.verified_by_id = user_id
    payment.verification_source = source
    if gateway is not None:
        payment.gateway_response = gateway
    if note:
        payment.note = note
    order.payment_status = PaymentStatus.paid
    add_event(db, order, "payment_verified", note or f"Payment verified ({source})", user_id)
    notify_customer(db, order, f"Payment received for {order.order_number}", "Thank you! Your payment is confirmed.")
    # A verified payment confirms a pending order automatically
    if order.status == S.pending:
        change_status(db, order, S.confirmed, note="Auto-confirmed after verified payment", user_id=user_id)


def latest_payment(order: Order) -> Payment | None:
    return order.payments[-1] if order.payments else None


def create_khqr_payment(db: Session, order: Order) -> Payment:
    pay_cfg = get_setting(db, "payments")
    payment = Payment(method=PaymentMethod.khqr, amount=order.total, currency="USD", status=PaymentStatus.unpaid)
    if settings.BAKONG_ACCOUNT_ID:
        payload = khqr.build_khqr(
            account_id=settings.BAKONG_ACCOUNT_ID,
            merchant_name=pay_cfg.get("khqr_merchant_name") or "IceQ Sole",
            merchant_city=pay_cfg.get("khqr_merchant_city") or "Phnom Penh",
            amount=order.total, currency="USD", bill_number=order.order_number, store_label="IceQ Sole",
            expiry_minutes=settings.KHQR_EXPIRY_MINUTES,
            account_information=settings.BAKONG_ACCOUNT_NUMBER.replace(" ", ""),
            acquiring_bank=settings.BAKONG_ACQUIRING_BANK,
        )
        payment.khqr_payload = payload
        payment.khqr_md5 = khqr.md5(payload)
        payment.expires_at = utcnow() + timedelta(minutes=settings.KHQR_EXPIRY_MINUTES)
    order.payments.append(payment)
    return payment


def payment_instructions(db: Session, order: Order) -> dict:
    cfg = get_setting(db, "payments")
    p = latest_payment(order)
    data = {
        "method": order.payment_method.value,
        "payment_status": order.payment_status.value,
        "amount": float(order.total),
        "amount_khr": order.total_khr,
        "currency": "USD",
        "order_number": order.order_number,
        "instructions": cfg.get("instructions", ""),
        "auto_verify": False,
    }
    if order.payment_method == PaymentMethod.khqr:
        data.update(
            khqr=p.khqr_payload if p else None,
            expires_at=p.expires_at.isoformat() if p and p.expires_at else None,
            static_qr_url=cfg.get("khqr_static_image_url") or None,
            merchant_name=cfg.get("khqr_merchant_name"),
            auto_verify=settings.bakong_enabled and bool(p and p.khqr_md5),
        )
    if order.payment_method in (PaymentMethod.bank_transfer, PaymentMethod.khqr):
        data["bank"] = {"bank_name": cfg.get("bank_name"), "account_name": cfg.get("bank_account_name"),
                        "account_number": cfg.get("bank_account_number")}
    return data
