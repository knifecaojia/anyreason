'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { ReferenceNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function ReferenceNode(props: NodeProps) {
  const data = props.data as unknown as ReferenceNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('referenceNode');
  const ports = reg?.ports ?? [];

  return (
    <NodeShell
      nodeId={props.id}
      title={data.title || '参考'}
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="text-xs text-textMuted line-clamp-4">
        {data.description || data.dialogue || '来自故事板'}
      </div>
      {data.sourceInfo?.shotCode && (
        <div className="mt-1 text-[10px] text-textMuted">
          镜头: {data.sourceInfo.shotCode}
        </div>
      )}
    </NodeShell>
  );
}
