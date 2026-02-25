'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { ScriptNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

const MAX_TEXT_LENGTH = 10000;

export default function ScriptNode(props: NodeProps) {
  const data = props.data as unknown as ScriptNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const ports = getNodeType('scriptNode')?.ports ?? [];
  const text = data.text ?? '';
  const isOverLimit = text.length > MAX_TEXT_LENGTH;

  return (
    <NodeShell
      nodeId={props.id}
      title="剧本节点"
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="space-y-2">
        <p className="text-xs text-textMain line-clamp-4 font-serif leading-relaxed italic">
          &ldquo;{text || '空剧本...'}&rdquo;
        </p>
        <div className={`text-[10px] ${isOverLimit ? 'text-red-400' : 'text-textMuted'}`}>
          {text.length} / {MAX_TEXT_LENGTH} 字符
        </div>
      </div>
    </NodeShell>
  );
}
