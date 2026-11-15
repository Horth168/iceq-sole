"""One-time sign-in for the PayWay listener account. Run it on YOUR computer, not on the server.

    cd backend
    pip install telethon==1.36.0          (already installed if you use the project's venv)
    python telegram_login.py

It asks for the API ID / API hash from my.telegram.org, then the phone number of the listener
account and the code Telegram sends to it (and the account's 2-step password if it has one - typed
only into this window, never stored). It checks that the account is in the payment group and prints
a SESSION key. Paste the three values into Render -> iceq-sole-api -> Environment:

    TG_LISTENER_API_ID, TG_LISTENER_API_HASH, TG_LISTENER_SESSION

The session key works like a password for that Telegram account: don't share it, don't commit it.
To cancel it later: Telegram -> Settings -> Devices -> end the "IceQ PayWay listener" session.
"""
from __future__ import annotations

import asyncio
import getpass
import pathlib

PAYMENT_GROUP_ID = -1004470641278   # "IceQ Sole Payment" (shown by /iceq@IceQSoleAdminBot)
PAYWAY_BOT = "payway"                # part of PayWay's username, to show recent payments


async def main() -> None:
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    print("IceQ Sole · PayWay listener sign-in\n")
    api_id = int(input("API ID (numbers, from my.telegram.org): ").strip())
    api_hash = input("API hash: ").strip()
    client = TelegramClient(StringSession(), api_id, api_hash, device_model="IceQ PayWay listener",
                            system_version="server", app_version="1.0")
    await client.start(phone=lambda: input("Phone number of the listener account (e.g. +855 12 345 678): ").strip(),
                       code_callback=lambda: input("Code Telegram just sent you: ").strip(),
                       password=lambda: getpass.getpass("2-step verification password (hidden, Enter if none): "))
    me = await client.get_me()
    print(f"\nSigned in as {me.first_name} (@{me.username or '-'})")

    await client.get_dialogs()
    try:
        group = await client.get_entity(PAYMENT_GROUP_ID)
        print(f"Payment group found: {getattr(group, 'title', PAYMENT_GROUP_ID)}")
        recent = [m async for m in client.iter_messages(group, limit=15)]
        payway = 0
        for m in recent:
            s = await m.get_sender()
            if PAYWAY_BOT in (getattr(s, "username", "") or "").lower():
                payway += 1
        print(f"PayWay messages visible in the last 15: {payway}  (should be more than 0 if PayWay posted recently)")
    except Exception as e:  # noqa: BLE001
        print(f"!! This account can't see the payment group ({e.__class__.__name__}). Add it to "
              "'IceQ Sole Payment' in Telegram, then run this again.")

    session = client.session.save()
    out = pathlib.Path(__file__).with_name(".env.listener")   # git-ignored (.env.*): never committed
    out.write_text(f"TG_LISTENER_API_ID={api_id}\nTG_LISTENER_API_HASH={api_hash}\nTG_LISTENER_SESSION={session}\n",
                   encoding="utf-8")
    print("\n" + "=" * 72)
    print(f"Saved the three values to:\n  {out}\n")
    print("Open that file in Notepad and copy each value from there - the session key is long and")
    print("terminals often break it when you copy. In Render -> iceq-sole-api -> Environment set:")
    print("  TG_LISTENER_API_ID    = the text after 'TG_LISTENER_API_ID='")
    print("  TG_LISTENER_API_HASH  = the text after 'TG_LISTENER_API_HASH='")
    print(f"  TG_LISTENER_SESSION   = the text after 'TG_LISTENER_SESSION=' ({len(session)} characters)")
    print("=" * 72)
    print("Keep that file and the session key secret - they sign in to this Telegram account.")
    print("Delete the file once Render has the values.")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
