from __future__ import annotations

import io
import mimetypes
from dataclasses import dataclass

from PIL import Image, ImageOps


@dataclass(frozen=True, slots=True)
class Thumbnail:
    data: bytes
    content_type: str
    size_bytes: int
    width: int
    height: int


def _is_transparent(img: Image.Image) -> bool:
    if img.mode in {"RGBA", "LA"}:
        return True
    if img.mode == "P":
        return "transparency" in (img.info or {})
    return False


def _guess_content_type(filename: str | None) -> str | None:
    if not filename:
        return None
    ct, _enc = mimetypes.guess_type(filename)
    return ct


def should_generate_thumbnail(*, content_type: str | None, filename: str | None) -> bool:
    ct = (content_type or "").strip().lower()
    if ct.startswith("image/"):
        return True
    guessed = (_guess_content_type(filename) or "").lower()
    return guessed.startswith("image/")


def generate_thumbnail(data: bytes, *, max_size: int = 512) -> Thumbnail:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    is_transparent = _is_transparent(img)
    out = io.BytesIO()

    if is_transparent:
        img.save(out, format="PNG", optimize=True)
        content_type = "image/png"
    else:
        if img.mode not in {"RGB", "L"}:
            img = img.convert("RGB")
        img.save(out, format="JPEG", quality=82, optimize=True, progressive=True)
        content_type = "image/jpeg"

    buf = out.getvalue()
    return Thumbnail(
        data=buf,
        content_type=content_type,
        size_bytes=len(buf),
        width=int(img.size[0]),
        height=int(img.size[1]),
    )

