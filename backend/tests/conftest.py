import io
import os
import tempfile
from decimal import Decimal

import pytest

_TMP = tempfile.mkdtemp(prefix="iceq-test-")
os.environ.update({
    "SECRET_KEY": "test-secret-key-that-is-long-enough-1234567890",
    "DATABASE_URL": f"sqlite:///{_TMP}/test.db".replace("\\", "/"),
    "STORAGE_PROVIDER": "local",
    "LOCAL_UPLOAD_DIR": os.path.join(_TMP, "uploads"),
    "RATE_LIMIT_ENABLED": "false",
    "ENVIRONMENT": "test",
    "BAKONG_ACCOUNT_ID": "iceq_test@abaa",
    "BAKONG_API_TOKEN": "",
    # outside services are off unless a test turns them on (ignores a developer's local .env)
    "TURNSTILE_SITE_KEY": "", "TURNSTILE_SECRET_KEY": "",
    "GOOGLE_CLIENT_ID": "", "TELEGRAM_LOGIN_BOT_TOKEN": "",
    "TG_LISTENER_API_ID": "", "TG_LISTENER_API_HASH": "", "TG_LISTENER_SESSION": "",
    "BREVO_API_KEY": "",
})

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (Brand, Category, Color, Product, ProductVariant, Role, Size, User)  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture
def client():
    return TestClient(app)


def make_user(db, email="admin@iceqsole.com", role=Role.admin, password="Passw0rd!"):
    u = User(email=email, full_name=email.split("@")[0].title(), password_hash=hash_password(password), role=role)
    db.add(u)
    db.commit()
    return u


def login(client, email, password="Passw0rd!", admin=False):
    r = client.post("/api/auth/admin/login" if admin else "/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin_headers(client, db):
    make_user(db)
    return login(client, "admin@iceqsole.com", admin=True)


@pytest.fixture
def catalog(db):
    """One product with two colours x two sizes."""
    b = Brand(name="Testbrand", slug="testbrand")
    c = Category(name="Lifestyle", slug="lifestyle")
    white, black = Color(name="White", hex="#FFFFFF"), Color(name="Black", hex="#000000")
    s42, s43 = Size(label="42", sort_order=1), Size(label="43", sort_order=2)
    db.add_all([b, c, white, black, s42, s43])
    db.flush()
    p = Product(name="Test Runner", slug="test-runner", price=Decimal("100"), sale_price=Decimal("80"),
                brand_id=b.id, category_id=c.id, is_featured=True)
    db.add(p)
    db.flush()
    variants = {}
    for col in (white, black):
        for s in (s42, s43):
            v = ProductVariant(product_id=p.id, color_id=col.id, size_id=s.id, sku=f"T-{col.name}-{s.label}",
                               stock=2, reserved=0)
            db.add(v)
            variants[(col.name, s.label)] = v
    db.commit()
    return {"product": p, "variants": variants, "brand": b, "category": c, "colors": (white, black), "sizes": (s42, s43)}


def png_bytes(w=1200, h=900, color=(200, 220, 240)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


CHECKOUT = {
    "full_name": "Sok Dara",
    "phone": "012 345 678",
    "email": "dara@example.com",
    "province": "Phnom Penh",
    "district": "Daun Penh",
    "address_line": "Street 240, House 12",
    "delivery_note": "Call before arriving",
}
