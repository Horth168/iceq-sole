"""Seed IceQ Sole with demo data for LOCAL TESTING.

    python seed.py                 # catalog, settings, banners, discounts, reviews
    python seed.py --demo-orders   # + demo customers and orders (dashboard charts)
    python seed.py --reset         # wipe the database first (development only!)

Product photos are real photographs from Unsplash (Unsplash License), listed with credits in
seed_assets/photos.json - each was checked by eye against the model/colour it is attached to.
Models without a verified photo get no image (the store shows a "photo coming soon" tile);
upload genuine photography via Dashboard -> Products -> Images.
Demo prices and descriptions are examples — verify everything before going live.
"""
from __future__ import annotations

import argparse
import json
import random
import secrets
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import (Banner, Brand, Notification, Category, Color, Discount, DiscountType, Gender, MovementReason, Order,
                        OrderItem, OrderStatus, Payment, PaymentMethod, PaymentStatus, Product, ProductImage,
                        ProductVariant, Review, Role, Size, StoreSetting, User)
from app.security import hash_password
from app.services import images as image_svc
from app.services import inventory
from app.services.storage import get_storage
from app.services import orders as order_svc
from app.utils import money, new_order_number, slugify, utcnow

ASSETS = Path(__file__).parent / "seed_assets"
PHOTOS = json.loads((ASSETS / "photos.json").read_text(encoding="utf-8"))["photos"]
rng = random.Random(7)

# Bump when sync_catalog() learns something new; it runs once per version on existing databases.
SYNC_KEY, SYNC_VERSION = "seed_sync", 5

BRANDS = [
    ("Nike", "Performance and street icons from Beaverton."),
    ("Air Jordan", "Courtside heritage, built for the culture."),
    ("Adidas", "Three stripes. Terrace classics and modern runners."),
    ("New Balance", "Made for comfort, worn for style."),
    ("Puma", "Fast heritage with a low-profile attitude."),
    ("Converse", "The canvas icon since forever."),
    ("Vans", "Off the wall skate classics."),
    ("Asics", "Japanese running technology turned street staple."),
    ("Reebok", "British-born court and fitness classics since 1958."),
    ("Li-Ning", "China's own sportswear icon, from the Olympic podium to the street."),
]
RETIRED_BRANDS = ["IceQ Originals"]  # earlier demo label shown with generated imagery - hidden, never deleted
CATEGORIES = [
    ("Lifestyle", "ស្ទីលប្រចាំថ្ងៃ", "Everyday icons that go with everything."),
    ("Running", "រត់", "Light, cushioned and ready to move."),
    ("Basketball", "បាល់បោះ", "Court heritage and hardwood energy."),
    ("Retro", "រេត្រូ", "Archive silhouettes, back in rotation."),
    ("Skate", "ស្គេត", "Grip, durability, board feel."),
]
COLORS = [("White", "#F7F7F5"), ("Black", "#151517"), ("Grey", "#9EA3A8"), ("Navy", "#1F2A44"), ("Red", "#C8102E"),
          ("Green", "#2F6B4F"), ("Cream", "#EFE6D2"), ("Brown", "#6B4A35"), ("Ice Blue", "#A9DDF3"), ("Pink", "#F2B8C6"),
          ("Sand", "#D8C3A0"), ("Orange", "#E86A2C"), ("Mustard", "#C99A2E"), ("Blue", "#2C5BA8")]
SIZES = ["36", "37", "38", "39", "40", "40.5", "41", "42", "42.5", "43", "44", "45", "46"]

