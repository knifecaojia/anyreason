'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { TextNoteNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function TextNoteNode(props: NodeProps) {
  const data = props.data as unknown as TextNoteNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const ports = getNodeType('textNoteNode')?.ports ?? [];

  return (
    <NodeShell
      nodeId={props.id}
      title={data.title || '笔记'}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div
        className={
          selected
            ? 'text-sm text-textMain'
            : 'text-xs text-textMuted line-clamp-3'
        }
      >
        {data.content ? data.content : '双击编辑内容'}
      </div>
    </NodeShell>
  );
}
