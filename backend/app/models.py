"""IceQ Sole database models (SQLAlchemy 2.0).

Money is stored as Numeric(12, 2) in USD. Timestamps are stored in UTC.
Each product variant is ONE colour + ONE size and owns its own stock.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (JSON, BigInteger, Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer,
                        Numeric, String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


Money = Numeric(12, 2)


def _enum(e: type[enum.Enum], name: str):
    return Enum(e, name=name, native_enum=False, length=32, validate_strings=True,
                values_callable=lambda x: [m.value for m in x])


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ---------------------------------------------------------------- enums
class Role(str, enum.Enum):
    customer = "customer"
    cashier = "cashier"            # shop counter: Point of sale only
    staff = "staff"
    admin = "admin"


class Gender(str, enum.Enum):
    men = "men"
    women = "women"
    unisex = "unisex"
    kids = "kids"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    processing = "processing"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"
    refunded = "refunded"


class PaymentMethod(str, enum.Enum):
    khqr = "khqr"
    bank_transfer = "bank_transfer"
    cod = "cod"
    cash = "cash"                  # in-store (POS) only - never offered at online checkout


class PaymentStatus(str, enum.Enum):
    unpaid = "unpaid"              # nothing received yet
    submitted = "submitted"        # customer submitted reference / screenshot, waiting for admin
    paid = "paid"                  # verified (by gateway or admin)
    failed = "failed"              # rejected by admin / gateway
    refunded = "refunded"


class DiscountType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"


class MovementReason(str, enum.Enum):
    initial = "initial"
    adjustment = "adjustment"
    restock = "restock"
    order_reserved = "order_reserved"
    order_confirmed = "order_confirmed"
    order_released = "order_released"
    order_restored = "order_restored"
    damaged = "damaged"
    returned = "returned"


# ---------------------------------------------------------------- users
class User(TimestampMixin, Base):
    """Customers, staff and admins share one table; `role` decides permissions."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    role: Mapped[Role] = mapped_column(_enum(Role, "role"), default=Role.customer, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_version: Mapped[int] = mapped_column(Integer, default=0)  # bump to revoke all sessions
    locale: Mapped[str] = mapped_column(String(5), default="en", server_default="en")
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # social sign-in (services/social.py); empty password_hash = no password set yet
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)

    addresses: Mapped[list[Address]] = relationship(back_populates="user", cascade="all, delete-orphan")
    orders: Mapped[list[Order]] = relationship(back_populates="user")
    wishlist: Mapped[list[WishlistItem]] = relationship(back_populates="user", cascade="all, delete-orphan")

    @property
    def is_staff(self) -> bool:
        return self.role in (Role.staff, Role.admin)

    @property
    def can_use_dashboard(self) -> bool:
        return self.role in (Role.cashier, Role.staff, Role.admin)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PasswordResetToken(Base):
    """Single-use password reset token. Only a SHA-256 hash is stored."""
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Address(TimestampMixin, Base):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(40), default="Home")
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20))
    province: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(80), default="")
    address_line: Mapped[str] = mapped_column(String(255))
    note: Mapped[str] = mapped_column(String(255), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="addresses")


# ---------------------------------------------------------------- catalog
class Brand(TimestampMixin, Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    logo_url: Mapped[str | None] = mapped_column(String(500))
    logo_key: Mapped[str | None] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    products: Mapped[list[Product]] = relationship(back_populates="brand")


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    name_km: Mapped[str] = mapped_column(String(80), default="", server_default="")
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(500))
    image_key: Mapped[str | None] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    products: Mapped[list[Product]] = relationship(back_populates="category")


