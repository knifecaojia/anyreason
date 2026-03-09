'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow } from '@/lib/canvas/xyflow-compat';
import type { StoryboardNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function StoryboardNode(props: NodeProps) {
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, data: any) => void;
  const data = props.data as unknown as StoryboardNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const [isEditing, setIsEditing] = useState(false);
  const reg = getNodeType('storyboardNode');
  const ports = reg?.ports ?? [];

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(props.id, { ...data, sceneDescription: e.target.value });
  };

  const handleDialogueChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(props.id, { ...data, dialogue: e.target.value });
  };

  return (
    <NodeShell
      nodeId={props.id}
      title={`镜头 #${data.shotNumber ?? 1}`}
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="space-y-2" onDoubleClick={() => setIsEditing(true)}>
        {/* Shot number badge */}
        <span className="inline-block px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold">
          Shot #{data.shotNumber ?? 1}
        </span>

        {/* Source info label (from storyboard panel) */}
        {data.sourceInfo && (
          <div className="flex items-center gap-1 text-[10px] text-textMuted">
            <span>来自故事板:</span>
            <span className="font-semibold text-primary">
              {data.sourceInfo.shotCode || '未知镜头'}
            </span>
          </div>
        )}

        {/* Scene description */}
        {isEditing ? (
          <div className="space-y-1">
            <div className="text-[10px] text-textMuted">场景描述</div>
            <textarea
              className="nodrag w-full bg-transparent border border-border rounded p-1 text-xs text-textMain resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              value={data.sceneDescription || ''}
              onChange={handleDescChange}
              placeholder="场景描述..."
            />
            <div className="text-[10px] text-textMuted">对白</div>
            <textarea
              className="nodrag w-full bg-transparent border border-border rounded p-1 text-xs text-textMain resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              value={data.dialogue || ''}
              onChange={handleDialogueChange}
              onBlur={() => setIsEditing(false)}
              placeholder="对白..."
            />
          </div>
        ) : (
          <>
            <p className="text-xs text-textMain line-clamp-3 leading-relaxed">
              {data.sceneDescription || '暂无场景描述'}
            </p>

            {/* Dialogue (if present) */}
            {data.dialogue && (
              <p className="text-xs text-textMuted italic border-l-2 border-primary/30 pl-2 line-clamp-2">
                &ldquo;{data.dialogue}&rdquo;
              </p>
            )}
          </>
        )}

        {/* Reference image thumbnail (if present) */}
        {data.referenceImageUrl && (
          <img
            src={data.referenceImageUrl}
            className="w-full h-20 rounded object-cover bg-black/50"
            alt={`镜头 #${data.shotNumber} 参考图`}
          />
        )}
      </div>
    </NodeShell>
  );
}
