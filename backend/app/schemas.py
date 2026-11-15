"""Pydantic request schemas (input validation). Responses are built in app/serializers.py."""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import DiscountType, Gender, MovementReason, OrderStatus, PaymentMethod, Role
from app.utils import CAMBODIA_PROVINCES, clean_text, normalize_kh_phone


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _phone(v: str | None) -> str | None:
    return normalize_kh_phone(v) if v else v


def _province(v: str) -> str:
    match = next((p for p in CAMBODIA_PROVINCES if p.lower() == v.strip().lower()), None)
    if not match:
        raise ValueError("Choose a valid Cambodian province / city")
    return match


# ---------------------------------------------------------------- auth
class RegisterIn(Strict):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = None
    accept_terms: bool
    locale: Literal["en", "km"] = "en"
    remember: bool = True

    _p = field_validator("phone")(lambda cls, v: _phone(v))
    _n = field_validator("full_name")(lambda cls, v: clean_text(v, 120))

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Password must contain letters and numbers")
        return v

    @model_validator(mode="after")
    def _confirm(self):
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match")
        if not self.accept_terms:
            raise ValueError("Please accept the terms and conditions")
        return self


class LoginIn(Strict):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    remember: bool = True


class ForgotPasswordIn(Strict):
    email: EmailStr


class ResetPasswordIn(Strict):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(max_length=128)

    @model_validator(mode="after")
    def _check(self):
        if not re.search(r"[A-Za-z]", self.password) or not re.search(r"\d", self.password):
            raise ValueError("Password must contain letters and numbers")
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match")
        return self


class RefreshIn(Strict):
    refresh_token: str


class ProfileIn(Strict):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None  # only used to add an email to a Telegram-only account
    phone: str | None = None
    locale: Literal["en", "km"] | None = None
    _p = field_validator("phone")(lambda cls, v: _phone(v))


class PasswordChangeIn(Strict):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Password must contain letters and numbers")
        return v


class AddressIn(Strict):
    label: str = Field(default="Home", max_length=40)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str
    province: str
    district: str = Field(default="", max_length=80)
    address_line: str = Field(min_length=3, max_length=255)
    note: str = Field(default="", max_length=255)
    is_default: bool = False

    _p = field_validator("phone")(lambda cls, v: _phone(v))
    _pr = field_validator("province")(lambda cls, v: _province(v))


# ---------------------------------------------------------------- cart / checkout
class CartAddIn(Strict):
    variant_id: int
    quantity: int = Field(default=1, ge=1, le=10)


class CartUpdateIn(Strict):
    quantity: int = Field(ge=0, le=10)


class CartDiscountIn(Strict):
    code: str = Field(min_length=1, max_length=40)


class CheckoutIn(Strict):
    idempotency_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9\-_]+$")
    full_name: str = Field(min_length=2, max_length=120)
    phone: str
    email: EmailStr | None = None
    province: str
    district: str = Field(default="", max_length=80)
    address_line: str = Field(min_length=3, max_length=255)
    delivery_note: str = Field(default="", max_length=500)
    payment_method: PaymentMethod
    discount_code: str | None = Field(default=None, max_length=40)
    save_address: bool = False

    _p = field_validator("phone")(lambda cls, v: _phone(v))
    _pr = field_validator("province")(lambda cls, v: _province(v))
    _t = field_validator("full_name", "address_line", "delivery_note", "district")(lambda cls, v: clean_text(v, 500))


class QuoteIn(Strict):
    province: str | None = None
    discount_code: str | None = None


class TrackIn(Strict):
    order_number: str = Field(min_length=4, max_length=24)
    contact: str = Field(min_length=3, max_length=255)  # phone or email used at checkout


class PaymentSubmitIn(Strict):
    reference: str = Field(default="", max_length=120)


class ReviewIn(Strict):
    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=120)
    body: str = Field(default="", max_length=2000)
    author_name: str | None = Field(default=None, max_length=80)

    _t = field_validator("title", "body")(lambda cls, v: clean_text(v))


class NewsletterIn(Strict):
    email: EmailStr


# ---------------------------------------------------------------- admin catalog
class BrandIn(Strict):
    name: str = Field(min_length=1, max_length=60)
    slug: str | None = Field(default=None, max_length=80)
    description: str = ""
    is_active: bool = True
    sort_order: int = 0


class CategoryIn(BrandIn):
    name_km: str = Field(default="", max_length=80)


class ColorIn(Strict):
    name: str = Field(min_length=1, max_length=40)
    hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = 0


class SizeIn(Strict):
    label: str = Field(min_length=1, max_length=12, pattern=r"^[0-9A-Za-z.\- ]+$")
    system: str = Field(default="EU", max_length=8)
    sort_order: int = 0


class VariantIn(Strict):
    id: int | None = None
    color_id: int
    size_id: int
    sku: str | None = Field(default=None, max_length=80)
    stock: int = Field(default=0, ge=0, le=100000)
    price_override: Decimal | None = Field(default=None, ge=0)
    is_active: bool = True


class ProductIn(Strict):
    name: str = Field(min_length=2, max_length=160)
    name_km: str = Field(default="", max_length=200)
    slug: str | None = Field(default=None, max_length=180)
    model: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=10000)
    description_km: str = Field(default="", max_length=10000)
    gender: Gender = Gender.unisex
    price: Decimal = Field(ge=0, le=100000)
    sale_price: Decimal | None = Field(default=None, ge=0)
    brand_id: int
    category_id: int
    is_active: bool = True
    is_featured: bool = False
    is_best_seller: bool = False
    is_new_arrival: bool = False
    is_trending: bool = False
    variants: list[VariantIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self):
        if self.sale_price is not None and self.sale_price >= self.price:
            raise ValueError("Sale price must be lower than the regular price")
        combos = [(v.color_id, v.size_id) for v in self.variants]
        if len(combos) != len(set(combos)):
            raise ValueError("Each colour + size combination can only appear once")
        return self


