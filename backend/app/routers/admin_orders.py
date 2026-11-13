"""Admin: orders, payments verification, customers, inventory, notifications."""
from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (Notification, Order, OrderStatus, PaymentMethod, PaymentStatus, Product, ProductVariant,
                        Role, StockMovement, User)
from app.schemas import AdminNoteIn, OrderStatusIn, PaymentVerifyIn, StockAdjustIn, TrackingIn
from app.security import require_staff
from app.serializers import (address_out, f, movement_out, notification_out, order_out, order_row, user_out,
                             variant_out)
from app.services import inventory
from app.services import orders as svc
from app.utils import LOCAL_TZ

router = APIRouter(prefix="/api/admin", tags=["Admin · orders & inventory"])


def _order(db: Session, order_id: int) -> Order:
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    return o


def _local_day(d: str, end: bool) -> datetime:
    day = datetime.strptime(d, "%Y-%m-%d").date()
    return datetime.combine(day, time.max if end else time.min, tzinfo=LOCAL_TZ)


# ================================================================ orders
@router.get("/orders")
def list_orders(db: Session = Depends(get_db), _: User = Depends(require_staff),
                q: str | None = Query(None, max_length=80), status: OrderStatus | None = None,
                payment_status: PaymentStatus | None = None, payment_method: PaymentMethod | None = None,
                date_from: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                date_to: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)):
    query = select(Order)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Order.order_number.ilike(like), Order.customer_name.ilike(like),
                                Order.customer_phone.ilike(like), Order.customer_email.ilike(like)))
    if status:
        query = query.where(Order.status == status)
    if payment_status:
        query = query.where(Order.payment_status == payment_status)
    if payment_method:
        query = query.where(Order.payment_method == payment_method)
    if date_from:
        query = query.where(Order.created_at >= _local_day(date_from, False))
    if date_to:
        query = query.where(Order.created_at <= _local_day(date_to, True))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    counts = dict(db.execute(select(Order.status, func.count()).group_by(Order.status)).all())
    return {"items": [order_row(o) for o in rows], "total": total, "page": page,
            "pages": max(1, -(-total // page_size)),
            "status_counts": {s.value: counts.get(s, 0) for s in OrderStatus}}


@router.get("/orders/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    o = _order(db, order_id)
    data = order_out(o, admin=True)
    data["allowed_status"] = [s.value for s in svc.ALLOWED[o.status]]
    if o.user:
        data["customer"] = user_out(o.user)
        data["customer"]["order_count"] = len(o.user.orders)
    return data


@router.post("/orders/{order_id}/status")
def set_status(order_id: int, body: OrderStatusIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    svc.change_status(db, o, body.status, note=body.note, user_id=user.id, restock=body.restock)
    db.commit()
    return get_order(order_id, db, user)


@router.post("/orders/{order_id}/payment")
def verify_payment(order_id: int, body: PaymentVerifyIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    if o.status in (OrderStatus.cancelled, OrderStatus.refunded):
        raise HTTPException(400, "Order is closed")
    if o.payment_status == PaymentStatus.paid:
        raise HTTPException(400, "Payment already verified")
    if body.approve:
        svc.mark_paid(db, o, source="admin", user_id=user.id, note=body.note or f"Verified by {user.full_name}")
    else:
        p = svc.latest_payment(o)
        if p:
            p.status = PaymentStatus.failed
            p.note = body.note
        o.payment_status = PaymentStatus.failed
        svc.add_event(db, o, "payment_rejected", body.note or "Payment could not be verified", user.id)
        svc.notify_customer(db, o, f"Payment issue on {o.order_number}",
                            body.note or "We could not verify your payment. Please contact us.")
    db.commit()
    return get_order(order_id, db, user)


@router.post("/orders/{order_id}/tracking")
def set_tracking(order_id: int, body: TrackingIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    o.carrier, o.tracking_number, o.tracking_url = body.carrier, body.tracking_number, body.tracking_url
    svc.add_event(db, o, "tracking", f"{body.carrier} {body.tracking_number}".strip(), user.id)
    svc.notify_customer(db, o, f"Tracking added for {o.order_number}", f"{body.carrier} {body.tracking_number}".strip())
    db.commit()
    return get_order(order_id, db, user)


@router.put("/orders/{order_id}/note")
def set_note(order_id: int, body: AdminNoteIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    o.admin_note = body.admin_note
    db.commit()
    return get_order(order_id, db, user)


# ================================================================ customers
@router.get("/customers")
def customers(db: Session = Depends(get_db), _: User = Depends(require_staff), q: str | None = Query(None, max_length=80),
              page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)):
    query = select(User).where(User.role == Role.customer)
    if q:
        like = f"%{q}%"
        query = query.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.phone.ilike(like)))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    stats = dict((uid, (n, s)) for uid, n, s in db.execute(
        select(Order.user_id, func.count(), func.sum(Order.total))
        .where(Order.user_id.in_([u.id for u in rows]),
               Order.status.notin_([OrderStatus.cancelled, OrderStatus.refunded])).group_by(Order.user_id)).all())
    items = []
    for u in rows:
        d = user_out(u)
        n, s = stats.get(u.id, (0, 0))
        d.update(order_count=n, total_spent=f(s or 0))
        items.append(d)
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // page_size))}


@router.get("/customers/{user_id}")
def customer(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Customer not found")
    orders = db.query(Order).filter(Order.user_id == u.id).order_by(Order.created_at.desc()).all()
    valid = [o for o in orders if o.status not in (OrderStatus.cancelled, OrderStatus.refunded)]
    return {**user_out(u), "addresses": [address_out(a) for a in u.addresses],
            "orders": [order_row(o) for o in orders], "order_count": len(orders),
            "total_spent": f(sum((o.total for o in valid), 0)),
            "wishlist_count": len(u.wishlist)}


@router.patch("/customers/{user_id}")
def toggle_customer(user_id: int, payload: dict[str, bool], db: Session = Depends(get_db), _: User = Depends(require_staff)):
    u = db.get(User, user_id)
    if not u or u.role != Role.customer:
        raise HTTPException(404, "Customer not found")
    if "is_active" in payload:
        u.is_active = bool(payload["is_active"])
        if not u.is_active:
            u.token_version += 1
    db.commit()
    return user_out(u)


# ================================================================ inventory
@router.get("/inventory")
def inventory_list(db: Session = Depends(get_db), _: User = Depends(require_staff),
                   q: str | None = Query(None, max_length=80), filter: str | None = Query(None, pattern="^(low|out|reserved)$"),
                   page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    threshold = inventory.low_stock_threshold(db)
    avail = ProductVariant.stock - ProductVariant.reserved
    query = select(ProductVariant).join(Product).where(ProductVariant.is_active.is_(True))
    if q:
        like = f"%{q}%"
        query = query.where(or_(ProductVariant.sku.ilike(like), Product.name.ilike(like)))
    if filter == "low":
        query = query.where(avail <= threshold)
    elif filter == "out":
        query = query.where(avail <= 0)
    elif filter == "reserved":
        query = query.where(ProductVariant.reserved > 0)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(avail.asc(), Product.name).offset((page - 1) * page_size).limit(page_size)).all()
    items = []
    for v in rows:
        d = variant_out(v, admin=True)
        d.update(product_id=v.product_id, product_name=v.product.name, brand=v.product.brand.name,
                 image=v.product.images[0].url if v.product.images else None,
                 low=v.available <= threshold)
        items.append(d)
    summary = db.execute(select(func.coalesce(func.sum(ProductVariant.stock), 0),
                                func.coalesce(func.sum(ProductVariant.reserved), 0))
                         .where(ProductVariant.is_active.is_(True))).one()
    low_count = db.scalar(select(func.count()).select_from(ProductVariant).where(ProductVariant.is_active.is_(True), avail <= threshold))
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // page_size)),
            "threshold": threshold, "summary": {"stock": int(summary[0]), "reserved": int(summary[1]), "low": low_count}}


@router.post("/inventory/{variant_id}/adjust")
def adjust_stock(variant_id: int, body: StockAdjustIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    v = db.get(ProductVariant, variant_id)
    if not v:
        raise HTTPException(404, "Variant not found")
    inventory.adjust(db, v, change=body.change, set_to=body.set_to, reason=body.reason, note=body.note, user_id=user.id)
    db.commit()
    db.refresh(v)
    return variant_out(v, admin=True)


@router.get("/inventory/movements")
def movements(db: Session = Depends(get_db), _: User = Depends(require_staff), variant_id: int | None = None,
              product_id: int | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    query = select(StockMovement)
    if variant_id:
        query = query.where(StockMovement.variant_id == variant_id)
    if product_id:
        query = query.where(StockMovement.variant_id.in_(select(ProductVariant.id).where(ProductVariant.product_id == product_id)))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(StockMovement.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [movement_out(m) for m in rows], "total": total, "page": page, "pages": max(1, -(-total // page_size))}


# ================================================================ notifications
@router.get("/notifications")
def admin_notifications(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    rows = db.query(Notification).filter(Notification.user_id.is_(None)).order_by(Notification.id.desc()).limit(40).all()
    unread = db.query(Notification).filter(Notification.user_id.is_(None), Notification.is_read.is_(False)).count()
    return {"items": [notification_out(n) for n in rows], "unread": unread}


@router.post("/notifications/read", status_code=204)
def admin_notifications_read(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    db.query(Notification).filter(Notification.user_id.is_(None)).update({"is_read": True})
    db.commit()
