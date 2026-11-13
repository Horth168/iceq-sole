"""Admin dashboard statistics — every number comes from the database."""
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (Order, OrderItem, OrderStatus, Payment, PaymentStatus, Product, ProductVariant, Role,
                        User)
from app.security import require_staff
from app.serializers import dt, f, order_row
from app.services import inventory
from app.utils import LOCAL_TZ, as_aware

router = APIRouter(prefix="/api/admin", tags=["Admin · dashboard"])

CLOSED = (OrderStatus.cancelled, OrderStatus.refunded)


@router.get("/dashboard")
def dashboard(days: int = Query(30, ge=7, le=365), db: Session = Depends(get_db), _: User = Depends(require_staff)):
    revenue = db.scalar(select(func.coalesce(func.sum(Order.total), 0))
                        .where(Order.payment_status == PaymentStatus.paid, Order.status.notin_(CLOSED)))
    status_counts = dict(db.execute(select(Order.status, func.count()).group_by(Order.status)).all())
    total_orders = sum(status_counts.values())
    awaiting_payment = db.scalar(select(func.count()).select_from(Order).where(
        Order.payment_status == PaymentStatus.submitted))
    threshold = inventory.low_stock_threshold(db)
    avail = ProductVariant.stock - ProductVariant.reserved
    low_rows = db.scalars(select(ProductVariant).join(Product).where(
        ProductVariant.is_active.is_(True), Product.is_active.is_(True), avail <= threshold)
        .order_by(avail.asc()).limit(8)).all()
    low_count = db.scalar(select(func.count()).select_from(ProductVariant).join(Product).where(
        ProductVariant.is_active.is_(True), Product.is_active.is_(True), avail <= threshold))

    # --- sales chart by local (Phnom Penh) day
    today = datetime.now(LOCAL_TZ).date()
    start_local = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), tzinfo=LOCAL_TZ)
    rows = db.execute(select(Order.created_at, Order.total, Order.status, Order.payment_status)
                      .where(Order.created_at >= start_local)).all()
    series = defaultdict(lambda: {"revenue": 0.0, "orders": 0})
    for created, total, status, pay in rows:
        day = as_aware(created).astimezone(LOCAL_TZ).date().isoformat()
        if status not in CLOSED:
            series[day]["orders"] += 1
            if pay == PaymentStatus.paid:
                series[day]["revenue"] += float(total)
    chart = []
    for i in range(days):
        d = (today - timedelta(days=days - 1 - i)).isoformat()
        chart.append({"date": d, "revenue": round(series[d]["revenue"], 2), "orders": series[d]["orders"]})

    best = db.execute(select(OrderItem.product_id, OrderItem.product_name, OrderItem.brand_name,
                             func.sum(OrderItem.quantity).label("qty"), func.sum(OrderItem.line_total).label("sales"))
                      .join(Order).where(Order.status.notin_(CLOSED + (OrderStatus.pending,)))
                      .group_by(OrderItem.product_id, OrderItem.product_name, OrderItem.brand_name)
                      .order_by(func.sum(OrderItem.quantity).desc()).limit(5)).all()
    images = {p.id: (p.images[0].url if p.images else None)
              for p in db.query(Product).filter(Product.id.in_([b.product_id for b in best if b.product_id]))}
    payments = db.query(Payment).order_by(Payment.updated_at.desc()).limit(8).all()
    recent = db.query(Order).order_by(Order.created_at.desc()).limit(8).all()
    return {
        "kpis": {
            "revenue": f(revenue),
            "total_orders": total_orders,
            "total_products": db.scalar(select(func.count()).select_from(Product)),
            "active_products": db.scalar(select(func.count()).select_from(Product).where(Product.is_active.is_(True))),
            "total_customers": db.scalar(select(func.count()).select_from(User).where(User.role == Role.customer)),
            "pending_orders": status_counts.get(OrderStatus.pending, 0),
            "completed_orders": status_counts.get(OrderStatus.delivered, 0),
            "awaiting_payment_verification": awaiting_payment,
            "low_stock": low_count,
        },
        "status_counts": {s.value: status_counts.get(s, 0) for s in OrderStatus},
        "sales_chart": chart,
        "best_sellers": [{"product_id": b.product_id, "name": b.product_name, "brand": b.brand_name,
                          "quantity": int(b.qty), "sales": f(b.sales), "image": images.get(b.product_id)} for b in best],
        "low_stock": [{"variant_id": v.id, "sku": v.sku, "product": v.product.name, "color": v.color.name,
                       "size": v.size.label, "available": v.available, "product_id": v.product_id} for v in low_rows],
        "recent_orders": [order_row(o) for o in recent],
        "recent_transactions": [{"id": p.id, "order_id": p.order_id, "order_number": p.order.order_number,
                                 "customer": p.order.customer_name, "method": p.method.value, "status": p.status.value,
                                 "amount": f(p.amount), "updated_at": dt(p.updated_at)} for p in payments],
    }
