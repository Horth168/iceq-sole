"""Persistent carts. Guests carry an opaque token (X-Cart-Token header); users own one cart."""
from __future__ import annotations

import secrets

from sqlalchemy.orm import Session

from app.models import Cart, CartItem, User

MAX_QTY_PER_LINE = 10


def _by_token(db: Session, token: str | None) -> Cart | None:
    if not token or len(token) > 64:
        return None
    return db.query(Cart).filter(Cart.token == token).first()


def get_cart(db: Session, user: User | None, token: str | None, create: bool = True) -> Cart | None:
    if user:
        cart = db.query(Cart).filter(Cart.user_id == user.id).first()
        if cart is None:
            guest = _by_token(db, token)
            if guest and guest.user_id is None:
                guest.user_id = user.id
                cart = guest
            elif create:
                cart = Cart(token=secrets.token_urlsafe(24), user_id=user.id)
                db.add(cart)
                db.flush()
        return cart
    cart = _by_token(db, token)
    if cart and cart.user_id is not None:
        cart = None  # a user's cart token cannot be used anonymously
    if cart is None and create:
        cart = Cart(token=secrets.token_urlsafe(24))
        db.add(cart)
        db.flush()
    return cart


def merge_guest_cart(db: Session, user: User, token: str | None) -> None:
    guest = _by_token(db, token)
    if not guest or guest.user_id is not None:
        return
    own = db.query(Cart).filter(Cart.user_id == user.id).first()
    if own is None:
        guest.user_id = user.id
        db.flush()
        return
    existing = {i.variant_id: i for i in own.items}
    for item in list(guest.items):
        if item.variant_id in existing:
            existing[item.variant_id].quantity = min(MAX_QTY_PER_LINE, existing[item.variant_id].quantity + item.quantity)
        else:
            own.items.append(CartItem(variant_id=item.variant_id, quantity=item.quantity))
    if guest.discount_code and not own.discount_code:
        own.discount_code = guest.discount_code
    db.delete(guest)
    db.flush()


def cart_lines(cart: Cart):
    """(variant, qty) pairs for purchasable items only."""
    return [(i.variant, i.quantity) for i in cart.items
            if i.variant.is_active and i.variant.product.is_active]
