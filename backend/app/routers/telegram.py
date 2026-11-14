"""Telegram webhook: /start (shows your chat ID) and the Received / Not received buttons."""
from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order, OrderStatus, PaymentStatus
from app.services import orders as svc
from app.services import telegram as tg

log = logging.getLogger("iceq.telegram")
router = APIRouter(prefix="/api/telegram", tags=["Telegram"], include_in_schema=False)


def _reply(chat_id: int, text: str, reply_to: int | None = None) -> None:
    extra = {"reply_parameters": {"message_id": reply_to, "allow_sending_without_reply": True}} if reply_to else {}
    tg.call("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", **extra)


@router.post("/webhook/{secret}")
async def webhook(secret: str, request: Request, db: Session = Depends(get_db),
                  x_telegram_bot_api_secret_token: str | None = Header(None)):
    expected = tg.webhook_secret()
    if not (hmac.compare_digest(secret, expected) and hmac.compare_digest(x_telegram_bot_api_secret_token or "", expected)):
        return {"ok": True}  # silently ignore anything that isn't from our Telegram webhook
    try:
        update = await request.json()
    except Exception:  # noqa: BLE001
        return {"ok": True}
    try:
        if "callback_query" in update:
            _handle_button(db, update["callback_query"])
        elif "message" in update:
            _handle_message(update["message"])
    except Exception:  # noqa: BLE001 - always answer 200 so Telegram doesn't retry forever
        log.exception("Telegram update failed")
        db.rollback()
    return {"ok": True}


def _handle_message(msg: dict) -> None:
    chat = msg.get("chat", {})
    if chat.get("type") != "private" or not (msg.get("text") or "").startswith("/start"):
        return
    cid = chat.get("id")
    if tg.is_admin(cid):
        _reply(cid, "✅ <b>Connected to IceQ Sole.</b>\nNew orders and payments will appear here with "
                    "<b>Received</b> / <b>Not received</b> buttons.")
    else:
        _reply(cid, f"👋 Your chat ID is <code>{cid}</code>\n\nTo get IceQ Sole alerts, put this number in "
                    "<b>TELEGRAM_ADMIN_CHAT_IDS</b> (Render → iceq-sole-api → Environment), save, then send /start again.")


def _handle_button(db: Session, cq: dict) -> None:
    user = cq.get("from", {})
    msg = cq.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    answer = lambda text, alert=False: tg.call("answerCallbackQuery", callback_query_id=cq["id"], text=text, show_alert=alert)  # noqa: E731
    if not tg.is_admin(user.get("id")):
        answer("You are not allowed to confirm payments.", True)
        return
    parts = (cq.get("data") or "").split(":")
    if len(parts) != 3 or parts[0] != "pay" or parts[1] not in ("ok", "no") or not parts[2].isdigit():
        answer("Unknown action")
        return
    order = db.get(Order, int(parts[2]))
    who = user.get("first_name") or "Telegram"

    def close(text: str) -> None:
        if chat_id and msg.get("message_id"):
            tg.call("editMessageReplyMarkup", chat_id=chat_id, message_id=msg["message_id"], reply_markup={"inline_keyboard": []})
            _reply(chat_id, text, msg["message_id"])

    if order is None:
        answer("Order not found", True)
        return
    if order.status in (OrderStatus.cancelled, OrderStatus.refunded):
        answer(f"{order.order_number} is {order.status.value}.", True)
        close(f"ℹ️ {order.order_number} is already {order.status.value}.")
        return
    if order.payment_status == PaymentStatus.paid:
        answer("Already marked as paid.", True)
        close(f"ℹ️ {order.order_number} was already marked as paid.")
        return

    if parts[1] == "ok":
        svc.mark_paid(db, order, source="telegram", note=f"Money received, confirmed on Telegram by {who}")
        db.commit()
        answer("Payment confirmed ✅")
        close(f"✅ <b>Paid</b> · {order.order_number} confirmed by {who}. The customer's order page now shows it as paid.")
    else:
        p = svc.latest_payment(order)
        note = "We could not find this payment yet. Please contact us with your receipt."
        if p:
            p.status = PaymentStatus.failed
            p.note = note
        order.payment_status = PaymentStatus.failed
        svc.add_event(db, order, "payment_rejected", f"Not received (Telegram, {who})")
        svc.notify_customer(db, order, f"Payment issue on {order.order_number}", note)
        db.commit()
        answer("Marked as not received")
        close(f"❌ <b>Not received</b> · {order.order_number}. The customer is asked to contact you with their receipt.")
