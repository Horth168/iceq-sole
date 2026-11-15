"""PayWay listener: a normal Telegram *user* account that reads ABA PayWay's messages for us.

Telegram never shows one bot's messages to another bot in a group, so IceQSoleAdminBot cannot see
"$2.00 paid by ..." from @PayWayByABA_bot. A user account can. This module signs in as that account
(Telethon, MTProto) and feeds every PayWay message from the payment group (PAYWAY_CHAT_ID) into
services/payway.handle - the same matching rules as before (sender must be the PayWay bot,
each ABA Trx ID used once, exact amount, only one possible order, otherwise the owner decides).

Setup (once): run `python telegram_login.py` on your computer, then set in Render:
    TG_LISTENER_API_ID, TG_LISTENER_API_HASH   (my.telegram.org -> API development tools)
    TG_LISTENER_SESSION                        (printed by telegram_login.py - keep it secret)
Off until all three are set. It reads only the payment group and never sends anything.

Reliability: on start (and every few minutes) it re-reads the group's recent messages, so a payment
that arrived while the server was restarting is still picked up. Re-reading is safe because each
transaction ID is processed once.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from datetime import timezone

from app.config import settings

log = logging.getLogger("iceq.listener")
logging.getLogger("telethon").setLevel(logging.WARNING)

RESCAN_EVERY = 300          # seconds between safety re-reads of the group
RESCAN_LIMIT = 40           # recent messages checked on each re-read
STATUS: dict = {"state": "off", "account": "", "since": None, "last_payment": None, "error": ""}
_started = False


def configured() -> bool:
    return bool(settings.TG_LISTENER_API_ID and settings.TG_LISTENER_API_HASH and settings.TG_LISTENER_SESSION
                and settings.PAYWAY_CHAT_ID.strip())


def to_bot_message(*, chat_id: int, sender_username: str | None, sender_is_bot: bool, text: str, date) -> dict:
    """Shape a Telethon message like a Bot API update, so payway.handle applies the same rules."""
    ts = date.replace(tzinfo=date.tzinfo or timezone.utc).timestamp() if date else time.time()
    return {"date": int(ts), "text": text or "",
            "chat": {"id": chat_id, "type": "supergroup"},
            "from": {"is_bot": bool(sender_is_bot), "username": sender_username or ""}}


def process(msg: dict) -> str:
    """Run one message through the PayWay matcher with its own database session."""
    from app.database import SessionLocal
    from app.services import payway
    db = SessionLocal()
    try:
        result = payway.handle(db, msg)
        if result not in ("ignored", "not_a_payment"):
            STATUS["last_payment"] = {"result": result, "at": int(time.time())}
            log.info("Listener: PayWay message -> %s", result)
        return result
    except Exception:  # noqa: BLE001 - one bad message must never stop the listener
        db.rollback()
        log.exception("Listener: could not process a PayWay message")
        return "error"
    finally:
        db.close()


async def _run() -> None:
    from telethon import TelegramClient, events
    from telethon.sessions import StringSession

    chat_id = int(settings.PAYWAY_CHAT_ID.strip())
    want = settings.PAYWAY_BOT_USERNAME.lstrip("@").lower()
    try:
        # copying a long key out of a terminal often adds line breaks or spaces: drop all whitespace
        session = StringSession("".join(settings.TG_LISTENER_SESSION.split()))
        api_id = int(str(settings.TG_LISTENER_API_ID).strip())
    except Exception:  # noqa: BLE001 - ValueError, binascii.Error, struct.error: a damaged key
        STATUS.update(state="error", error="TG_LISTENER_SESSION or TG_LISTENER_API_ID is not valid - copy them again from telegram_login.py")
        log.error("Listener: %s", STATUS["error"])
        return
    client = TelegramClient(session, api_id, settings.TG_LISTENER_API_HASH, catch_up=True, auto_reconnect=True,
                            connection_retries=None, retry_delay=5)

    async def handle(message) -> None:
        if not message or not (message.message or "").strip():
            return
        sender = await message.get_sender()
        msg = to_bot_message(chat_id=chat_id, sender_username=getattr(sender, "username", None),
                             sender_is_bot=bool(getattr(sender, "bot", False)), text=message.message, date=message.date)
        if msg["from"]["username"].lower() != want:
            return  # only PayWay's own messages are passed on (the matcher checks again)
        await asyncio.to_thread(process, msg)

    @client.on(events.NewMessage(chats=chat_id))
    async def on_new(event):  # noqa: ANN001
        await handle(event.message)

    await client.connect()
    if not await client.is_user_authorized():
        STATUS.update(state="error", error="Session expired or invalid - run telegram_login.py again")
        log.error("Listener: %s", STATUS["error"])
        return
    me = await client.get_me()
    STATUS.update(state="connected", account=(f"@{me.username}" if me.username else me.first_name or "account"),
                  since=int(time.time()), error="")
    log.info("Listener connected as %s, watching %s", STATUS["account"], chat_id)
    await client.get_dialogs()  # fills the entity cache so the group id resolves

    async def rescan() -> None:
        while True:
            try:
                async for m in client.iter_messages(chat_id, limit=RESCAN_LIMIT):
                    await handle(m)
            except Exception as e:  # noqa: BLE001
                log.warning("Listener re-read failed: %s", e.__class__.__name__)
            await asyncio.sleep(RESCAN_EVERY)

    asyncio.create_task(rescan())
    await client.run_until_disconnected()


def _thread_main() -> None:
    while True:
        try:
            asyncio.run(_run())
        except Exception as e:  # noqa: BLE001
            detail = f"{e.__class__.__module__}.{e.__class__.__name__}: {str(e)[:200]}"  # never contains the session key
            STATUS.update(state="reconnecting", error=detail)
            log.warning("Listener stopped (%s), restarting in 30 s", detail)
        if STATUS.get("state") == "error":
            return  # bad session: needs a new one, retrying would not help
        time.sleep(30)


def start() -> None:
    """Called once at startup; does nothing unless the listener is configured."""
    global _started
    if _started or not configured():
        return
    _started = True
    STATUS["state"] = "starting"
    threading.Thread(target=_thread_main, name="payway-listener", daemon=True).start()
