import uuid
from decimal import Decimal

from app.models import Discount, DiscountType, ProductVariant, Role
from app.services import khqr
from tests.conftest import CHECKOUT, login, make_user, png_bytes


def _cart_add(client, variant_id, qty=1, token=None, headers=None):
    h = dict(headers or {})
    if token:
        h["X-Cart-Token"] = token
    r = client.post("/api/cart/items", json={"variant_id": variant_id, "quantity": qty}, headers=h)
    return r


def _checkout(client, token, method="cod", key=None, **extra):
    body = {**CHECKOUT, "payment_method": method, "idempotency_key": key or uuid.uuid4().hex, **extra}
    return client.post("/api/checkout", json=body, headers={"X-Cart-Token": token})


def test_guest_cart_and_checkout_reserves_stock(client, db, catalog):
    v = catalog["variants"][("White", "42")]
    r = _cart_add(client, v.id, 2)
    assert r.status_code == 200, r.text
    cart = r.json()
    token = cart["token"]
    assert cart["count"] == 2 and cart["subtotal"] == 160  # sale price used
    assert cart["items"][0]["color"] == "White" and cart["items"][0]["size"] == "42"
    # cannot exceed stock
    assert _cart_add(client, v.id, 1, token).status_code == 409
    # persistent cart
    assert client.get("/api/cart", headers={"X-Cart-Token": token}).json()["count"] == 2

    r = _checkout(client, token)
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["status"] == "pending" and order["total"] == 160  # free delivery over $100
    assert order["items"][0]["sku"] == "T-White-42"
    db.expire_all()
    var = db.get(ProductVariant, v.id)
    assert var.stock == 2 and var.reserved == 2 and var.available == 0
    # cart emptied
    assert client.get("/api/cart", headers={"X-Cart-Token": token}).json()["count"] == 0
    # guest can view with access token, not without
    num, t = order["order_number"], r.json()["access_token"]
    assert client.get(f"/api/orders/{num}").status_code == 404
    assert client.get(f"/api/orders/{num}", params={"t": t}).status_code == 200
    # tracking by phone
    tr = client.post("/api/orders/track", json={"order_number": num, "contact": "+85512345678"})
    assert tr.status_code == 200
    assert client.post("/api/orders/track", json={"order_number": num, "contact": "099999999"}).status_code == 404


def test_no_overselling_between_two_customers(client, db, catalog):
    v = catalog["variants"][("Black", "43")]  # stock 2
    t1 = _cart_add(client, v.id, 2).json()["token"]
    t2 = _cart_add(client, v.id, 1).json()["token"]
    assert _checkout(client, t1).status_code == 201
    r = _checkout(client, t2)
    assert r.status_code == 409
    assert "left in stock" in r.json()["detail"]
    db.expire_all()
    assert db.get(ProductVariant, v.id).reserved == 2


def test_duplicate_submission_returns_same_order(client, catalog):
    v = catalog["variants"][("White", "43")]
    token = _cart_add(client, v.id, 1).json()["token"]
    key = uuid.uuid4().hex
    a = _checkout(client, token, key=key)
    b = _checkout(client, token, key=key)
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["order"]["order_number"] == b.json()["order"]["order_number"]


def test_discount_codes(client, db, catalog):
    db.add(Discount(code="SAVE10", type=DiscountType.percent, value=Decimal(10), usage_limit=1))
    db.add(Discount(code="BIG", type=DiscountType.fixed, value=Decimal(5), min_subtotal=Decimal(500)))
    db.commit()
    v = catalog["variants"][("White", "42")]
    token = _cart_add(client, v.id, 1).json()["token"]
    h = {"X-Cart-Token": token}
    assert client.post("/api/cart/discount", json={"code": "nope"}, headers=h).status_code == 400
    r = client.post("/api/cart/discount", json={"code": "BIG"}, headers=h)
    assert r.status_code == 400 and "Spend at least" in r.json()["detail"]
    r = client.post("/api/cart/discount", json={"code": "save10"}, headers=h)
    assert r.status_code == 200 and r.json()["discount_amount"] == 8
    order = _checkout(client, token).json()["order"]
    assert order["discount_code"] == "SAVE10" and order["total"] == 73.5
    # usage limit reached for the next customer
    t2 = _cart_add(client, catalog["variants"][("Black", "42")].id, 1).json()["token"]
    assert client.post("/api/cart/discount", json={"code": "SAVE10"}, headers={"X-Cart-Token": t2}).status_code == 400


def test_delivery_fee_and_free_shipping(client, catalog):
    v = catalog["variants"][("White", "42")]
    token = _cart_add(client, v.id, 1).json()["token"]
    q = client.post("/api/cart/quote", json={"province": "Siem Reap"}, headers={"X-Cart-Token": token}).json()
    assert q["delivery_fee"] == 3.0 and q["total"] == 83.0 and q["total_khr"] == 340300
    _cart_add(client, v.id, 1, token)
    q = client.post("/api/cart/quote", json={"province": "Siem Reap"}, headers={"X-Cart-Token": token}).json()
    assert q["delivery_fee"] == 0  # over $100 threshold