# name, brand, category, gender, price, sale, flags, colourways (photographed first), description EN, KM
P = [
    ("Air Force 1 '07", "Nike", "Lifestyle", "unisex", 115, None, "fb", ["White", "Black"],
     "The hoops original turned street uniform. Clean leather-look upper and a chunky cupsole that goes with everything.",
     "ស្បែកជើងបាល់បោះដើម ដែលក្លាយជាឯកសណ្ឋានតាមផ្លូវ។ ផ្នែកខាងលើរចនាបែបស្បែកស្អាតរលូន និងបាតក្រាស់ ពាក់ជាមួយអ្វីក៏សមដែរ។"),
    ("Dunk Low Retro", "Nike", "Retro", "unisex", 115, 99, "tn", ["Black", "Green", "Grey"],
     "Eighties college-court energy in a low-cut profile. Colour-blocked panels and an easy, everyday fit.",
     "ថាមពលទីលានបាល់បោះមហាវិទ្យាល័យទសវត្សរ៍ទី៨០ ក្នុងរាងទាប។ បន្ទះពណ៌ផ្ទុយគ្នា និងសមល្អសម្រាប់ពាក់ប្រចាំថ្ងៃ។"),
    ("Air Max 90", "Nike", "Lifestyle", "men", 135, None, "f", ["Grey", "White", "Red"],
     "Visible cushioning and layered panels from the running archive, refined for daily wear.",
     "ខ្នើយដែលមើលឃើញ និងបន្ទះជាន់គ្នាពីបណ្ណសារស្បែកជើងរត់ ត្រូវបានកែលម្អសម្រាប់ពាក់ប្រចាំថ្ងៃ។"),
    ("Air Zoom Pegasus", "Nike", "Running", "unisex", 140, 119, "n", ["Black", "Ice Blue"],
     "A dependable daily trainer for easy miles and city runs.",
     "ស្បែកជើងហាត់ប្រាណប្រចាំថ្ងៃដែលអាចទុកចិត្តបាន សម្រាប់ការរត់ស្រាលៗ និងរត់ក្នុងទីក្រុង។"),
    ("Air Jordan 1 Low", "Air Jordan", "Basketball", "unisex", 125, None, "bt", ["Red", "Black"],
     "The silhouette that started it all, cut low for an easy everyday fit.",
     "រាងដែលចាប់ផ្តើមអ្វីៗទាំងអស់ ក្នុងកម្ពស់ទាប ងាយស្រួលពាក់ប្រចាំថ្ងៃ។"),
    ("Air Jordan 1 High", "Air Jordan", "Basketball", "unisex", 180, None, "nt", ["Blue", "Red"],
     "The original high-top that changed basketball and sneaker culture for good.",
     "ស្បែកជើងកម្ពស់ខ្ពស់ដើម ដែលបានផ្លាស់ប្តូរវប្បធម៌បាល់បោះ និងស្បែកជើងប៉ាតាជារៀងរហូត។"),
    ("Air Jordan 4 Retro", "Air Jordan", "Basketball", "men", 215, None, "ft", ["White", "Red", "Black"],
     "A collector favourite with structured support details and statement presence.",
     "ស្បែកជើងដែលអ្នកប្រមូលចូលចិត្ត មានព័ត៌មានលម្អិតទ្រទ្រង់ច្បាស់លាស់ និងរូបរាងលេចធ្លោ។"),
    ("Samba OG", "Adidas", "Retro", "unisex", 100, None, "bft", ["White", "Green", "Navy", "Black"],
     "Born for indoor football, adopted by the street. Slim profile, gum-style sole.",
     "កើតឡើងសម្រាប់បាល់ទាត់ក្នុងផ្ទះ ហើយត្រូវបានទទួលយកដោយតាមផ្លូវ។ រាងស្តើង និងបាតពណ៌ជ័រ។"),
    ("Campus 00s", "Adidas", "Lifestyle", "unisex", 110, None, "n", ["Mustard"],
     "A chunky take on the eighties campus icon, with a soft suede-look upper and a thick rubber-look sole.",
     "ការរចនាបែបក្រាស់នៃស្បែកជើងសាលាទសវត្សរ៍ទី៨០ ជាមួយផ្នែកខាងលើបែបស្វេដទន់ និងបាតក្រាស់។"),
    ("Gazelle", "Adidas", "Retro", "women", 100, 85, "n", ["Black", "Navy", "Pink"],
     "Soft suede-look upper and a low, easy shape that pairs with everything.",
     "ផ្នែកខាងលើបែបស្វេដទន់ និងរាងទាបងាយស្រួល ដែលសមនឹងសម្លៀកបំពាក់គ្រប់បែប។"),
    ("Ultraboost", "Adidas", "Running", "unisex", 190, 159, "n", ["Black", "White"],
     "Energetic cushioning for long days on foot and comfortable runs.",
     "ខ្នើយផ្តល់ថាមពល សម្រាប់ថ្ងៃដែលឈរដើរយូរ និងការរត់ប្រកបដោយផាសុកភាព។"),
    ("Forum Low", "Adidas", "Basketball", "unisex", 110, None, "", ["Blue", "White"],
     "Eighties basketball heritage with the signature ankle strap detail.",
     "មរតកបាល់បោះទសវត្សរ៍ទី៨០ ជាមួយខ្សែរឹតកជើងដែលជាសញ្ញាសម្គាល់។"),
    ("550", "New Balance", "Basketball", "unisex", 110, None, "bt", ["Green", "Blue", "White"],
     "A late-eighties court shoe brought back with clean, low-key styling.",
     "ស្បែកជើងទីលានចុងទសវត្សរ៍ទី៨០ ដែលត្រលប់មកវិញជាមួយរចនាបថស្អាត និងសាមញ្ញ។"),
    ("530", "New Balance", "Running", "women", 100, None, "fn", ["White", "Cream", "Grey"],
     "Retro running lines with a chunky, comfortable sole.",
     "ខ្សែបន្ទាត់ស្បែកជើងរត់បែបរេត្រូ ជាមួយបាតក្រាស់ និងផាសុកភាព។"),
    ("9060", "New Balance", "Lifestyle", "men", 150, 129, "t", ["White", "Grey", "Sand"],
     "Futuristic layered design with a sculpted, wavy sole.",
     "ការរចនាជាន់គ្នាបែបអនាគត ជាមួយបាតរាងរលកដែលឆ្លាក់យ៉ាងស្អាត។"),
    ("Suede Classic", "Puma", "Retro", "unisex", 75, 59, "", ["Red", "Black", "Navy"],
     "A b-boy and terrace staple with a soft suede-look upper.",
     "ស្បែកជើងដ៏សំខាន់សម្រាប់ b-boy និងអ្នកគាំទ្របាល់ទាត់ ជាមួយផ្នែកខាងលើបែបស្វេដទន់។"),
    ("Palermo", "Puma", "Lifestyle", "women", 90, None, "n", ["Green", "Cream"],
     "Terrace-inspired low profile with a gum-tone sole.",
     "រាងទាបដែលបំផុសគំនិតពីកីឡដ្ឋាន ជាមួយបាតពណ៌ជ័រ។"),
    ("Chuck 70 Hi", "Converse", "Lifestyle", "unisex", 90, None, "b", ["Black", "Cream"],
     "Premium take on the canvas high-top with a vintage-inspired sole.",
     "កំណែពិសេសនៃស្បែកជើងក្រណាត់កម្ពស់ខ្ពស់ ជាមួយបាតដែលបំផុសគំនិតពីបែបបុរាណ។"),
    ("Chuck Taylor All Star Low", "Converse", "Lifestyle", "kids", 55, None, "", ["White", "Red"],
     "The timeless low-top canvas sneaker, sized for kids.",
     "ស្បែកជើងក្រណាត់កម្ពស់ទាបដែលមិនចេះហួសសម័យ មានទំហំសម្រាប់កុមារ។"),
    ("Old Skool", "Vans", "Skate", "unisex", 70, None, "b", ["Black", "Navy"],
     "Skate classic with the iconic side stripe and durable construction.",
     "ស្បែកជើងស្គេតបុរាណ ជាមួយឆ្នូតចំហៀងដ៏ល្បី និងការផលិតរឹងមាំ។"),
    ("Gel-Kayano 14", "Asics", "Running", "unisex", 150, None, "nt", ["White", "Grey"],
     "Late-2000s running tech DNA, reworked as a sought-after lifestyle runner.",
     "DNA បច្ចេកវិទ្យាស្បែកជើងរត់ពីចុងទសវត្សរ៍ ២០០០ ដែលត្រូវបានរចនាឡើងវិញជាស្បែកជើងប្រចាំថ្ងៃដ៏ពេញនិយម។"),
    ("Club C 85", "Reebok", "Lifestyle", "unisex", 80, None, "n", ["White"],
     "The clean, low-profile court classic from 1985: soft leather-look upper, perforated toe and a cushioned cupsole.",
     "ស្បែកជើងទីលានបុរាណឆ្នាំ ១៩៨៥ រាងទាប ស្អាតរលូន៖ ផ្នែកខាងលើបែបស្បែកទន់ ក្បាលមានរន្ធខ្យល់ និងបាតទ្រទ្រង់ផាសុកភាព។"),
    ("Knit Runner", "Li-Ning", "Running", "unisex", 75, None, "n", ["Grey"],
     "A lightweight everyday running shoe with a breathable knit upper and a soft, cushioned midsole.",
     "ស្បែកជើងរត់ប្រចាំថ្ងៃស្រាល ជាមួយផ្នែកខាងលើត្បាញដែលខ្យល់ចេញចូលបានល្អ និងបាតកណ្តាលទន់ផាសុកភាព។"),
]
FLAG = {"f": "is_featured", "b": "is_best_seller", "n": "is_new_arrival", "t": "is_trending"}
LEGACY_SLUGS = {"air-jordan-1-low": ["air-jordan-1-mid"],
                # renamed to the model family: the verified photos do not show the exact version
                "nike-air-zoom-pegasus": ["nike-pegasus-41"], "adidas-ultraboost": ["adidas-ultraboost-5"]}  # renamed: the verified photos show the Low

