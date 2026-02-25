'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { SlicerNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function SlicerNode(props: NodeProps) {
  const data = props.data as unknown as SlicerNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const ports = getNodeType('slicerNode')?.ports ?? [];
  const items = data.storyboardItems ?? [];

  return (
    <NodeShell
      nodeId={props.id}
      title="拆分节点"
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="min-h-[60px]">
        {data.isProcessing ? (
          <div className="flex items-center justify-center py-4 text-xs text-textMuted">
            <span className="animate-pulse">拆分中...</span>
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {items.map((item, idx) => (
              <div
                key={`shot-${item.shotNumber}-${idx}`}
                className="bg-surfaceHighlight p-2 rounded border border-border text-[11px]"
              >
                <div className="font-medium text-textMain">
                  #{item.shotNumber}
                </div>
                <div className="text-textMuted line-clamp-2">
                  {item.sceneDescription}
                </div>
              </div>
            ))}
            <div className="text-[10px] text-textMuted text-right">
              共 {items.length} 个分镜
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4 text-[10px] text-textMuted">
            等待输入
          </div>
        )}
      </div>
    </NodeShell>
  );
}
