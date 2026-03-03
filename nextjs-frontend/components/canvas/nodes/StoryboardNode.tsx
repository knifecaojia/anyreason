'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { StoryboardNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import NodeShell from './NodeShell';

export default function StoryboardNode(props: NodeProps) {
  const data = props.data as unknown as StoryboardNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('storyboardNode');
  const ports = reg?.ports ?? [];
  const { expand, collapse, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();

  return (
    <NodeShell
      nodeId={props.id}
      title={`镜头 #${data.shotNumber ?? 1}`}
      icon={reg?.icon}
      iconEmoji="🎬"
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
        {/* Shot number badge */}
        <span className="inline-block px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold">
          Shot #{data.shotNumber ?? 1}
        </span>

        {/* Scene description */}
        <p className="text-xs text-textMain line-clamp-3 leading-relaxed">
          {data.sceneDescription || '暂无场景描述'}
        </p>

        {/* Dialogue (if present) */}
        {data.dialogue && (
          <p className="text-xs text-textMuted italic border-l-2 border-primary/30 pl-2 line-clamp-2">
            &ldquo;{data.dialogue}&rdquo;
          </p>
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