REVIEWS = [
    ("Sokha P.", 5, "Fits true to size", "Ordered on Monday, delivered in Phnom Penh the next day. Packaging was perfect."),
    ("Dara K.", 5, "Exactly as shown", "Paid with KHQR, confirmation came fast. Will order again."),
    ("Bopha L.", 4, "Super comfy", "Comfortable from day one. Delivery to Siem Reap took two days."),
    ("Vichea S.", 5, "Great service", "They helped me pick the right size on Telegram. Legit store."),
    ("Mealea C.", 5, "Love the colour", "Even better in person. The box arrived in perfect condition."),
    ("Rithy N.", 4, "Solid pair", "Good quality and fair price. Cash on delivery made it easy."),
]

BANNERS = {
    "hero": dict(placement="hero", sort_order=0, photo="banner:hero", cta_link="/shop", theme="dark",
                 eyebrow="New season · 2026", title="Stay cold.\nWalk loud.",
                 subtitle="Authentic sneakers from the brands you love, fresh drops weekly — delivered across Cambodia.",
                 cta_label="Shop now", eyebrow_km="រដូវកាលថ្មី · ២០២៦", title_km="ត្រជាក់ចិត្ត។\nដើរឲ្យលេចធ្លោ។",
                 subtitle_km="ស្បែកជើងប៉ាតាពិតប្រាកដពីម៉ាកដែលអ្នកស្រឡាញ់ ម៉ូដថ្មីរៀងរាល់សប្តាហ៍ — ដឹកជញ្ជូនទូទាំងកម្ពុជា។",
                 cta_label_km="ទិញឥឡូវ"),
    "promo": dict(placement="promo", sort_order=0, photo="banner:promo", cta_link="/shop?on_sale=true", theme="dark",
                  eyebrow="Limited offer", title="Winter drop — 20% off", subtitle="Use code FREEZE20 on orders over $120.",
                  cta_label="Shop the sale", eyebrow_km="ការផ្តល់ជូនមានកំណត់", title_km="បញ្ចុះតម្លៃ ២០% រដូវរងា",
                  subtitle_km="ប្រើកូដ FREEZE20 សម្រាប់ការបញ្ជាទិញលើស $120។", cta_label_km="ទិញទំនិញបញ្ចុះតម្លៃ"),
}


