'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow } from '@/lib/canvas/xyflow-compat';
import type { ScriptNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
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
  const text = data.text ?? '';
  const isOverLimit = text.length > MAX_TEXT_LENGTH;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(props.id, { ...data, text: e.target.value });
  };

  return (
    <NodeShell
      nodeId={props.id}
      title="剧本节点"
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="relative">
        <textarea
          className="nodrag w-full bg-transparent text-xs text-textMain resize-none focus:outline-none min-h-[8rem] p-1"
          value={data.text || ''}
          onChange={handleTextChange}
          placeholder="暂无剧本内容。请在右侧面板选择分集以自动加载..."
        />
        {!data.text && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] text-textMuted bg-surface/80 px-2 py-1 rounded">
              等待分集选择...
            </span>
          </div>
        )}
      </div>
    </NodeShell>
  );
}
