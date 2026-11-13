"""Inventory rules.

* Checkout RESERVES stock with an atomic conditional UPDATE, so two customers can never
  buy the same last pair (no overselling, works on SQLite and PostgreSQL).
* Confirming an order COMMITS the reservation: physical stock is deducted.
* Cancelling RELEASES the reservation, or RESTORES stock if it was already deducted.
* Every change writes a StockMovement row (full audit trail).
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import (MovementReason, Notification, Order, ProductVariant, StockMovement)
from app.services.settings_store import get_setting


def _log(db: Session, variant: ProductVariant, change: int, reserved_change: int, reason: MovementReason,
         reference: str = "", note: str = "", user_id: int | None = None) -> None:
    db.refresh(variant)
    db.add(StockMovement(variant_id=variant.id, change=change, reserved_change=reserved_change,
                         stock_after=variant.stock, reason=reason, reference=reference, note=note,
                         user_id=user_id))


def reserve(db: Session, variant: ProductVariant, qty: int, reference: str) -> None:
    db.refresh(variant)
    before = variant.available
    result = db.execute(
        update(ProductVariant)
        .where(ProductVariant.id == variant.id,
               ProductVariant.is_active.is_(True),
               (ProductVariant.stock - ProductVariant.reserved) >= qty)
        .values(reserved=ProductVariant.reserved + qty)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.refresh(variant)
        name = variant.product.name if variant.product else "This item"
        raise HTTPException(409, f"{name} ({variant.color.name}, EU {variant.size.label}) only has "
                                 f"{variant.available} left in stock")
    _log(db, variant, 0, qty, MovementReason.order_reserved, reference)
    _alert_if_crossed(db, variant, before)


def commit_order(db: Session, order: Order, user_id: int | None = None) -> None:
    """Turn reservations into real deductions (called when an order is confirmed)."""
    if order.stock_committed or order.stock_released:
        return
    for item in order.items:
        if not item.variant_id:
            continue
        db.execute(
            update(ProductVariant).where(ProductVariant.id == item.variant_id)
            .values(stock=ProductVariant.stock - item.quantity, reserved=ProductVariant.reserved - item.quantity)
            .execution_options(synchronize_session=False)
        )
        v = db.get(ProductVariant, item.variant_id)
        _log(db, v, -item.quantity, -item.quantity, MovementReason.order_confirmed, order.order_number, user_id=user_id)
        if v.product:
            v.product.sold_count = (v.product.sold_count or 0) + item.quantity
    order.stock_committed = True  # available (stock - reserved) is unchanged, so no new alert


def release_order(db: Session, order: Order, user_id: int | None = None, restock: bool = True) -> None:
    """Give stock back for a cancelled/refunded order (only once)."""
    if order.stock_released:
        return
    for item in order.items:
        if not item.variant_id:
            continue
        v = db.get(ProductVariant, item.variant_id)
        if v is None:
            continue
        if order.stock_committed:
            if not restock:
                continue
            db.execute(update(ProductVariant).where(ProductVariant.id == v.id)
                       .values(stock=ProductVariant.stock + item.quantity)
                       .execution_options(synchronize_session=False))
            _log(db, v, item.quantity, 0, MovementReason.order_restored, order.order_number, user_id=user_id)
            if v.product:
                v.product.sold_count = max(0, (v.product.sold_count or 0) - item.quantity)
        else:
            db.execute(update(ProductVariant).where(ProductVariant.id == v.id)
                       .values(reserved=ProductVariant.reserved - item.quantity)
                       .execution_options(synchronize_session=False))
            _log(db, v, 0, -item.quantity, MovementReason.order_released, order.order_number, user_id=user_id)
    order.stock_released = True


def adjust(db: Session, variant: ProductVariant, *, change: int | None = None, set_to: int | None = None,
           reason: MovementReason = MovementReason.adjustment, note: str = "", user_id: int | None = None) -> None:
    db.refresh(variant)
    new_stock = set_to if set_to is not None else variant.stock + (change or 0)
    if new_stock < variant.reserved:
        raise HTTPException(409, f"Stock cannot go below the {variant.reserved} pair(s) reserved by pending orders")
    if new_stock < 0:
        raise HTTPException(400, "Stock cannot be negative")
    delta = new_stock - variant.stock
    before = variant.available
    if delta == 0:
        return
    variant.stock = new_stock
    db.flush()
    _log(db, variant, delta, 0, reason, note=note, user_id=user_id)
    _alert_if_crossed(db, variant, before)


def low_stock_threshold(db: Session) -> int:
    return int(get_setting(db, "inventory").get("low_stock_threshold", 3))


def _alert_if_crossed(db: Session, v: ProductVariant, before: int) -> None:
    """Notify admins only when availability CROSSES the threshold (no repeated spam)."""
    threshold = low_stock_threshold(db)
    after = v.available
    if not v.is_active or after > threshold or before <= after:
        return
    if before > threshold or (after == 0 and before > 0):
        label = f"{v.product.name} · {v.color.name} · EU {v.size.label}"
        db.add(Notification(user_id=None, type="low_stock",
                            title="Out of stock" if after == 0 else "Low stock",
                            message=f"{label} has {after} pair(s) available",
                            link=f"/inventory?q={v.sku}"))
