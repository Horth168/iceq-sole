"""Copy every row from one PostgreSQL database to another (e.g. Render -> Neon).

    1. Put both URLs in backend/.env.migrate (git-ignored, never commit it):
         SOURCE_DATABASE_URL=postgresql://...render...
         TARGET_DATABASE_URL=postgresql://...neon...?sslmode=require
    2. python copy_database.py            # dry run: shows row counts only
       python copy_database.py --copy     # creates tables on the target and copies the data

The target must be empty. URLs and passwords are never printed.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import create_engine, func, select, text

HERE = Path(__file__).parent


def load_urls() -> tuple[str, str]:
    f = HERE / ".env.migrate"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    src, dst = os.environ.get("SOURCE_DATABASE_URL", ""), os.environ.get("TARGET_DATABASE_URL", "")
    if not src or not dst:
        sys.exit("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL in backend/.env.migrate")
    if src == dst:
        sys.exit("Source and target are the same database")
    return src, dst


def norm(url: str) -> str:
    for old in ("postgres://", "postgresql://"):
        if url.startswith(old):
            return url.replace(old, "postgresql+psycopg://", 1)
    return url


def host(url: str) -> str:
    return urlparse(url.replace("+psycopg", "")).hostname or "?"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--copy", action="store_true", help="actually copy (default is a dry run)")
    args = ap.parse_args()
    src_url, dst_url = load_urls()
    src, dst = create_engine(norm(src_url)), create_engine(norm(dst_url))
    print(f"source: {host(src_url)}\ntarget: {host(dst_url)}")

    os.environ["DATABASE_URL"] = dst_url  # models + alembic point at the target
    sys.path.insert(0, str(HERE))
    from app.database import Base  # noqa: E402
    import app.models  # noqa: F401,E402

    tables = Base.metadata.sorted_tables  # parents before children
    with src.connect() as s:
        counts = {t.name: s.scalar(select(func.count()).select_from(t)) for t in tables}
    for name, n in counts.items():
        print(f"  {name:28} {n}")
    if not args.copy:
        print("Dry run only. Re-run with --copy to copy.")
        return

    # 1. schema on the target via the project's migrations (also writes alembic_version)
    from alembic import command
    from alembic.config import Config
    command.upgrade(Config(str(HERE / "alembic.ini")), "head")

    with dst.connect() as d:
        busy = [t.name for t in tables if d.scalar(select(func.count()).select_from(t))]
    if busy:
        sys.exit(f"Target is not empty ({', '.join(busy)}). Refusing to copy.")

    # 2. rows, table by table, in one transaction on the target
    with src.connect() as s, dst.begin() as d:
        for t in tables:
            rows = [dict(r._mapping) for r in s.execute(select(t))]
            for i in range(0, len(rows), 500):
                d.execute(t.insert(), rows[i:i + 500])
            print(f"  copied {t.name:20} {len(rows)}")
        # 3. move id sequences past the copied ids
        for t in tables if dst.dialect.name == "postgresql" else []:
            if "id" in t.c and t.c.id.primary_key and t.c.id.autoincrement is not False:
                d.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{t.name}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {t.name}), 0) + 1, false) "
                    f"WHERE pg_get_serial_sequence('{t.name}', 'id') IS NOT NULL"))

    # 4. verify
    with dst.connect() as d:
        bad = [t.name for t in tables if d.scalar(select(func.count()).select_from(t)) != counts[t.name]]
    print("Verified: every table has the same number of rows." if not bad else f"MISMATCH in: {bad}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
