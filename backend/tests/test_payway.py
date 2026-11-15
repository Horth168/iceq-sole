"""ABA PayWay Telegram notices confirm KHQR orders automatically - only when it is safe to."""
import time

from app.config import settings
from app.models import Order, PaymentStatus
from app.services import payway
from tests.test_telegram import ADMIN, _hook, _order, sent  # noqa: F401  (fixture re-used)

CHAT = -1004470641278


def _notice(amount="81.50", trx="179468810879402", cur="$"):
    return (f"{cur}{amount} paid by SIN MONG HORTH (*291) on Nov 15, 03:28 AM via ABA PAY at SIN MONG HORTH. "
            f"Trx. ID: {trx}, APV: 929857.")


def _group_msg(text, *, username="PayWayByABA_bot", is_bot=True, chat=CHAT, date=None):
    return {"message": {"message_id": 9, "date": date or int(time.time()), "text": text,
                        "chat": {"id": chat, "type": "supergroup", "title": "IceQ Sole Payment"},
                        "from": {"id": 5000, "is_bot": is_bot, "username": username, "first_name": "PayWay by ABA"}}}


def _on(monkeypatch):
    monkeypatch.setattr(settings, "PAYWAY_CHAT_ID", str(CHAT))


def _amount(r):
    return r["order"]["total"]


def test_parse_real_messages():
    n = payway.parse(_notice("1.00"))
    assert (n.currency, str(n.amount), n.payer, n.account, n.trx, n.apv) == ("USD", "1.00", "SIN MONG HORTH", "*291", "179468810879402", "929857")
    k = payway.parse("៛100 paid by SIN MONG HORTH (*291) on Nov 15, 03:27 AM via ABA PAY at SIN MONG HORTH. Trx. ID: 17946880631517, APV: 402439.")
    assert k.currency == "KHR" and k.amount == 100
    assert payway.parse("hello there") is None


def test_matching_payment_confirms_order(client, catalog, db, sent, monkeypatch):
    _on(monkeypatch)
    r = _order(client, catalog)
    _hook(client, _group_msg(_notice(f"{_amount(r):.2f}")))
    db.expire_all()
    order = db.get(Order, r["order"]["id"])
    assert order.payment_status == PaymentStatus.paid and order.status.value == "processing"
    pay = order.payments[-1]
    assert pay.reference == "ABA 179468810879402" and pay.verification_source == "payway"
    assert any("Paid automatically" in kw.get("text", "") for m, kw in sent if m == "sendMessage")
    # the customer's own order page shows it as paid
    page = client.get(f"/api/orders/{order.order_number}", params={"t": r["access_token"]}).json()
    assert page.get("order", page)["payment_status"] == "paid"


def test_fake_messages_are_ignored(client, catalog, db, sent, monkeypatch):
    _on(monkeypatch)
    r = _order(client, catalog)
    text = _notice(f"{_amount(r):.2f}")
    _hook(client, _group_msg(text, username="SomeoneElse", is_bot=False))        # a person typing it
    _hook(client, _group_msg(text, username="PayWayByABA_bot_fake"))             # a look-alike bot
    _hook(client, _group_msg(text, chat=-100999))                                # another chat
    db.expire_all()
    assert db.get(Order, r["order"]["id"]).payment_status == PaymentStatus.unpaid


def test_same_transaction_is_used_once(client, catalog, db, sent, monkeypatch):
    _on(monkeypatch)
    a = _order(client, catalog, size="42")
    _hook(client, _group_msg(_notice(f"{_amount(a):.2f}", trx="111")))
    b = _order(client, catalog, size="43")
    _hook(client, _group_msg(_notice(f"{_amount(b):.2f}", trx="111")))   # replayed notice
    db.expire_all()
    assert db.get(Order, a["order"]["id"]).payment_status == PaymentStatus.paid
    assert db.get(Order, b["order"]["id"]).payment_status == PaymentStatus.unpaid


def test_two_orders_same_amount_asks_admin(client, catalog, db, sent, monkeypatch):
    _on(monkeypatch)
    a = _order(client, catalog, size="42")
    b = _order(client, catalog, size="43")
    assert _amount(a) == _amount(b)
    _hook(client, _group_msg(_notice(f"{_amount(a):.2f}", trx="222")))
    db.expire_all()
    assert db.get(Order, a["order"]["id"]).payment_status == PaymentStatus.unpaid
    assert db.get(Order, b["order"]["id"]).payment_status == PaymentStatus.unpaid
    asks = [kw for m, kw in sent if m == "sendMessage" and "didn't guess" in kw.get("text", "")]
    assert asks and len(asks[0]["reply_markup"]["inline_keyboard"]) == 2


def test_wrong_amount_or_expired_qr_does_nothing(client, catalog, db, sent, monkeypatch):
    _on(monkeypatch)
    r = _order(client, catalog)
    _hook(client, _group_msg(_notice("0.01", trx="333")))
    _hook(client, _group_msg(_notice(f"{_amount(r):.2f}", trx="444"), date=int(time.time()) + 6 * 3600))
    db.expire_all()
    assert db.get(Order, r["order"]["id"]).payment_status == PaymentStatus.unpaid
    assert any("no unpaid KHQR order" in kw.get("text", "") for m, kw in sent if m == "sendMessage")


def test_channel_posts_work_and_iceq_command(client, catalog, db, sent, monkeypatch):
    _on(monkeypatch)
    r = _order(client, catalog)
    post = {"channel_post": {"message_id": 3, "date": int(time.time()), "text": _notice(f"{_amount(r):.2f}", trx="555"),
                             "chat": {"id": CHAT, "type": "channel", "title": "IceQ Payments"}}}
    _hook(client, post)
    db.expire_all()
    assert db.get(Order, r["order"]["id"]).payment_status == PaymentStatus.paid
    _hook(client, {"channel_post": {"message_id": 4, "date": int(time.time()), "text": "/iceq",
                                    "chat": {"id": CHAT, "type": "channel"}}})
    assert any("This is the payment chat" in kw.get("text", "") for m, kw in sent if m == "sendMessage")


def test_off_without_chat_id(client, catalog, db, sent, monkeypatch):
    monkeypatch.setattr(settings, "PAYWAY_CHAT_ID", "")
    r = _order(client, catalog)
    _hook(client, _group_msg(_notice(f"{_amount(r):.2f}", trx="666")))
    db.expire_all()
    assert db.get(Order, r["order"]["id"]).payment_status == PaymentStatus.unpaid