class Color(Base):
    __tablename__ = "colors"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    hex: Mapped[str] = mapped_column(String(7), default="#000000")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Size(Base):
    __tablename__ = "sizes"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(12), unique=True)  # "EU 42" style label is built in UI
    system: Mapped[str] = mapped_column(String(8), default="EU")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_product_price"),
        CheckConstraint("sale_price IS NULL OR sale_price >= 0", name="ck_product_sale_price"),
        Index("ix_products_flags", "is_active", "is_featured", "is_best_seller", "is_new_arrival"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    name_km: Mapped[str] = mapped_column(String(200), default="", server_default="")
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    model: Mapped[str] = mapped_column(String(120), default="")  # manufacturer style code / model name
    description: Mapped[str] = mapped_column(Text, default="")
    description_km: Mapped[str] = mapped_column(Text, default="", server_default="")
    gender: Mapped[Gender] = mapped_column(_enum(Gender, "gender"), default=Gender.unisex, index=True)
    price: Mapped[Decimal] = mapped_column(Money)
    sale_price: Mapped[Decimal | None] = mapped_column(Money)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="RESTRICT"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_best_seller: Mapped[bool] = mapped_column(Boolean, default=False)
    is_new_arrival: Mapped[bool] = mapped_column(Boolean, default=False)
    is_trending: Mapped[bool] = mapped_column(Boolean, default=False)
    sold_count: Mapped[int] = mapped_column(Integer, default=0)
    rating_avg: Mapped[float] = mapped_column(Numeric(3, 2), default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)

    brand: Mapped[Brand] = relationship(back_populates="products", lazy="joined")
    category: Mapped[Category] = relationship(back_populates="products", lazy="joined")
    variants: Mapped[list[ProductVariant]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductVariant.id")
    images: Mapped[list[ProductImage]] = relationship(
        back_populates="product", cascade="all, delete-orphan",
        order_by="(ProductImage.is_primary.desc(), ProductImage.sort_order, ProductImage.id)")
    reviews: Mapped[list[Review]] = relationship(back_populates="product", cascade="all, delete-orphan")

    @property
    def effective_price(self) -> Decimal:
        if self.sale_price is not None and self.sale_price < self.price:
            return self.sale_price
        return self.price


class ProductImage(Base):
    """Image metadata only — the binary lives in cloud/local storage."""
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    color_id: Mapped[int | None] = mapped_column(ForeignKey("colors.id", ondelete="SET NULL"))
    url: Mapped[str] = mapped_column(String(500))
    storage_key: Mapped[str | None] = mapped_column(String(300))      # main object key
    provider: Mapped[str] = mapped_column(String(20), default="local")
    renditions: Mapped[dict] = mapped_column(JSON, default=dict)       # {"400": {"url":..,"key":..}, ...}
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    alt: Mapped[str] = mapped_column(String(200), default="")
    credit: Mapped[str] = mapped_column(String(300), default="", server_default="")  # photographer / licence
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product] = relationship(back_populates="images")
    color: Mapped[Color | None] = relationship(lazy="joined")


class ProductVariant(Base):
    """One colour + one size of a product, with its own stock.

    stock    = pairs physically on the shelf
    reserved = pairs held by pending (not yet confirmed) orders
    available to sell = stock - reserved
    """
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("product_id", "color_id", "size_id", name="uq_variant_combo"),
        CheckConstraint("stock >= 0", name="ck_variant_stock"),
        CheckConstraint("reserved >= 0", name="ck_variant_reserved"),
        CheckConstraint("reserved <= stock", name="ck_variant_reserved_le_stock"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    color_id: Mapped[int] = mapped_column(ForeignKey("colors.id", ondelete="RESTRICT"), index=True)
    size_id: Mapped[int] = mapped_column(ForeignKey("sizes.id", ondelete="RESTRICT"), index=True)
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    price_override: Mapped[Decimal | None] = mapped_column(Money)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped[Product] = relationship(back_populates="variants")
    color: Mapped[Color] = relationship(lazy="joined")
    size: Mapped[Size] = relationship(lazy="joined")

    @property
    def available(self) -> int:
        return max(0, (self.stock or 0) - (self.reserved or 0))


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"), index=True)
    change: Mapped[int] = mapped_column(Integer)            # +/- on physical stock
    reserved_change: Mapped[int] = mapped_column(Integer, default=0)
    stock_after: Mapped[int] = mapped_column(Integer)
    reason: Mapped[MovementReason] = mapped_column(_enum(MovementReason, "movement_reason"), index=True)
    reference: Mapped[str] = mapped_column(String(60), default="")  # e.g. order number
    note: Mapped[str] = mapped_column(String(255), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    variant: Mapped[ProductVariant] = relationship(lazy="joined")
    user: Mapped[User | None] = relationship()


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author_name: Mapped[str] = mapped_column(String(80))
    rating: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(120), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)   # show on homepage
    verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False)

    product: Mapped[Product] = relationship(back_populates="reviews")


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_wishlist"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="wishlist")
    product: Mapped[Product] = relationship()


# ---------------------------------------------------------------- cart
class Cart(TimestampMixin, Base):
    """Persistent cart. Guests are identified by an opaque token, users by user_id."""
    __tablename__ = "carts"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    discount_code: Mapped[str | None] = mapped_column(String(40))

    items: Mapped[list[CartItem]] = relationship(back_populates="cart", cascade="all, delete-orphan",
                                                 order_by="CartItem.id")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("cart_id", "variant_id", name="uq_cart_variant"),
                      CheckConstraint("quantity > 0", name="ck_cart_qty"))

    id: Mapped[int] = mapped_column(primary_key=True)
    cart_id: Mapped[int] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    cart: Mapped[Cart] = relationship(back_populates="items")
    variant: Mapped[ProductVariant] = relationship(lazy="joined")


