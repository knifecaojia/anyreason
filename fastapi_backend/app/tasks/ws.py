from __future__ import annotations

from fastapi import WebSocket, WebSocketDisconnect

from app.config import settings
from app.tasks.realtime import TaskWebSocketManager
from app.tasks.ticket import verify_ws_ticket


async def handle_task_ws(*, websocket: WebSocket, manager: TaskWebSocketManager) -> None:
    ticket = websocket.query_params.get("ticket")
    user_id = verify_ws_ticket(ticket=ticket or "", secret=settings.ACCESS_SECRET_KEY)
    if user_id is None:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    await manager.connect(user_id=user_id, websocket=websocket)
    try:
        while True:
            await websocket.receive()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id=user_id, websocket=websocket)
