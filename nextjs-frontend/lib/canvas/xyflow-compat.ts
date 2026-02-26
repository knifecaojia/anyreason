/**
 * Compatibility shim for @xyflow/react v12 type exports.
 *
 * All runtime values MUST use ES re-exports (not require()) to ensure
 * they share the same module instance — and therefore the same zustand
 * store — as the ReactFlow / ReactFlowProvider imported in page components.
 */

import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useReactFlow as _useReactFlow } from '@xyflow/react';

// ---- Runtime re-exports (ES imports — same module instance) ----
export {
  BaseEdge,
  getBezierPath,
  Handle,
  Position,
} from '@xyflow/react';

/** Re-export useReactFlow with explicit return type to preserve full ReactFlowInstance type. */
export function useReactFlow<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
>(): ReactFlowInstance<NodeType, EdgeType> {
  return _useReactFlow<NodeType, EdgeType>();
}

// ---- Type-only exports ----

/**
 * Props passed to custom node components by ReactFlow.
 */
export type NodeProps<NodeType extends Node = Node> = {
  id: string;
  type: string;
  data: NodeType extends Node<infer D> ? D : Record<string, unknown>;
  selected: boolean;
  dragging: boolean;
  zIndex: number;
  width?: number;
  height?: number;
  sourcePosition?: string;
  targetPosition?: string;
  dragHandle?: string;
  parentId?: string;
  selectable?: boolean;
  deletable?: boolean;
  draggable?: boolean;
  positionAbsoluteX?: number;
  positionAbsoluteY?: number;
};

/**
 * Props passed to custom edge components by ReactFlow.
 */
export type EdgeProps = {
  id: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
  selected?: boolean;
  animated?: boolean;
  data?: Record<string, unknown>;
  style?: React.CSSProperties;
  type?: string;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  markerStart?: string;
  markerEnd?: string;
  interactionWidth?: number;
};
