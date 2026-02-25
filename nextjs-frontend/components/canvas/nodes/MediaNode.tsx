'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { MediaNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function MediaNode(props: NodeProps) {
  const data = props.data as unknown as MediaNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('mediaNode');
  const ports = reg?.ports ?? [];

  return (
    <NodeShell
      nodeId={props.id}
      title={data.title || '媒体'}
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      {data.resultUrl ? (
        data.mediaType === 'video' ? (
          <video
            src={data.resultUrl}
            className="w-full h-24 rounded-xl object-cover bg-black"
            controls={false}
            muted
          />
        ) : (
          <img
            src={data.resultUrl}
            className="w-full h-24 rounded-xl object-cover bg-black/50"
            alt={data.title || '媒体'}
          />
        )
      ) : (
        <div className="h-24 rounded-xl bg-surfaceHighlight border border-border flex items-center justify-center text-xs text-textMuted">
          {data.mediaType === 'video' ? '视频预览' : '图片预览'}
        </div>
      )}
      <div className="mt-2 text-xs text-textMuted">
        Focus 时显示提示词面板
      </div>
    </NodeShell>
  );
}
