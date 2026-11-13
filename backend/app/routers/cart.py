"""Persistent shopping cart (guest token or signed-in user)."""
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CartItem, ProductVariant, User
from app.schemas import CartAddIn, CartDiscountIn, CartUpdateIn, QuoteIn
from app.security import get_optional_user
from app.serializers import cart_out, quote_out
from app.services.cart_service import MAX_QTY_PER_LINE, cart_lines, get_cart
from app.services.pricing import build_quote, find_discount, validate_discount

router = APIRouter(prefix="/api/cart", tags=["Cart"])


def _response(db: Session, cart, province: str | None = None):
    db.commit()
    db.refresh(cart)
    quote = build_quote(db, cart_lines(cart), discount_code=cart.discount_code, province=province)
    return cart_out(cart, quote)


@router.get("")
def view_cart(province: str | None = None, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user),
              x_cart_token: str | None = Header(None)):
    cart = get_cart(db, user, x_cart_token)
    return _response(db, cart, province)


@router.post("/items")
def add_item(body: CartAddIn, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user),
             x_cart_token: str | None = Header(None)):
    v = db.get(ProductVariant, body.variant_id)
    if not v or not v.is_active or not v.product.is_active:
        raise HTTPException(404, "This size/colour is no longer available")
    cart = get_cart(db, user, x_cart_token)
    item = next((i for i in cart.items if i.variant_id == v.id), None)
    new_qty = (item.quantity if item else 0) + body.quantity
    if new_qty > MAX_QTY_PER_LINE:
        raise HTTPException(400, f"Maximum {MAX_QTY_PER_LINE} pairs per item")
    if new_qty > v.available:
        raise HTTPException(409, f"Only {v.available} pair(s) left in EU {v.size.label}" if v.available
                            else "Sorry, this size is sold out")
    if item:
        item.quantity = new_qty
    else:
        cart.items.append(CartItem(variant_id=v.id, quantity=body.quantity))
    return _response(db, cart)


@router.patch("/items/{item_id}")
def update_item(item_id: int, body: CartUpdateIn, db: Session = Depends(get_db),
                user: User | None = Depends(get_optional_user), x_cart_token: str | None = Header(None)):
    cart = get_cart(db, user, x_cart_token)
    item = next((i for i in cart.items if i.id == item_id), None)
    if not item:
        raise HTTPException(404, "Item not in cart")
    if body.quantity == 0:
        cart.items.remove(item)
    else:
        if body.quantity > item.variant.available:
            raise HTTPException(409, f"Only {item.variant.available} pair(s) available")
        item.quantity = body.quantity
    return _response(db, cart)


@router.put("/items/{item_id}/variant")
def change_variant(item_id: int, body: CartAddIn, db: Session = Depends(get_db),
                   user: User | None = Depends(get_optional_user), x_cart_token: str | None = Header(None)):
    """Switch size/colour of a cart line."""
    cart = get_cart(db, user, x_cart_token)
    item = next((i for i in cart.items if i.id == item_id), None)
    v = db.get(ProductVariant, body.variant_id)
    if not item or not v or v.product_id != item.variant.product_id or not v.is_active:
        raise HTTPException(404, "Option not available")
    if body.quantity > v.available:
        raise HTTPException(409, f"Only {v.available} pair(s) available in that option")
    other = next((i for i in cart.items if i.variant_id == v.id and i.id != item.id), None)
    if other:
        other.quantity = min(MAX_QTY_PER_LINE, other.quantity + body.quantity, v.available)
        cart.items.remove(item)
    else:
        item.variant_id = v.id
        item.quantity = body.quantity
    db.flush()
    db.expire(cart)
    return _response(db, cart)


@router.delete("/items/{item_id}")
def remove_item(item_id: int, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user),
                x_cart_token: str | None = Header(None)):
    cart = get_cart(db, user, x_cart_token)
    item = next((i for i in cart.items if i.id == item_id), None)
    if item:
        cart.items.remove(item)
    return _response(db, cart)


@router.post("/discount")
def apply_discount(body: CartDiscountIn, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user),
                   x_cart_token: str | None = Header(None)):
    cart = get_cart(db, user, x_cart_token)
    quote = build_quote(db, cart_lines(cart), discount_code=None, province=None)
    validate_discount(find_discount(db, body.code), quote.subtotal)  # raises a friendly 400
    cart.discount_code = body.code.strip().upper()
    return _response(db, cart)


@router.delete("/discount")
def remove_discount(db: Session = Depends(get_db), user: User | None = Depends(get_optional_user),
                    x_cart_token: str | None = Header(None)):
    cart = get_cart(db, user, x_cart_token)
    cart.discount_code = None
    return _response(db, cart)


@router.post("/quote")
def quote(body: QuoteIn, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user),
          x_cart_token: str | None = Header(None)):
    cart = get_cart(db, user, x_cart_token)
    q = build_quote(db, cart_lines(cart), discount_code=body.discount_code or cart.discount_code, province=body.province)
    db.commit()
    return quote_out(q)
