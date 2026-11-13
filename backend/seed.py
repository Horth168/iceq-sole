"""Seed IceQ Sole with demo data for LOCAL TESTING.

    python seed.py                 # catalog, settings, banners, discounts, reviews
    python seed.py --demo-orders   # + demo customers and orders (dashboard charts)
    python seed.py --reset         # wipe the database first (development only!)

Branded products use clearly-labelled illustrated placeholders. Replace them with genuine
product photography you are licensed to use, via Dashboard → Products → Images.
Demo prices and descriptions are examples — verify everything before going live.
"""
from __future__ import annotations

import argparse
import random
import secrets
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import (Banner, Brand, Notification, Category, Color, Discount, DiscountType, Gender, MovementReason, Order,
                        OrderItem, OrderStatus, Payment, PaymentMethod, PaymentStatus, Product, ProductImage,
                        ProductVariant, Review, Role, Size, User)
from app.placeholders import sneaker_svg
from app.security import hash_password
from app.services import images as image_svc
from app.services import inventory
from app.services import orders as order_svc
from app.services.storage import get_storage
from app.utils import money, new_order_number, slugify, utcnow

ASSETS = Path(__file__).parent / "seed_assets"
rng = random.Random(7)

BRANDS = [
    ("Nike", "Performance and street icons from Beaverton."),
    ("Air Jordan", "Courtside heritage, built for the culture."),
    ("Adidas", "Three stripes. Terrace classics and modern runners."),
    ("New Balance", "Made for comfort, worn for style."),
    ("Puma", "Fast heritage with a low-profile attitude."),
    ("Converse", "The canvas icon since forever."),
    ("Vans", "Off the wall skate classics."),
    ("Asics", "Japanese running technology turned street staple."),
    ("IceQ Originals", "Our in-house label. Clean lines, cold colourways."),
]
CATEGORIES = [
    ("Lifestyle", "Everyday icons that go with everything."),
    ("Running", "Light, cushioned and ready to move."),
    ("Basketball", "Court heritage and hardwood energy."),
    ("Retro", "Archive silhouettes, back in rotation."),
    ("Skate", "Grip, durability, board feel."),
]
COLORS = [("White", "#F7F7F5"), ("Black", "#151517"), ("Grey", "#9EA3A8"), ("Navy", "#1F2A44"), ("Red", "#C8102E"),
          ("Green", "#2F6B4F"), ("Cream", "#EFE6D2"), ("Brown", "#6B4A35"), ("Ice Blue", "#A9DDF3"), ("Pink", "#F2B8C6"),
          ("Sand", "#D8C3A0"), ("Orange", "#E86A2C")]
SIZES = ["36", "37", "38", "39", "40", "40.5", "41", "42", "42.5", "43", "44", "45", "46"]

