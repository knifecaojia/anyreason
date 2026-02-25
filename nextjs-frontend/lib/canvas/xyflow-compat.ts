/**
 * Compatibility shim for @xyflow/react v12 type exports.
 *
 * In @xyflow/react v12, some types (NodeProps, EdgeProps) and even some
 * runtime exports (BaseEdge, getBezierPath, Handle, Position) fail to
 * resolve during webpack builds due to moduleResolution mismatches between
 * the IDE (bundler mode) and the webpack TypeScript checker.
 *
 * This module provides compatible type aliases and re-exports runtime
 * values via require() to bypass the TS module resolution issue.
 */

import type { Node } from '@xyflow/react';

// ---- Runtime re-exports via require() to bypass TS module resolution ----
// eslint-disable-next-line @typescript-eslint/no-var-requires
const xyflow = require('@xyflow/react');

export const BaseEdge: any = xyflow.BaseEdge;
export const getBezierPath: any = xyflow.getBezierPath;
export const Handle: any = xyflow.Handle;
export const Position: any = xyflow.Position;
export const useReactFlow: any = xyflow.useReactFlow;

// ---- Type-only exports ----

/**
 * Props passed to custom node components by ReactFlow.
 * Mirrors the internal NodeProps from @xyflow/react.
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
 * Mirrors the internal EdgeProps from @xyflow/react.
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
