'use client';

/**
 * NodeLibrary — left-side node palette for dragging node types onto the canvas.
 *
 * Defaults to **collapsed icon-only mode** (slim vertical strip of icons).
 * Click the expand button or any icon to expand into the full panel with labels.
 * Per spec P2: 节点列表默认最小化为 icon，点击展开。
 */

import { useState, type DragEvent } from 'react';
import {
  getAllNodeTypes,
  getNodeTypesByGroup,
  type NodeGroup,
  type NodeTypeRegistration,
} from '@/lib/canvas/node-registry';
import { ChevronDown, ChevronRight, ChevronLeft, PanelLeftOpen } from 'lucide-react';

/** Group metadata with Chinese labels */
const NODE_GROUPS: { group: NodeGroup; label: string }[] = [
  { group: 'creation', label: '创作组' },
  { group: 'ai-generation', label: 'AI 生成组' },
  { group: 'reference', label: '引用组' },
];

// ===== Shared drag handler =====

function makeDragStart(reg: NodeTypeRegistration) {
  return (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/reactflow-node-type', reg.type);
    e.dataTransfer.effectAllowed = 'move';
  };
}

// ===== Collapsed icon item =====

function IconItem({ reg }: { reg: NodeTypeRegistration }) {
  const Icon = reg.icon;
  return (
    <div
      draggable
      onDragStart={makeDragStart(reg)}
      className={`w-8 h-8 rounded-lg ${reg.colorClass ?? 'bg-primary/10 text-primary'} flex items-center justify-center cursor-grab hover:scale-110 active:cursor-grabbing transition-transform`}
      title={reg.label}
    >
      <Icon size={14} />
    </div>
  );
}

// ===== Expanded list item =====

function ListItem({ reg }: { reg: NodeTypeRegistration }) {
  const Icon = reg.icon;
  return (
    <div
      draggable
      onDragStart={makeDragStart(reg)}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab bg-surfaceHighlight hover:bg-surface border border-transparent hover:border-border transition-colors active:cursor-grabbing"
    >
      <div className={`w-7 h-7 rounded ${reg.colorClass ?? 'bg-primary/10 text-primary'} flex items-center justify-center flex-shrink-0`}>
        <Icon size={14} />
      </div>
      <span className="text-xs font-medium text-textMain truncate">
        {reg.label}
      </span>
    </div>
  );
}

// ===== Expanded group section =====

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
            <ListItem key={reg.type} reg={reg} />
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Main Component =====

export default function NodeLibrary() {
  const [expanded, setExpanded] = useState(false);

  // --- Collapsed: slim icon strip ---
  if (!expanded) {
    const allTypes = Array.from(getAllNodeTypes().values());
    return (
      <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur border border-border rounded-xl shadow-xl z-10 flex flex-col items-center py-2 px-1 gap-1">
        {/* Expand button */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-8 h-8 rounded-lg hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors mb-1"
          title="展开节点库"
        >
          <PanelLeftOpen size={14} />
        </button>
        {/* Icon list — all node types as small draggable icons */}
        {allTypes.map((reg) => (
          <IconItem key={reg.type} reg={reg} />
        ))}
      </div>
    );
  }

  // --- Expanded: full panel with groups ---
  return (
    <div className="absolute top-4 left-4 w-52 bg-surface/90 backdrop-blur border border-border rounded-xl shadow-xl z-10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider">
          节点库
        </h4>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-5 h-5 rounded hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors"
          title="收起节点库"
        >
          <ChevronLeft size={12} />
        </button>
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
