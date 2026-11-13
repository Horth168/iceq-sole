"""Public storefront API: catalog browsing, search, filters, reviews, homepage content."""
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.limiter import limiter
from app.models import (Banner, Brand, Category, Color, Gender, NewsletterSubscriber, Order, OrderItem,
                        OrderStatus, Product, ProductVariant, Review, Size, User)
from app.schemas import NewsletterIn, ReviewIn
from app.security import get_optional_user
from app.serializers import (banner_out, brand_out, category_out, color_out, product_card, product_detail,
                             review_out, size_out)
from app.services.settings_store import public_settings
from app.utils import CAMBODIA_PROVINCES

router = APIRouter(prefix="/api", tags=["Storefront"])

SortKey = Literal["featured", "newest", "price_asc", "price_desc", "best_selling", "rating", "discount"]


def _eager(q):
    return q.options(selectinload(Product.images), selectinload(Product.variants))


def _effective_price():
    return func.coalesce(Product.sale_price, Product.price)


@router.get("/products")
def list_products(
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=80),
    brand: list[str] = Query(default=[]),
    category: list[str] = Query(default=[]),
    gender: list[Gender] = Query(default=[]),
    size: list[str] = Query(default=[]),
    color: list[str] = Query(default=[]),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    in_stock: bool = False,
    on_sale: bool = False,
    featured: bool = False,
    new_arrival: bool = False,
    best_seller: bool = False,
    trending: bool = False,
    ids: str | None = Query(None, max_length=400, description="Comma separated product ids"),
    sort: SortKey = "featured",
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=60),
):
    query = select(Product).where(Product.is_active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        query = query.join(Brand, Product.brand_id == Brand.id).where(
            or_(Product.name.ilike(like), Product.name_km.ilike(like), Product.model.ilike(like),
                Brand.name.ilike(like), Product.description.ilike(like)))
    if brand:
        query = query.where(Product.brand_id.in_(select(Brand.id).where(Brand.slug.in_(brand))))
    if category:
        query = query.where(Product.category_id.in_(select(Category.id).where(Category.slug.in_(category))))
    if gender:
        query = query.where(Product.gender.in_(gender))
    price = _effective_price()
    if min_price is not None:
        query = query.where(price >= Decimal(str(min_price)))
    if max_price is not None:
        query = query.where(price <= Decimal(str(max_price)))
    if on_sale:
        query = query.where(Product.sale_price.is_not(None), Product.sale_price < Product.price)
    for flag, col in ((featured, Product.is_featured), (new_arrival, Product.is_new_arrival),
                      (best_seller, Product.is_best_seller), (trending, Product.is_trending)):
        if flag:
            query = query.where(col.is_(True))
    if ids:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()][:50]
        query = query.where(Product.id.in_(id_list))
    # variant-level filters (size / colour / availability) must match the SAME variant
    conds = [ProductVariant.is_active.is_(True)]
    if size:
        conds.append(ProductVariant.size_id.in_(select(Size.id).where(Size.label.in_(size))))
    if color:
        conds.append(ProductVariant.color_id.in_(select(Color.id).where(func.lower(Color.name).in_([c.lower() for c in color]))))
    if in_stock or size or color:
        if in_stock:
            conds.append((ProductVariant.stock - ProductVariant.reserved) > 0)
        query = query.where(Product.id.in_(select(ProductVariant.product_id).where(and_(*conds))))

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    order = {
        "featured": (Product.is_featured.desc(), Product.sold_count.desc(), Product.id.desc()),
        "newest": (Product.created_at.desc(), Product.id.desc()),
        "price_asc": (price.asc(), Product.id),
        "price_desc": (price.desc(), Product.id),
        "best_selling": (Product.sold_count.desc(), Product.id.desc()),
        "rating": (Product.rating_avg.desc(), Product.rating_count.desc()),
        "discount": (((Product.price - price) / func.nullif(Product.price, 0)).desc(), Product.id),
    }[sort]
    rows = db.scalars(_eager(query.order_by(*order).offset((page - 1) * page_size).limit(page_size))).unique().all()
    return {"items": [product_card(p) for p in rows], "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


@router.get("/products/filters")
def filter_options(db: Session = Depends(get_db)):
    active = select(Product.id).where(Product.is_active.is_(True))
    price_min, price_max = db.execute(
        select(func.min(_effective_price()), func.max(_effective_price())).where(Product.is_active.is_(True))).one()
    brand_counts = dict(db.execute(select(Product.brand_id, func.count()).where(Product.is_active.is_(True))
                                   .group_by(Product.brand_id)).all())
    cat_counts = dict(db.execute(select(Product.category_id, func.count()).where(Product.is_active.is_(True))
                                 .group_by(Product.category_id)).all())
    size_ids = set(db.scalars(select(ProductVariant.size_id).where(ProductVariant.product_id.in_(active))).all())
    color_ids = set(db.scalars(select(ProductVariant.color_id).where(ProductVariant.product_id.in_(active))).all())
    return {
        "brands": [brand_out(b, brand_counts.get(b.id, 0)) for b in
                   db.query(Brand).filter(Brand.is_active.is_(True)).order_by(Brand.sort_order, Brand.name)
                   if brand_counts.get(b.id)],
        "categories": [category_out(c, cat_counts.get(c.id, 0)) for c in
                       db.query(Category).filter(Category.is_active.is_(True)).order_by(Category.sort_order)
                       if cat_counts.get(c.id)],
        "sizes": [size_out(s) for s in db.query(Size).order_by(Size.sort_order) if s.id in size_ids],
        "colors": [color_out(c) for c in db.query(Color).order_by(Color.sort_order) if c.id in color_ids],
        "genders": [g.value for g in Gender],
        "price": {"min": float(price_min or 0), "max": float(price_max or 0)},
    }


@router.get("/search/suggest")
def suggest(q: str = Query(..., min_length=1, max_length=80), db: Session = Depends(get_db)):
    like = f"%{q.strip()}%"
    products = db.scalars(_eager(select(Product).join(Brand).where(
        Product.is_active.is_(True), or_(Product.name.ilike(like), Product.name_km.ilike(like), Brand.name.ilike(like),
                                         Product.model.ilike(like)))
        .order_by(Product.sold_count.desc()).limit(6))).unique().all()
    brands = db.query(Brand).filter(Brand.is_active.is_(True), Brand.name.ilike(like)).limit(4).all()
    return {"products": [product_card(p) for p in products], "brands": [brand_out(b) for b in brands]}


@router.get("/products/{slug}")
def get_product(slug: str, db: Session = Depends(get_db)):
    p = db.scalars(_eager(select(Product).where(Product.slug == slug, Product.is_active.is_(True)))).unique().first()
    if not p:
        raise HTTPException(404, "Product not found")
    return product_detail(p)


@router.get("/products/{slug}/related")
def related(slug: str, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.slug == slug).first()
    if not p:
        raise HTTPException(404, "Product not found")
    rows = db.scalars(_eager(select(Product).where(
        Product.is_active.is_(True), Product.id != p.id,
        or_(Product.category_id == p.category_id, Product.brand_id == p.brand_id))
        .order_by((Product.category_id == p.category_id).desc(), Product.sold_count.desc()).limit(8))).unique().all()
    return [product_card(r) for r in rows]


@router.get("/products/{slug}/reviews")
def product_reviews(slug: str, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.slug == slug).first()
    if not p:
        raise HTTPException(404, "Product not found")
    rows = (db.query(Review).filter(Review.product_id == p.id, Review.is_approved.is_(True))
            .order_by(Review.created_at.desc()).limit(50).all())
    dist = {i: 0 for i in range(1, 6)}
    for r in rows:
        dist[r.rating] += 1
    return {"items": [review_out(r) for r in rows], "average": float(p.rating_avg or 0),
            "count": p.rating_count, "distribution": dist}


@router.post("/products/{slug}/reviews", status_code=201)
@limiter.limit("5/hour")
def add_review(request: Request, slug: str, body: ReviewIn, db: Session = Depends(get_db),
               user: User | None = Depends(get_optional_user)):
    p = db.query(Product).filter(Product.slug == slug, Product.is_active.is_(True)).first()
    if not p:
        raise HTTPException(404, "Product not found")
    if not user:
        raise HTTPException(401, "Please sign in to write a review")
    verified = db.query(OrderItem).join(Order).filter(
        Order.user_id == user.id, OrderItem.product_id == p.id, Order.status == OrderStatus.delivered).first() is not None
    r = Review(product_id=p.id, user_id=user.id, author_name=(body.author_name or user.full_name or "Customer")[:80],
               rating=body.rating, title=body.title, body=body.body, verified_purchase=verified, is_approved=False)
    db.add(r)
    db.commit()
    return {"ok": True, "message": "Thanks! Your review will appear after moderation."}


@router.get("/brands")
def brands(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Product.brand_id, func.count()).where(Product.is_active.is_(True))
                             .group_by(Product.brand_id)).all())
    return [brand_out(b, counts.get(b.id, 0)) for b in
            db.query(Brand).filter(Brand.is_active.is_(True)).order_by(Brand.sort_order, Brand.name)]


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Product.category_id, func.count()).where(Product.is_active.is_(True))
                             .group_by(Product.category_id)).all())
    return [category_out(c, counts.get(c.id, 0)) for c in
            db.query(Category).filter(Category.is_active.is_(True)).order_by(Category.sort_order, Category.name)]


