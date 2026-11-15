"""Download a full backup of the store's data (admins only): Excel (one sheet per table) or JSON.

Secrets never leave the server: password hashes are blanked and sign-in / reset tokens are skipped.
JSON keeps exact values (money as strings, times in ISO-8601 UTC) so it can be re-imported later.
"""
from __future__ import annotations

import io
import json
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, get_db
from app.limiter import limiter
from app.models import User
from app.security import require_admin
from app.utils import utcnow


router = APIRouter(prefix="/api/admin/backup", tags=["Admin · backup"])

SKIP_TABLES = {"refresh_tokens", "password_reset_tokens", "alembic_version"}
REDACT = {("users", "password_hash"), ("users", "token_version")}


def _value(v):
    if isinstance(v, Enum):
        return v.value
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, bytes):
        return None
    return v


def collect(db: Session) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for table in Base.metadata.sorted_tables:
        if table.name in SKIP_TABLES:
            continue
        cols = [c for c in table.columns if (table.name, c.name) not in REDACT]
        rows = db.execute(select(*cols).order_by(*table.primary_key.columns)).all()
        out[table.name] = [{c.name: _value(r[i]) for i, c in enumerate(cols)} for r in rows]
    return out


def _stamp() -> str:
    return utcnow().strftime("%Y-%m-%d_%H%M")


@router.get("/json")
@limiter.limit("10/hour")
def backup_json(request: Request, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    data = {"store": "IceQ Sole", "exported_at": utcnow().isoformat(), "format": 1, "tables": collect(db)}
    body = json.dumps(data, ensure_ascii=False, indent=1, default=str).encode()
    return Response(body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="iceq-sole-backup_{_stamp()}.json"',
                             "Cache-Control": "no-store"})


@router.get("/xlsx")
@limiter.limit("10/hour")
def backup_xlsx(request: Request, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    tables = collect(db)
    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    summary.append(["IceQ Sole backup", utcnow().strftime("%Y-%m-%d %H:%M UTC")])
    summary.append([])
    summary.append(["Table", "Rows"])
    for name, rows in tables.items():
        summary.append([name, len(rows)])
    summary["A1"].font = Font(bold=True, size=14)
    for c in summary[3]:
        c.font = Font(bold=True)
    summary.column_dimensions["A"].width = 28

    head_fill = PatternFill("solid", fgColor="0B0B0D")
    for name, rows in tables.items():
        ws = wb.create_sheet(name[:31])
        cols = [c.name for c in Base.metadata.tables[name].columns if (name, c.name) not in REDACT]
        ws.append(cols)
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = head_fill
        for r in rows:
            ws.append([json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for v in (r[c] for c in cols)])
        ws.freeze_panes = "A2"
        for i, c in enumerate(cols, start=1):
            longest = max([len(str(c))] + [len(str(r[c])) for r in rows[:200] if r[c] is not None])
            ws.column_dimensions[get_column_letter(i)].width = min(48, max(10, longest + 2))
    buf = io.BytesIO()
    wb.save(buf)
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="iceq-sole-backup_{_stamp()}.xlsx"',
                             "Cache-Control": "no-store"})
