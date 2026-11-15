"""Convert ORM objects into JSON-safe dicts for API responses."""
from __future__ import annotations

from decimal import Decimal

from app.models import (Address, Banner, Brand, Cart, Category, Color, Discount, Notification, Order,
                        Payment, Product, ProductImage, ProductVariant, Review, Size, StockMovement, User)
from app.utils import as_aware


def f(v) -> float | None:
    return None if v is None else float(v)


def dt(v):
    v = as_aware(v)
    return v.isoformat() if v else None


def user_out(u: User) -> dict:
    from app.services.social import is_placeholder_email
    return {"id": u.id, "email": None if is_placeholder_email(u.email) else u.email,
            "full_name": u.full_name, "phone": u.phone, "role": u.role.value,
            "has_password": bool(u.password_hash), "google": bool(u.google_sub), "telegram": bool(u.telegram_id),
            "locale": u.locale or "en",
            "is_active": u.is_active, "created_at": dt(u.created_at), "last_login_at": dt(u.last_login_at)}


def brand_out(b: Brand, count: int | None = None) -> dict:
    d = {"id": b.id, "name": b.name, "slug": b.slug, "description": b.description, "logo_url": b.logo_url,
         "is_active": b.is_active, "sort_order": b.sort_order}
    if count is not None:
        d["product_count"] = count
    return d


def category_out(c: Category, count: int | None = None) -> dict:
    d = {"id": c.id, "name": c.name, "name_km": c.name_km or "", "slug": c.slug, "description": c.description,
         "image_url": c.image_url,
         "is_active": c.is_active, "sort_order": c.sort_order}
    if count is not None:
        d["product_count"] = count
    return d


def color_out(c: Color) -> dict:
    return {"id": c.id, "name": c.name, "hex": c.hex, "sort_order": c.sort_order}


def size_out(s: Size) -> dict:
    return {"id": s.id, "label": s.label, "system": s.system, "sort_order": s.sort_order}


def image_out(i: ProductImage) -> dict:
    srcset = ", ".join(f"{r['url']} {w}w" for w, r in sorted((i.renditions or {}).items(), key=lambda x: int(x[0])))
    small = min((i.renditions or {}).items(), key=lambda x: int(x[0]), default=(None, {"url": i.url}))[1]["url"]
    return {"id": i.id, "url": i.url, "thumb_url": small, "srcset": srcset, "alt": i.alt,
            "color_id": i.color_id, "is_primary": i.is_primary, "sort_order": i.sort_order, "credit": i.credit or "",
            "width": i.width, "height": i.height, "provider": i.provider}


def variant_out(v: ProductVariant, admin: bool = False) -> dict:
    d = {"id": v.id, "color_id": v.color_id, "size_id": v.size_id, "color": v.color.name, "color_hex": v.color.hex,
         "size": v.size.label, "sku": v.sku, "available": v.available if v.is_active else 0,
         "price": f(v.price_override) if v.price_override is not None else f(v.product.effective_price),
         "is_active": v.is_active}
    if admin:
        d.update(stock=v.stock, reserved=v.reserved, price_override=f(v.price_override))
    return d


def _discount_pct(p: Product) -> int:
    if p.sale_price is not None and p.sale_price < p.price and p.price > 0:
        return int(round((1 - Decimal(p.sale_price) / Decimal(p.price)) * 100))
    return 0


def product_card(p: Product) -> dict:
    images = p.images
    primary = images[0] if images else None
    hover = images[1] if len(images) > 1 else None
    active = [v for v in p.variants if v.is_active]
    sizes = sorted({(v.size.sort_order, v.size.label) for v in active if v.available > 0})
    colors = {}
    for v in sorted(active, key=lambda x: x.color.sort_order):
        colors.setdefault(v.color_id, {"id": v.color_id, "name": v.color.name, "hex": v.color.hex})
    return {
        "id": p.id, "name": p.name, "name_km": p.name_km or "", "slug": p.slug, "model": p.model,
        "brand": {"id": p.brand.id, "name": p.brand.name, "slug": p.brand.slug},
        "category": {"id": p.category.id, "name": p.category.name, "name_km": p.category.name_km or "",
                     "slug": p.category.slug},
        "gender": p.gender.value,
        "price": f(p.price), "sale_price": f(p.sale_price) if _discount_pct(p) else None,
        "effective_price": f(p.effective_price), "discount_percent": _discount_pct(p),
        "image": image_out(primary) if primary else None,
        "hover_image": image_out(hover) if hover else None,
        "sizes": [s[1] for s in sizes], "colors": list(colors.values()),
        "in_stock": any(v.available > 0 for v in active),
        "is_featured": p.is_featured, "is_best_seller": p.is_best_seller,
        "is_new_arrival": p.is_new_arrival, "is_trending": p.is_trending,
        "rating_avg": f(p.rating_avg) or 0, "rating_count": p.rating_count,
    }


