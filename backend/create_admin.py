"""Create (or reset) the admin account.  Run:  python create_admin.py"""
from getpass import getpass

from database import Base, SessionLocal, engine
from models import User
from security import hash_password

Base.metadata.create_all(bind=engine)

username = input("Admin username: ").strip()
password = getpass("Admin password (typing is hidden): ")
if len(password) < 8:
    raise SystemExit("Password must be at least 8 characters.")
if password != getpass("Type the password again: "):
    raise SystemExit("Passwords do not match.")

db = SessionLocal()
user = db.query(User).filter(User.username == username).first()
if user:
    user.password_hash = hash_password(password)
    print(f"Password updated for '{username}'.")
else:
    db.add(User(username=username, password_hash=hash_password(password), role="admin"))
    print(f"Admin '{username}' created.")
db.commit()
db.close()