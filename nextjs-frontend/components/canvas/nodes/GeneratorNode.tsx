'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { GeneratorNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function GeneratorNode(props: NodeProps) {
  const data = props.data as unknown as GeneratorNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const ports = getNodeType('generatorNode')?.ports ?? [];

  return (
    <NodeShell
      nodeId={props.id}
      title="生成节点"
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="space-y-3">
        {/* Model name */}
        <div className="flex items-center justify-between text-[10px] text-textMuted">
          <span>模型配置</span>
          <span className="text-purple-400 font-mono truncate max-w-[120px]">
            {data.model || '未选择'}
          </span>
        </div>

        {/* Prompt */}
        {data.prompt && (
          <p className="text-[11px] text-textMuted line-clamp-2 italic">
            {data.prompt}
          </p>
        )}

        {/* Progress bar when processing */}
        {data.isProcessing && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-surfaceHighlight overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{ width: `${data.progress ?? 0}%` }}
              />
            </div>
            <div className="text-[10px] text-purple-300 text-right">
              {data.progress ?? 0}%
            </div>
          </div>
        )}

        {/* Result thumbnail or placeholder */}
        {data.lastImage ? (
          <div className="aspect-video bg-black rounded border border-border overflow-hidden">
            <img
              src={data.lastImage}
              className="w-full h-full object-cover"
              alt="Generated"
            />
          </div>
        ) : (
          <div className="aspect-video bg-surfaceHighlight rounded border border-border border-dashed flex items-center justify-center text-textMuted text-xs">
            {data.isProcessing ? '生成中...' : '准备就绪'}
          </div>
        )}

        {/* Error display */}
        {data.error && (
          <div className="text-[10px] text-red-400 truncate" title={data.error}>
            ⚠ {data.error}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
