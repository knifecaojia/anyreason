'use client';

import { BaseEdge, getBezierPath, useReactFlow } from '@/lib/canvas/xyflow-compat';
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
  source,
  target,
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
  const strokeWidth = selected ? 2.5 : 1.5;

  const rf = useReactFlow() as any;
  const deleteElements = rf.deleteElements as (params: { edges: { id: string }[] }) => void;
  const getNodes = rf.getNodes as () => any[];

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const handleDoubleClick = async () => {
    const nodes = getNodes();
    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);

    if (sourceNode?.type === 'assetNode' && targetNode?.type === 'storyboardNode') {
      const assetId = sourceNode.data?.assetId as string | undefined;
      const storyboardId = targetNode.data?.sourceStoryboardId as string | undefined;

      if (assetId && storyboardId) {
        try {
          const res = await fetch(`/api/storyboards/${encodeURIComponent(storyboardId)}/asset-bindings`, {
            cache: 'no-store',
          });
          if (res.ok) {
            const json = await res.json() as { data?: { bindings?: Array<{ id: string; asset_entity_id: string }> } };
            const binding = json.data?.bindings?.find((item) => item.asset_entity_id === assetId);
            if (binding?.id) {
              await fetch(`/api/asset-bindings/${encodeURIComponent(binding.id)}`, {
                method: 'DELETE',
              });
            }
          }
        } catch {
          // Best effort only: local edge deletion should still succeed.
        }
      }
    }

    deleteElements({ edges: [{ id }] });
  };

  const handleClick = (event: React.MouseEvent<SVGPathElement>) => {
    if (event.detail >= 2) {
      void handleDoubleClick();
    }
  };

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
          strokeDasharray: '8 6',
          ...(isTransmitting
            ? {
                animation: 'typedEdgeFlow 0.6s linear infinite',
              }
            : {}),
        }}
      />

      {/* Invisible wider path for easier interaction */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
        onDoubleClick={() => {
          void handleDoubleClick();
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
