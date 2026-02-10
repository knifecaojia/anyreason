from __future__ import annotations

import base64
import hmac
import json
import time
from dataclasses import dataclass
from hashlib import sha256
from uuid import UUID


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + pad).encode("utf-8"))


def _sign(*, secret: str, payload_b64: str) -> str:
    sig = hmac.new(secret.encode("utf-8"), payload_b64.encode("utf-8"), sha256).digest()
    return _b64url_encode(sig)


@dataclass(frozen=True)
class WsTicket:
    ticket: str
    expires_at_epoch: int


def issue_ws_ticket(*, user_id: UUID, secret: str, ttl_seconds: int = 600) -> WsTicket:
    now = int(time.time())
    exp = now + int(ttl_seconds)
    payload = {"sub": str(user_id), "exp": exp, "iat": now}
    payload_raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload_b64 = _b64url_encode(payload_raw)
    sig_b64 = _sign(secret=secret, payload_b64=payload_b64)
    return WsTicket(ticket=f"{payload_b64}.{sig_b64}", expires_at_epoch=exp)


def verify_ws_ticket(*, ticket: str, secret: str, now_epoch: int | None = None) -> UUID | None:
    t = (ticket or "").strip()
    if "." not in t:
        return None
    payload_b64, sig_b64 = t.split(".", 1)
    expected = _sign(secret=secret, payload_b64=payload_b64)
    if not hmac.compare_digest(expected, sig_b64):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception:
        return None
    sub = payload.get("sub")
    exp = payload.get("exp")
    if not sub or not isinstance(exp, int):
        return None
    now = int(time.time()) if now_epoch is None else int(now_epoch)
    if now >= exp:
        return None
    try:
        return UUID(str(sub))
    except Exception:
        return None
