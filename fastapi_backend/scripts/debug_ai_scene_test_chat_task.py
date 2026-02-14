import argparse
import asyncio
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings


async def _run(task_id: str | None, limit: int) -> int:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)
    try:
        async with Session() as db:
            if task_id:
                tid = UUID(task_id)
                q = text(
                    """
                    select
                        id,
                        type,
                        status,
                        progress,
                        updated_at,
                        coalesce(length(error),0) as err_len,
                        pg_column_size(result_json) as result_bytes,
                        pg_column_size(input_json) as input_bytes
                    from tasks
                    where id = :tid
                    """
                )
                row = (await db.execute(q, {"tid": tid})).mappings().first()
                print("TASK:", dict(row) if row else None)
                q2 = text(
                    """
                    select event_type, created_at, pg_column_size(payload) as payload_bytes, payload
                    from task_events
                    where task_id = :tid
                    order by created_at desc
                    limit 20
                    """
                )
                rows = (await db.execute(q2, {"tid": tid})).mappings().all()
                print(f"EVENTS(last {len(rows)}):")
                for r in rows:
                    payload = r.get("payload") or {}
                    if isinstance(payload, dict):
                        payload = {k: payload.get(k) for k in list(payload.keys())[:8]}
                    print(
                        {
                            "event_type": r.get("event_type"),
                            "created_at": str(r.get("created_at")),
                            "payload_bytes": r.get("payload_bytes"),
                            "payload_keys": list((r.get("payload") or {}).keys()) if isinstance(r.get("payload"), dict) else None,
                            "payload_head": payload,
                        }
                    )
            else:
                q = text(
                    """
                    select
                        id,
                        status,
                        progress,
                        updated_at,
                        pg_column_size(result_json) as result_bytes,
                        pg_column_size(input_json) as input_bytes
                    from tasks
                    where type = 'ai_scene_test_chat'
                    order by created_at desc
                    limit :lim
                    """
                )
                rows = (await db.execute(q, {"lim": limit})).mappings().all()
                for r in rows:
                    print(dict(r))
        return 0
    finally:
        await engine.dispose()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--task-id", type=str, default=None)
    p.add_argument("--limit", type=int, default=10)
    args = p.parse_args()
    raise SystemExit(asyncio.run(_run(args.task_id, args.limit)))


if __name__ == "__main__":
    main()
