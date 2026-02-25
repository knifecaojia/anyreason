'use client';

import { BaseEdge, getBezierPath } from '@/lib/canvas/xyflow-compat';
import type { PortDataType } from '@/lib/canvas/types';
import { PORT_COLORS } from '@/lib/canvas/port-system';

/** Edge data shape expected by TypedEdge */
export interface TypedEdgeData {
  portType?: PortDataType;
  isTransmitting?: boolean;
  [key: string]: unknown;
}

/** Edge type string for ReactFlow registration */
export const TYPED_EDGE_TYPE = 'typedEdge';

const DEFAULT_COLOR = '#94a3b8'; // neutral gray (slate-400)

export default function TypedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: any) {
  const edgeData = data as TypedEdgeData | undefined;
  const portType = edgeData?.portType;
  const isTransmitting = edgeData?.isTransmitting ?? false;

  const color = portType ? PORT_COLORS[portType] : DEFAULT_COLOR;
  const strokeWidth = selected ? 3 : 2;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      {/* Glow layer when selected */}
      {selected && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: 8,
            opacity: 0.25,
            filter: `drop-shadow(0 0 4px ${color})`,
          }}
        />
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth,
          ...(isTransmitting
            ? {
                strokeDasharray: '6 4',
                animation: 'typedEdgeFlow 0.6s linear infinite',
              }
            : {}),
        }}
      />

      {/* Inline keyframes for the flow animation */}
      {isTransmitting && (
        <style>{`
          @keyframes typedEdgeFlow {
            to { stroke-dashoffset: -10; }
          }
        `}</style>
      )}
    </>
  );
}