@router.get("/home")
def home(db: Session = Depends(get_db)):
    def block(*conds, order=Product.sold_count.desc(), limit=8):
        q = select(Product).where(Product.is_active.is_(True), *conds).order_by(order, Product.id.desc()).limit(limit)
        return [product_card(p) for p in db.scalars(_eager(q)).unique().all()]

    testimonials = (db.query(Review).filter(Review.is_approved.is_(True), Review.is_featured.is_(True))
                    .order_by(Review.created_at.desc()).limit(6).all())
    banners = db.query(Banner).filter(Banner.is_active.is_(True)).order_by(Banner.placement, Banner.sort_order).all()
    return {
        "banners": [banner_out(b) for b in banners],
        "featured": block(Product.is_featured.is_(True)),
        "new_arrivals": block(Product.is_new_arrival.is_(True), order=Product.created_at.desc()),
        "best_sellers": block(Product.is_best_seller.is_(True)),
        "trending": block(Product.is_trending.is_(True)),
        "on_sale": block(Product.sale_price.is_not(None), Product.sale_price < Product.price, limit=4),
        "brands": brands(db),
        "categories": categories(db),
        "testimonials": [review_out(r, with_product=True) for r in testimonials],
    }


@router.get("/settings/public")
def settings_public(db: Session = Depends(get_db)):
    return {**public_settings(db), "provinces": CAMBODIA_PROVINCES}


@router.post("/newsletter", status_code=201)
@limiter.limit("5/hour")
def newsletter(request: Request, body: NewsletterIn, db: Session = Depends(get_db)):
    try:
        db.add(NewsletterSubscriber(email=body.email.lower()))
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"ok": True, "message": "You're on the list. Welcome to IceQ Sole."}