# ---------------------------------------------------------------- marketing
class Discount(TimestampMixin, Base):
    __tablename__ = "discounts"
    __table_args__ = (CheckConstraint("value > 0", name="ck_discount_value"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(200), default="")
    type: Mapped[DiscountType] = mapped_column(_enum(DiscountType, "discount_type"))
    value: Mapped[Decimal] = mapped_column(Money)
    min_subtotal: Mapped[Decimal] = mapped_column(Money, default=0)
    max_discount: Mapped[Decimal | None] = mapped_column(Money)   # cap for percent codes
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Banner(TimestampMixin, Base):
    __tablename__ = "banners"

    id: Mapped[int] = mapped_column(primary_key=True)
    placement: Mapped[str] = mapped_column(String(20), default="hero", index=True)  # hero | promo | category
    eyebrow: Mapped[str] = mapped_column(String(60), default="")
    title: Mapped[str] = mapped_column(String(120))
    subtitle: Mapped[str] = mapped_column(String(255), default="")
    cta_label: Mapped[str] = mapped_column(String(40), default="Shop now")
    eyebrow_km: Mapped[str] = mapped_column(String(80), default="", server_default="")
    title_km: Mapped[str] = mapped_column(String(160), default="", server_default="")
    subtitle_km: Mapped[str] = mapped_column(String(300), default="", server_default="")
    cta_label_km: Mapped[str] = mapped_column(String(60), default="", server_default="")
    image_credit: Mapped[str] = mapped_column(String(300), default="", server_default="")
    cta_link: Mapped[str] = mapped_column(String(255), default="/shop")
    image_url: Mapped[str] = mapped_column(String(500))
    image_key: Mapped[str | None] = mapped_column(String(300))
    mobile_image_url: Mapped[str | None] = mapped_column(String(500))
    mobile_image_key: Mapped[str | None] = mapped_column(String(300))
    theme: Mapped[str] = mapped_column(String(10), default="dark")  # text colour over the image
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- orders
class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_status_created", "status", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus, "order_status"),
                                                default=OrderStatus.pending, index=True)
    payment_method: Mapped[PaymentMethod] = mapped_column(_enum(PaymentMethod, "payment_method"))
    payment_status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus, "payment_status"),
                                                          default=PaymentStatus.unpaid, index=True)
    # customer + delivery snapshot (kept even if the account/address changes later)
    customer_name: Mapped[str] = mapped_column(String(120))
    customer_phone: Mapped[str] = mapped_column(String(20), index=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), index=True)
    province: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(80), default="")
    address_line: Mapped[str] = mapped_column(String(255))
    delivery_note: Mapped[str] = mapped_column(String(500), default="")
    # money
    subtotal: Mapped[Decimal] = mapped_column(Money)
    discount_code: Mapped[str | None] = mapped_column(String(40))
    discount_amount: Mapped[Decimal] = mapped_column(Money, default=0)
    delivery_fee: Mapped[Decimal] = mapped_column(Money, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=0)
    total: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    khr_rate: Mapped[int] = mapped_column(Integer, default=4100)
    # fulfilment
    stock_committed: Mapped[bool] = mapped_column(Boolean, default=False)  # reservation turned into deduction
    stock_released: Mapped[bool] = mapped_column(Boolean, default=False)   # reservation/stock given back
    carrier: Mapped[str] = mapped_column(String(60), default="")
    tracking_number: Mapped[str] = mapped_column(String(80), default="")
    tracking_url: Mapped[str] = mapped_column(String(300), default="")
    admin_note: Mapped[str] = mapped_column(Text, default="")
    channel: Mapped[str] = mapped_column(String(10), default="online", server_default="online", index=True)  # online | pos

    user: Mapped[User | None] = relationship(back_populates="orders")
    items: Mapped[list[OrderItem]] = relationship(back_populates="order", cascade="all, delete-orphan",
                                                  order_by="OrderItem.id")
    payments: Mapped[list[Payment]] = relationship(back_populates="order", cascade="all, delete-orphan",
                                                   order_by="Payment.id")
    history: Mapped[list[OrderStatusEvent]] = relationship(back_populates="order", cascade="all, delete-orphan",
                                                           order_by="OrderStatusEvent.id")

    @property
    def total_khr(self) -> int:
        return int(round(float(self.total) * (self.khr_rate or 4100), -2))


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_order_item_qty"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), index=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), index=True)
    product_name: Mapped[str] = mapped_column(String(160))
    brand_name: Mapped[str] = mapped_column(String(60), default="")
    product_slug: Mapped[str] = mapped_column(String(180), default="")
    color: Mapped[str] = mapped_column(String(40))
    size: Mapped[str] = mapped_column(String(12))
    sku: Mapped[str] = mapped_column(String(80))
    image_url: Mapped[str | None] = mapped_column(String(500))
    unit_price: Mapped[Decimal] = mapped_column(Money)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[Decimal] = mapped_column(Money)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusEvent(Base):
    __tablename__ = "order_status_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32))
    note: Mapped[str] = mapped_column(String(500), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    order: Mapped[Order] = relationship(back_populates="history")


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    method: Mapped[PaymentMethod] = mapped_column(_enum(PaymentMethod, "payment_method"))
    status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus, "payment_status"),
                                                  default=PaymentStatus.unpaid, index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    reference: Mapped[str] = mapped_column(String(120), default="")      # bank ref typed by customer
    proof_url: Mapped[str | None] = mapped_column(String(500))           # screenshot
    proof_key: Mapped[str | None] = mapped_column(String(300))
    khqr_payload: Mapped[str | None] = mapped_column(Text)               # EMV string shown as QR
    khqr_md5: Mapped[str | None] = mapped_column(String(32), index=True)
    gateway_response: Mapped[dict | None] = mapped_column(JSON)
    verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_source: Mapped[str] = mapped_column(String(20), default="")  # gateway | admin
    note: Mapped[str] = mapped_column(String(500), default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="payments")


# ---------------------------------------------------------------- system
class StoreSetting(Base):
    """Key/value JSON settings (store info, delivery, payments, tax, currency...)."""
    __tablename__ = "store_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Notification(Base):
    """In-app notifications. user_id NULL = for the admin team."""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(500), default="")
    link: Mapped[str] = mapped_column(String(255), default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