# name, brand, category, gender, price, sale, flags, colourways, description
P = [
    ("Air Force 1 '07", "Nike", "Lifestyle", "unisex", 115, None, "fb", ["White", "Black"],
     "The hoops original turned street uniform. Clean leather-look upper and a chunky cupsole that goes with everything."),
    ("Dunk Low Retro", "Nike", "Retro", "unisex", 115, 99, "tn", ["Grey", "Green"],
     "Eighties college-court energy in a low-cut profile. Colour-blocked panels and an easy, everyday fit."),
    ("Air Max 90", "Nike", "Lifestyle", "men", 135, None, "f", ["White", "Red"],
     "Visible cushioning and layered panels from the running archive, refined for daily wear."),
    ("Pegasus 41", "Nike", "Running", "unisex", 140, 119, "n", ["Black", "Ice Blue"],
     "A dependable daily trainer for easy miles and city runs."),
    ("Air Jordan 1 Mid", "Air Jordan", "Basketball", "unisex", 125, None, "bt", ["Red", "Black"],
     "The silhouette that started it all, in a versatile mid-cut height."),
    ("Air Jordan 4 Retro", "Air Jordan", "Basketball", "men", 215, None, "ft", ["White", "Black"],
     "A collector favourite with structured support details and statement presence."),
    ("Samba OG", "Adidas", "Retro", "unisex", 100, None, "bft", ["White", "Black"],
     "Born for indoor football, adopted by the street. Slim profile, gum-style sole."),
    ("Gazelle", "Adidas", "Retro", "women", 100, 85, "n", ["Pink", "Navy"],
     "Soft suede-look upper and a low, easy shape that pairs with everything."),
    ("Ultraboost 5", "Adidas", "Running", "unisex", 190, 159, "n", ["Black", "White"],
     "Energetic cushioning for long days on foot and comfortable runs."),
    ("Forum Low", "Adidas", "Basketball", "unisex", 110, None, "", ["White"],
     "Eighties basketball heritage with the signature ankle strap detail."),
    ("550", "New Balance", "Basketball", "unisex", 110, None, "bt", ["White", "Green"],
     "A late-eighties court shoe brought back with clean, low-key styling."),
    ("530", "New Balance", "Running", "women", 100, None, "fn", ["Grey", "Cream"],
     "Retro running lines with a chunky, comfortable sole."),
    ("9060", "New Balance", "Lifestyle", "men", 150, 129, "t", ["Grey", "Sand"],
     "Futuristic layered design with a sculpted, wavy sole."),
    ("Suede Classic", "Puma", "Retro", "unisex", 75, 59, "", ["Navy", "Red"],
     "A b-boy and terrace staple with a soft suede-look upper."),
    ("Palermo", "Puma", "Lifestyle", "women", 90, None, "n", ["Green", "Cream"],
     "Terrace-inspired low profile with a gum-tone sole."),
    ("Chuck 70 Hi", "Converse", "Lifestyle", "unisex", 90, None, "b", ["Black", "Cream"],
     "Premium take on the canvas high-top with a vintage-inspired sole."),
    ("Chuck Taylor All Star Low", "Converse", "Lifestyle", "kids", 55, None, "", ["White", "Red"],
     "The timeless low-top canvas sneaker, sized for kids."),
    ("Old Skool", "Vans", "Skate", "unisex", 70, None, "b", ["Black", "Navy"],
     "Skate classic with the iconic side stripe and durable construction."),
    ("Gel-Kayano 14", "Asics", "Running", "unisex", 150, None, "nt", ["Grey", "White"],
     "Late-2000s running tech DNA, reworked as a sought-after lifestyle runner."),
    # Original in-house label — uses generated studio photography (seed_assets/originals)
    ("Glacier Runner", "IceQ Originals", "Running", "unisex", 89, None, "fnt", ["Ice Blue"],
     "Our debut runner in a frost-white and glacier-blue colourway. Breathable mesh-look upper and a soft, sculpted midsole."),
    ("Polar Court Low", "IceQ Originals", "Lifestyle", "unisex", 79, 69, "fn", ["White"],
     "A minimal low-top in tonal white with an icy accent on the heel. Built to be the cleanest pair you own."),
    ("Midnight Trail", "IceQ Originals", "Running", "men", 95, None, "n", ["Black"],
     "Stealthy black runner with a rugged outsole for city streets after dark."),
]
FLAG = {"f": "is_featured", "b": "is_best_seller", "n": "is_new_arrival", "t": "is_trending"}
ORIGINAL_PHOTOS = {"Glacier Runner": "glacier-runner", "Polar Court Low": "polar-court", "Midnight Trail": "midnight-trail"}

REVIEWS = [
    ("Sokha P.", 5, "Fits true to size", "Ordered on Monday, delivered in Phnom Penh the next day. Packaging was perfect."),
    ("Dara K.", 5, "Exactly as shown", "Paid with KHQR, confirmation came fast. Will order again."),
    ("Bopha L.", 4, "Super comfy", "Comfortable from day one. Delivery to Siem Reap took two days."),
    ("Vichea S.", 5, "Great service", "They helped me pick the right size on Telegram. Legit store."),
    ("Mealea C.", 5, "Love the colour", "Even better in person. The box arrived in perfect condition."),
    ("Rithy N.", 4, "Solid pair", "Good quality and fair price. Cash on delivery made it easy."),
]