def credit(photo: dict) -> str:
    return f"{photo['credit']} / {photo.get('site', 'Unsplash')}"


def photos_for(target: str, color: str | None = None) -> list[dict]:
    return [p for p in PHOTOS if p["target"] == target and (color is None or p["color"] == color)]


def full_name(name: str, brand: str) -> str:
    return name if brand == "Air Jordan" else f"{brand} {name}"


def ensure_taxonomy(db):
    """Create missing brands / categories / colours / sizes (never renames or deletes)."""
    def upsert(model, key, value, **fields):
        row = db.query(model).filter(getattr(model, key) == value).first()
        if not row:
            row = model(**{key: value}, **fields)
            db.add(row)
        return row
    brands = {n: upsert(Brand, "name", n, slug=slugify(n), description=d, sort_order=i) for i, (n, d) in enumerate(BRANDS)}
    cats = {}
    for i, (n, km, d) in enumerate(CATEGORIES):
        c = upsert(Category, "name", n, slug=slugify(n), description=d, sort_order=i)
        c.name_km = c.name_km or km
        cats[n] = c
    colors = {n: upsert(Color, "name", n, hex=h, sort_order=i) for i, (n, h) in enumerate(COLORS)}
    sizes = {s: upsert(Size, "label", s, system="EU", sort_order=i) for i, s in enumerate(SIZES)}
    db.flush()
    return brands, cats, colors, sizes


