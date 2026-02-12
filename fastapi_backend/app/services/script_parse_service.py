from __future__ import annotations

import io
import zipfile
import xml.etree.ElementTree as ET

from charset_normalizer import from_bytes

from app.core.exceptions import AppError


def _get_ext(filename: str | None) -> str:
    name = (filename or "").strip().lower()
    if "." not in name:
        return ""
    return "." + name.rsplit(".", 1)[-1]


def _decode_text_bytes(file_bytes: bytes) -> str:
    try:
        match = from_bytes(file_bytes).best()
        if match:
            out = match.output()
            if isinstance(out, (bytes, bytearray)):
                return bytes(out).decode("utf-8", errors="replace")
            return str(out)
    except Exception:
        pass
    return file_bytes.decode("utf-8", errors="replace")


def _extract_docx_text(file_bytes: bytes) -> str:
    zf = zipfile.ZipFile(io.BytesIO(file_bytes))
    xml_bytes = zf.read("word/document.xml")
    root = ET.fromstring(xml_bytes)

    out: list[str] = []
    buf: list[str] = []

    for el in root.iter():
        tag = el.tag
        if tag.endswith("}t") and el.text:
            buf.append(el.text)
        elif tag.endswith("}tab"):
            buf.append("\t")
        elif tag.endswith("}br"):
            out.append("".join(buf))
            buf = []
        elif tag.endswith("}p"):
            if buf:
                out.append("".join(buf))
                buf = []
            else:
                out.append("")

    if buf:
        out.append("".join(buf))

    return "\n".join([line.rstrip() for line in out]).strip()


def _extract_doc_text_best_effort(file_bytes: bytes) -> str:
    ascii_buf: list[str] = []
    cur: bytearray = bytearray()
    for b in file_bytes:
        if 32 <= b <= 126:
            cur.append(b)
            continue
        if len(cur) >= 6:
            ascii_buf.append(cur.decode("ascii", errors="ignore"))
        cur = bytearray()
    if len(cur) >= 6:
        ascii_buf.append(cur.decode("ascii", errors="ignore"))

    utf16_buf: list[str] = []
    cur16: bytearray = bytearray()
    i = 0
    n = len(file_bytes)
    while i + 1 < n:
        b1 = file_bytes[i]
        b2 = file_bytes[i + 1]
        if 32 <= b1 <= 126 and b2 == 0:
            cur16.append(b1)
            cur16.append(b2)
            i += 2
            continue
        if len(cur16) >= 12:
            utf16_buf.append(cur16.decode("utf-16le", errors="ignore"))
        cur16 = bytearray()
        i += 2
    if len(cur16) >= 12:
        utf16_buf.append(cur16.decode("utf-16le", errors="ignore"))

    parts: list[str] = []
    seen: set[str] = set()
    for s in ascii_buf + utf16_buf:
        cleaned = " ".join(s.split())
        if len(cleaned) < 8:
            continue
        if cleaned in seen:
            continue
        seen.add(cleaned)
        parts.append(cleaned)
        if len(parts) >= 4000:
            break
    return "\n".join(parts).strip()


class ScriptParseService:
    ALLOWED_SCRIPT_EXTS = {".txt", ".md", ".doc", ".docx"}

    def get_ext(self, filename: str | None) -> str:
        return _get_ext(filename)

    def parse_script_file(self, *, filename: str | None, file_bytes: bytes) -> str:
        if not file_bytes:
            return ""

        ext = _get_ext(filename)
        if ext not in self.ALLOWED_SCRIPT_EXTS:
            raise AppError(msg="仅支持上传 txt / md / doc / docx 文件", code=400, status_code=400)

        if ext == ".docx":
            return _extract_docx_text(file_bytes)
        if ext == ".doc":
            best = _extract_doc_text_best_effort(file_bytes)
            return best or _decode_text_bytes(file_bytes)
        return _decode_text_bytes(file_bytes)


script_parse_service = ScriptParseService()