def put_svg(key: str, svg: str) -> str:
    return get_storage().put(key, svg.encode("utf-8"), "image/svg+xml")


def seed_catalog(db) -> None:
    if db.query(Product).first():
        print("Catalog already seeded - skipping (use --reset to start over)")
        return
    brands = {n: Brand(name=n, slug=slugify(n), description=d, sort_order=i) for i, (n, d) in enumerate(BRANDS)}
    cats = {n: Category(name=n, slug=slugify(n), description=d, sort_order=i) for i, (n, d) in enumerate(CATEGORIES)}
    colors = {n: Color(name=n, hex=h, sort_order=i) for i, (n, h) in enumerate(COLORS)}
    sizes = {s: Size(label=s, system="EU", sort_order=i) for i, s in enumerate(SIZES)}
    db.add_all([*brands.values(), *cats.values(), *colors.values(), *sizes.values()])
    db.flush()

    for c in cats.values():
        path = ASSETS / "categories" / f"{c.slug}.jpg"
        if path.exists():
            s = image_svc.store_image(path.read_bytes(), "categories", widths=(480, 1200))
            c.image_url, c.image_key = s.url, s.key

    admin = db.query(User).filter(User.role == Role.admin).first()
    for idx, (name, brand, cat, gender, price, sale, flags, colorways, desc) in enumerate(P):
        full = name if brand in ("Air Jordan", "IceQ Originals") else f"{brand} {name}"
        p = Product(name=full, slug=slugify(full), model=name, description=desc, gender=Gender(gender),
                    price=Decimal(price), sale_price=Decimal(sale) if sale else None,
                    brand_id=brands[brand].id, category_id=cats[cat].id,
                    **{FLAG[ch]: True for ch in flags})
        p.created_at = utcnow() - timedelta(days=60 - idx * 2)
        db.add(p)
        db.flush()
        size_range = SIZES[0:8] if gender == "women" else SIZES[2:12] if gender != "kids" else SIZES[0:6]
        for color_name in colorways:
            col = colors[color_name]
            for s in size_range:
                v = ProductVariant(product_id=p.id, color_id=col.id, size_id=sizes[s].id,
                                   sku=f"IQ-{p.id:04d}-{slugify(color_name)[:6].upper()}-{s.replace('.', '')}",
                                   stock=0, reserved=0)
                db.add(v)
                db.flush()
                qty = rng.choice([2, 4, 5, 6, 6, 8, 8, 10, 12, 15]) if rng.random() > 0.05 else 0
                if qty:
                    inventory.adjust(db, v, set_to=qty, reason=MovementReason.initial, note="Seed stock",
                                     user_id=admin.id if admin else None)
            # images
            photo_dir = ASSETS / "originals" / ORIGINAL_PHOTOS.get(name, "__none__")
            photos = sorted(photo_dir.glob("*.jpg")) if photo_dir.exists() else []
            order_base = len(p.images)
            if photos:
                for n, ph in enumerate(photos):
                    s = image_svc.store_image(ph.read_bytes(), f"products/{p.id}")
                    db.add(ProductImage(product_id=p.id, color_id=col.id, url=s.url, storage_key=s.key,
                                        provider=s.provider, renditions=s.renditions, width=s.width, height=s.height,
                                        alt=f"{full} in {color_name}", sort_order=order_base + n,
                                        is_primary=order_base + n == 0))
            else:
                sole = "#C89B6D" if name in ("Samba OG", "Palermo", "Gazelle") else "#F4F2EC"
                for view in range(3):
                    key = f"products/{p.id}/placeholder-{slugify(color_name)}-{view}.svg"
                    url = put_svg(key, sneaker_svg(col.hex, brand, name, view, sole))
                    db.add(ProductImage(product_id=p.id, color_id=col.id, url=url, storage_key=key,
                                        provider=get_storage().name, renditions={}, width=1200, height=1200,
                                        alt=f"Illustration of {full} in {color_name}", sort_order=order_base + view,
                                        is_primary=order_base + view == 0))
            db.flush()
            db.refresh(p)
    db.commit()
    print(f"Seeded {len(P)} products, {len(BRANDS)} brands, {len(CATEGORIES)} categories")


