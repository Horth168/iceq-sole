"""ABA merchant (PayWay) QR: per-order QRs keep the PAYWAY@ABA routing, riel mode, order-number matching.
Uses a fake merchant QR in the same layout as a real ABA PAY merchant code (made-up IDs)."""
import time
import uuid
from decimal import Decimal

from app.config import settings
from app.models import Order, PaymentStatus
from app.services import khqr, payway
from tests.conftest import CHECKOUT

T = lambda t, v: f"{t}{len(v):02d}{v}"  # noqa: E731


def fake_merchant_qr():
    acct = T("00", "abaakhppxxx@abaa") + T("01", "000000000000001") + T("02", "ABA Bank")
    routing = T("00", "PAYWAY@ABA") + T("01", "0000001") + T("02", "000000002")
    body = (T("00", "01") + T("01", "11") + T("30", acct) + T("52", "5399") + T("53", "116") + T("58", "KH")
            + T("59", "TEST MERCHANT") + T("60", "Phnom Penh") + T("62", T("68", routing)) + "6304")
    return body + khqr.crc16_ccitt(body)


def test_order_qr_keeps_payway_routing():
    tpl = fake_merchant_qr()
    q = khqr.build_from_template(tpl, amount=Decimal("2.00"), currency="USD", bill_number="IQ261115-ABCDE")
    top, src = dict(khqr.parse_tlv(q)), dict(khqr.parse_tlv(tpl))
    inner = dict(khqr.parse_tlv(top["62"]))
    assert top["30"] == src["30"] and top["01"] == "12" and top["53"] == "840" and top["54"] == "2.00"
    assert inner["68"] == dict(khqr.parse_tlv(src["62"]))["68"]      # PAYWAY@ABA routing untouched
    assert inner["01"] == "IQ261115-ABCDE"
    assert khqr.crc16_ccitt(q[:-4]) == q[-4:]


def _setup(client, admin_headers, currency):
    r = client.put("/api/admin/settings/payments", json={"khqr_template": fake_merchant_qr(), "khqr_currency": currency},
                   headers=admin_headers)
    assert r.status_code == 200, r.text


def _order(client, catalog, size="42"):
    v = catalog["variants"][("White", size)]
    token = client.post("/api/cart/items", json={"variant_id": v.id, "quantity": 1}).json()["token"]
    r = client.post("/api/checkout", json={**CHECKOUT, "payment_method": "khqr", "idempotency_key": uuid.uuid4().hex},
                    headers={"X-Cart-Token": token})
    assert r.status_code == 201, r.text
    return r.json()


def _notice(db, text):
    msg = {"date": int(time.time()), "chat": {"id": -100, "type": "supergroup"},
           "from": {"is_bot": True, "username": "PayWayByABA_bot"}, "text": text}
    return payway.handle(db, msg)


def test_riel_qr_and_riel_notice(client, db, catalog, admin_headers, monkeypatch):
    _setup(client, admin_headers, "KHR")
    monkeypatch.setattr(settings, "PAYWAY_CHAT_ID", "-100")
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "1:test")
    r = _order(client, catalog)
    pay = r["payment"]
    assert pay["currency"] == "KHR" and pay["amount"] % 100 == 0
    top = dict(khqr.parse_tlv(pay["khqr"]))
    assert top["53"] == "116" and int(top["54"]) == pay["amount"]
    # a dollar notice for the same value does not match a riel QR; the riel notice does
    assert _notice(db, f"${r['order']['total']:.2f} paid by A B (*1) on Nov 15, 10:00 AM via ABA PAY at X. Trx. ID: 7, APV: 1.") == "unmatched"
    assert _notice(db, f"៛{int(pay['amount']):,} paid by A B (*1) on Nov 15, 10:00 AM via ABA PAY at X. Trx. ID: 8, APV: 1.") == "matched"
    db.expire_all()
    assert db.get(Order, r["order"]["id"]).payment_status == PaymentStatus.paid


def test_order_number_in_notice_picks_the_right_order(client, db, catalog, admin_headers, monkeypatch):
    _setup(client, admin_headers, "USD")
    monkeypatch.setattr(settings, "PAYWAY_CHAT_ID", "-100")
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "1:test")
    a = _order(client, catalog, "42")
    b = _order(client, catalog, "43")                      # same price: amount alone is ambiguous
    num = b["order"]["order_number"]
    res = _notice(db, f"${b['order']['total']:.2f} paid by A B (*1) on Nov 15, 10:00 AM via ABA PAY at X. Remark: {num}. Trx. ID: 9, APV: 1.")
    assert res == "matched"
    db.expire_all()
    assert db.get(Order, b["order"]["id"]).payment_status == PaymentStatus.paid
    assert db.get(Order, a["order"]["id"]).payment_status == PaymentStatus.unpaid


def test_bad_currency_setting_refused(client, admin_headers):
    assert client.put("/api/admin/settings/payments", json={"khqr_currency": "EUR"}, headers=admin_headers).status_code == 400
