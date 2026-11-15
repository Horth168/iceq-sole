"""Sales reports for the dashboard: any date range (Cambodia time), compared with the period before.

A "sale" is an order that is PAID and not cancelled/refunded, online or in store (POS), so every
figure here is money actually received. Revenue = order total (USD, after discount, incl. delivery).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.models import Order, OrderStatus, PaymentStatus, Product

CAMBODIA = timezone(timedelta(hours=7))
DONE = (OrderStatus.cancelled, OrderStatus.refunded)


def _range(start: str | None, end: str | None) -> tuple[date, date]:
    today = datetime.now(CAMBODIA).date()
    try:
        e = date.fromisoformat(end) if end else today
        s = date.fromisoformat(start) if start else e - timedelta(days=29)
    except ValueError as exc:
        raise HTTPException(400, "Dates must look like 2026-11-15") from exc
    if s > e:
        s, e = e, s
    if (e - s).days > 3 * 366:
        raise HTTPException(400, "Choose a range of 3 years or less")
    return s, e


def _utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=CAMBODIA).astimezone(timezone.utc)


def _orders(db: Session, s: date, e: date) -> list[Order]:
    return (db.query(Order).options(selectinload(Order.items))
            .filter(Order.created_at >= _utc(s), Order.created_at < _utc(e + timedelta(days=1)))
            .all())


def _local_day(o: Order) -> date:
    c = o.created_at if o.created_at.tzinfo else o.created_at.replace(tzinfo=timezone.utc)
    return c.astimezone(CAMBODIA).date()


def _totals(orders: list[Order]) -> dict:
    paid = [o for o in orders if o.payment_status == PaymentStatus.paid and o.status not in DONE]
    revenue = sum((o.total for o in paid), Decimal(0))
    items = sum(i.quantity for o in paid for i in o.items)
    return {
        "revenue": float(revenue), "orders": len(paid), "items": items,
        "aov": float(revenue / len(paid)) if paid else 0.0,
        "discounts": float(sum((o.discount_amount or 0 for o in paid), Decimal(0))),
        "delivery": float(sum((o.delivery_fee or 0 for o in paid), Decimal(0))),
        "cancelled": len([o for o in orders if o.status in DONE]),
        "unpaid": len([o for o in orders if o.payment_status != PaymentStatus.paid and o.status not in DONE]),
    }


def _change(now: float, before: float) -> float | None:
    if not before:
        return None
    return round((now - before) / before * 100, 1)


def build(db: Session, start: str | None, end: str | None) -> dict:
    s, e = _range(start, end)
    days = (e - s).days + 1
    orders = _orders(db, s, e)
    prev = _orders(db, s - timedelta(days=days), s - timedelta(days=1))
    cur, before = _totals(orders), _totals(prev)
    paid = [o for o in orders if o.payment_status == PaymentStatus.paid and o.status not in DONE]

    # revenue over time: by day, or by month for long ranges
    monthly = days > 92
    key = (lambda d: d.strftime("%Y-%m")) if monthly else (lambda d: d.isoformat())
    buckets: dict[str, dict] = {}
    d = s
    while d <= e:
        buckets.setdefault(key(d), {"label": key(d), "online": 0.0, "pos": 0.0, "orders": 0})
        d += timedelta(days=1)
    for o in paid:
        b = buckets[key(_local_day(o))]
        b["pos" if o.channel == "pos" else "online"] += float(o.total)
        b["orders"] += 1
    series = [{**b, "online": round(b["online"], 2), "pos": round(b["pos"], 2)} for b in buckets.values()]

    def group(fn) -> list[dict]:
        acc: dict[str, dict] = defaultdict(lambda: {"revenue": Decimal(0), "orders": 0})
        for o in paid:
            k = fn(o)
            acc[k]["revenue"] += o.total
            acc[k]["orders"] += 1
        return sorted(({"name": k, "revenue": float(v["revenue"]), "orders": v["orders"]} for k, v in acc.items()),
                      key=lambda r: -r["revenue"])

    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(
        {i.product_id for o in paid for i in o.items if i.product_id})).all()} if paid else {}
    per_product: dict[str, dict] = defaultdict(lambda: {"units": 0, "revenue": Decimal(0), "brand": "", "id": None})
    per_brand: dict[str, dict] = defaultdict(lambda: {"units": 0, "revenue": Decimal(0)})
    per_cat: dict[str, dict] = defaultdict(lambda: {"units": 0, "revenue": Decimal(0)})
    per_size: dict[str, int] = defaultdict(int)
    for o in paid:
        for i in o.items:
            pp = per_product[i.product_name]
            pp["units"] += i.quantity
            pp["revenue"] += i.line_total
            pp["brand"], pp["id"] = i.brand_name, i.product_id
            per_brand[i.brand_name or "Other"]["units"] += i.quantity
            per_brand[i.brand_name or "Other"]["revenue"] += i.line_total
            p = products.get(i.product_id)
            cat = p.category.name if p and p.category else "Other"
            per_cat[cat]["units"] += i.quantity
            per_cat[cat]["revenue"] += i.line_total
            per_size[i.size] += i.quantity

    def rows(m: dict) -> list[dict]:
        return sorted(({"name": k, "units": v["units"], "revenue": float(v["revenue"]),
                        **({"brand": v["brand"], "product_id": v["id"]} if "brand" in v else {})} for k, v in m.items()),
                      key=lambda r: (-r["revenue"], -r["units"]))

    size_key = lambda k: (0, float(k)) if k.replace(".", "", 1).isdigit() else (1, 0.0)  # noqa: E731
    return {
        "start": s.isoformat(), "end": e.isoformat(), "days": days, "grouped_by": "month" if monthly else "day",
        "previous": {"start": (s - timedelta(days=days)).isoformat(), "end": (s - timedelta(days=1)).isoformat()},
        "kpis": {k: {"value": v, "change": _change(v, before[k])} for k, v in cur.items()},
        "series": series,
        "channels": group(lambda o: "pos" if o.channel == "pos" else "online"),
        "payments": group(lambda o: o.payment_method.value),
        "provinces": group(lambda o: o.province or "Other") if paid else [],
        "products": rows(per_product)[:15],
        "brands": rows(per_brand),
        "categories": rows(per_cat),
        "sizes": [{"size": k, "units": v} for k, v in sorted(per_size.items(), key=lambda kv: size_key(kv[0]))],
    }


def to_xlsx(report: dict) -> bytes:
    import io

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws.append([f"IceQ Sole sales report {report['start']} to {report['end']}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Compared with {report['previous']['start']} to {report['previous']['end']}"])
    ws.append([])
    ws.append(["Measure", "Value", "Change vs previous (%)"])
    names = {"revenue": "Revenue (USD)", "orders": "Paid orders", "items": "Items sold", "aov": "Average order (USD)",
             "discounts": "Discounts given (USD)", "delivery": "Delivery fees (USD)", "cancelled": "Cancelled / refunded",
             "unpaid": "Waiting for payment"}
    for k, label in names.items():
        kp = report["kpis"][k]
        ws.append([label, round(kp["value"], 2) if isinstance(kp["value"], float) else kp["value"], kp["change"]])
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 24
    head = PatternFill("solid", fgColor="0B0B0D")

    def sheet(title: str, columns: list[str], data: list[list]):
        s = wb.create_sheet(title)
        s.append(columns)
        for c in s[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = head
        for r in data:
            s.append(r)
        for i, _ in enumerate(columns):
            s.column_dimensions[chr(65 + i)].width = 22 if i == 0 else 16
        s.freeze_panes = "A2"

    sheet("By " + report["grouped_by"], [report["grouped_by"].title(), "Online (USD)", "In store (USD)", "Total (USD)", "Orders"],
          [[r["label"], r["online"], r["pos"], round(r["online"] + r["pos"], 2), r["orders"]] for r in report["series"]])
    sheet("Products", ["Product", "Brand", "Units", "Revenue (USD)"],
          [[r["name"], r.get("brand", ""), r["units"], r["revenue"]] for r in report["products"]])
    sheet("Brands", ["Brand", "Units", "Revenue (USD)"], [[r["name"], r["units"], r["revenue"]] for r in report["brands"]])
    sheet("Categories", ["Category", "Units", "Revenue (USD)"], [[r["name"], r["units"], r["revenue"]] for r in report["categories"]])
    sheet("Sizes", ["Size", "Units sold"], [[r["size"], r["units"]] for r in report["sizes"]])
    sheet("Payments", ["Method", "Orders", "Revenue (USD)"], [[r["name"], r["orders"], r["revenue"]] for r in report["payments"]])
    sheet("Channels", ["Channel", "Orders", "Revenue (USD)"], [[r["name"], r["orders"], r["revenue"]] for r in report["channels"]])
    sheet("Provinces", ["Province", "Orders", "Revenue (USD)"], [[r["name"], r["orders"], r["revenue"]] for r in report["provinces"]])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
