from datetime import datetime
from decimal import Decimal

from sqlalchemy import (Boolean, DateTime, ForeignKey, Integer, Numeric,
                        String, Text, UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Brand(Base):
    """Nike, Adidas, Puma, Converse..."""
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(255))

    products: Mapped[list["Product"]] = relationship(back_populates="brand")


class Category(Base):
    """Running, Basketball, Lifestyle, Kids..."""
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    """One shoe model, e.g. 'Nike Air Force 1 '07'."""
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    slug: Mapped[str] = mapped_column(String(170), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    gender: Mapped[str] = mapped_column(String(10), default="unisex")  # men / women / unisex / kids
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))             # normal price in USD
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # discount price (optional)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)      # show in shop?
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)   # show on home page?
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))

    brand: Mapped["Brand"] = relationship(back_populates="products")
    category: Mapped["Category"] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan")
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan",
        order_by="ProductImage.sort_order")


class ProductVariant(Base):
    """One color + one size of a shoe, with its own stock.
    Example: Air Force 1 / White / EU 42 / 3 pairs in stock."""
    __tablename__ = "product_variants"
    __table_args__ = (UniqueConstraint("product_id", "color", "size"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    color: Mapped[str] = mapped_column(String(40))
    size: Mapped[str] = mapped_column(String(10))   # EU size, e.g. "42" or "42.5"
    sku: Mapped[str] = mapped_column(String(60), unique=True)
    stock: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped["Product"] = relationship(back_populates="variants")


class ProductImage(Base):
    """Photos of a shoe. 'color' links a photo to one colorway (optional)."""
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(255))
    color: Mapped[str | None] = mapped_column(String(40))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped["Product"] = relationship(back_populates="images")


class User(Base):
    """People who can log in to the dashboard (you, and later your staff)."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="admin")  # admin / staff
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())