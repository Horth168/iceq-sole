"""Telegram alerts and the Received / Not received buttons (Telegram API replaced by a recorder)."""
import uuid

import pytest

from app.config import settings
from app.models import Order
from app.services import telegram as tg
from tests.conftest import CHECKOUT

ADMIN = 111
STRANGER = 999


class _NowThread:
    """Runs the background send immediately so tests can see what was sent."""
    def __init__(self, target, args=(), daemon=None):
        self.target, self.args = target, args

    def start(self):
        self.target(*self.args)


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "123:test")
    monkeypatch.setattr(settings, "TELEGRAM_ADMIN_CHAT_IDS", str(ADMIN))
    monkeypatch.setattr(tg, "call", lambda method, **kw: calls.append((method, kw)) or {"ok": True})
    monkeypatch.setattr(tg.threading, "Thread", _NowThread)
    return calls


def _order(client, catalog, method="khqr", size="42"):
    v = catalog["variants"][("White", size)]
    token = client.post("/api/cart/items", json={"variant_id": v.id, "quantity": 1}).json()["token"]
    r = client.post("/api/checkout", json={**CHECKOUT, "payment_method": method, "idempotency_key": uuid.uuid4().hex},
                    headers={"X-Cart-Token": token})
    assert r.status_code == 201, r.text
    return r.json()


def _hook(client, update, secret=None, header=None):
    s = tg.webhook_secret()
    return client.post(f"/api/telegram/webhook/{secret or s}", json=update,
                       headers={"X-Telegram-Bot-Api-Secret-Token": header if header is not None else s})


def _press(client, data, user_id=ADMIN, cq_id="cq1"):
    return _hook(client, {"callback_query": {"id": cq_id, "data": data, "from": {"id": user_id, "first_name": "Owner"},
                                             "message": {"message_id": 5, "chat": {"id": user_id, "type": "private"}}}})


def test_new_khqr_order_sends_alert_with_buttons(client, catalog, sent):
    r = _order(client, catalog)
    oid = r["order"]["id"]
    msgs = [kw for m, kw in sent if m == "sendMessage"]
    assert len(msgs) == 1 and msgs[0]["chat_id"] == ADMIN
    assert r["order"]["order_number"] in msgs[0]["text"]
    buttons = msgs[0]["reply_markup"]["inline_keyboard"][0]
    assert [b["callback_data"] for b in buttons] == [f"pay:ok:{oid}", f"pay:no:{oid}"]


def test_cod_order_alert_has_no_buttons(client, catalog, sent):
    _order(client, catalog, method="cod")
    msgs = [kw for m, kw in sent if m == "sendMessage"]
    assert len(msgs) == 1 and "reply_markup" not in msgs[0]


def test_no_alert_when_order_fails(client, catalog, sent):
    v = catalog["variants"][("White", "42")]
    token = client.post("/api/cart/items", json={"variant_id": v.id, "quantity": 1}).json()["token"]
    bad = {**CHECKOUT, "phone": "123", "payment_method": "khqr", "idempotency_key": uuid.uuid4().hex}
    assert client.post("/api/checkout", json=bad, headers={"X-Cart-Token": token}).status_code == 422
    assert not [m for m, _ in sent if m == "sendMessage"]


def test_received_button_marks_paid_and_confirms(client, db, catalog, sent):
    oid = _order(client, catalog)["order"]["id"]
    assert _press(client, f"pay:ok:{oid}").status_code == 200
    db.expire_all()
    o = db.get(Order, oid)
    assert o.payment_status.value == "paid" and o.status.value == "processing" and o.stock_committed
    assert o.payments[-1].verification_source == "telegram"
    # buttons removed + confirmation reply
    assert any(m == "editMessageReplyMarkup" for m, _ in sent)
    assert any(m == "sendMessage" and "Paid" in kw["text"] for m, kw in sent)
    # pressing again does nothing harmful
    sent.clear()
    _press(client, f"pay:ok:{oid}", cq_id="cq2")
    assert any(m == "answerCallbackQuery" and "Already" in kw["text"] for m, kw in sent)