def add_colourway(db, p: Product, color: Color, gender: str, sizes: dict, admin) -> None:
    size_range = SIZES[0:8] if gender == "women" else SIZES[2:12] if gender != "kids" else SIZES[0:6]
    for s in size_range:
        sku = f"IQ-{p.id:04d}-{slugify(color.name)[:6].upper()}-{s.replace('.', '')}"
        if db.query(ProductVariant).filter(ProductVariant.sku == sku).first():
            continue
        v = ProductVariant(product_id=p.id, color_id=color.id, size_id=sizes[s].id, sku=sku, stock=0, reserved=0)
        db.add(v)
        db.flush()
        qty = rng.choice([2, 4, 5, 6, 6, 8, 8, 10, 12, 15]) if rng.random() > 0.05 else 0
        if qty:
            inventory.adjust(db, v, set_to=qty, reason=MovementReason.initial, note="Seed stock",
                             user_id=admin.id if admin else None)


def add_photos(db, p: Product, color: Color, slug: str) -> int:
    added = 0
    for n, ph in enumerate(photos_for(slug, color.name)):
        s = image_svc.store_image((ASSETS / ph["file"]).read_bytes(), f"products/{p.id}")
        db.add(ProductImage(product_id=p.id, color_id=color.id, url=s.url, storage_key=s.key, provider=s.provider,
                            renditions=s.renditions, width=s.width, height=s.height, credit=credit(ph),
                            alt=f"{p.name} in {color.name}" + ("" if n == 0 else f", view {n + 1}"),
                            sort_order=1000 + n, is_primary=False))
        added += 1
    return added


def reorder_images(p: Product, colour_order: list[int]) -> None:
    rank = {cid: i for i, cid in enumerate(colour_order)}
    imgs = sorted(p.images, key=lambda i: (rank.get(i.color_id, len(rank)), i.sort_order, i.id or 0))
    for n, im in enumerate(imgs):
        im.sort_order, im.is_primary = n, n == 0


def seed_catalog(db) -> None:
    """Fresh database only: base taxonomy. Products, photos and banners come from sync_catalog()."""
    if db.query(Product).first():
        return
    ensure_taxonomy(db)
    db.commit()
    print("Created brands, categories, colours and sizes")


def sync_catalog(db, force: bool = False) -> None:
    """Bring a demo catalogue up to date without losing data. Runs once per SYNC_VERSION.

    - removes the old illustrated SVG placeholders
    - adds missing demo products / colourways (renames Air Jordan 1 Mid -> Low, whose photos show the Low)
    - attaches verified photos (with credits) to colourways that have none yet
    - Khmer descriptions / category names, real banner + category photography
    - hides the retired in-house demo label (its imagery was generated)
    Orders, customers, stock levels and anything an admin uploaded are left alone.
    """
    flag = db.get(StoreSetting, SYNC_KEY)
    done = (flag.value or {}).get("version", 0) if flag else 0
    if done >= SYNC_VERSION and not force:
        return
    brands, cats, colors, sizes = ensure_taxonomy(db)
    admin = db.query(User).filter(User.role == Role.admin).first()

    svgs = db.query(ProductImage).filter(ProductImage.url.like("%.svg")).all()
    for img in svgs:
        image_svc.delete_stored(img.storage_key, img.renditions)
        db.delete(img)
    db.flush()

    created = photos = 0
    for idx, (name, brand, cat, gender, price, sale, flags, colourways, desc, desc_km) in enumerate(P):
        full = full_name(name, brand)
        slug = slugify(full)
        p = db.query(Product).filter(Product.slug.in_([slug, *LEGACY_SLUGS.get(slug, [])])).first()
        if not p:
            p = Product(name=full, slug=slug, model=name, description=desc, gender=Gender(gender),
                        price=Decimal(price), sale_price=Decimal(sale) if sale else None,
                        brand_id=brands[brand].id, category_id=cats[cat].id, **{FLAG[ch]: True for ch in flags})
            p.created_at = utcnow() - timedelta(days=60 - idx * 2)
            db.add(p)
            created += 1
        elif p.slug != slug:
            p.name, p.slug, p.model, p.description = full, slug, name, desc
        p.description_km = p.description_km or desc_km
        db.flush()
        have = {v.color_id for v in p.variants}
        for c in colourways:
            if colors[c].id not in have:
                add_colourway(db, p, colors[c], gender, sizes, admin)
        db.flush()
        db.refresh(p)
        photographed = {i.color_id for i in p.images}
        for c in colourways:
            if colors[c].id not in photographed:
                photos += add_photos(db, p, colors[c], slug)
        db.flush()
        db.refresh(p)
        reorder_images(p, [colors[c].id for c in colourways])

    for bname in RETIRED_BRANDS:
        b = db.query(Brand).filter(Brand.name == bname).first()
        if b:
            b.is_active = False
            for prod in db.query(Product).filter(Product.brand_id == b.id):
                prod.is_active = False

    for c in cats.values() if done < 1 or force else []:  # once; later admin uploads stay
        ph = photos_for(f"cat:{c.slug}")
        if ph:
            if c.image_key:
                image_svc.delete_stored(c.image_key)
            s = image_svc.store_image((ASSETS / ph[0]["file"]).read_bytes(), "categories", widths=(480, 1200))
            c.image_url, c.image_key = s.url, s.key

    # v2: a model without a single verified photo is hidden until real photography is uploaded
    # (Dashboard -> Products -> Needs photo, then switch it back to visible)
    hidden = []
    if done < 2:
        for spec in P:
            prod = db.query(Product).filter(Product.slug == slugify(full_name(spec[0], spec[1]))).first()
            if prod and not prod.images and prod.is_active:
                prod.is_active = False
                hidden.append(prod.slug)

    # v3: brand logos (one-colour SVG marks: Simple Icons, CC0; Wikimedia Commons, PD-textlogo) for
    # brands that have no logo yet - an admin's own upload is never replaced
    logos = 0
    if done < 4:
        for b in brands.values():
            svg = ASSETS / "brands" / f"{b.slug}.svg"
            if svg.exists() and not b.logo_url:
                key = f"brands/{b.slug}.svg"
                b.logo_url, b.logo_key = get_storage().put(key, svg.read_bytes(), "image/svg+xml"), key
                logos += 1

    if 0 < done < 5:
        for slug in ("nike-air-zoom-pegasus", "adidas-ultraboost"):
            prod = db.query(Product).filter(Product.slug == slug).first()
            if prod and prod.images and not prod.is_active:
                prod.is_active = True

    sync_banners(db)
    if flag:
        flag.value = {"version": SYNC_VERSION}
    else:
        db.add(StoreSetting(key=SYNC_KEY, value={"version": SYNC_VERSION}))
    db.commit()
    print(f"Catalogue sync v{SYNC_VERSION}: removed {len(svgs)} illustrations, added {created} products and {photos} photos"
          + (f", hid {len(hidden)} products without photos" if hidden else "")
          + (f", added {logos} brand logos" if logos else ""))


