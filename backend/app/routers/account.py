"""Signed-in customer: profile, password, addresses, wishlist, orders, notifications."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from sqlalchemy import func
from app.services.social import is_placeholder_email
from app.database import get_db
from app.models import Address, Notification, Order, Product, RefreshToken, User, WishlistItem
from app.schemas import AddressIn, PasswordChangeIn, ProfileIn
from app.security import get_current_user, hash_password, issue_tokens, verify_password
from app.serializers import address_out, notification_out, order_out, order_row, product_card, user_out

router = APIRouter(prefix="/api/account", tags=["Customer account"])


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.put("/me")
def update_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.full_name = body.full_name
    user.phone = body.phone
    if body.email and is_placeholder_email(user.email):
        email = body.email.lower()
        if db.query(User).filter(func.lower(User.email) == email, User.id != user.id).first():
            raise HTTPException(409, "An account with this email already exists")
        user.email = email
    if body.locale:
        user.locale = body.locale
    db.commit()
    return user_out(user)


@router.post("/password")
def change_password(body: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # accounts made with Google/Telegram have no password yet: they can set one without a current one
    if user.password_hash and not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # sign out every other device
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    db.flush()
    return {**issue_tokens(db, user), "user": user_out(user)}


# ---------------------------------------------------------------- addresses
@router.get("/addresses")
def list_addresses(user: User = Depends(get_current_user)):
    return [address_out(a) for a in sorted(user.addresses, key=lambda a: (not a.is_default, a.id))]


def _own_address(db: Session, user: User, address_id: int) -> Address:
    a = db.get(Address, address_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Address not found")
    return a


def _set_default(db: Session, user: User, address: Address) -> None:
    for a in user.addresses:
        a.is_default = a.id == address.id


@router.post("/addresses", status_code=201)
def add_address(body: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(user.addresses) >= 10:
        raise HTTPException(400, "You can save up to 10 addresses")
    a = Address(user_id=user.id, **body.model_dump())
    db.add(a)
    db.flush()
    db.refresh(user)
    if body.is_default or len(user.addresses) == 1:
        _set_default(db, user, a)
    db.commit()
    return address_out(a)


@router.put("/addresses/{address_id}")
def update_address(address_id: int, body: AddressIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    a = _own_address(db, user, address_id)
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    if body.is_default:
        _set_default(db, user, a)
    db.commit()
    return address_out(a)


@router.delete("/addresses/{address_id}", status_code=204)
def delete_address(address_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _own_address(db, user, address_id)
    was_default = a.is_default
    db.delete(a)
    db.flush()
    db.refresh(user)
    if was_default and user.addresses:
        user.addresses[0].is_default = True
    db.commit()


# ---------------------------------------------------------------- wishlist
@router.get("/wishlist")
def wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(WishlistItem).filter(WishlistItem.user_id == user.id).order_by(WishlistItem.id.desc()).all()
    return [product_card(i.product) for i in items if i.product.is_active]


@router.post("/wishlist/{product_id}", status_code=201)
def add_wishlist(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p or not p.is_active:
        raise HTTPException(404, "Product not found")
    exists = db.query(WishlistItem).filter_by(user_id=user.id, product_id=product_id).first()
    if not exists:
        db.add(WishlistItem(user_id=user.id, product_id=product_id))
        db.commit()
    return {"ok": True}


@router.post("/wishlist-sync")
def sync_wishlist(product_ids: list[int], user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Merge a guest's local wishlist after sign-in."""
    have = {w.product_id for w in user.wishlist}
    for pid in set(product_ids[:100]) - have:
        if db.get(Product, pid):
            db.add(WishlistItem(user_id=user.id, product_id=pid))
    db.commit()
    return wishlist(user, db)


@router.delete("/wishlist/{product_id}", status_code=204)
def remove_wishlist(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(WishlistItem).filter_by(user_id=user.id, product_id=product_id).delete()
    db.commit()


# ---------------------------------------------------------------- orders
@router.get("/orders")
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.user_id == user.id).order_by(Order.created_at.desc()).limit(100).all()
    out = []
    for o in orders:
        row = order_row(o)
        row["thumbs"] = [i.image_url for i in o.items[:3]]
        out.append(row)
    return out


@router.get("/orders/{order_number}")
def my_order(order_number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    o = db.query(Order).filter(Order.order_number == order_number, Order.user_id == user.id).first()
    if not o:
        raise HTTPException(404, "Order not found")
    return order_out(o)


# ---------------------------------------------------------------- notifications
@router.get("/notifications")
def my_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(Notification).filter(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc()).limit(30).all())
    return [notification_out(n) for n in rows]


@router.post("/notifications/read", status_code=204)
def read_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id).update({"is_read": True})
    db.commit()