def test_order_lifecycle_stock_and_customer_visibility(client, db, catalog, admin_headers):
    make_user(db, "buyer@iceqsole.com", Role.customer)
    ch = login(client, "buyer@iceqsole.com")
    v = catalog["variants"][("White", "42")]
    _cart_add(client, v.id, 1, headers=ch)
    r = client.post("/api/checkout", json={**CHECKOUT, "payment_method": "cod", "idempotency_key": uuid.uuid4().hex},
                    headers=ch)
    assert r.status_code == 201, r.text
    oid, num = r.json()["order"]["id"], r.json()["order"]["order_number"]

    # invalid transition
    assert client.post(f"/api/admin/orders/{oid}/status", json={"status": "delivered"}, headers=admin_headers).status_code == 400
    # confirm => physical stock deducted
    r = client.post(f"/api/admin/orders/{oid}/status", json={"status": "confirmed"}, headers=admin_headers)
    assert r.status_code == 200
    db.expire_all()
    var = db.get(ProductVariant, v.id)
    assert (var.stock, var.reserved) == (1, 0)
    client.post(f"/api/admin/orders/{oid}/tracking", json={"carrier": "J&T", "tracking_number": "JT123"}, headers=admin_headers)
    client.post(f"/api/admin/orders/{oid}/status", json={"status": "shipped"}, headers=admin_headers)
    # customer sees the update
    mine = client.get(f"/api/account/orders/{num}", headers=ch).json()
    assert mine["status"] == "shipped" and mine["tracking_number"] == "JT123"
    # cancel shipped order => stock restored
    client.post(f"/api/admin/orders/{oid}/status", json={"status": "cancelled"}, headers=admin_headers)
    db.expire_all()
    assert db.get(ProductVariant, v.id).stock == 2
    # cannot cancel twice / restore twice
    assert client.post(f"/api/admin/orders/{oid}/status", json={"status": "cancelled"}, headers=admin_headers).json()["status"] == "cancelled"
    db.expire_all()
    assert db.get(ProductVariant, v.id).stock == 2
    # customer notifications were created
    assert len(client.get("/api/account/notifications", headers=ch).json()) >= 3


def test_customer_cancel_pending_releases_reservation(client, db, catalog):
    v = catalog["variants"][("Black", "42")]
    token = _cart_add(client, v.id, 1).json()["token"]
    r = _checkout(client, token).json()
    num, t = r["order"]["order_number"], r["access_token"]
    assert client.post(f"/api/orders/{num}/cancel", params={"t": t}).status_code == 200
    db.expire_all()
    assert db.get(ProductVariant, v.id).reserved == 0


def test_khqr_payment_manual_verification(client, db, catalog, admin_headers):
    v = catalog["variants"][("White", "43")]
    token = _cart_add(client, v.id, 1).json()["token"]
    r = _checkout(client, token, method="khqr")
    assert r.status_code == 201, r.text
    pay = r.json()["payment"]
    assert pay["khqr"].startswith("000201010212") and pay["amount"] == 81.5
    assert pay["auto_verify"] is False  # no Bakong token configured
    num, t, oid = r.json()["order"]["order_number"], r.json()["access_token"], r.json()["order"]["id"]
    # client cannot mark itself paid: check returns unpaid
    assert client.post(f"/api/orders/{num}/payment/check", params={"t": t}).json()["paid"] is False
    # customer submits reference + screenshot
    r = client.post(f"/api/orders/{num}/payment/submit", params={"t": t}, data={"reference": "ABA-998877"},
                    files={"screenshot": ("proof.png", png_bytes(600, 1000), "image/png")})
    assert r.status_code == 200, r.text
    assert r.json()["order"]["payment_status"] == "submitted"
    assert r.json()["order"]["payments"][0]["proof_url"]
    # admin approves => paid + auto-confirmed + stock committed
    r = client.post(f"/api/admin/orders/{oid}/payment", json={"approve": True, "note": "Matched in ABA app"}, headers=admin_headers)
    o = r.json()
    assert o["payment_status"] == "paid" and o["status"] == "confirmed" and o["stock_committed"]
    dash = client.get("/api/admin/dashboard", headers=admin_headers).json()
    assert dash["kpis"]["revenue"] == 81.5 and dash["kpis"]["total_orders"] == 1


def test_khqr_payload_is_valid_emv():
    payload = khqr.build_khqr(account_id="shop@abaa", merchant_name="IceQ Sole", merchant_city="Phnom Penh",
                              amount=Decimal("12.5"), bill_number="IQ1")
    assert payload.startswith("00020101021229")
    assert "5303840" in payload and "540512.50" in payload and "5802KH" in payload
    body, crc = payload[:-4], payload[-4:]
    assert body.endswith("6304") and khqr.crc16_ccitt(body) == crc
    assert khqr.crc16_ccitt("123456789") == "29B1"  # CRC-16/CCITT-FALSE check value


