"""Transactional email: Brevo's HTTPS API first, SMTP as the fallback.

Render's free plan blocks outgoing SMTP ports, so there BREVO_API_KEY is what actually delivers mail.
Or set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM. When SMTP is not
configured, development logs the message instead; production logs only that it was skipped
(never the reset link, so tokens don't end up in logs).
"""
from __future__ import annotations

import logging
import smtplib
import ssl

import httpx
from email.message import EmailMessage
from email.utils import formataddr

from app.config import settings

log = logging.getLogger("iceq.email")


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def brevo_configured() -> bool:
    return bool(settings.BREVO_API_KEY and sender_address())


def email_configured() -> bool:
    return brevo_configured() or smtp_configured()


def sender_address() -> str:
    return settings.EMAIL_FROM or settings.SMTP_FROM or settings.SMTP_USER


BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def _send_brevo(to: str, subject: str, text: str, html: str | None) -> bool:
    body = {
        "sender": {"name": settings.SMTP_FROM_NAME, "email": sender_address()},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": text,
    }
    if html:
        body["htmlContent"] = html
    try:
        r = httpx.post(BREVO_URL, json=body, timeout=20,
                       headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"})
    except httpx.HTTPError as e:
        log.error("Email to %s via Brevo failed: %s", to, e)
        return False
    if r.status_code >= 300:
        # Brevo's error body explains the problem (e.g. unverified sender) and never contains the key
        log.error("Email to %s via Brevo rejected (%s): %s", to, r.status_code, r.text[:300])
        return False
    return True


def _send_smtp(to: str, subject: str, text: str, html: str | None) -> bool:
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
        log.error("Email to %s via SMTP failed: %s", to, e)
        return False


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    if not email_configured():
        if settings.is_production:
            log.warning("Email not configured - email to %s (%s) was not sent", to, subject)
        else:
            log.info("DEV EMAIL to %s | %s\n%s", to, subject, text)
        return False
    if brevo_configured() and _send_brevo(to, subject, text, html):
        return True
    if smtp_configured():
        return _send_smtp(to, subject, text, html)
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


# ---------------------------------------------------------------- order payment emails (English + Khmer)
PAYMENT_MAIL = {
    "paid": ("Payment received for {num} - IceQ Sole / បានទទួលការទូទាត់",
             "Hi {name},\n\nWe've received your payment of {amount} for order {num}. Your sneakers are now being prepared.\n"
             "Track your order: {link}\n\n"
             "សួស្តី {name},\nយើងបានទទួលការទូទាត់ {amount} សម្រាប់ការបញ្ជាទិញ {num} ហើយ។ ស្បែកជើងរបស់អ្នកកំពុងត្រូវបានរៀបចំ។\n"
             "តាមដានការបញ្ជាទិញ៖ {link}\n\nThank you / សូមអរគុណ - IceQ Sole"),
    "failed": ("We couldn't confirm your payment for {num} - IceQ Sole / មិនទាន់ទទួលបានការទូទាត់",
               "Hi {name},\n\nWe couldn't find a payment of {amount} for order {num} yet. Please open your order and pay "
               "again with a new QR, or send us your receipt:\n{link}\n\n"
               "សួស្តី {name},\nយើងមិនទាន់រកឃើញការទូទាត់ {amount} សម្រាប់ការបញ្ជាទិញ {num} នៅឡើយទេ។ "
               "សូមបើកការបញ្ជាទិញ ហើយបង់ម្តងទៀតដោយ QR ថ្មី ឬផ្ញើបង្កាន់ដៃមកយើង៖\n{link}\n\nIceQ Sole"),
}


def send_payment_update(order, kind: str, link: str) -> bool:
    """kind = paid | failed. Plain bilingual email; silently skipped when there's no address or SMTP."""
    if not order.customer_email:
        return False
    subject, body = PAYMENT_MAIL[kind]
    vals = {"num": order.order_number, "name": order.customer_name, "amount": f"${order.total:,.2f}", "link": link}
    return send_email(order.customer_email, subject.format(**vals), body.format(**vals))


# ---------------------------------------------------------------- receipts (HTML, English + Khmer)
from datetime import timedelta as _td
from html import escape as _esc

PAY_NAMES = {"khqr": "ABA KHQR", "bank_transfer": "Bank transfer", "cod": "Cash on delivery"}


def receipt_snapshot(order) -> dict:
    """Plain data copy of an order, taken in the request thread so the email thread never touches the DB."""
    from app.services.orders import invoice_number, order_link
    paid = order.payment_status.value == "paid"
    return {
        "to": order.customer_email, "name": order.customer_name, "num": order.order_number,
        "inv": invoice_number(order), "link": order_link(order), "paid": paid,
        "method": order.payment_method.value, "created": order.created_at,
        "address": ", ".join(x for x in (order.address_line, order.district, order.province) if x),
        "phone": order.customer_phone,
        "items": [{"name": i.product_name, "variant": f"{i.color} · {'EU ' + i.size if i.size[:1].isdigit() else i.size}",
                   "qty": i.quantity, "total": i.line_total, "image": i.image_url} for i in order.items],
        "subtotal": order.subtotal, "discount": order.discount_amount, "code": order.discount_code,
        "delivery": order.delivery_fee, "tax": order.tax_amount, "total": order.total, "total_khr": order.total_khr,
    }


def _money(v) -> str:
    return f"${float(v or 0):,.2f}"


def receipt_html(r: dict, kind: str) -> tuple[str, str, str]:
    """(subject, text, html) for kind = placed | paid."""
    store = settings.STORE_URL.rstrip("/")
    when = (r["created"] + _td(hours=7)).strftime("%d %b %Y, %H:%M") if r.get("created") else ""
    if kind == "paid":
        subject = f"Receipt {r['inv']} · payment received - IceQ Sole"
        head, head_km = "Payment received", "បានទទួលការទូទាត់"
        intro = f"Hi {r['name']}, thank you! We've received your payment and your order is being prepared."
        intro_km = "សូមអរគុណ! យើងបានទទួលការទូទាត់ ហើយការបញ្ជាទិញរបស់អ្នកកំពុងត្រូវបានរៀបចំ។"
    else:
        subject = f"Order {r['num']} received · receipt {r['inv']} - IceQ Sole"
        head, head_km = "Order received", "បានទទួលការបញ្ជាទិញ"
        nxt = ("We'll call you to confirm delivery." if r["method"] == "cod"
               else "Complete your payment from your order page if you haven't yet.")
        intro = f"Hi {r['name']}, thanks for shopping with IceQ Sole! Here's your receipt. {nxt}"
        intro_km = "សូមអរគុណសម្រាប់ការទិញទំនិញជាមួយ IceQ Sole! នេះជាបង្កាន់ដៃរបស់អ្នក។"
    status = ("PAID", "#D1FAE5", "#065F46") if r["paid"] else (("PAY ON DELIVERY" if r["method"] == "cod" else "AWAITING PAYMENT"), "#FEF3C7", "#92400E")
    font = "font-family:Arial,Helvetica,'Kantumruy Pro',sans-serif"

    rows = ""
    for it in r["items"]:
        img = it["image"] if (it["image"] or "").startswith("http") else ""
        pic = (f'<img src="{_esc(img)}" width="48" height="48" alt="" style="display:block;border-radius:8px;object-fit:cover;background:#F5F4F0">'
               if img else "")
        rows += (f'<tr><td style="padding:12px 0;border-bottom:1px solid #EEE;width:56px;vertical-align:top">{pic}</td>'
                 f'<td style="padding:12px 8px;border-bottom:1px solid #EEE;vertical-align:top"><b>{_esc(it["name"])}</b><br>'
                 f'<span style="color:#8A877F;font-size:12px">{_esc(it["variant"])} &times; {it["qty"]}</span></td>'
                 f'<td style="padding:12px 0;border-bottom:1px solid #EEE;text-align:right;vertical-align:top;white-space:nowrap"><b>{_money(it["total"])}</b></td></tr>')

    def line(label, value, strong=False):
        st = "font-size:18px;font-weight:900;border-top:2px solid #0B0B0D;padding-top:10px" if strong else "color:#55534E"
        return (f'<tr><td style="padding:4px 0;{st}">{label}</td>'
                f'<td style="padding:4px 0;text-align:right;white-space:nowrap;{st}">{value}</td></tr>')

    totals = line("Subtotal", _money(r["subtotal"]))
    if float(r["discount"] or 0) > 0:
        totals += line(f"Discount ({_esc(r['code'] or '')})", "&minus;" + _money(r["discount"]))
    totals += line("Delivery", _money(r["delivery"]) if float(r["delivery"] or 0) else "Free")
    if float(r["tax"] or 0) > 0:
        totals += line("Tax", _money(r["tax"]))
    totals += line("Total", _money(r["total"]), strong=True)
    totals += f'<tr><td colspan="2" style="text-align:right;color:#8A877F;font-size:12px">&asymp; {int(r["total_khr"] or 0):,} &#6107;</td></tr>'

    fact = lambda k, v, mono=True: (f'<td width="50%" style="padding:6px 8px 6px 0;vertical-align:top"><div style="font-size:10px;letter-spacing:1.5px;color:#8A877F;text-transform:uppercase">{k}</div>'  # noqa: E731
                                    f'<div style="font-weight:700;margin-top:3px;font-size:13px;word-break:break-all;{"font-family:monospace,monospace" if mono else ""}">{v}</div></td>')
    badge = (f'<span style="display:inline-block;background:{status[1]};color:{status[2]};font-size:11px;font-weight:700;'
             f'letter-spacing:1px;padding:4px 10px;border-radius:999px">{status[0]}</span>'
             f'<div style="font-size:12px;color:#55534E;margin-top:5px">{PAY_NAMES.get(r["method"], r["method"])}</div>')
    html = f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head>
<body style="margin:0;background:#F5F4F0;padding:20px 10px;{font};color:#0B0B0D">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0B0B0D;padding:18px 20px">
  <table role="presentation" width="100%"><tr>
  <td><img src="{store}/icons/icon-192.png" width="40" height="40" alt="IceQ Sole" style="vertical-align:middle;border-radius:10px">
      <span style="color:#fff;font-size:20px;font-weight:900;vertical-align:middle;margin-left:10px">ICEQ <span style="font-size:10px;letter-spacing:4px">SOLE</span></span></td>
  <td style="text-align:right;color:#fff"><div style="font-size:18px;font-weight:900;text-transform:uppercase">Receipt</div>
      <div style="font-family:monospace,monospace;font-size:12px;color:#BDBAB2">{r['inv']}</div></td></tr></table>
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <div style="font-size:22px;font-weight:900">{head}</div><div style="color:#8A877F;font-size:13px;margin-top:2px">{head_km}</div>
  <p style="font-size:14px;line-height:1.6;margin:14px 0 4px">{_esc(intro)}</p>
  <p style="font-size:13px;line-height:1.6;color:#55534E;margin:0">{intro_km}</p>
</td></tr>
<tr><td style="padding:18px 28px">
  <table role="presentation" width="100%" style="border:1px solid #EEE;border-radius:12px;padding:10px 14px">
    <tr>{fact("Invoice no.", r['inv'])}{fact("Tracking code", r['num'])}</tr>
    <tr>{fact("Date", when, mono=False)}<td width="50%" style="padding:6px 0;vertical-align:top"><div style="font-size:10px;letter-spacing:1.5px;color:#8A877F;text-transform:uppercase;margin-bottom:4px">Payment</div>{badge}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellspacing="0" style="font-size:14px;border-collapse:collapse">{rows}</table></td></tr>
<tr><td style="padding:12px 28px 4px"><table role="presentation" width="100%" cellspacing="0" style="font-size:14px;border-collapse:collapse">{totals}</table></td></tr>
<tr><td style="padding:10px 28px 4px;font-size:13px;color:#55534E"><b style="color:#0B0B0D">Deliver to:</b> {_esc(r['address'])} · {_esc(r['phone'])}</td></tr>
<tr><td style="padding:22px 28px 30px;text-align:center">
  <a href="{r['link']}" style="display:inline-block;background:#0B0B0D;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px">Track your order &rarr;</a>
  <div style="color:#8A877F;font-size:12px;margin-top:10px">Or enter <b>{r['num']}</b> at {store}/track</div>
</td></tr>
<tr><td style="background:#F5F4F0;padding:16px 28px;text-align:center;color:#8A877F;font-size:11px;line-height:1.6">
  Unworn items in original packaging can be exchanged within 7 days with this receipt.<br>IceQ Sole · {store.replace('https://', '')}
</td></tr></table></body></html>"""
    lines = [f"{head} / {head_km}", "", intro, intro_km, "", f"Invoice: {r['inv']}", f"Tracking code: {r['num']}",
             f"Date: {when}", f"Payment: {PAY_NAMES.get(r['method'], r['method'])} - {status[0]}", ""]
    lines += [f"- {it['name']} ({it['variant']}) x{it['qty']}: {_money(it['total'])}" for it in r["items"]]
    lines += ["", f"Total: {_money(r['total'])}", f"Track your order: {r['link']}", "", "IceQ Sole"]
    text = chr(10).join(lines)
    return subject, text, html


def send_receipt(r: dict, kind: str) -> bool:
    if not r.get("to"):
        return False
    subject, text, html = receipt_html(r, kind)
    return send_email(r["to"], subject, text, html)


def send_receipt_later(order, kind: str) -> None:
    """kind = placed (right after checkout) | paid (payment confirmed). Runs after the response."""
    if not order.customer_email:
        return
    import threading
    threading.Thread(target=send_receipt, args=(receipt_snapshot(order), kind), daemon=True).start()


def send_payment_update_later(order, kind: str, link: str) -> None:
    """Send after the response, without holding the database session. Paid = the PAID receipt."""
    if kind == "paid":
        send_receipt_later(order, "paid")
        return
    import threading
    from types import SimpleNamespace
    snap = SimpleNamespace(order_number=order.order_number, customer_name=order.customer_name,
                           customer_email=order.customer_email, total=order.total)
    if snap.customer_email:
        threading.Thread(target=send_payment_update, args=(snap, kind, link), daemon=True).start()
