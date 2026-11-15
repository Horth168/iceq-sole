"""In-store POS: cash with change, KHQR (auto + manual confirm), stock, cancel, permissions, daily summary."""
import time
import uuid

from app.config import settings
from app.models import Order, PaymentStatus, ProductVariant, Role
from app.services import payway
from tests.conftest import login, make_user
from tests.test_checkout_orders import _fake_bank_qr


def _sale(client, headers, catalog, *, method="cash", qty=1, size="42", **extra):
    v = catalog["variants"][("White", size)]
    body = {"items": [{"variant_id": v.id, "quantity": qty}], "payment_method": method,
            "idempotency_key": uuid.uuid4().hex, **extra}
    return client.post("/api/admin/pos/sales", json=body, headers=headers), v


def test_catalog_lists_variants_with_stock(client, catalog, admin_headers):
    r = client.get("/api/admin/pos/catalog", headers=admin_headers)
    assert r.status_code == 200
    p = r.json()[0]
    assert p["variants"] and {"sku", "available", "price", "size", "color"} <= set(p["variants"][0])


def test_cash_sale_pays_delivers_and_gives_change(client, db, catalog, admin_headers):
    r, v = _sale(client, admin_headers, catalog, cash_usd=100, cash_khr=4100)  # $100 + 4,100 riel ($1)
    assert r.status_code == 201, r.text
    o = r.json()["order"]
    assert o["channel"] == "pos" and o["payment_method"] == "cash"
    assert o["payment_status"] == "paid" and o["status"] == "delivered"
    total = o["total"]
    cash = r.json()["payment"]["cash"]
    assert abs(float(cash["change_usd"]) - (101 - total)) < 0.01
    assert cash["change_khr"] % 100 == 0
    db.expire_all()
    v = db.get(ProductVariant, v.id)
    assert v.stock == 1 and v.reserved == 0          # 2 in stock, 1 sold and deducted


def test_cash_too_little_is_refused(client, catalog, admin_headers):
    r, _ = _sale(client, admin_headers, catalog, cash_usd=1)
    assert r.status_code == 400 and "less than the total" in r.json()["detail"]


def test_not_enough_stock(client, catalog, admin_headers):
    r, _ = _sale(client, admin_headers, catalog, qty=3, cash_usd=10000)
    assert r.status_code == 409


def test_discount_and_walk_in(client, catalog, admin_headers):
    r, _ = _sale(client, admin_headers, catalog, cash_usd=1000, discount_percent=10)
    o = r.json()["order"]
    assert o["customer_name"] == "Walk-in customer"
    assert abs(o["discount_amount"] - o["subtotal"] * 0.10) < 0.01 and o["delivery_fee"] == 0


def test_khqr_sale_auto_confirmed_by_payway(client, db, catalog, admin_headers, monkeypatch):
    assert client.put("/api/admin/settings/payments", json={"khqr_template": _fake_bank_qr()}, headers=admin_headers).status_code == 200
    r, v = _sale(client, admin_headers, catalog, method="khqr")
    assert r.status_code == 201, r.text
    sale = r.json()
    assert sale["payment"]["khqr"] and sale["order"]["payment_status"] == "unpaid"
    db.expire_all()
    assert db.get(ProductVariant, v.id).reserved == 1        # held while the customer pays
    # ABA PayWay notice arrives -> paid; the POS then completes the hand-over
    monkeypatch.setattr(settings, "PAYWAY_CHAT_ID", "-100")
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "1:test")
    msg = {"date": int(time.time()), "chat": {"id": -100, "type": "supergroup"},
           "from": {"is_bot": True, "username": "PayWayByABA_bot"},
           "text": f"${sale['order']['total']:.2f} paid by A B (*1) on Nov 15, 10:00 AM via ABA PAY at X. Trx. ID: 42, APV: 1."}
    assert payway.handle(db, msg) == "matched"
    done = client.post(f"/api/admin/pos/sales/{sale['order']['id']}/complete", json={}, headers=admin_headers)
    assert done.status_code == 200 and done.json()["order"]["status"] == "delivered"