class ImageUpdateIn(Strict):
    alt: str | None = Field(default=None, max_length=200)
    credit: str | None = Field(default=None, max_length=300)
    color_id: int | None = None
    is_primary: bool | None = None


class ImageOrderIn(Strict):
    image_ids: list[int]


class StockAdjustIn(Strict):
    change: int | None = Field(default=None, ge=-100000, le=100000)
    set_to: int | None = Field(default=None, ge=0, le=100000)
    reason: MovementReason = MovementReason.adjustment
    note: str = Field(default="", max_length=255)

    @model_validator(mode="after")
    def _one(self):
        if (self.change is None) == (self.set_to is None):
            raise ValueError("Send either change or set_to")
        if self.reason in (MovementReason.order_reserved, MovementReason.order_confirmed,
                           MovementReason.order_released, MovementReason.order_restored):
            raise ValueError("Order movements are created automatically")
        return self


# ---------------------------------------------------------------- admin orders
class OrderStatusIn(Strict):
    status: OrderStatus
    note: str = Field(default="", max_length=500)
    restock: bool = True  # for refunds of delivered orders


class TrackingIn(Strict):
    carrier: str = Field(default="", max_length=60)
    tracking_number: str = Field(default="", max_length=80)
    tracking_url: str = Field(default="", max_length=300)

    @field_validator("tracking_url")
    @classmethod
    def _url(cls, v: str) -> str:
        if v and not v.startswith(("https://", "http://")):
            raise ValueError("Tracking URL must start with http(s)://")
        return v


class PaymentVerifyIn(Strict):
    approve: bool
    note: str = Field(default="", max_length=500)


class AdminNoteIn(Strict):
    admin_note: str = Field(default="", max_length=5000)


# ---------------------------------------------------------------- marketing
class DiscountIn(Strict):
    code: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")
    description: str = Field(default="", max_length=200)
    type: DiscountType
    value: Decimal = Field(gt=0)
    min_subtotal: Decimal = Field(default=Decimal(0), ge=0)
    max_discount: Decimal | None = Field(default=None, gt=0)
    usage_limit: int | None = Field(default=None, ge=1)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _check(self):
        self.code = self.code.upper()
        if self.type == DiscountType.percent and self.value > 100:
            raise ValueError("Percentage cannot exceed 100")
        if self.starts_at and self.expires_at and self.expires_at <= self.starts_at:
            raise ValueError("Expiry must be after the start date")
        return self


class BannerIn(Strict):
    placement: Literal["hero", "promo", "category"] = "hero"
    eyebrow: str = Field(default="", max_length=60)
    title: str = Field(min_length=1, max_length=120)
    subtitle: str = Field(default="", max_length=255)
    cta_label: str = Field(default="Shop now", max_length=40)
    eyebrow_km: str = Field(default="", max_length=80)
    title_km: str = Field(default="", max_length=160)
    subtitle_km: str = Field(default="", max_length=300)
    cta_label_km: str = Field(default="", max_length=60)
    image_credit: str = Field(default="", max_length=300)
    cta_link: str = Field(default="/shop", max_length=255, pattern=r"^(/|https://)")
    theme: Literal["dark", "light"] = "dark"
    sort_order: int = 0
    is_active: bool = True


class ReviewModerateIn(Strict):
    is_approved: bool | None = None
    is_featured: bool | None = None


class StaffIn(Strict):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: Role = Role.staff


class UserUpdateIn(Strict):
    is_active: bool | None = None
    role: Role | None = None


# ---- social sign-in
class GoogleLoginIn(Strict):
    credential: str | None = Field(None, min_length=20, max_length=4096)    # ID token (Google's own button)
    access_token: str | None = Field(None, min_length=20, max_length=4096)  # token client (our button)
    remember: bool = True
    locale: Literal["en", "km"] | None = None


class TelegramLoginIn(Strict):
    id: int
    auth_date: int
    hash: str = Field(min_length=64, max_length=64)
    first_name: str | None = Field(None, max_length=256)
    last_name: str | None = Field(None, max_length=256)
    username: str | None = Field(None, max_length=64)
    photo_url: str | None = Field(None, max_length=1024)
    remember: bool = True
    locale: Literal["en", "km"] | None = None


class TelegramAppLoginIn(Strict):
    init_data: str = Field(min_length=20, max_length=8192)
    remember: bool = True
    locale: Literal["en", "km"] | None = None


# ---- in-store POS
class PosLineIn(Strict):
    variant_id: int
    quantity: int = Field(ge=1, le=50)


class PosSaleIn(Strict):
    items: list[PosLineIn] = Field(min_length=1, max_length=60)
    payment_method: Literal["cash", "khqr", "bank_transfer"]
    cash_usd: Decimal | None = Field(None, ge=0, le=100000)
    cash_khr: int | None = Field(None, ge=0, le=400000000)
    discount_amount: Decimal | None = Field(None, ge=0, le=100000)
    discount_percent: Decimal | None = Field(None, ge=0, le=100)
    customer_name: str | None = Field(None, max_length=120)
    customer_phone: str | None = Field(None, max_length=20)
    customer_email: EmailStr | None = None
    note: str | None = Field(None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=64)


class PosCompleteIn(Strict):
    confirm_received: bool = False
