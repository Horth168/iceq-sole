"""Telegram alerts for the shop owner, with one-tap payment confirmation.

How it works
- New orders, submitted payments and low stock are sent to the admin chat(s).
- KHQR / bank-transfer orders carry two buttons: "Received" and "Not received". The owner checks
  the bank app and taps one; the order is then marked paid (and confirmed) or the payment rejected.
  Nothing is ever marked paid automatically: a person always decides.
- Only chat IDs listed in TELEGRAM_ADMIN_CHAT_IDS can press the buttons.

Messages are queued on the database session and sent only after the transaction commits, from a
background thread, so a failed order never produces an alert and requests never wait on Telegram.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import logging
import threading
from decimal import Decimal

import httpx
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import settings

log = logging.getLogger("iceq.telegram")
API = "https://api.telegram.org/bot{token}/{method}"
OUTBOX = "tg_outbox"


# ---------------------------------------------------------------- config helpers
def enabled() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


def admin_chat_ids() -> list[int]:
    out = []
    for part in settings.TELEGRAM_ADMIN_CHAT_IDS.replace(";", ",").split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            out.append(int(part))
    return out


def is_admin(chat_or_user_id: int | None) -> bool:
    return chat_or_user_id is not None and int(chat_or_user_id) in admin_chat_ids()


def webhook_secret() -> str:
    """Stable secret derived from SECRET_KEY: used in the webhook URL and Telegram's secret header."""
    return hmac.new(settings.SECRET_KEY.encode(), b"telegram-webhook", hashlib.sha256).hexdigest()[:48]


def webhook_url() -> str:
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/api/telegram/webhook/{webhook_secret()}"


# ---------------------------------------------------------------- low-level API
def call(method: str, **payload) -> dict | None:
    if not enabled():
        return None
    try:
        r = httpx.post(API.format(token=settings.TELEGRAM_BOT_TOKEN, method=method), json=payload, timeout=12)
        data = r.json()
        if not data.get("ok"):
            log.warning("Telegram %s failed: %s", method, data.get("description"))
        return data
    except Exception as e:  # noqa: BLE001 - alerts must never break the shop
        log.warning("Telegram %s error: %s", method, e.__class__.__name__)
        return None


def register_webhook() -> None:
    if not enabled() or not settings.API_PUBLIC_URL.startswith("https://"):
        return
    call("setWebhook", url=webhook_url(), secret_token=webhook_secret(),
         allowed_updates=["message", "callback_query"], drop_pending_updates=False)
    call("setMyCommands", commands=[{"command": "start", "description": "Connect this chat to IceQ Sole alerts"}])


def register_webhook_async() -> None:
    threading.Thread(target=register_webhook, daemon=True).start()


# ---------------------------------------------------------------- outbox (send after commit)
def queue(db: Session, text: str, *, buttons: list[list[dict]] | None = None, photo: str | None = None) -> None:
    if not enabled() or not admin_chat_ids():
        return
    db.info.setdefault(OUTBOX, []).append({"text": text, "buttons": buttons, "photo": photo})


def _deliver(items: list[dict]) -> None:
    for item in items:
        markup = {"inline_keyboard": item["buttons"]} if item["buttons"] else None
        for chat in admin_chat_ids():
            if item["photo"]:
                res = call("sendPhoto", chat_id=chat, photo=item["photo"], caption=item["text"][:1024],
                           parse_mode="HTML", **({"reply_markup": markup} if markup else {}))
                if res and res.get("ok"):
                    continue  # fall back to plain text if the photo could not be fetched
            call("sendMessage", chat_id=chat, text=item["text"], parse_mode="HTML",
                 disable_web_page_preview=True, **({"reply_markup": markup} if markup else {}))


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    items = session.info.pop(OUTBOX, None)
    if items:
        threading.Thread(target=_deliver, args=(items,), daemon=True).start()


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(OUTBOX, None)


# ---------------------------------------------------------------- message builders
def _e(v) -> str:
    return html.escape(str(v or ""))


def _money(v) -> str:
    return f"${Decimal(v):,.2f}"


METHOD = {"khqr": "KHQR (Bakong)", "bank_transfer": "Bank transfer", "cod": "Cash on delivery"}


def pay_buttons(order_id: int) -> list[list[dict]]:
    return [[{"text": "✅ Received", "callback_data": f"pay:ok:{order_id}"},
             {"text": "❌ Not received", "callback_data": f"pay:no:{order_id}"}]]


def _dashboard_link(order_id: int) -> str:
    base = settings.DASHBOARD_URL.rstrip("/")
    return f'\n<a href="{_e(base)}/orders/{order_id}">Open in dashboard</a>' if base.startswith("http") else ""


def order_summary(order) -> str:
    items = "\n".join(f"• {_e(i.product_name)} · {_e(i.color)} · EU {_e(i.size)} × {i.quantity}" for i in order.items)
    where = ", ".join(x for x in [order.district, order.province] if x)
    return (f"<b>{_e(order.order_number)}</b> · <b>{_money(order.total)}</b>\n"
            f"{_e(METHOD.get(order.payment_method.value, order.payment_method.value))}\n"
            f"👤 {_e(order.customer_name)} · {_e(order.customer_phone)}\n"
            f"📍 {_e(where)}\n{items}")


def new_order(db: Session, order) -> None:
    paid_online = order.payment_method.value != "cod"
    text = "🛍 <b>New order</b>\n" + order_summary(order)
    if paid_online:
        text += "\n\nCheck your bank app, then tap a button when the money arrives."
    queue(db, text + _dashboard_link(order.id), buttons=pay_buttons(order.id) if paid_online else None)


def payment_submitted(db: Session, order, payment) -> None:
    text = "💸 <b>Customer says they paid</b>\n" + order_summary(order)
    if payment and payment.reference:
        text += f"\nRef: <code>{_e(payment.reference)}</code>"
    text += "\n\nCheck your bank app for this amount, then tap a button."
    photo = payment.proof_url if payment and payment.proof_url and payment.proof_url.startswith("https://") else None
    queue(db, text + _dashboard_link(order.id), buttons=pay_buttons(order.id), photo=photo)


def low_stock(db: Session, title: str, message: str) -> None:
    queue(db, f"📦 <b>{_e(title)}</b>\n{_e(message)}")
