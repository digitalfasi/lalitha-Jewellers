"""Saving uploaded images (piece / combo photos, the business logo).

Every upload is opened with Pillow, so only real images get through; it is
shrunk to at most 1600 px and re-saved, which also drops camera metadata
(EXIF, GPS). Files go under UPLOAD_DIR/<folder>/<random>.jpg|png and are
served at /uploads/... The random name is the only protection, so nothing
private should be uploaded here.
"""
import io
import uuid
from pathlib import Path
from typing import Optional

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app._shared.core.config import settings
from app._shared.exceptions.base import ValidationException

MAX_SIDE = 1600


def upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_image(file: UploadFile, folder: str) -> str:
    """Returns the path relative to UPLOAD_DIR, e.g. 'pieces/ab12….jpg'."""
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    raw = await file.read(limit + 1)
    if not raw:
        raise ValidationException("The file is empty.", field="file")
    if len(raw) > limit:
        raise ValidationException(f"The photo is larger than {settings.MAX_UPLOAD_MB} MB.", field="file")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationException("That file isn't a photo. Use a JPG, PNG or WebP image.", field="file")
    if img.format not in ("JPEG", "PNG", "WEBP"):
        raise ValidationException("Use a JPG, PNG or WebP image.", field="file")

    img.thumbnail((MAX_SIDE, MAX_SIDE))
    keep_alpha = img.mode in ("RGBA", "LA", "P") and img.format in ("PNG", "WEBP")
    out = io.BytesIO()
    if keep_alpha:
        img.convert("RGBA").save(out, "PNG", optimize=True)
        ext = "png"
    else:
        img.convert("RGB").save(out, "JPEG", quality=85, optimize=True)
        ext = "jpg"

    target = upload_root() / folder
    target.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    (target / name).write_bytes(out.getvalue())
    return f"{folder}/{name}"


def delete_upload(rel_path: Optional[str]) -> None:
    if not rel_path:
        return
    root = upload_root().resolve()
    path = (root / rel_path).resolve()
    if root in path.parents and path.is_file():  # never outside the upload folder
        path.unlink()


def upload_url(rel_path: Optional[str]) -> Optional[str]:
    return f"/uploads/{rel_path}" if rel_path else None
