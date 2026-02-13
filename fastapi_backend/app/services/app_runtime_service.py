from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.scene_engine import run_scene


@dataclass(frozen=True)
class FlowNode:
    id: str
    type: str
    scene_code: str | None = None
    condition: str | None = None


@dataclass(frozen=True)
class FlowEdge:
    from_id: str
    to_id: str
    condition: str | None = None


@dataclass(frozen=True)
class FlowDefinition:
    nodes: list[FlowNode]
    edges: list[FlowEdge]


def _parse_flow_definition(flow_definition: dict) -> FlowDefinition:
    nodes_raw = flow_definition.get("nodes") or []
    edges_raw = flow_definition.get("edges") or []
    if not isinstance(nodes_raw, list) or not isinstance(edges_raw, list):
        raise ValueError("invalid_flow_definition")

    nodes: list[FlowNode] = []
    for n in nodes_raw:
        if not isinstance(n, dict):
            raise ValueError("invalid_flow_node")
        node_id = str(n.get("id") or "").strip()
        node_type = str(n.get("type") or "").strip()
        if not node_id or not node_type:
            raise ValueError("invalid_flow_node")
        nodes.append(
            FlowNode(
                id=node_id,
                type=node_type,
                scene_code=(str(n.get("scene_code") or n.get("scene_id") or "").strip() or None),
                condition=(str(n.get("condition") or "").strip() or None),
            )
        )

    edges: list[FlowEdge] = []
    for e in edges_raw:
        if not isinstance(e, dict):
            raise ValueError("invalid_flow_edge")
        from_id = str(e.get("from") or "").strip()
        to_id = str(e.get("to") or "").strip()
        if not from_id or not to_id:
            raise ValueError("invalid_flow_edge")
        cond = e.get("condition")
        edges.append(FlowEdge(from_id=from_id, to_id=to_id, condition=str(cond).strip() if cond is not None else None))

    node_ids = [n.id for n in nodes]
    if len(set(node_ids)) != len(node_ids):
        raise ValueError("duplicate_node_id")
    return FlowDefinition(nodes=nodes, edges=edges)


def validate_flow_definition(flow_definition: dict) -> FlowDefinition:
    flow = _parse_flow_definition(flow_definition)
    nodes_by_id = {n.id: n for n in flow.nodes}
    for e in flow.edges:
        if e.from_id not in nodes_by_id or e.to_id not in nodes_by_id:
            raise ValueError("edge_references_unknown_node")

    indegree: dict[str, int] = {n.id: 0 for n in flow.nodes}
    outdegree: dict[str, int] = {n.id: 0 for n in flow.nodes}
    for e in flow.edges:
        indegree[e.to_id] += 1
        outdegree[e.from_id] += 1

    starts = [nid for nid, d in indegree.items() if d == 0]
    if len(starts) != 1:
        raise ValueError("invalid_start_node_count")

    for n in flow.nodes:
        if n.type == "condition":
            if outdegree[n.id] > 2:
                raise ValueError("invalid_condition_outdegree")
        else:
            if outdegree[n.id] > 1:
                raise ValueError("invalid_outdegree")

    return flow


ALLOWED_CALLS = {"len": len}


class _SafeEval(ast.NodeVisitor):
    _allowed_nodes = (
        ast.Expression,
        ast.BoolOp,
        ast.BinOp,
        ast.UnaryOp,
        ast.Compare,
        ast.Call,
        ast.Name,
        ast.Load,
        ast.Constant,
        ast.Subscript,
        ast.Index,
        ast.Attribute,
        ast.And,
        ast.Or,
        ast.Not,
        ast.Eq,
        ast.NotEq,
        ast.Gt,
        ast.GtE,
        ast.Lt,
        ast.LtE,
        ast.In,
        ast.NotIn,
        ast.Is,
        ast.IsNot,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Mod,
        ast.USub,
        ast.UAdd,
    )

    def generic_visit(self, node):
        if not isinstance(node, self._allowed_nodes):
            raise ValueError("unsafe_expression")
        super().generic_visit(node)

    def visit_Call(self, node: ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_CALLS:
            raise ValueError("unsafe_call")
        self.generic_visit(node)


def evaluate_condition(*, expr: str, state: dict[str, Any]) -> bool:
    tree = ast.parse(expr, mode="eval")
    _SafeEval().visit(tree)
    ctx = {
        "input": state.get("input", {}),
        "user": state.get("user", {}),
        "intermediate": state.get("intermediate", {}),
        "len": len,
    }
    return bool(eval(compile(tree, "<condition>", "eval"), {"__builtins__": {}}, ctx))


async def execute_user_app_flow(
    *,
    db,
    user_id: UUID,
    flow_definition: dict,
    input_data: dict,
    reporter,
) -> dict[str, Any]:
    flow = validate_flow_definition(flow_definition)
    nodes_by_id = {n.id: n for n in flow.nodes}
    edges_from: dict[str, list[FlowEdge]] = {}
    indegree: dict[str, int] = {n.id: 0 for n in flow.nodes}
    for e in flow.edges:
        edges_from.setdefault(e.from_id, []).append(e)
        indegree[e.to_id] += 1
    start_node_id = next(nid for nid, d in indegree.items() if d == 0)

    state: dict[str, Any] = {"input": input_data or {}, "user": {"user_id": str(user_id)}, "intermediate": {}}
    steps = 0
    current_id: str | None = start_node_id

    while current_id is not None:
        node = nodes_by_id[current_id]
        steps += 1
        await reporter.log(message="app.node.start", payload={"node_id": node.id, "type": node.type})
        await reporter.progress(progress=min(95, steps * 10), payload={"node_id": node.id, "phase": "start"})

        if node.type == "scene":
            if not node.scene_code:
                raise ValueError("scene_code_required")
            out = await run_scene(db=db, user_id=user_id, scene_code=node.scene_code, payload=state["input"])
            state["intermediate"][node.id] = out.model_dump()
            await reporter.log(message="app.node.done", payload={"node_id": node.id, "type": node.type})
        elif node.type == "condition":
            if not node.condition:
                raise ValueError("condition_required")
            result = evaluate_condition(expr=node.condition, state=state)
            state["intermediate"][node.id] = {"result": bool(result), "expr": node.condition}
            await reporter.log(message="app.node.done", payload={"node_id": node.id, "type": node.type, "result": bool(result)})
        else:
            raise ValueError("unsupported_node_type")

        outgoing = edges_from.get(node.id, [])
        if not outgoing:
            current_id = None
            break

        if node.type == "condition":
            cond_value = bool(state["intermediate"][node.id]["result"])
            pick = "true" if cond_value else "false"
            edge = next((e for e in outgoing if (e.condition or "").lower() == pick), None) or outgoing[0]
            current_id = edge.to_id
        else:
            current_id = outgoing[0].to_id

    return {"steps": steps, "state": state}

