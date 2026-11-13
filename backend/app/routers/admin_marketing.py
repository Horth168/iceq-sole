"""Admin: discount codes, homepage banners, reviews moderation, newsletter."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Banner, Discount, NewsletterSubscriber, Product, Review, User
from app.schemas import BannerIn, DiscountIn, ReviewModerateIn
from app.security import require_staff
from app.serializers import banner_out, discount_out, dt, review_out
from app.services import images

router = APIRouter(prefix="/api/admin", tags=["Admin · marketing"])


# ================================================================ discounts
@router.get("/discounts")
def list_discounts(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return [discount_out(d) for d in db.query(Discount).order_by(Discount.created_at.desc())]


@router.post("/discounts", status_code=201)
def create_discount(body: DiscountIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    d = Discount(**body.model_dump())
    db.add(d)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That code already exists")
    return discount_out(d)


@router.put("/discounts/{discount_id}")
def update_discount(discount_id: int, body: DiscountIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    d = db.get(Discount, discount_id)
    if not d:
        raise HTTPException(404, "Discount not found")
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That code already exists")
    return discount_out(d)


@router.delete("/discounts/{discount_id}", status_code=204)
def delete_discount(discount_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    d = db.get(Discount, discount_id)
    if d:
        db.delete(d)
        db.commit()


# ================================================================ banners
@router.get("/banners")
def list_banners(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return [banner_out(b) for b in db.query(Banner).order_by(Banner.placement, Banner.sort_order)]


async def _banner_images(b: Banner, image: UploadFile | None, mobile_image: UploadFile | None) -> list:
    old = []
    if image is not None:
        s = images.store_image(await images.read_upload(image), "banners", widths=images.BANNER_WIDTHS)
        old.append((b.image_key, None))
        b.image_url, b.image_key = s.url, s.key
    if mobile_image is not None:
        s = images.store_image(await images.read_upload(mobile_image), "banners", widths=(640, 1080))
        old.append((b.mobile_image_key, None))
        b.mobile_image_url, b.mobile_image_key = s.url, s.key
    return old


@router.post("/banners", status_code=201)
async def create_banner(data: str = Form(..., description="BannerIn as JSON"), image: UploadFile = File(...),
                        mobile_image: UploadFile | None = File(None), db: Session = Depends(get_db),
                        _: User = Depends(require_staff)):
    body = BannerIn.model_validate_json(data)
    b = Banner(**body.model_dump(), image_url="")
    await _banner_images(b, image, mobile_image)
    db.add(b)
    db.commit()
    return banner_out(b)


@router.put("/banners/{banner_id}")
async def update_banner(banner_id: int, data: str = Form(...), image: UploadFile | None = File(None),
                        mobile_image: UploadFile | None = File(None), db: Session = Depends(get_db),
                        _: User = Depends(require_staff)):
    b = db.get(Banner, banner_id)
    if not b:
        raise HTTPException(404, "Banner not found")
    body = BannerIn.model_validate_json(data)
    for k, v in body.model_dump().items():
        setattr(b, k, v)
    old = await _banner_images(b, image, mobile_image)
    db.commit()
    for key, _r in old:
        images.delete_stored(key)
    return banner_out(b)


@router.delete("/banners/{banner_id}", status_code=204)
def delete_banner(banner_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    b = db.get(Banner, banner_id)
    if b:
        keys = (b.image_key, b.mobile_image_key)
        db.delete(b)
        db.commit()
        for k in keys:
            images.delete_stored(k)


# ================================================================ reviews
def _recalc(db: Session, product_id: int) -> None:
    avg, n = db.query(func.avg(Review.rating), func.count()).filter(
        Review.product_id == product_id, Review.is_approved.is_(True)).one()
    p = db.get(Product, product_id)
    p.rating_avg, p.rating_count = round(float(avg or 0), 2), n


@router.get("/reviews")
def list_reviews(status: str = "pending", db: Session = Depends(get_db), _: User = Depends(require_staff)):
    q = db.query(Review)
    if status == "pending":
        q = q.filter(Review.is_approved.is_(False))
    elif status == "approved":
        q = q.filter(Review.is_approved.is_(True))
    return [review_out(r, with_product=True) for r in q.order_by(Review.created_at.desc()).limit(200)]


@router.patch("/reviews/{review_id}")
def moderate_review(review_id: int, body: ReviewModerateIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    r = db.get(Review, review_id)
    if not r:
        raise HTTPException(404, "Review not found")
    if body.is_approved is not None:
        r.is_approved = body.is_approved
    if body.is_featured is not None:
        r.is_featured = body.is_featured
    db.flush()
    _recalc(db, r.product_id)
    db.commit()
    return review_out(r, with_product=True)


@router.delete("/reviews/{review_id}", status_code=204)
def delete_review(review_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    r = db.get(Review, review_id)
    if r:
        pid = r.product_id
        db.delete(r)
        db.flush()
        _recalc(db, pid)
        db.commit()


# ================================================================ newsletter
@router.get("/newsletter")
def subscribers(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return [{"id": s.id, "email": s.email, "created_at": dt(s.created_at)}
            for s in db.query(NewsletterSubscriber).order_by(NewsletterSubscriber.id.desc()).limit(1000)]
