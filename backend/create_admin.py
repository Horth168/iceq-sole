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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email")
    ap.add_argument("--name", default="Store Admin")
    args = ap.parse_args()

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
