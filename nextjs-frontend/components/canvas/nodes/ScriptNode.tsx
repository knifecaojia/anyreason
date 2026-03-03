'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow } from '@/lib/canvas/xyflow-compat';
import type { ScriptNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import NodeShell from './NodeShell';

const MAX_TEXT_LENGTH = 10000;

export default function ScriptNode(props: NodeProps) {
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, data: any) => void;
  const data = props.data as unknown as ScriptNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('scriptNode');
  const ports = reg?.ports ?? [];
  const { expand, collapse, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const text = data.text ?? '';
  const isOverLimit = text.length > MAX_TEXT_LENGTH;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value.slice(0, MAX_TEXT_LENGTH);
    updateNodeData(props.id, { ...data, text: newText });
  };

  return (
    <NodeShell
      nodeId={props.id}
      title="剧本节点"
      icon={reg?.icon}
      iconEmoji="📄"
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      renderLevel={renderLevel}
      onExpand={expand}
      onCollapse={collapse}
      ports={ports}
      selected={selected}
    >
      <div className="space-y-2">
        <textarea
          className="nodrag w-full bg-transparent border border-border rounded-lg p-2 text-xs text-textMain resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          rows={4}
          value={text}
          onChange={handleTextChange}
          placeholder="在此输入剧本文本..."
          style={{ minHeight: '4.5rem', maxHeight: '18rem', overflow: 'auto' }}
        />
        <div className={`text-[10px] ${isOverLimit ? 'text-red-400' : 'text-textMuted'}`}>
          {text.length} / {MAX_TEXT_LENGTH} 字符
        </div>
      </div>
    </NodeShell>
  );
}
