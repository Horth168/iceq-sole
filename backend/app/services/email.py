"""Transactional email over SMTP (e.g. Gmail with an App password).

Set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM. When SMTP is not
configured, development logs the message instead; production logs only that it was skipped
(never the reset link, so tokens don't end up in logs).
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.config import settings

log = logging.getLogger("iceq.email")


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    if not smtp_configured():
        if settings.is_production:
            log.warning("SMTP not configured - email to %s (%s) was not sent", to, subject)
        else:
            log.info("DEV EMAIL to %s | %s\n%s", to, subject, text)
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM or settings.SMTP_USER))
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        ctx = ssl.create_default_context()
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, 465, context=ctx, timeout=20) as s:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
                s.starttls(context=ctx)
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as e:
        log.error("Email to %s failed: %s", to, e)
        return False


RESET = {
    "en": {
        "subject": "Reset your IceQ Sole password",
        "hello": "Hi {name},",
        "body": "We received a request to reset your IceQ Sole password. This link works once and expires in {minutes} minutes:",
        "button": "Choose a new password",
        "ignore": "If you didn't ask for this, you can ignore this email - your password stays the same.",
    },
    "km": {
        "subject": "កំណត់ពាក្យសម្ងាត់ IceQ Sole របស់អ្នកឡើងវិញ",
        "hello": "សួស្តី {name},",
        "body": "យើងបានទទួលសំណើកំណត់ពាក្យសម្ងាត់ IceQ Sole របស់អ្នកឡើងវិញ។ តំណនេះប្រើបានតែម្តង ហើយផុតកំណត់ក្នុងរយៈពេល {minutes} នាទី៖",
        "button": "ជ្រើសរើសពាក្យសម្ងាត់ថ្មី",
        "ignore": "ប្រសិនបើអ្នកមិនបានស្នើសុំទេ សូមកុំខ្វល់នឹងអ៊ីមែលនេះ — ពាក្យសម្ងាត់របស់អ្នកនៅដដែល។",
    },
}


def send_password_reset(to: str, name: str, link: str, locale: str = "en") -> bool:
    t = RESET.get(locale, RESET["en"])
    minutes = settings.PASSWORD_RESET_EXPIRE_MINUTES
    hello = t["hello"].format(name=name or "there")
    body = t["body"].format(minutes=minutes)
    text = f"{hello}\n\n{body}\n{link}\n\n{t['ignore']}\n\nIceQ Sole"
    html = f"""<div style="font-family:Arial,'Kantumruy Pro',sans-serif;max-width:520px;margin:auto;color:#0A0A0B">
<p style="font-size:20px;font-weight:900;letter-spacing:-.5px">ICEQ <span style="font-size:11px;letter-spacing:4px">SOLE</span></p>
<p>{hello}</p><p>{body}</p>
<p><a href="{link}" style="display:inline-block;background:#0A0A0B;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">{t['button']}</a></p>
<p style="color:#8A877F;font-size:13px">{t['ignore']}</p></div>"""
    return send_email(to, t["subject"], text, html)
