from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
from database import Base, engine, get_db

# Create the database tables (if they don't exist yet)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="IceQ Sole API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "shop": "IceQ Sole"}


# Temporary test endpoints - in Step 4 we replace these with full product APIs
@app.get("/api/brands")
def list_brands(db: Session = Depends(get_db)):
    return [{"id": b.id, "name": b.name, "slug": b.slug} for b in db.query(models.Brand).all()]


@app.get("/api/test-products")
def test_products(db: Session = Depends(get_db)):
    result = []
    for p in db.query(models.Product).all():
        result.append({
            "name": p.name,
            "brand": p.brand.name,
            "price": float(p.price),
            "sale_price": float(p.sale_price) if p.sale_price else None,
            "colors": sorted({v.color for v in p.variants}),
            "sizes": sorted({v.size for v in p.variants}, key=float),
            "total_stock": sum(v.stock for v in p.variants),
        })
    return result