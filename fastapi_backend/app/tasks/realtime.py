from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from uuid import UUID

from fastapi import WebSocket
from redis.exceptions import ConnectionError

from app.config import settings
from app.tasks.redis_client import get_redis


@dataclass
class TaskWebSocketManager:
    _connections: dict[str, set[WebSocket]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def connect(self, *, user_id: UUID, websocket: WebSocket) -> None:
        key = str(user_id)
        async with self._lock:
            self._connections.setdefault(key, set()).add(websocket)

    async def disconnect(self, *, user_id: UUID, websocket: WebSocket) -> None:
        key = str(user_id)
        async with self._lock:
            s = self._connections.get(key)
            if not s:
                return
            s.discard(websocket)
            if not s:
                self._connections.pop(key, None)

    async def send_to_user(self, *, user_id: str, payload: dict) -> None:
        async with self._lock:
            sockets = list(self._connections.get(user_id, set()))
        if not sockets:
            return
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                pass

    async def close_all(self) -> None:
        async with self._lock:
            sockets = [ws for group in self._connections.values() for ws in group]
            self._connections.clear()
        for ws in sockets:
            try:
                await ws.close()
            except Exception:
                pass


async def redis_event_forwarder(*, manager: TaskWebSocketManager, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        r = get_redis()
        pubsub = r.pubsub()
        try:
            await pubsub.subscribe(settings.TASK_EVENTS_CHANNEL)
            async for msg in pubsub.listen():
                if stop_event.is_set():
                    break
                if not isinstance(msg, dict) or msg.get("type") != "message":
                    continue
                raw = msg.get("data")
                if not raw:
                    continue
                try:
                    payload = json.loads(raw)
                except Exception:
                    continue
                user_id = payload.get("user_id")
                if not user_id:
                    continue
                await manager.send_to_user(user_id=str(user_id), payload=payload)
        except ConnectionError:
            await asyncio.sleep(1.0)
        except Exception:
            await asyncio.sleep(0.5)
        finally:
            try:
                await pubsub.close()
            except Exception:
                pass