def product_detail(p: Product, admin: bool = False) -> dict:
    d = product_card(p)
    d.update(
        description=p.description,
        description_km=p.description_km or "",
        images=[image_out(i) for i in p.images],
        variants=[variant_out(v, admin) for v in p.variants if admin or v.is_active],
        is_active=p.is_active, created_at=dt(p.created_at), updated_at=dt(p.updated_at),
        sold_count=p.sold_count, brand_id=p.brand_id, category_id=p.category_id,
    )
    if admin:
        d["regular_sale_price"] = f(p.sale_price)
        d["total_stock"] = sum(v.stock for v in p.variants)
        d["total_available"] = sum(v.available for v in p.variants if v.is_active)
    return d


def review_out(r: Review, with_product: bool = False) -> dict:
    d = {"id": r.id, "product_id": r.product_id, "author_name": r.author_name, "rating": r.rating,
         "title": r.title, "body": r.body, "is_approved": r.is_approved, "is_featured": r.is_featured,
         "verified_purchase": r.verified_purchase, "created_at": dt(r.created_at)}
    if with_product and r.product:
        d["product"] = {"id": r.product.id, "name": r.product.name, "slug": r.product.slug}
    return d


def address_out(a: Address) -> dict:
    return {"id": a.id, "label": a.label, "full_name": a.full_name, "phone": a.phone, "province": a.province,
            "district": a.district, "address_line": a.address_line, "note": a.note, "is_default": a.is_default}


def cart_out(cart: Cart, quote) -> dict:
    by_variant = {l.variant.id: l for l in quote.lines}
    items = []
    for it in cart.items:
        v = it.variant
        p = v.product
        line = by_variant.get(v.id)
        img = next((i for i in p.images if i.color_id == v.color_id), p.images[0] if p.images else None)
        items.append({
            "id": it.id, "variant_id": v.id, "quantity": it.quantity,
            "product": {"id": p.id, "name": p.name, "slug": p.slug, "brand": p.brand.name},
            "color": v.color.name, "color_hex": v.color.hex, "size": v.size.label, "sku": v.sku,
            "image": image_out(img) if img else None,
            "unit_price": f(line.unit_price) if line else f(p.effective_price),
            "compare_price": f(p.price) if p.sale_price is not None and p.sale_price < p.price else None,
            "line_total": f(line.line_total) if line else 0,
            "available": v.available if (v.is_active and p.is_active) else 0,
        })
    return {"token": cart.token, "items": items, "count": sum(i.quantity for i in cart.items),
            **quote_out(quote)}


def quote_out(q) -> dict:
    return {"subtotal": f(q.subtotal), "discount_code": q.discount_code, "discount_amount": f(q.discount_amount),
            "delivery_fee": f(q.delivery_fee), "tax_amount": f(q.tax_amount), "total": f(q.total),
            "total_khr": q.total_khr, "khr_rate": q.khr_rate, "messages": q.messages}


def payment_out(p: Payment, admin: bool = False) -> dict:
    d = {"id": p.id, "method": p.method.value, "status": p.status.value, "amount": f(p.amount),
         "currency": p.currency, "reference": p.reference, "proof_url": p.proof_url,
         "khqr": p.khqr_payload, "expires_at": dt(p.expires_at), "verified_at": dt(p.verified_at),
         "verification_source": p.verification_source, "created_at": dt(p.created_at)}
    if admin:
        d.update(note=p.note, gateway_response=p.gateway_response, order_id=p.order_id)
    return d


