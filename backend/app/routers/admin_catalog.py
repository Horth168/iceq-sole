"""Admin: products, variants, images, brands, categories, colours, sizes."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (Brand, CartItem, Category, Color, MovementReason, OrderItem, Product, ProductImage,
                        ProductVariant, Size, User)
from app.schemas import BrandIn, CategoryIn, ColorIn, ImageOrderIn, ImageUpdateIn, ProductIn, SizeIn
from app.security import require_staff
from app.serializers import brand_out, category_out, color_out, image_out, product_detail, size_out
from app.services import images, inventory
from app.utils import slugify

router = APIRouter(prefix="/api/admin", tags=["Admin · catalog"])


# ================================================================ products
@router.get("/products")
def admin_products(db: Session = Depends(get_db), _: User = Depends(require_staff),
                   q: str | None = Query(None, max_length=80), brand_id: int | None = None,
                   category_id: int | None = None, status: str | None = Query(None, pattern="^(active|hidden|low|out|needs_photo)$"),
                   page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)):
    query = select(Product).options(selectinload(Product.images), selectinload(Product.variants))
    if q:
        like = f"%{q}%"
        query = query.where(or_(Product.name.ilike(like), Product.model.ilike(like),
                                Product.id.in_(select(ProductVariant.product_id).where(ProductVariant.sku.ilike(like)))))
    if brand_id:
        query = query.where(Product.brand_id == brand_id)
    if category_id:
        query = query.where(Product.category_id == category_id)
    if status == "active":
        query = query.where(Product.is_active.is_(True))
    elif status == "hidden":
        query = query.where(Product.is_active.is_(False))
    elif status == "needs_photo":
        query = query.where(~Product.id.in_(select(ProductImage.product_id)))
    elif status in ("low", "out"):
        threshold = inventory.low_stock_threshold(db)
        avail = ProductVariant.stock - ProductVariant.reserved
        cond = avail <= 0 if status == "out" else avail <= threshold
        query = query.where(Product.id.in_(select(ProductVariant.product_id).where(cond, ProductVariant.is_active.is_(True))))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Product.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [product_detail(p, admin=True) for p in rows], "total": total, "page": page,
            "pages": max(1, -(-total // page_size))}


@router.get("/products/{product_id}")
def admin_product(product_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return product_detail(_product(db, product_id), admin=True)


def _product(db: Session, product_id: int) -> Product:
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    return p


def _unique_slug(db: Session, model, base: str, exclude_id: int | None = None) -> str:
    slug, n = base, 2
    while True:
        q = db.query(model).filter(model.slug == slug)
        if exclude_id:
            q = q.filter(model.id != exclude_id)
        if not q.first():
            return slug
        slug, n = f"{base}-{n}", n + 1


def _sku(p: Product, color: Color, size: Size) -> str:
    return f"IQ-{p.id:04d}-{slugify(color.name)[:6].upper()}-{size.label.replace('.', '')}"


def _apply_variants(db: Session, p: Product, body: ProductIn, user: User) -> None:
    existing = {v.id: v for v in p.variants}
    seen: set[int] = set()
    for vin in body.variants:
        color, size = db.get(Color, vin.color_id), db.get(Size, vin.size_id)
        if not color or not size:
            raise HTTPException(400, "Unknown colour or size in variants")
        v = existing.get(vin.id) if vin.id else next(
            (x for x in p.variants if x.color_id == vin.color_id and x.size_id == vin.size_id), None)
        if v is None:
            v = ProductVariant(product_id=p.id, color_id=color.id, size_id=size.id, stock=0, reserved=0,
                               sku=(vin.sku or _sku(p, color, size)).upper(),
                               price_override=vin.price_override, is_active=vin.is_active)
            db.add(v)
            db.flush()
            if vin.stock:
                inventory.adjust(db, v, set_to=vin.stock, reason=MovementReason.initial, note="Initial stock", user_id=user.id)
        else:
            v.color_id, v.size_id = color.id, size.id
            if vin.sku:
                v.sku = vin.sku.upper()
            v.price_override, v.is_active = vin.price_override, vin.is_active
            if vin.stock != v.stock:
                inventory.adjust(db, v, set_to=vin.stock, note="Edited in product form", user_id=user.id)
        seen.add(v.id)
    for vid, v in existing.items():
        if vid in seen:
            continue
        if v.reserved:
            raise HTTPException(409, f"Variant {v.sku} has pairs reserved by pending orders and cannot be removed")
        if db.query(OrderItem).filter(OrderItem.variant_id == vid).first():
            v.is_active = False  # keep history for past orders
        else:
            db.query(CartItem).filter(CartItem.variant_id == vid).delete()
            db.delete(v)


def _save_product(db: Session, p: Product, body: ProductIn, user: User) -> Product:
    if not db.get(Brand, body.brand_id) or not db.get(Category, body.category_id):
        raise HTTPException(400, "Choose a valid brand and category")
    data = body.model_dump(exclude={"variants", "slug"})
    for k, v in data.items():
        setattr(p, k, v)
    p.slug = _unique_slug(db, Product, slugify(body.slug or body.name), p.id)
    if p.id is None:
        db.add(p)
    db.flush()
    _apply_variants(db, p, body, user)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, "Duplicate SKU or colour/size combination") from e
    db.refresh(p)
    return p


@router.post("/products", status_code=201)
def create_product(body: ProductIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    return product_detail(_save_product(db, Product(), body, user), admin=True)


@router.put("/products/{product_id}")
def update_product(product_id: int, body: ProductIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    return product_detail(_save_product(db, _product(db, product_id), body, user), admin=True)


@router.patch("/products/{product_id}/flags")
def update_flags(product_id: int, flags: dict[str, bool], db: Session = Depends(get_db), _: User = Depends(require_staff)):
    p = _product(db, product_id)
    for k in ("is_active", "is_featured", "is_best_seller", "is_new_arrival", "is_trending"):
        if k in flags:
            setattr(p, k, bool(flags[k]))
    db.commit()
    return product_detail(p, admin=True)


@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    """Products with order history are archived (hidden) to keep records intact; others are deleted with images."""
    p = _product(db, product_id)
    if any(v.reserved for v in p.variants):
        raise HTTPException(409, "This product has pairs reserved by pending orders")
    if db.query(OrderItem).filter(OrderItem.product_id == p.id).first():
        p.is_active = False
        db.commit()
        return {"archived": True, "message": "Product has past orders, so it was hidden instead of deleted"}
    for img in p.images:
        images.delete_stored(img.storage_key, img.renditions)
    db.delete(p)
    db.commit()
    return {"deleted": True}


# ================================================================ product images
@router.post("/products/{product_id}/images", status_code=201)
async def upload_images(product_id: int, files: list[UploadFile] = File(...), color_id: int | None = Form(None),
                        db: Session = Depends(get_db), _: User = Depends(require_staff)):
    p = _product(db, product_id)
    if len(files) > 10:
        raise HTTPException(400, "Upload up to 10 images at a time")
    if len(p.images) + len(files) > 20:
        raise HTTPException(400, "A product can have at most 20 images")
    created = []
    next_order = max((i.sort_order for i in p.images), default=-1) + 1
    for n, f in enumerate(files):
        data = await images.read_upload(f)
        stored = images.store_image(data, f"products/{p.id}")
        img = ProductImage(product_id=p.id, color_id=color_id, url=stored.url, storage_key=stored.key,
                           provider=stored.provider, renditions=stored.renditions, width=stored.width,
                           height=stored.height, alt=p.name, sort_order=next_order + n,
                           is_primary=not p.images and n == 0)
        db.add(img)
        created.append(img)
    db.commit()
    return [image_out(i) for i in created]


def _image(db: Session, product_id: int, image_id: int) -> ProductImage:
    img = db.get(ProductImage, image_id)
    if not img or img.product_id != product_id:
        raise HTTPException(404, "Image not found")
    return img


@router.put("/products/{product_id}/images/{image_id}/file")
async def replace_image(product_id: int, image_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                        _: User = Depends(require_staff)):
    img = _image(db, product_id, image_id)
    data = await images.read_upload(file)
    stored = images.store_image(data, f"products/{product_id}")
    old_key, old_renditions = img.storage_key, img.renditions
    img.url, img.storage_key, img.provider = stored.url, stored.key, stored.provider
    img.renditions, img.width, img.height = stored.renditions, stored.width, stored.height
    db.commit()
    images.delete_stored(old_key, old_renditions)  # only after the DB points at the new file
    return image_out(img)


@router.patch("/products/{product_id}/images/{image_id}")
def update_image(product_id: int, image_id: int, body: ImageUpdateIn, db: Session = Depends(get_db),
                 _: User = Depends(require_staff)):
    img = _image(db, product_id, image_id)
    if body.alt is not None:
        img.alt = body.alt
    if body.credit is not None:
        img.credit = body.credit
    if "color_id" in body.model_fields_set:
        img.color_id = body.color_id
    if body.is_primary:
        for other in img.product.images:
            other.is_primary = other.id == img.id
    db.commit()
    return image_out(img)


@router.put("/products/{product_id}/images-order")
def reorder_images(product_id: int, body: ImageOrderIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    p = _product(db, product_id)
    by_id = {i.id: i for i in p.images}
    if set(body.image_ids) != set(by_id):
        raise HTTPException(400, "Send every image id of this product exactly once")
    for n, iid in enumerate(body.image_ids):
        by_id[iid].sort_order = n
        by_id[iid].is_primary = n == 0
    db.commit()
    db.refresh(p)
    return [image_out(i) for i in p.images]


@router.delete("/products/{product_id}/images/{image_id}", status_code=204)
def delete_image(product_id: int, image_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    img = _image(db, product_id, image_id)
    p = img.product
    was_primary = img.is_primary
    key, renditions = img.storage_key, img.renditions
    db.delete(img)
    db.flush()
    db.refresh(p)
    if was_primary and p.images:
        p.images[0].is_primary = True
    db.commit()
    images.delete_stored(key, renditions)


# ================================================================ brands / categories
def _taxonomy_routes(path: str, model, schema, out, folder: str):
    @router.get(f"/{path}", name=f"list_{path}")
    def _list(db: Session = Depends(get_db), _: User = Depends(require_staff)):
        col = Product.brand_id if path == "brands" else Product.category_id
        counts = dict(db.execute(select(col, func.count()).group_by(col)).all())
        return [out(x, counts.get(x.id, 0)) for x in db.query(model).order_by(model.sort_order, model.name)]

    @router.post(f"/{path}", status_code=201, name=f"create_{path}")
    def _create(body: schema, db: Session = Depends(get_db), _: User = Depends(require_staff)):
        obj = model(**body.model_dump(exclude={"slug"}))
        obj.slug = _unique_slug(db, model, slugify(body.slug or body.name))
        db.add(obj)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "That name already exists")
        return out(obj)

    @router.put(f"/{path}/{{obj_id}}", name=f"update_{path}")
    def _update(obj_id: int, body: schema, db: Session = Depends(get_db), _: User = Depends(require_staff)):
        obj = db.get(model, obj_id) or _404()
        for k, v in body.model_dump(exclude={"slug"}).items():
            setattr(obj, k, v)
        obj.slug = _unique_slug(db, model, slugify(body.slug or body.name), obj.id)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "That name already exists")
        return out(obj)

    @router.delete(f"/{path}/{{obj_id}}", status_code=204, name=f"delete_{path}")
    def _delete(obj_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
        obj = db.get(model, obj_id) or _404()
        if obj.products:
            raise HTTPException(409, f"Move or delete its {len(obj.products)} product(s) first")
        key = obj.logo_key if path == "brands" else obj.image_key
        db.delete(obj)
        db.commit()
        images.delete_stored(key)

    @router.post(f"/{path}/{{obj_id}}/image", name=f"image_{path}")
    async def _image_upload(obj_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                            _: User = Depends(require_staff)):
        obj = db.get(model, obj_id) or _404()
        stored = images.store_image(await images.read_upload(file), folder, widths=(480, 1200))
        if path == "brands":
            old, obj.logo_url, obj.logo_key = obj.logo_key, stored.url, stored.key
        else:
            old, obj.image_url, obj.image_key = obj.image_key, stored.url, stored.key
        db.commit()
        images.delete_stored(old)
        return out(obj)


def _404():
    raise HTTPException(404, "Not found")


_taxonomy_routes("brands", Brand, BrandIn, brand_out, "brands")
_taxonomy_routes("categories", Category, CategoryIn, category_out, "categories")


# ================================================================ colours / sizes
@router.get("/colors")
def list_colors(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return [color_out(c) for c in db.query(Color).order_by(Color.sort_order, Color.name)]


@router.post("/colors", status_code=201)
def create_color(body: ColorIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    c = Color(**body.model_dump())
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Colour already exists")
    return color_out(c)


@router.put("/colors/{color_id}")
def update_color(color_id: int, body: ColorIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    c = db.get(Color, color_id) or _404()
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Colour already exists")
    return color_out(c)


@router.delete("/colors/{color_id}", status_code=204)
def delete_color(color_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    c = db.get(Color, color_id) or _404()
    if db.query(ProductVariant).filter(ProductVariant.color_id == c.id).first():
        raise HTTPException(409, "This colour is used by product variants")
    db.delete(c)
    db.commit()


@router.get("/sizes")
def list_sizes(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return [size_out(s) for s in db.query(Size).order_by(Size.sort_order)]


@router.post("/sizes", status_code=201)
def create_size(body: SizeIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    s = Size(**body.model_dump())
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Size already exists")
    return size_out(s)


@router.put("/sizes/{size_id}")
def update_size(size_id: int, body: SizeIn, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    s = db.get(Size, size_id) or _404()
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Size already exists")
    return size_out(s)


@router.delete("/sizes/{size_id}", status_code=204)
def delete_size(size_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    s = db.get(Size, size_id) or _404()
    if db.query(ProductVariant).filter(ProductVariant.size_id == s.id).first():
        raise HTTPException(409, "This size is used by product variants")
    db.delete(s)
    db.commit()
