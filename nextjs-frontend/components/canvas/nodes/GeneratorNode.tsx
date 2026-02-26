'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow } from '@/lib/canvas/xyflow-compat';
import type { GeneratorNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function GeneratorNode(props: NodeProps) {
  const data = props.data as unknown as GeneratorNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('generatorNode');
  const ports = reg?.ports ?? [];
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, data: any) => void;
  const mode = data.generationMode ?? 'image';

  return (
    <NodeShell
      nodeId={props.id}
      title="生成节点"
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="space-y-3">
        {/* Generation mode toggle */}
        <div className="flex items-center gap-1 mb-2">
          <button
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              mode === 'image'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-textMuted hover:text-textMain'
            }`}
            onClick={() => updateNodeData(props.id, { ...data, generationMode: 'image' })}
          >
            图像
          </button>
          <button
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              mode === 'video'
                ? 'bg-green-500/20 text-green-400'
                : 'text-textMuted hover:text-textMain'
            }`}
            onClick={() => updateNodeData(props.id, { ...data, generationMode: 'video' })}
          >
            视频
          </button>
        </div>

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
            {mode === 'video' ? (
              <video
                src={data.lastImage}
                className="w-full h-full object-cover"
                controls
                muted
              />
            ) : (
              <img
                src={data.lastImage}
                className="w-full h-full object-cover"
                alt="Generated"
              />
            )}
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
