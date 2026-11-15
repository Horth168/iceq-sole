"""Sales reports (staff and admins; cashiers can't see them). See services/reports.py."""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import require_staff
from app.services import reports

router = APIRouter(prefix="/api/admin/reports", tags=["Admin · reports"])
DATE = r"^\d{4}-\d{2}-\d{2}$"


@router.get("")
def report(start: str | None = Query(None, pattern=DATE), end: str | None = Query(None, pattern=DATE),
           db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return reports.build(db, start, end)


@router.get("/xlsx")
def report_xlsx(start: str | None = Query(None, pattern=DATE), end: str | None = Query(None, pattern=DATE),
                db: Session = Depends(get_db), _: User = Depends(require_staff)):
    r = reports.build(db, start, end)
    return Response(reports.to_xlsx(r), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="iceq-sole-sales_{r["start"]}_to_{r["end"]}.xlsx"',
                             "Cache-Control": "no-store"})