def _set_banner_photo(db, b: Banner, spec: dict) -> None:
    ph = photos_for(spec["photo"])[0]
    image_svc.delete_stored(b.image_key) if b.image_key else None
    image_svc.delete_stored(b.mobile_image_key) if b.mobile_image_key else None
    s = image_svc.store_image((ASSETS / ph["file"]).read_bytes(), "banners", widths=image_svc.BANNER_WIDTHS)
    b.image_url, b.image_key, b.mobile_image_url, b.mobile_image_key = s.url, s.key, None, None
    b.image_credit = credit(ph)
    for k, v in spec.items():
        if k.endswith("_km") and not getattr(b, k):
            setattr(b, k, v)


def sync_banners(db) -> None:
    """Swap the old generated banner art for credited photography; banners an admin made are untouched."""
    for b in db.query(Banner).filter(Banner.image_credit == "").all():
        if "glacier" in (b.cta_link or "") or "originals" in (b.image_url or ""):
            b.is_active = False  # pointed at the retired in-house label
        elif b.placement in BANNERS and b.title in (BANNERS[b.placement]["title"], "Stay cold.\nWalk loud."):
            _set_banner_photo(db, b, BANNERS[b.placement])
    for key, spec in BANNERS.items():
        if not db.query(Banner).filter(Banner.placement == key, Banner.is_active.is_(True)).first():
            b = Banner(**{k: v for k, v in spec.items() if k != "photo"})
            db.add(b)
            _set_banner_photo(db, b, spec)
    db.flush()


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
    ap.add_argument("--sync", action="store_true", help="re-run the catalogue/photo sync even if already applied")
    ap.add_argument("--if-env", action="store_true",
                    help="only run when SEED_DEMO_CATALOG=true (start-up hook for hosts without a shell)")
    args = ap.parse_args()
    if args.if_env:
        import os
        if os.environ.get("SEED_DEMO_CATALOG", "").lower() != "true":
            return
        args.reset = args.demo_orders = False  # never wipe data or invent orders in production
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
        sync_catalog(db, force=args.sync)
        seed_marketing(db)
        seed_reviews(db)
        if args.demo_orders:
            seed_demo_orders(db)
    finally:
        db.close()
    print("Done.")


if __name__ == "__main__":
    main()
