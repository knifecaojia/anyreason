'use client';

import { useState, type DragEvent } from 'react';
import {
  getNodeTypesByGroup,
  type NodeGroup,
  type NodeTypeRegistration,
} from '@/lib/canvas/node-registry';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** Group metadata with Chinese labels matching the spec */
const NODE_GROUPS: { group: NodeGroup; label: string }[] = [
  { group: 'creation', label: '创作组' },
  { group: 'ai-generation', label: 'AI 生成组' },
  { group: 'display', label: '展示组' },
  { group: 'reference', label: '引用组' },
];

function NodeTypeItem({ reg }: { reg: NodeTypeRegistration }) {
  const Icon = reg.icon;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/reactflow-node-type', reg.type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab bg-surfaceHighlight hover:bg-surface border border-transparent hover:border-border transition-colors active:cursor-grabbing"
    >
      <div className="w-7 h-7 rounded bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <Icon size={14} />
      </div>
      <span className="text-xs font-medium text-textMain truncate">
        {reg.label}
      </span>
    </div>
  );
}

function NodeGroupSection({
  group,
  label,
  defaultExpanded = true,
}: {
  group: NodeGroup;
  label: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const nodeTypes = getNodeTypesByGroup(group);

  if (nodeTypes.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-textMuted hover:text-textMain transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
      </button>
      {expanded && (
        <div className="space-y-1 mt-0.5">
          {nodeTypes.map((reg) => (
            <NodeTypeItem key={reg.type} reg={reg} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NodeLibrary() {
  return (
    <div className="absolute top-4 left-4 w-52 bg-surface/90 backdrop-blur border border-border rounded-xl shadow-xl z-10 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider">
          节点库
        </h4>
      </div>
      <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
        {NODE_GROUPS.map(({ group, label }) => (
          <NodeGroupSection key={group} group={group} label={label} />
        ))}
      </div>
      <div className="px-3 py-1.5 border-t border-border">
        <p className="text-[10px] text-textMuted text-center">
          拖拽节点至画布以添加
        </p>
      </div>
    </div>
  );
}
