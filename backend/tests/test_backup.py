"""Admin data backup: complete, admin-only, and never contains secrets."""
import io
import json

from openpyxl import load_workbook

from app.models import Role
from tests.conftest import login, make_user


def test_json_backup_has_data_and_no_secrets(client, db, catalog, admin_headers):
    r = client.get("/api/admin/backup/json", headers=admin_headers)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = json.loads(r.content)
    t = data["tables"]
    assert t["products"] and t["product_variants"] and t["users"]
    assert "password_hash" not in t["users"][0]
    assert "refresh_tokens" not in t and "password_reset_tokens" not in t
    assert b"$2b$" not in r.content  # no bcrypt hash anywhere


def test_excel_backup_opens_with_one_sheet_per_table(client, db, catalog, admin_headers):
    r = client.get("/api/admin/backup/xlsx", headers=admin_headers)
    assert r.status_code == 200
    wb = load_workbook(io.BytesIO(r.content))
    assert "Summary" in wb.sheetnames and "products" in wb.sheetnames and "orders" in wb.sheetnames
    head = [c.value for c in wb["users"][1]]
    assert "email" in head and "password_hash" not in head


def test_only_admins_can_download(client, db, catalog):
    make_user(db, "staff@iceqsole.com", Role.staff)
    make_user(db, "buyer@example.com", Role.customer)
    assert client.get("/api/admin/backup/json").status_code == 401
    assert client.get("/api/admin/backup/json", headers=login(client, "staff@iceqsole.com", admin=True)).status_code == 403
    assert client.get("/api/admin/backup/xlsx", headers=login(client, "buyer@example.com")).status_code == 403
