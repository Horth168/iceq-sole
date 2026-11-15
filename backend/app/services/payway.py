"""Automatic KHQR payment confirmation from ABA PayWay's Telegram notifications.

ABA's "PayWay by ABA" bot posts a message for every payment into a chat you link in the ABA app:

    $1.00 paid by SIN MONG HORTH (*291) on Nov 15, 03:28 AM via ABA PAY at SIN MONG HORTH.
    Trx. ID: 179468810879402, APV: 929857.

Our admin bot reads those messages and confirms the matching order by itself. Safety rules:

* Only the configured chat (PAYWAY_CHAT_ID) is listened to.
* In a group, the message must come from the PayWay bot itself (Telegram user, is_bot, username
  PAYWAY_BOT_USERNAME). Nobody can post as another bot, so typing "$1.00 paid by ..." does nothing.
  In a channel every post is from the channel; only channel admins can post, so keep it private
  with just you and the two bots as admins.
* Every ABA transaction ID is used once (stored as the payment's reference "ABA <trx>").
* No cents trick: an order is confirmed only when EXACTLY ONE unpaid KHQR order has that exact
  amount and its QR was live when the money arrived. Two possible orders -> you get buttons
  instead; no possible order -> you get told, nothing is changed.

Note: Telegram never delivers one bot's messages to another bot inside a GROUP. Inside a CHANNEL
the posts are the channel's, so admin bots do receive them. See ops notes in the final setup steps.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Order, OrderStatus, Payment, PaymentMethod, PaymentStatus
from app.services import orders as svc
from app.services import telegram as tg
from app.utils import as_aware, utcnow

log = logging.getLogger("iceq.payway")

# "$1.00 paid by NAME (*291) on Nov 15, 03:28 AM via ABA PAY at MERCHANT. Trx. ID: 1794..., APV: 929857."
PATTERN = re.compile(
    r"(?P<cur>\$|USD|៛|KHR)\s?(?P<amount>\d[\d,]*(?:\.\d{1,2})?)\s+paid\s+by\s+(?P<payer>.+?)"
    r"(?:\s+\((?P<account>[^)]*)\))?\s+on\s+(?P<when>.+?)\s+via\s+(?P<via>.+?)\s+at\s+(?P<merchant>.+?)\.?\s*"
    r"Trx\.?\s*ID:?\s*(?P<trx>\d+)(?:\s*,\s*APV:?\s*(?P<apv>\d+))?",
    re.IGNORECASE | re.DOTALL,
)
GRACE = timedelta(minutes=10)   # money that lands a little after the QR's countdown still counts


@dataclass
class Notice:
    currency: str      # "USD" | "KHR"
    amount: Decimal
    payer: str
    account: str
    trx: str
    apv: str
    text: str


def parse(text: str) -> Notice | None:
    m = PATTERN.search(text or "")
    if not m:
        return None
    try:
        amount = Decimal(m["amount"].replace(",", ""))
    except InvalidOperation:
        return None
    cur = "KHR" if m["cur"] in ("៛", "KHR", "khr") else "USD"
    return Notice(cur, amount, " ".join(m["payer"].split()), (m["account"] or "").strip(), m["trx"], m["apv"] or "", text)


# ---------------------------------------------------------------- which messages to trust
def enabled() -> bool:
    return tg.enabled() and bool(settings.PAYWAY_CHAT_ID.strip())


def from_payway(msg: dict) -> bool:
    """True when this Telegram message is a genuine PayWay notification in our payment chat."""
    chat = msg.get("chat") or {}
    if str(chat.get("id")) != settings.PAYWAY_CHAT_ID.strip():
        return False
    if chat.get("type") == "channel":
        return True  # channel posts can only be made by the channel's admins
    sender = msg.get("from") or {}
    want = settings.PAYWAY_BOT_USERNAME.lstrip("@").lower()
    return bool(sender.get("is_bot")) and (sender.get("username") or "").lower() == want


# ---------------------------------------------------------------- matching
ORDER_NO = re.compile(r"\bIQ\d{6}-[A-Z0-9]{5}\b")


def candidates(db: Session, notice: Notice, received_at: datetime) -> list[tuple[Order, Payment]]:
    """Unpaid KHQR orders whose current QR asks for exactly this amount (and currency) and was live at
    received_at. If ABA's message carries our order number (the QR's bill number), only that order."""
    numbers = set(ORDER_NO.findall(notice.text or ""))
    rows = (db.query(Order, Payment).join(Payment, Payment.order_id == Order.id)
            .filter(Order.payment_method == PaymentMethod.khqr,
                    Order.payment_status.in_([PaymentStatus.unpaid, PaymentStatus.submitted]),
                    Order.status.notin_([OrderStatus.cancelled, OrderStatus.refunded]),
                    Payment.method == PaymentMethod.khqr,
                    Payment.status.in_([PaymentStatus.unpaid, PaymentStatus.submitted]),
                    Payment.currency == notice.currency,
                    Payment.amount == notice.amount)
            .all())
    if numbers:
        rows = [(o, p) for o, p in rows if o.order_number in numbers]
    out = []
    for order, pay in rows:
        if svc.latest_payment(order) is not pay:
            continue  # an older QR that was replaced by a new one
        start = as_aware(pay.created_at) - timedelta(minutes=1)
        end = as_aware(pay.expires_at) + GRACE if pay.expires_at else start + timedelta(hours=2)
        if start <= received_at <= end:
            out.append((order, pay))
    return out


def already_used(db: Session, trx: str) -> bool:
    return db.query(Payment.id).filter(Payment.reference == f"ABA {trx}").first() is not None


SEEN_KEY, SEEN_MAX = "payway_seen", 500


def _seen(db: Session) -> dict:
    from app.models import StoreSetting
    row = db.get(StoreSetting, SEEN_KEY)
    return dict(row.value or {}) if row else {}


def already_seen(db: Session, trx: str) -> bool:
    """Payments that matched nothing / several orders are remembered too, so the owner is told once."""
    return trx in _seen(db)


def remember(db: Session, trx: str, outcome: str) -> None:
    from app.models import StoreSetting
    seen = _seen(db)
    seen[trx] = outcome
    if len(seen) > SEEN_MAX:
        seen = dict(list(seen.items())[-SEEN_MAX:])
    row = db.get(StoreSetting, SEEN_KEY)
    if row:
        row.value = seen
    else:
        db.add(StoreSetting(key=SEEN_KEY, value=seen))


def _money(n: Notice) -> str:
    return f"${n.amount:,.2f}" if n.currency == "USD" else f"៛{n.amount:,.0f}"


def handle(db: Session, msg: dict) -> str:
    """Process one Telegram message. Returns what happened (for logs and tests)."""
    if not enabled() or not from_payway(msg):
        return "ignored"
    notice = parse(msg.get("text") or msg.get("caption") or "")
    if notice is None:
        return "not_a_payment"
    if already_used(db, notice.trx) or already_seen(db, notice.trx):
        return "duplicate"
    log.info("PayWay notice in %s: %s %s, Trx %s", (msg.get("chat") or {}).get("id"), notice.currency, notice.amount, notice.trx)
    received_at = datetime.fromtimestamp(msg.get("date") or utcnow().timestamp(), tz=timezone.utc)
    who = f"{tg._e(notice.payer)}" + (f" ({tg._e(notice.account)})" if notice.account else "")
    found = candidates(db, notice, received_at)

    if len(found) == 1:
        order, pay = found[0]
        db.refresh(order, with_for_update=True)       # lock the order row (Postgres); re-check after the lock
        if order.payment_status == PaymentStatus.paid or already_used(db, notice.trx):
            return "duplicate"
        pay.reference = f"ABA {notice.trx}"
        pay.gateway_response = {"source": "payway_telegram", "payer": notice.payer, "account": notice.account,
                                "amount": str(notice.amount), "currency": notice.currency, "trx": notice.trx,
                                "apv": notice.apv, "received_at": received_at.isoformat()}
        svc.confirm_payment(db, order, source="payway",
                            note=f"Paid {_money(notice)} by {notice.payer} {notice.account} · ABA Trx {notice.trx}".strip())
        tg.queue(db, f"✅ <b>Paid automatically</b> · {order.order_number}\n"
                     f"{_money(notice)} from {who}\nABA Trx {tg._e(notice.trx)} · moved to <b>Processing</b>.")
        db.commit()
        from app.services.email import send_payment_update_later
        send_payment_update_later(order, "paid", svc.order_link(order))
        return "matched"

    if len(found) > 1:
        lines = "\n".join(f"• {o.order_number} · {tg._e(o.customer_name)} · {tg._e(o.customer_phone)}" for o, _ in found)
        tg.queue(db, f"⚠️ <b>{_money(notice)} received from {who}</b>, but {len(found)} orders are waiting for that "
                     f"exact amount, so I didn't guess.\n{lines}\nABA Trx {tg._e(notice.trx)}\n"
                     "Press <b>Received</b> on the right order:",
                 buttons=[[{"text": f"Received · {o.order_number}", "callback_data": f"pay:ok:{o.id}"}] for o, _ in found])
        remember(db, notice.trx, "ambiguous")
        db.commit()
        return "ambiguous"

    tg.queue(db, f"ℹ️ <b>{_money(notice)} received from {who}</b>, but no unpaid KHQR order is waiting for that "
                 f"amount right now (ABA Trx {tg._e(notice.trx)}). If it belongs to an order, confirm it in the dashboard.")
    remember(db, notice.trx, "unmatched")
    db.commit()
    return "unmatched"
