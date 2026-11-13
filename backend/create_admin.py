"""Create (or reset the password of) an IceQ Sole admin account.

Interactive:       python create_admin.py
Non-interactive:   python create_admin.py --email you@example.com --name "Your Name"
                   (password read from the ADMIN_PASSWORD environment variable)
"""
import argparse
import os
from getpass import getpass

from sqlalchemy import func

from app.database import SessionLocal
from app.models import Role, User
from app.security import hash_password


def bootstrap_from_env() -> None:
    """Hosts without a shell (e.g. Render free): create the FIRST admin from
    INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD. Does nothing once any admin exists,
    so it never overwrites a password. Remove the two env vars after the first deploy."""
    email = os.environ.get("INITIAL_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "")
    if not email or not password:
        return
    db = SessionLocal()
    try:
        if db.query(User).filter(User.role == Role.admin).first():
            print("Admin already exists - bootstrap skipped")
            return
        if len(password) < 10:
            raise SystemExit("INITIAL_ADMIN_PASSWORD must be at least 10 characters")
        db.add(User(email=email, full_name="Store Admin", password_hash=hash_password(password), role=Role.admin))
        db.commit()
        print(f"Bootstrap admin {email} created")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email")
    ap.add_argument("--name", default="Store Admin")
    ap.add_argument("--from-env", action="store_true", help="create the first admin from INITIAL_ADMIN_* env vars")
    args = ap.parse_args()
    if args.from_env:
        bootstrap_from_env()
        return

    email = (args.email or input("Admin email: ")).strip().lower()
    password = os.environ.get("ADMIN_PASSWORD") or getpass("Password (min 8 chars, hidden): ")
    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters.")
    if not os.environ.get("ADMIN_PASSWORD") and password != getpass("Repeat password: "):
        raise SystemExit("Passwords do not match.")

    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if user:
            user.password_hash = hash_password(password)
            user.role = Role.admin
            user.is_active = True
            user.token_version += 1
            print(f"Updated {email}: role=admin, password reset.")
        else:
            db.add(User(email=email, full_name=args.name, password_hash=hash_password(password), role=Role.admin))
            print(f"Admin {email} created.")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
