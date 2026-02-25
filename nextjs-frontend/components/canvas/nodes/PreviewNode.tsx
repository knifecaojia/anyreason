'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { PreviewNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function PreviewNode(props: NodeProps) {
  const data = props.data as unknown as PreviewNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('previewNode');
  const ports = reg?.ports ?? [];

  return (
    <NodeShell
      nodeId={props.id}
      title="预览节点"
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center">
        {data.url ? (
          data.mediaType === 'video' ? (
            <video
              src={data.url}
              className="w-full h-full object-contain"
              controls={false}
              muted
            />
          ) : (
            <img
              src={data.url}
              className="w-full h-full object-contain"
              alt="Preview"
            />
          )
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-500 opacity-30">
            <span className="text-2xl">🖼</span>
            <span className="text-[10px]">无信号</span>
          </div>
        )}
      </div>
    </NodeShell>
  );
}