def test_not_received_button_rejects_payment(client, db, catalog, sent):
    oid = _order(client, catalog)["order"]["id"]
    _press(client, f"pay:no:{oid}")
    db.expire_all()
    o = db.get(Order, oid)
    assert o.payment_status.value == "failed" and o.status.value == "pending"


def test_only_admin_chat_can_press(client, db, catalog, sent):
    oid = _order(client, catalog)["order"]["id"]
    _press(client, f"pay:ok:{oid}", user_id=STRANGER)
    db.expire_all()
    assert db.get(Order, oid).payment_status.value == "unpaid"
    assert any(m == "answerCallbackQuery" and kw.get("show_alert") for m, kw in sent)


def test_webhook_rejects_wrong_secret(client, db, catalog, sent):
    oid = _order(client, catalog)["order"]["id"]
    update = {"callback_query": {"id": "x", "data": f"pay:ok:{oid}", "from": {"id": ADMIN},
                                 "message": {"message_id": 1, "chat": {"id": ADMIN}}}}
    _hook(client, update, secret="wrong")
    _hook(client, update, header="wrong")
    db.expire_all()
    assert db.get(Order, oid).payment_status.value == "unpaid"


def test_start_shows_chat_id_to_new_user(client, sent):
    _hook(client, {"message": {"text": "/start", "chat": {"id": STRANGER, "type": "private"}}})
    msg = [kw for m, kw in sent if m == "sendMessage"][-1]
    assert str(STRANGER) in msg["text"] and "TELEGRAM_ADMIN_CHAT_IDS" in msg["text"]
    _hook(client, {"message": {"text": "/start", "chat": {"id": ADMIN, "type": "private"}}})
    assert "Connected" in [kw for m, kw in sent if m == "sendMessage"][-1]["text"]


def test_payment_submission_alert(client, catalog, sent):
    r = _order(client, catalog)
    sent.clear()
    num, t = r["order"]["order_number"], r["access_token"]
    assert client.post(f"/api/orders/{num}/payment/submit", params={"t": t}, data={"reference": "ABA-123"}).status_code == 200
    msgs = [kw for m, kw in sent if m in ("sendMessage", "sendPhoto")]
    assert len(msgs) == 1 and "ABA-123" in msgs[0]["text"] and "reply_markup" in msgs[0]


def test_disabled_without_token(client, catalog, monkeypatch):
    calls = []
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(tg, "call", lambda method, **kw: calls.append(method))
    _order(client, catalog)
    assert calls == []


def test_customer_can_get_new_qr_after_not_received(client, db, catalog, sent, monkeypatch):
    mails = []
    from app.services import email as email_svc
    monkeypatch.setattr(email_svc, "send_payment_update", lambda o, kind, link: mails.append((kind, o.order_number, link)))
    monkeypatch.setattr(email_svc.threading if hasattr(email_svc, "threading") else __import__("threading"), "Thread", _NowThread)
    r = _order(client, catalog)
    oid, num, t = r["order"]["id"], r["order"]["order_number"], r["access_token"]
    old_qr = r["payment"]["khqr"]
    _press(client, f"pay:no:{oid}")
    page = client.get(f"/api/orders/{num}", params={"t": t}).json()
    assert page["order"]["payment_status"] == "failed"
    assert mails and mails[-1][0] == "failed" and f"/order/{num}?t=" in mails[-1][2]
    # customer asks for a new QR -> unpaid again with a different code
    new = client.post(f"/api/orders/{num}/payment/renew", params={"t": t})
    assert new.status_code == 200, new.text
    assert new.json()["order"]["payment_status"] == "unpaid" and new.json()["payment"]["khqr"] != old_qr
    # asking again while the QR is still valid keeps the same code
    again = client.post(f"/api/orders/{num}/payment/renew", params={"t": t}).json()
    assert again["payment"]["khqr"] == new.json()["payment"]["khqr"]
    # wrong token -> not found
    assert client.post(f"/api/orders/{num}/payment/renew", params={"t": "nope"}).status_code == 404
    # then the owner confirms -> paid + processing + "paid" email
    _press(client, f"pay:ok:{oid}", cq_id="cq9")
    db.expire_all()
    o = db.get(Order, oid)
    assert o.payment_status.value == "paid" and o.status.value == "processing" and mails[-1][0] == "paid"
