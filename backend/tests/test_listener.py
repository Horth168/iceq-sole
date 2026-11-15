"""PayWay listener (user account): message shape and processing. Telegram itself is not contacted."""
import uuid
from datetime import datetime, timezone

from app.config import settings
from app.models import Order, PaymentStatus
from app.services import tg_listener
from tests.conftest import CHECKOUT
from tests.test_checkout_orders import _fake_bank_qr

CHAT = -1004470641278


def _on(monkeypatch):
    monkeypatch.setattr(settings, "PAYWAY_CHAT_ID", str(CHAT))
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "1:test")
    from app.services import telegram as tg
    monkeypatch.setattr(tg, "call", lambda method, **kw: {"ok": True})


def _khqr_order(client, catalog, admin_headers):
    client.put("/api/admin/settings/payments", json={"khqr_template": _fake_bank_qr()}, headers=admin_headers)
    v = catalog["variants"][("White", "42")]
    token = client.post("/api/cart/items", json={"variant_id": v.id, "quantity": 1}).json()["token"]
    r = client.post("/api/checkout", json={**CHECKOUT, "payment_method": "khqr", "idempotency_key": uuid.uuid4().hex},
                    headers={"X-Cart-Token": token})
    assert r.status_code == 201, r.text
    return r.json()["order"]


def _msg(text, username="PayWayByABA_bot", is_bot=True):
    return tg_listener.to_bot_message(chat_id=CHAT, sender_username=username, sender_is_bot=is_bot, text=text,
                                      date=datetime.now(timezone.utc))


def test_off_until_configured(monkeypatch):
    monkeypatch.setattr(settings, "TG_LISTENER_API_ID", "")
    assert tg_listener.configured() is False
    tg_listener.start()  # does nothing, no thread, no error
    monkeypatch.setattr(settings, "TG_LISTENER_API_ID", "123")
    monkeypatch.setattr(settings, "TG_LISTENER_API_HASH", "abc")
    monkeypatch.setattr(settings, "TG_LISTENER_SESSION", "x")
    monkeypatch.setattr(settings, "PAYWAY_CHAT_ID", str(CHAT))
    assert tg_listener.configured() is True


def test_message_shape_matches_bot_api():
    m = _msg("$2.00 paid by A (*1) on Nov 15, 12:35 PM via ABA PAY at X. Trx. ID: 5, APV: 1.")
    assert m["chat"] == {"id": CHAT, "type": "supergroup"} and m["from"] == {"is_bot": True, "username": "PayWayByABA_bot"}
    assert isinstance(m["date"], int) and m["text"].startswith("$2.00")


def test_listener_confirms_the_order(client, db, catalog, admin_headers, monkeypatch):
    _on(monkeypatch)
    order = _khqr_order(client, catalog, admin_headers)
    text = f"${order['total']:.2f} paid by SIN MONG HORTH (*291) on Nov 15, 12:35 PM via ABA PAY at SIN MONG HORTH. Trx. ID: 17947209585817, APV: 180610."
    assert tg_listener.process(_msg(text)) == "matched"
    assert tg_listener.process(_msg(text)) == "duplicate"          # re-read after a restart: no double payment
    db.expire_all()
    o = db.get(Order, order["id"])
    assert o.payment_status == PaymentStatus.paid and o.status.value == "processing"


def test_listener_ignores_people_typing_payments(client, db, catalog, admin_headers, monkeypatch):
    _on(monkeypatch)
    order = _khqr_order(client, catalog, admin_headers)
    text = f"${order['total']:.2f} paid by X (*1) on Nov 15, 12:35 PM via ABA PAY at Y. Trx. ID: 99, APV: 1."
    assert tg_listener.process(_msg(text, username="someone", is_bot=False)) == "ignored"
    db.expire_all()
    assert db.get(Order, order["id"]).payment_status == PaymentStatus.unpaid
