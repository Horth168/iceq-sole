"""Sales reports: only paid, non-cancelled sales count; online vs POS; products/sizes; Excel; permissions."""
import io
import uuid

from openpyxl import load_workbook

from app.models import Role
from tests.conftest import CHECKOUT, login, make_user


def _pos_sale(client, headers, catalog, size="42"):
    v = catalog["variants"][("White", size)]
    r = client.post("/api/admin/pos/sales", headers=headers, json={
        "items": [{"variant_id": v.id, "quantity": 1}], "payment_method": "cash", "cash_usd": 1000,
        "idempotency_key": uuid.uuid4().hex})
    assert r.status_code == 201, r.text
    return r.json()["order"]


def _online_cod(client, catalog, size="43"):
    v = catalog["variants"][("White", size)]
    token = client.post("/api/cart/items", json={"variant_id": v.id, "quantity": 1}).json()["token"]
    r = client.post("/api/checkout", json={**CHECKOUT, "payment_method": "cod", "idempotency_key": uuid.uuid4().hex},
                    headers={"X-Cart-Token": token})
    assert r.status_code == 201, r.text
    return r.json()["order"]


def test_report_counts_only_paid_sales(client, catalog, admin_headers):
    pos = _pos_sale(client, admin_headers, catalog)                       # paid in store
    online = _online_cod(client, catalog)                                 # not paid yet
    r = client.get("/api/admin/reports", headers=admin_headers).json()
    k = r["kpis"]
    assert k["orders"]["value"] == 1 and abs(k["revenue"]["value"] - pos["total"]) < 0.01
    assert k["unpaid"]["value"] == 1 and k["items"]["value"] == 1
    assert {c["name"] for c in r["channels"]} == {"pos"}
    # the COD order gets paid -> it counts as an online sale
    assert client.post(f"/api/admin/orders/{online['id']}/payment", json={"approve": True}, headers=admin_headers).status_code == 200
    r = client.get("/api/admin/reports", headers=admin_headers).json()
    assert r["kpis"]["orders"]["value"] == 2
    ch = {c["name"]: c for c in r["channels"]}
    assert ch["online"]["orders"] == 1 and ch["pos"]["orders"] == 1
    assert sum(p["revenue"] for p in r["payments"]) == r["kpis"]["revenue"]["value"]
    assert r["products"][0]["units"] == 2 and {s["size"] for s in r["sizes"]} == {"42", "43"}
    day = r["series"][-1]
    assert day["online"] > 0 and day["pos"] > 0 and r["grouped_by"] == "day" and r["days"] == 30


def test_cancelled_orders_not_counted(client, catalog, admin_headers):
    o = _online_cod(client, catalog)
    assert client.post(f"/api/admin/orders/{o['id']}/status", json={"status": "cancelled"}, headers=admin_headers).status_code == 200
    r = client.get("/api/admin/reports", headers=admin_headers).json()
    assert r["kpis"]["revenue"]["value"] == 0 and r["kpis"]["cancelled"]["value"] == 1


def test_long_range_groups_by_month_and_dates_checked(client, admin_headers):
    r = client.get("/api/admin/reports", params={"start": "2026-01-01", "end": "2026-11-15"}, headers=admin_headers).json()
    assert r["grouped_by"] == "month" and r["series"][0]["label"] == "2026-01"
    assert client.get("/api/admin/reports", params={"start": "15-11-2026"}, headers=admin_headers).status_code == 422


def test_excel_export(client, catalog, admin_headers):
    _pos_sale(client, admin_headers, catalog)
    x = client.get("/api/admin/reports/xlsx", headers=admin_headers)
    assert x.status_code == 200 and "attachment" in x.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(x.content))
    assert {"Summary", "Products", "Sizes", "Payments", "Channels"} <= set(wb.sheetnames)


def test_cashiers_cannot_see_reports(client, db, catalog):
    make_user(db, "till@iceqsole.com", Role.cashier)
    h = login(client, "till@iceqsole.com", admin=True)
    assert client.get("/api/admin/reports", headers=h).status_code == 403