def seed_marketing(db) -> None:
    if not db.query(Discount).first():
        db.add_all([
            Discount(code="WELCOME10", description="10% off your first order", type=DiscountType.percent,
                     value=Decimal(10), max_discount=Decimal(30), is_active=True),
            Discount(code="ICEQ5", description="$5 off orders over $60", type=DiscountType.fixed, value=Decimal(5),
                     min_subtotal=Decimal(60), is_active=True),
            Discount(code="FREEZE20", description="20% off — winter drop (expires in 30 days)",
                     type=DiscountType.percent, value=Decimal(20), min_subtotal=Decimal(120),
                     expires_at=utcnow() + timedelta(days=30), usage_limit=100, is_active=True),
        ])
    if not db.query(Banner).first():
        banner_specs = [
            ("hero", "New season · 2026", "Stay cold.\nWalk loud.", "Premium sneakers, authentic heritage and fresh drops — delivered across Cambodia.",
             "Shop now", "/shop", "hero-main", "hero-main-mobile", "dark", 0),
            ("hero", "The Originals", "Glacier Runner", "Our in-house runner in frost white and glacier blue.",
             "Discover", "/product/glacier-runner", "hero-originals", None, "dark", 1),
            ("promo", "Limited offer", "Winter drop — 20% off", "Use code FREEZE20 on orders over $120.",
             "Shop the sale", "/shop?on_sale=true", "promo-sale", None, "dark", 0),
        ]
        for placement, eyebrow, title, subtitle, cta, link, img, mimg, theme, order in banner_specs:
            path = ASSETS / "banners" / f"{img}.jpg"
            if not path.exists():
                print(f"  (banner image {path.name} missing - banner skipped)")
                continue
            s = image_svc.store_image(path.read_bytes(), "banners", widths=image_svc.BANNER_WIDTHS)
            b = Banner(placement=placement, eyebrow=eyebrow, title=title, subtitle=subtitle, cta_label=cta,
                       cta_link=link, image_url=s.url, image_key=s.key, theme=theme, sort_order=order)
            mpath = ASSETS / "banners" / f"{mimg}.jpg" if mimg else None
            if mpath and mpath.exists():
                ms = image_svc.store_image(mpath.read_bytes(), "banners", widths=(640, 1080))
                b.mobile_image_url, b.mobile_image_key = ms.url, ms.key
            db.add(b)
    db.commit()


def seed_reviews(db) -> None:
    if db.query(Review).first():
        return
    products = db.query(Product).order_by(Product.sold_count.desc(), Product.id).limit(12).all()
    for i, (name, rating, title, body) in enumerate(REVIEWS):
        p = products[i % len(products)]
        db.add(Review(product_id=p.id, author_name=name, rating=rating, title=title, body=body,
                      is_approved=True, is_featured=True, verified_purchase=True))
    db.flush()
    for p in products:
        rs = [r.rating for r in p.reviews if r.is_approved]
        p.rating_avg, p.rating_count = (round(sum(rs) / len(rs), 2), len(rs)) if rs else (0, 0)
    db.commit()


