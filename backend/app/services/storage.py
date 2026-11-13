"""Storage abstraction: local disk (development), Cloudflare R2 or Firebase Storage.

Switch providers with STORAGE_PROVIDER=local|cloudflare|firebase. The database only keeps
the public URL and the object key; binaries live in the storage provider.
"""
from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from app.config import settings

log = logging.getLogger("iceq.storage")


class StorageError(RuntimeError):
    pass


class StorageProvider(ABC):
    name: str = "base"

    @abstractmethod
    def put(self, key: str, data: bytes, content_type: str) -> str:
        """Store bytes under `key` and return the public URL."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove the object. Missing objects are ignored."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        ...

    @abstractmethod
    def public_url(self, key: str) -> str:
        ...


# ----------------------------------------------------------------- local
class LocalStorage(StorageProvider):
    """Writes to backend/uploads and is served by FastAPI at /uploads. Development only."""
    name = "local"

    def __init__(self, root: str, base_url: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.base_url = base_url.rstrip("/")

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise StorageError("Invalid storage key")
        return p

    def put(self, key: str, data: bytes, content_type: str) -> str:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return self.public_url(key)

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except OSError as e:  # pragma: no cover
            log.warning("local delete failed for %s: %s", key, e)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def public_url(self, key: str) -> str:
        return f"{self.base_url}/uploads/{quote(key)}"


# ----------------------------------------------------------------- cloudflare r2
class R2Storage(StorageProvider):
    """Cloudflare R2 via the S3-compatible API (boto3). Credentials stay on the server."""
    name = "cloudflare"

    def __init__(self):
        missing = [k for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
                               "R2_BUCKET_NAME", "R2_PUBLIC_URL") if not getattr(settings, k)]
        if missing:
            raise StorageError(f"Cloudflare R2 is selected but these env vars are missing: {', '.join(missing)}")
        import boto3
        from botocore.config import Config

        self.bucket = settings.R2_BUCKET_NAME
        self.public_base = settings.R2_PUBLIC_URL.rstrip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )

    def put(self, key: str, data: bytes, content_type: str) -> str:
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type,
                                   CacheControl="public, max-age=31536000, immutable")
        except Exception as e:
            raise StorageError(f"R2 upload failed: {e}") from e
        return self.public_url(key)

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as e:
            log.warning("R2 delete failed for %s: %s", key, e)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def public_url(self, key: str) -> str:
        return f"{self.public_base}/{quote(key)}"


# ----------------------------------------------------------------- firebase
class FirebaseStorage(StorageProvider):
    """Firebase Storage (Google Cloud Storage bucket) via firebase-admin.

    Objects are given a download token so they can be served through the public
    firebasestorage.googleapis.com URL while Storage Security Rules deny client writes.
    """
    name = "firebase"

    def __init__(self):
        if not settings.FIREBASE_STORAGE_BUCKET or not settings.FIREBASE_SERVICE_ACCOUNT:
            raise StorageError("Firebase is selected but FIREBASE_STORAGE_BUCKET / FIREBASE_SERVICE_ACCOUNT are missing")
        import firebase_admin
        from firebase_admin import credentials, storage

        raw = settings.FIREBASE_SERVICE_ACCOUNT.strip()
        info = json.loads(raw) if raw.startswith("{") else raw  # JSON secret or file path
        if isinstance(info, str) and not os.path.exists(info):
            raise StorageError("FIREBASE_SERVICE_ACCOUNT file was not found")
        cred = credentials.Certificate(info)
        app_name = "iceq-storage"
        try:
            app = firebase_admin.get_app(app_name)
        except ValueError:
            app = firebase_admin.initialize_app(cred, {
                "storageBucket": settings.FIREBASE_STORAGE_BUCKET,
                "projectId": settings.FIREBASE_PROJECT_ID or None,
            }, name=app_name)
        self.bucket = storage.bucket(app=app)

    def put(self, key: str, data: bytes, content_type: str) -> str:
        import uuid
        blob = self.bucket.blob(key)
        token = uuid.uuid4().hex
        blob.metadata = {"firebaseStorageDownloadTokens": token}
        blob.cache_control = "public, max-age=31536000, immutable"
        try:
            blob.upload_from_string(data, content_type=content_type)
        except Exception as e:
            raise StorageError(f"Firebase upload failed: {e}") from e
        return self._token_url(key, token)

    def _token_url(self, key: str, token: str) -> str:
        return (f"https://firebasestorage.googleapis.com/v0/b/{self.bucket.name}/o/"
                f"{quote(key, safe='')}?alt=media&token={token}")

    def delete(self, key: str) -> None:
        try:
            self.bucket.blob(key).delete()
        except Exception as e:
            log.warning("Firebase delete failed for %s: %s", key, e)

    def exists(self, key: str) -> bool:
        return self.bucket.blob(key).exists()

    def public_url(self, key: str) -> str:
        blob = self.bucket.get_blob(key)
        token = (blob.metadata or {}).get("firebaseStorageDownloadTokens", "") if blob else ""
        return self._token_url(key, token)


@lru_cache
def get_storage() -> StorageProvider:
    provider = settings.STORAGE_PROVIDER
    if provider == "cloudflare":
        return R2Storage()
    if provider == "firebase":
        return FirebaseStorage()
    return LocalStorage(settings.LOCAL_UPLOAD_DIR, settings.API_PUBLIC_URL)