def test_bakong_check_requires_matching_amount(client, db, catalog, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "BAKONG_API_TOKEN", "x")
    v = catalog["variants"][("White", "43")]
    token = _cart_add(client, v.id, 1).json()["token"]
    r = _checkout(client, token, method="khqr").json()
    num, t = r["order"]["order_number"], r["access_token"]
    monkeypatch.setattr(khqr, "check_payment", lambda md5: {"paid": True, "data": {"amount": 1.0, "currency": "USD"}, "error": None})
    assert client.post(f"/api/orders/{num}/payment/check", params={"t": t}).json()["paid"] is False
    monkeypatch.setattr(khqr, "check_payment", lambda md5: {"paid": True, "data": {"amount": 81.5, "currency": "USD", "hash": "abc"}, "error": None})
    res = client.post(f"/api/orders/{num}/payment/check", params={"t": t}).json()
    assert res["paid"] is True
    assert client.get(f"/api/orders/{num}", params={"t": t}).json()["order"]["status"] == "confirmed"


def test_inventory_adjust_cannot_go_below_reserved(client, db, catalog, admin_headers):
    v = catalog["variants"][("White", "42")]
    token = _cart_add(client, v.id, 2).json()["token"]
    _checkout(client, token)
    r = client.post(f"/api/admin/inventory/{v.id}/adjust", json={"set_to": 1, "note": "count"}, headers=admin_headers)
    assert r.status_code == 409
    r = client.post(f"/api/admin/inventory/{v.id}/adjust", json={"change": 5, "reason": "restock"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["stock"] == 7
    low = client.get("/api/admin/inventory", params={"filter": "reserved"}, headers=admin_headers).json()
    assert low["total"] == 1


def test_wishlist_addresses_reviews(client, db, catalog, admin_headers):
    make_user(db, "w@iceqsole.com", Role.customer)
    h = login(client, "w@iceqsole.com")
    pid = catalog["product"].id
    assert client.post(f"/api/account/wishlist/{pid}", headers=h).status_code == 201
    assert len(client.get("/api/account/wishlist", headers=h).json()) == 1
    a = client.post("/api/account/addresses", json={"full_name": "Wan Sok", "phone": "097 123 4567", "province": "siem reap",
                                                    "address_line": "Road 6"}, headers=h)
    assert a.status_code == 201 and a.json()["is_default"] and a.json()["province"] == "Siem Reap"
    assert client.post("/api/account/addresses", json={"full_name": "Wan Sok", "phone": "097 123 4567", "province": "Atlantis",
                                                       "address_line": "x x"}, headers=h).status_code == 422
    r = client.post("/api/products/test-runner/reviews", json={"rating": 5, "title": "Great", "body": "<b>Nice</b>"}, headers=h)
    assert r.status_code == 201
    pending = client.get("/api/admin/reviews", headers=admin_headers).json()
    assert pending[0]["body"] == "bNice/b"  # angle brackets stripped
    client.patch(f"/api/admin/reviews/{pending[0]['id']}", json={"is_approved": True}, headers=admin_headers)
    assert client.get("/api/products/test-runner/reviews").json()["count"] == 1


def test_settings_and_home(client, admin_headers, catalog):
    r = client.put("/api/admin/settings/delivery", json={"phnom_penh_fee": 2}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["phnom_penh_fee"] == 2
    assert client.put("/api/admin/settings/delivery", json={"hack": 1}, headers=admin_headers).status_code == 400
    pub = client.get("/api/settings/public").json()
    assert pub["delivery"]["phnom_penh_fee"] == 2 and "Phnom Penh" in pub["provinces"]
    assert "bank_account_number" not in pub["payments"]
    home = client.get("/api/home").json()
    assert home["featured"][0]["slug"] == "test-runner"
    assert client.get("/api/health").json()["status"] == "ok"


def _tlv_parse(s):
    out, i = {}, 0
    while i + 4 <= len(s):
        tag, n = s[i:i + 2], int(s[i + 2:i + 4])
        out[tag] = s[i + 4:i + 4 + n]
        i += 4 + n
    return out


def test_khqr_aba_personal_account_layout():
    """ABA personal accounts: shared Bakong ID + account number + bank, same layout as ABA's own QR."""
    payload = khqr.build_khqr(account_id="abaakhppxxx@abaa", merchant_name="IceQ Sole", merchant_city="Phnom Penh",
                              amount=Decimal("81.5"), bill_number="IQ-1", account_information="001553304",
                              acquiring_bank="ABA Bank")
    top = _tlv_parse(payload)
    assert _tlv_parse(top["29"]) == {"00": "abaakhppxxx@abaa", "01": "001553304", "02": "ABA Bank"}
    assert top["53"] == "840" and top["54"] == "81.50" and top["01"] == "12"
    assert khqr.crc16_ccitt(payload[:-4]) == payload[-4:]
