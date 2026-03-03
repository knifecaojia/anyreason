"""M3.2: Canvas batch execution task handler.

Receives a canvas_id and a list of frontend_node_ids, executes them
in topological order (based on edges in canvas JSON), and updates
CanvasExecution + CanvasNode records as it progresses.

input_json schema:
{
    "canvas_id": "uuid",
    "execution_id": "uuid",
    "node_ids": ["frontend_node_id_1", ...],  # optional, if empty → all nodes
    "trigger_type": "manual" | "batch",
}
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Canvas, CanvasExecution, CanvasNode, Task
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class CanvasBatchExecuteHandler(BaseTaskHandler):
    task_type = "canvas_batch_execute"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        canvas_id = payload.get("canvas_id")
        execution_id = payload.get("execution_id")
        requested_node_ids: list[str] = payload.get("node_ids") or []

        if not canvas_id:
            raise ValueError("canvas_id is required")

        canvas_uuid = UUID(str(canvas_id))

        # Verify canvas exists and belongs to user
        result = await db.execute(
            select(Canvas).where(Canvas.id == canvas_uuid, Canvas.user_id == task.user_id)
        )
        canvas = result.scalar_one_or_none()
        if canvas is None:
            raise ValueError("Canvas not found or access denied")

        # Load canvas nodes from DB
        node_result = await db.execute(
            select(CanvasNode)
            .where(CanvasNode.canvas_id == canvas_uuid)
            .order_by(CanvasNode.created_at)
        )
        all_nodes = list(node_result.scalars().all())

        # Filter to requested nodes if specified
        if requested_node_ids:
            target_nodes = [n for n in all_nodes if n.frontend_node_id in requested_node_ids]
        else:
            target_nodes = all_nodes

        if not target_nodes:
            await reporter.log(message="没有需要执行的节点", level="warn")
            return {"completed": 0, "total": 0}

        total = len(target_nodes)

        # Update or create CanvasExecution record
        execution: CanvasExecution | None = None
        if execution_id:
            exec_result = await db.execute(
                select(CanvasExecution).where(CanvasExecution.id == UUID(str(execution_id)))
            )
            execution = exec_result.scalar_one_or_none()

        if execution is None:
            execution = CanvasExecution(
                canvas_id=canvas_uuid,
                trigger_type=payload.get("trigger_type", "batch"),
                status="running",
                total_nodes=total,
                completed_nodes=0,
                started_at=datetime.now(timezone.utc),
            )
            db.add(execution)
            await db.flush()
        else:
            execution.status = "running"
            execution.total_nodes = total
            execution.completed_nodes = 0
            execution.started_at = datetime.now(timezone.utc)
            await db.flush()

        await reporter.progress(progress=5, payload={"execution_id": str(execution.id), "total_nodes": total})

        completed = 0
        failed = 0
        total_token_usage = 0
        node_results: list[dict[str, Any]] = []

        # Execute nodes sequentially (topological order would require edges from canvas JSON;
        # for now, process in DB insertion order which follows frontend creation order)
        for i, node in enumerate(target_nodes):
            node_info = {"frontend_node_id": node.frontend_node_id, "node_type": node.node_type}

            # Mark node as running
            node.status = "running"
            await db.flush()

            try:
                await reporter.log(
                    message=f"执行节点 {i + 1}/{total}: {node.node_type} ({node.frontend_node_id[:8]}…)",
                    level="info",
                )

                # Placeholder: actual node execution depends on node_type
                # For now, mark as completed (real implementation will dispatch
                # to type-specific sub-handlers in future iterations)
                node_result = await self._execute_single_node(db=db, task=task, node=node, reporter=reporter)

                node.status = "completed"
                completed += 1
                node_info["status"] = "completed"
                node_info["result"] = node_result

                # M3.4: Accumulate token usage from LLM nodes
                tokens = node_result.get("token_usage", 0)
                if isinstance(tokens, (int, float)) and tokens > 0:
                    total_token_usage += int(tokens)

            except Exception as e:
                node.status = "failed"
                failed += 1
                node_info["status"] = "failed"
                node_info["error"] = str(e)
                await reporter.log(
                    message=f"节点执行失败: {node.frontend_node_id[:8]}… — {e}",
                    level="error",
                )

            node.updated_at = datetime.now(timezone.utc)
            node_results.append(node_info)

            # Update execution progress
            execution.completed_nodes = completed + failed
            await db.flush()

            progress_pct = int(5 + (90 * (i + 1) / total))
            await reporter.progress(
                progress=progress_pct,
                payload={"completed": completed, "failed": failed, "current": i + 1, "total": total},
            )

        # Finalize execution
        now = datetime.now(timezone.utc)
        if failed == 0:
            execution.status = "completed"
        elif completed > 0:
            execution.status = "partial"
        else:
            execution.status = "failed"
        execution.finished_at = now
        execution.result_summary = {
            "total": total,
            "completed": completed,
            "failed": failed,
            "total_token_usage": total_token_usage,
            "node_results": node_results,
        }
        await db.flush()

        return {
            "execution_id": str(execution.id),
            "status": execution.status,
            "total": total,
            "completed": completed,
            "failed": failed,
            "total_token_usage": total_token_usage,
        }

    async def _execute_single_node(
        self,
        *,
        db: AsyncSession,
        task: Task,
        node: CanvasNode,
        reporter: TaskReporter,
    ) -> dict[str, Any]:
        """Execute a single canvas node based on its type.

        Currently a stub that returns success. Future iterations will dispatch
        to type-specific handlers (e.g., generatorNode → image generation,
        textGenNode → LLM text generation).
        """
        node_type = node.node_type
        config = node.config_json or {}

        # Type-specific execution stubs
        if node_type == "textGenNode":
            return {"output": "text_generation_placeholder", "token_usage": 0}
        elif node_type == "generatorNode":
            return {"output": "image_generation_placeholder"}
        elif node_type in ("scriptNode", "storyboardNode", "slicerNode", "textNoteNode"):
            # Data nodes don't need execution
            return {"output": "data_node_skipped", "skipped": True}
        else:
            return {"output": "unknown_node_type", "skipped": True}
