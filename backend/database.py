from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# For now we use SQLite (a single file: iceq_sole.db). Later we switch to PostgreSQL.
DATABASE_URL = "sqlite:///./iceq_sole.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()