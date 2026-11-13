"""Secure image upload pipeline.

1. Size check (MAX_UPLOAD_MB) and real format sniffing with Pillow (extension/MIME are not trusted)
2. Decompression-bomb guard, EXIF orientation fix, metadata stripped
3. Re-encoded to WebP in several widths for responsive delivery (srcset)
"""
from __future__ import annotations

import io
import uuid
from dataclasses import dataclass, field

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings
from app.services.storage import StorageError, get_storage

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}  # MPO = multi-picture JPEG from phones
Image.MAX_IMAGE_PIXELS = 40_000_000
PRODUCT_WIDTHS = (480, 960, 1600)
BANNER_WIDTHS = (768, 1440, 2400)


@dataclass
class StoredImage:
    url: str
    key: str
    provider: str
    width: int
    height: int
    renditions: dict = field(default_factory=dict)


async def read_upload(file: UploadFile) -> bytes:
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"Image is larger than {settings.MAX_UPLOAD_MB} MB")
    if not data:
        raise HTTPException(400, "Empty file")
    return data


def open_image(data: bytes) -> Image.Image:
    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()  # detects truncated / corrupted files
        img = Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(415, "Unsupported or corrupted image. Use JPG, PNG or WebP.")
    if img.format not in ALLOWED_FORMATS:
        raise HTTPException(415, "Only JPG, PNG and WebP images are allowed")
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    return img


def _encode_webp(img: Image.Image, width: int) -> tuple[bytes, int, int]:
    w = min(width, img.width)
    h = round(img.height * w / img.width)
    resized = img if w == img.width else img.resize((w, h), Image.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, "WEBP", quality=82, method=6)
    return buf.getvalue(), w, h


def store_image(data: bytes, folder: str, widths=PRODUCT_WIDTHS) -> StoredImage:
    """Validate, optimise and upload. Returns the largest rendition as the main URL."""
    img = open_image(data)
    storage = get_storage()
    base = f"{folder.strip('/')}/{uuid.uuid4().hex}"
    renditions: dict[str, dict] = {}
    uploaded: list[str] = []
    targets = sorted(set(widths))
    if img.width < targets[-1] and img.width > targets[0] and img.width not in targets:
        targets = [w for w in targets if w < img.width] + [img.width]  # keep full resolution, never upscale
    try:
        for target in targets:
            if renditions and target > img.width:
                continue  # never upscale
            body, w, h = _encode_webp(img, target)
            key = f"{base}-{w}.webp"
            url = storage.put(key, body, "image/webp")
            uploaded.append(key)
            renditions[str(w)] = {"url": url, "key": key, "width": w, "height": h}
    except StorageError as e:
        for k in uploaded:
            storage.delete(k)
        raise HTTPException(502, str(e))
    largest = renditions[max(renditions, key=int)]
    return StoredImage(url=largest["url"], key=largest["key"], provider=storage.name,
                       width=largest["width"], height=largest["height"], renditions=renditions)


def delete_stored(key: str | None, renditions: dict | None = None) -> None:
    storage = get_storage()
    keys = {key} if key else set()
    for r in (renditions or {}).values():
        if isinstance(r, dict) and r.get("key"):
            keys.add(r["key"])
    for k in keys:
        storage.delete(k)


def store_raw_proof(data: bytes, folder: str) -> StoredImage:
    """Payment screenshots: validated and re-encoded once (max 1600px)."""
    return store_image(data, folder, widths=(1600,))


def new_key(folder: str, ext: str) -> str:
    return f"{folder.strip('/')}/{uuid.uuid4().hex}.{ext}"
