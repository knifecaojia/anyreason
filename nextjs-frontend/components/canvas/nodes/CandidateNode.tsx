'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { CandidateNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

export default function CandidateNode(props: NodeProps) {
  const data = props.data as unknown as CandidateNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const ports = getNodeType('candidateNode')?.ports ?? [];
  const candidates = data.candidates ?? [];

  return (
    <NodeShell
      nodeId={props.id}
      title="资产候选清单"
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="min-h-[60px]">
        {data.isProcessing ? (
          <div className="flex items-center justify-center py-4 text-xs text-textMuted">
            <span className="animate-pulse">提取中...</span>
          </div>
        ) : candidates.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {candidates.map((c, idx) => (
              <div
                key={`${c.name}-${idx}`}
                className="bg-surfaceHighlight p-2 rounded border border-border"
              >
                <div className="font-medium text-xs text-orange-200 truncate">
                  {c.name}
                </div>
                {c.description && (
                  <div className="text-[10px] text-textMuted line-clamp-2 mt-0.5">
                    {c.description}
                  </div>
                )}
                {c.tags && c.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[9px] bg-white/5 px-1 rounded text-textMuted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-4 text-[10px] text-textMuted italic">
            等待提取结果...
          </div>
        )}
      </div>
    </NodeShell>
  );
}
