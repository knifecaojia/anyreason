'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { AssetNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

/**
 * AssetNode — merged from Studio and Storyboard asset node implementations.
 *
 * Studio version: simple name + type display with avatar initial.
 * Storyboard version: thumbnail image with overlay label, empty-state placeholder.
 *
 * This unified version supports both modes: when a thumbnail is present it renders
 * the rich image preview (storyboard style), otherwise falls back to the compact
 * avatar display (studio style).
 */
export default function AssetNode(props: NodeProps) {
  const data = props.data as unknown as AssetNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('assetNode');
  const ports = reg?.ports ?? [];
  const hasThumbnail = !!data.thumbnail;

  return (
    <NodeShell
      nodeId={props.id}
      title={data.name || '资产'}
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      {hasThumbnail ? (
        /* Storyboard-style: thumbnail with overlay */
        <div className="relative group">
          <img
            src={data.thumbnail}
            className="w-full h-24 object-cover rounded bg-black/50"
            alt={data.name}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-b text-[10px] truncate text-white">
            {data.assetType}: {data.name}
          </div>
        </div>
      ) : (
        /* Studio-style: avatar initial + name/type */
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surfaceHighlight border border-border flex items-center justify-center text-sm text-textMain">
            {(data.name || 'A').slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-textMain truncate">{data.name}</div>
            <div className="text-xs text-textMuted truncate">
              {data.assetType}
            </div>
          </div>
        </div>
      )}
      {data.category && (
        <div className="mt-1 text-[10px] text-textMuted">{data.category}</div>
      )}
    </NodeShell>
  );
}
