"""Application settings, loaded from environment variables / backend/.env.

Every secret comes from the environment. Nothing sensitive is hard-coded.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core ---
    APP_NAME: str = "IceQ Sole API"
    ENVIRONMENT: str = "development"  # development | production | test
    SECRET_KEY: str = Field(..., min_length=32)
    DATABASE_URL: str = f"sqlite:///{(BASE_DIR / 'data' / 'iceq_sole_dev.db').as_posix()}"

    # --- Auth ---
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # --- Web ---
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174"
    STORE_URL: str = "http://localhost:5173"
    API_PUBLIC_URL: str = "http://localhost:8000"
    RATE_LIMIT_ENABLED: bool = True

    # --- Storage ---
    STORAGE_PROVIDER: str = "local"  # local | cloudflare | firebase
    LOCAL_UPLOAD_DIR: str = str(BASE_DIR / "uploads")
    MAX_UPLOAD_MB: int = 8

    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_PUBLIC_URL: str = ""

    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_STORAGE_BUCKET: str = ""
    # Either a path to the service-account JSON file, or the JSON itself (deployment secret)
    FIREBASE_SERVICE_ACCOUNT: str = ""

    # --- Payments: Bakong KHQR (ABA / any Bakong-member bank account) ---
    BAKONG_ACCOUNT_ID: str = ""      # e.g. yourname@abaa  (public, shown inside the QR)
    BAKONG_ACCOUNT_NUMBER: str = ""  # e.g. ABA personal: the USD account number (no spaces)
    BAKONG_ACQUIRING_BANK: str = ""  # e.g. "ABA Bank"
    BAKONG_API_TOKEN: str = ""       # secret, from https://api-bakong.nbc.gov.kh
    BAKONG_API_URL: str = "https://api-bakong.nbc.gov.kh"
    KHQR_EXPIRY_MINUTES: int = 30

    # --- Email (password reset) - e.g. Gmail: smtp.gmail.com / 587 / your Gmail / App password ---
    # Telegram alerts + one-tap payment confirmation (bot from @BotFather; chat IDs = who may confirm)
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_ADMIN_CHAT_IDS: str = ""  # comma separated numeric chat IDs
    DASHBOARD_URL: str = ""            # optional, for "open in dashboard" links

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "IceQ Sole"
    PASSWORD_RESET_EXPIRE_MINUTES: int = 60
    REMEMBER_ME_DAYS: int = 30

    # --- Locale ---
    TIMEZONE: str = "Asia/Phnom_Penh"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _db(cls, v):
        return v or f"sqlite:///{(BASE_DIR / 'data' / 'iceq_sole_dev.db').as_posix()}"

    @field_validator("STORAGE_PROVIDER")
    @classmethod
    def _provider(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in {"local", "cloudflare", "firebase"}:
            raise ValueError("STORAGE_PROVIDER must be local, cloudflare or firebase")
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def bakong_enabled(self) -> bool:
        return bool(self.BAKONG_ACCOUNT_ID and self.BAKONG_API_TOKEN)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
