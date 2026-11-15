"""Receipt emails: sent on checkout when there is an email, and again (PAID) when payment is confirmed."""
import uuid

from app.services import email as mail
from tests.conftest import CHECKOUT
from tests.test_telegram import _NowThread  # runs background sends immediately


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(mail, "send_email", lambda to, subject, text, html=None: sent.append((to, subject, text, html)) or True)
    monkeypatch.setattr(mail.threading if hasattr(mail, "threading") else __import__("threading"), "Thread", _NowThread)
    return sent


def _checkout(client, catalog, email):
    v = catalog["variants"][("White", "42")]
    token = client.post("/api/cart/items", json={"variant_id": v.id, "quantity": 1}).json()["token"]
    body = {**CHECKOUT, "payment_method": "cod", "idempotency_key": uuid.uuid4().hex}
    if email:
        body["email"] = email
    else:
        body.pop("email", None)
    r = client.post("/api/checkout", json=body, headers={"X-Cart-Token": token})
    assert r.status_code == 201, r.text
    return r.json()["order"]


def test_receipt_emailed_after_checkout(client, catalog, monkeypatch):
    sent = _capture(monkeypatch)
    order = _checkout(client, catalog, "buyer@example.com")
    assert len(sent) == 1
    to, subject, text, html = sent[0]
    inv = "INV-" + order["order_number"][2:]
    assert to == "buyer@example.com" and inv in subject and order["order_number"] in subject
    assert inv in html and order["order_number"] in html and "Track your order" in html
    assert "/icons/icon-192.png" in html and "PAY ON DELIVERY" in html
    assert order["invoice_number"] == inv


def test_no_email_no_receipt(client, catalog, monkeypatch):
    sent = _capture(monkeypatch)
    _checkout(client, catalog, None)
    assert sent == []


def test_paid_receipt_when_payment_confirmed(client, catalog, admin_headers, monkeypatch):
    sent = _capture(monkeypatch)
    order = _checkout(client, catalog, "buyer@example.com")
    sent.clear()
    r = client.post(f"/api/admin/orders/{order["id"]}/payment", json={"approve": True}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert sent and "payment received" in sent[0][1] and "PAID" in sent[0][3]