def seed_demo_orders(db, count: int = 36) -> None:
    if db.query(Order).first():
        print("Orders exist - skipping demo orders")
        return
    customers = []
    for i, (n, ph) in enumerate([("Sokha Pich", "012345678"), ("Dara Kim", "092888123"), ("Bopha Lim", "077654321"),
                                 ("Vichea Sok", "015222333"), ("Mealea Chan", "098765432")]):
        email = f"demo{i + 1}@iceqsole.test"
        u = db.query(User).filter(User.email == email).first() or User(
            email=email, full_name=n, phone=ph, password_hash=hash_password(secrets.token_urlsafe(12)), role=Role.customer)
        db.add(u)
        customers.append(u)
    db.flush()
    variants = [v for v in db.query(ProductVariant).all() if v.stock >= 2]
    provinces = ["Phnom Penh"] * 5 + ["Siem Reap", "Battambang", "Kampot", "Preah Sihanouk", "Kandal"]
    statuses = ([OrderStatus.delivered] * 14 + [OrderStatus.shipped] * 4 + [OrderStatus.processing] * 3 +
                [OrderStatus.confirmed] * 3 + [OrderStatus.pending] * 6 + [OrderStatus.cancelled] * 3)
    for i in range(count):
        c = rng.choice(customers)
        picks = rng.sample(variants, k=rng.choice([1, 1, 1, 2]))
        method = rng.choice([PaymentMethod.khqr, PaymentMethod.khqr, PaymentMethod.cod, PaymentMethod.bank_transfer])
        province = rng.choice(provinces)
        subtotal = sum((money(v.product.effective_price) for v in picks), Decimal(0))
        fee = money(0 if subtotal >= 100 else (1.5 if province == "Phnom Penh" else 3))
        created = utcnow() - timedelta(days=rng.randint(0, 29), hours=rng.randint(0, 20))
        o = Order(order_number=new_order_number(), user_id=c.id, payment_method=method, customer_name=c.full_name,
                  customer_phone=c.phone, customer_email=c.email, province=province, address_line="Street 123, House 45",
                  subtotal=subtotal, delivery_fee=fee, total=subtotal + fee, created_at=created, updated_at=created)
        db.add(o)
        db.flush()
        for v in picks:
            db.refresh(v)
            if v.available < 1:
                continue
            inventory.reserve(db, v, 1, o.order_number)
            o.items.append(OrderItem(product_id=v.product_id, variant_id=v.id, product_name=v.product.name,
                                     brand_name=v.product.brand.name, product_slug=v.product.slug, color=v.color.name,
                                     size=v.size.label, sku=v.sku,
                                     image_url=v.product.images[0].url if v.product.images else None,
                                     unit_price=money(v.product.effective_price), quantity=1,
                                     line_total=money(v.product.effective_price)))
        if not o.items:
            db.delete(o)
            continue
        o.payments.append(Payment(method=method, amount=o.total, created_at=created))
        order_svc.add_event(db, o, "pending", "Order placed")
        target = statuses[i % len(statuses)]
        path = {OrderStatus.pending: [], OrderStatus.confirmed: [OrderStatus.confirmed],
                OrderStatus.processing: [OrderStatus.confirmed, OrderStatus.processing],
                OrderStatus.shipped: [OrderStatus.confirmed, OrderStatus.processing, OrderStatus.shipped],
                OrderStatus.delivered: [OrderStatus.confirmed, OrderStatus.processing, OrderStatus.shipped, OrderStatus.delivered],
                OrderStatus.cancelled: [OrderStatus.cancelled]}[target]
        if target not in (OrderStatus.pending, OrderStatus.cancelled) and method != PaymentMethod.cod:
            order_svc.mark_paid(db, o, source="admin", note="Demo payment")
            path = [s for s in path if s != OrderStatus.confirmed]
        for s in path:
            order_svc.change_status(db, o, s, note="Demo")
        db.flush()
        for p_ in o.payments:
            p_.created_at = created
        for h in o.history:
            h.created_at = created
    db.query(Notification).update({"is_read": True})  # demo history shouldn't look like new alerts
    db.commit()
    print(f"Created demo customers and {db.query(Order).count()} demo orders")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="drop all tables first (development only)")
    ap.add_argument("--demo-orders", action="store_true", help="also create demo customers and orders")
    args = ap.parse_args()
    if args.reset:
        if settings.is_production:
            raise SystemExit("Refusing to reset a production database")
        Base.metadata.drop_all(engine)
        from alembic import command
        from alembic.config import Config
        with engine.begin() as conn:
            conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        command.upgrade(Config(str(Path(__file__).parent / "alembic.ini")), "head")
    db = SessionLocal()
    try:
        seed_catalog(db)
        seed_marketing(db)
        seed_reviews(db)
        if args.demo_orders:
            seed_demo_orders(db)
    finally:
        db.close()
    print("Done.")


if __name__ == "__main__":
    main()