def test_khqr_manual_confirm_and_cancel(client, db, catalog, admin_headers):
    client.put("/api/admin/settings/payments", json={"khqr_template": _fake_bank_qr()}, headers=admin_headers)
    a, _ = _sale(client, admin_headers, catalog, method="khqr", size="42")
    sid = a.json()["order"]["id"]
    assert client.post(f"/api/admin/pos/sales/{sid}/complete", json={}, headers=admin_headers).status_code == 400
    ok = client.post(f"/api/admin/pos/sales/{sid}/complete", json={"confirm_received": True}, headers=admin_headers)
    assert ok.json()["order"]["payment_status"] == "paid" and ok.json()["order"]["status"] == "delivered"
    b, v = _sale(client, admin_headers, catalog, method="khqr", size="43")
    bid = b.json()["order"]["id"]
    assert client.post(f"/api/admin/pos/sales/{bid}/cancel", headers=admin_headers).json()["order"]["status"] == "cancelled"
    db.expire_all()
    assert db.get(ProductVariant, v.id).reserved == 0        # stock released


def test_same_tap_twice_is_one_sale(client, db, catalog, admin_headers):
    v = catalog["variants"][("White", "42")]
    body = {"items": [{"variant_id": v.id, "quantity": 1}], "payment_method": "cash", "cash_usd": 500, "idempotency_key": "tap-12345678"}
    first = client.post("/api/admin/pos/sales", json=body, headers=admin_headers).json()["order"]["id"]
    second = client.post("/api/admin/pos/sales", json=body, headers=admin_headers).json()["order"]["id"]
    assert first == second and db.query(Order).filter(Order.channel == "pos").count() == 1


def test_staff_only_and_cash_not_online(client, db, catalog):
    make_user(db, "buyer@example.com", Role.customer)
    assert client.get("/api/admin/pos/catalog", headers=login(client, "buyer@example.com")).status_code == 403
    make_user(db, "cashier@iceqsole.com", Role.staff)
    assert client.get("/api/admin/pos/catalog", headers=login(client, "cashier@iceqsole.com", admin=True)).status_code == 200
    # the online checkout never accepts in-store cash
    v = catalog["variants"][("White", "42")]
    token = client.post("/api/cart/items", json={"variant_id": v.id, "quantity": 1}).json()["token"]
    from tests.conftest import CHECKOUT
    r = client.post("/api/checkout", json={**CHECKOUT, "payment_method": "cash", "idempotency_key": uuid.uuid4().hex},
                    headers={"X-Cart-Token": token})
    assert r.status_code in (400, 422)


def test_daily_summary(client, catalog, admin_headers):
    _sale(client, admin_headers, catalog, cash_usd=1000)
    s = client.get("/api/admin/pos/summary", headers=admin_headers).json()
    assert s["sales"] == 1 and s["items"] == 1 and s["by_method"]["cash"] == s["revenue"] > 0
    assert s["cash"]["received_usd"] == 1000 and s["orders"][0]["invoice_number"].startswith("INV-")


def test_cashier_can_only_use_the_pos(client, db, catalog, admin_headers):
    r = client.post("/api/admin/staff", json={"email": "counter@iceqsole.com", "full_name": "Counter One",
                                                "password": "Passw0rd!x", "role": "cashier"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    h = login(client, "counter@iceqsole.com", password="Passw0rd!x", admin=True)   # can sign in to the dashboard
    # selling works
    assert client.get("/api/admin/pos/catalog", headers=h).status_code == 200
    cfg = client.get("/api/admin/pos/config", headers=h).json()
    assert cfg["role"] == "cashier" and cfg["can_discount"] is False and cfg["khr_rate"] > 0
    sale, _ = _sale(client, h, catalog, cash_usd=1000)
    assert sale.status_code == 201 and sale.json()["order"]["status"] == "delivered"
    assert client.get("/api/admin/pos/summary", headers=h).json()["sales"] == 1
    # ...but no discounts
    no, _ = _sale(client, h, catalog, cash_usd=1000, discount_percent=50)
    assert no.status_code == 403
    # and nothing else in the dashboard
    for path in ["/api/admin/orders", "/api/admin/products", "/api/admin/settings", "/api/admin/customers",
                 "/api/admin/notifications", "/api/admin/backup/json", "/api/admin/staff", "/api/admin/dashboard"]:
        assert client.get(path, headers=h).status_code in (403, 404), path
    assert client.put("/api/admin/settings/payments", json={"cod_enabled": False}, headers=h).status_code == 403