def order_out(o: Order, admin: bool = False) -> dict:
    d = {
        "id": o.id, "order_number": o.order_number, "status": o.status.value, "channel": o.channel or "online",
        "invoice_number": "INV-" + (o.order_number[2:] if (o.order_number or "").startswith("IQ") else (o.order_number or "")),
        "payment_method": o.payment_method.value, "payment_status": o.payment_status.value,
        "customer_name": o.customer_name, "customer_phone": o.customer_phone, "customer_email": o.customer_email,
        "province": o.province, "district": o.district, "address_line": o.address_line,
        "delivery_note": o.delivery_note,
        "subtotal": f(o.subtotal), "discount_code": o.discount_code, "discount_amount": f(o.discount_amount),
        "delivery_fee": f(o.delivery_fee), "tax_amount": f(o.tax_amount), "total": f(o.total),
        "total_khr": o.total_khr, "khr_rate": o.khr_rate, "currency": o.currency,
        "carrier": o.carrier, "tracking_number": o.tracking_number, "tracking_url": o.tracking_url,
        "created_at": dt(o.created_at), "updated_at": dt(o.updated_at),
        "items": [{"id": i.id, "product_id": i.product_id, "variant_id": i.variant_id, "product_name": i.product_name,
                   "brand_name": i.brand_name, "product_slug": i.product_slug, "color": i.color, "size": i.size,
                   "sku": i.sku, "image_url": i.image_url, "unit_price": f(i.unit_price), "quantity": i.quantity,
                   "line_total": f(i.line_total)} for i in o.items],
        "history": [{"status": h.status, "note": h.note, "created_at": dt(h.created_at)} for h in o.history],
        "payments": [payment_out(p, admin) for p in o.payments],
        "item_count": sum(i.quantity for i in o.items),
    }
    if admin:
        d.update(admin_note=o.admin_note, user_id=o.user_id, stock_committed=o.stock_committed,
                 stock_released=o.stock_released, idempotency_key=o.idempotency_key)
    return d


def order_row(o: Order) -> dict:
    return {"id": o.id, "order_number": o.order_number, "status": o.status.value,
            "payment_method": o.payment_method.value, "payment_status": o.payment_status.value,
            "customer_name": o.customer_name, "customer_phone": o.customer_phone, "province": o.province,
            "total": f(o.total), "item_count": sum(i.quantity for i in o.items), "created_at": dt(o.created_at)}


def discount_out(d: Discount) -> dict:
    return {"id": d.id, "code": d.code, "description": d.description, "type": d.type.value, "value": f(d.value),
            "min_subtotal": f(d.min_subtotal), "max_discount": f(d.max_discount), "usage_limit": d.usage_limit,
            "used_count": d.used_count, "starts_at": dt(d.starts_at), "expires_at": dt(d.expires_at),
            "is_active": d.is_active, "created_at": dt(d.created_at)}


def banner_out(b: Banner) -> dict:
    return {"id": b.id, "placement": b.placement, "eyebrow": b.eyebrow, "title": b.title, "subtitle": b.subtitle,
            "cta_label": b.cta_label, "cta_link": b.cta_link, "image_url": b.image_url,
            "eyebrow_km": b.eyebrow_km or "", "title_km": b.title_km or "", "subtitle_km": b.subtitle_km or "",
            "cta_label_km": b.cta_label_km or "", "image_credit": b.image_credit or "",
            "mobile_image_url": b.mobile_image_url, "theme": b.theme, "sort_order": b.sort_order,
            "is_active": b.is_active}


def movement_out(m: StockMovement) -> dict:
    v = m.variant
    return {"id": m.id, "variant_id": m.variant_id, "sku": v.sku if v else "",
            "product": v.product.name if v and v.product else "", "color": v.color.name if v else "",
            "size": v.size.label if v else "", "change": m.change, "reserved_change": m.reserved_change,
            "stock_after": m.stock_after, "reason": m.reason.value, "reference": m.reference, "note": m.note,
            "user": m.user.full_name if m.user else None, "created_at": dt(m.created_at)}


def notification_out(n: Notification) -> dict:
    return {"id": n.id, "type": n.type, "title": n.title, "message": n.message, "link": n.link,
            "is_read": n.is_read, "created_at": dt(n.created_at)}
