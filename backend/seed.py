"""Fill the database with starter data. Run once:  python seed.py"""
from decimal import Decimal

from database import Base, SessionLocal, engine
from models import Brand, Category, Product, ProductImage, ProductVariant

Base.metadata.create_all(bind=engine)
db = SessionLocal()

if db.query(Brand).count() > 0:
    print("Database already has data - nothing to do.")
    db.close()
    raise SystemExit

# Brands
brands = {}
for name in ["Nike", "Adidas", "Puma", "Converse", "New Balance", "Vans"]:
    b = Brand(name=name, slug=name.lower().replace(" ", "-"))
    db.add(b)
    brands[name] = b

# Categories
cats = {}
for name in ["Running", "Basketball", "Lifestyle", "Skateboarding", "Kids"]:
    c = Category(name=name, slug=name.lower())
    db.add(c)
    cats[name] = c

# Sample products: (name, brand, category, gender, price, sale_price, colors, sizes)
samples = [
    ("Nike Air Force 1 '07", "Nike", "Lifestyle", "unisex", "115.00", None,
     ["White", "Black"], ["39", "40", "41", "42", "43", "44"]),
    ("Adidas Samba OG", "Adidas", "Lifestyle", "unisex", "100.00", "89.00",
     ["White/Black", "Black/Gum"], ["38", "39", "40", "41", "42", "43"]),
    ("Puma Suede Classic", "Puma", "Lifestyle", "men", "75.00", None,
     ["Red", "Navy"], ["40", "41", "42", "43", "44"]),
    ("Converse Chuck Taylor All Star", "Converse", "Lifestyle", "unisex", "65.00", None,
     ["Black", "White"], ["36", "37", "38", "39", "40", "41", "42"]),
]

for name, brand, cat, gender, price, sale, colors, sizes in samples:
    p = Product(
        name=name,
        slug=name.lower().replace("'", "").replace(" ", "-"),
        description=f"Original {name}.",
        gender=gender,
        price=Decimal(price),
        sale_price=Decimal(sale) if sale else None,
        is_featured=True,
        brand=brands[brand],
        category=cats[cat],
    )
    for color in colors:
        p.images.append(ProductImage(
            url=f"https://placehold.co/600x600?text={name.split()[0]}+{color}",
            color=color))
        for size in sizes:
            sku = f"{p.slug[:12]}-{color[:3]}-{size}".upper()
            p.variants.append(ProductVariant(color=color, size=size, sku=sku, stock=5))
    db.add(p)

db.commit()
print(f"Done! {db.query(Brand).count()} brands, {db.query(Category).count()} categories, "
      f"{db.query(Product).count()} products, {db.query(ProductVariant).count()} size/color variants.")
db.close()