'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { GroupNodeData } from '@/lib/canvas/types';

const GROUP_PALETTE = [
  { label: '蓝', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  { label: '紫', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  { label: '绿', bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
  { label: '橙', bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
] as const;

export default function GroupNode(props: NodeProps) {
  const data = props.data as unknown as GroupNodeData;
  const selected = Boolean(props.selected);
  const [editingLabel, setEditingLabel] = useState(false);

  const colorIdx = GROUP_PALETTE.findIndex((p) => p.label === data.color) >= 0
    ? GROUP_PALETTE.findIndex((p) => p.label === data.color)
    : 0;
  const palette = GROUP_PALETTE[colorIdx];

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        lineClassName={`!border-2 !border-dashed ${palette.border}`}
        handleClassName="!w-3 !h-3 !bg-primary !border-background !border-2 !rounded-sm"
      />
      <div
        className={`rounded-2xl ${palette.bg} ${palette.border} border-2 border-dashed w-full h-full relative`}
        style={{ minWidth: 200, minHeight: 150 }}
      >
        {/* Label badge — top-left */}
        <div
          className={`absolute top-2 left-3 flex items-center gap-1.5 ${palette.text}`}
        >
          {editingLabel ? (
            <input
              className="nodrag bg-transparent border-none outline-none text-xs font-semibold w-24"
              autoFocus
              defaultValue={data.label || '分组'}
              onBlur={(e) => {
                setEditingLabel(false);
                // Note: updateNodeData would be called here in a full implementation
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditingLabel(false);
              }}
            />
          ) : (
            <span
              className="text-xs font-semibold cursor-default select-none"
              onDoubleClick={() => setEditingLabel(true)}
            >
              {data.label || '分组'}
            </span>
          )}
          {data.childNodeIds && data.childNodeIds.length > 0 && (
            <span className="text-[9px] opacity-60">
              ({data.childNodeIds.length})
            </span>
          )}
        </div>
      </div>
    </>
  );
}
