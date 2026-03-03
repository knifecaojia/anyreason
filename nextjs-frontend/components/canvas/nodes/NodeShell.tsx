'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Handle, Position } from '@/lib/canvas/xyflow-compat';
import type { PortDefinition } from '@/lib/canvas/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface NodeShellProps {
  nodeId: string;
  title: string;
  icon?: React.ComponentType<{ size?: number }>;
  iconEmoji?: string;
  colorClass?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onTitleChange?: (newTitle: string) => void;
  renderLevel?: 'full' | 'simplified' | 'placeholder' | 'icon';
  onExpand?: () => void;
  onCollapse?: () => void;
  ports?: PortDefinition[];
  selected?: boolean;
  children: ReactNode;
}

const HANDLE_STYLE: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 9999,
  background: '#374151', border: '3px solid #1f2937',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 700, color: '#9ca3af',
  top: '50%', zIndex: 30,
};

function PortHandles({ ports, selected = false }: { ports: PortDefinition[]; selected?: boolean }) {
  const hasInput = ports.some((p) => p.direction === 'input');
  const hasOutput = ports.some((p) => p.direction === 'output');

  return (
    <>
      {hasInput && (
        <Handle id="in" type="target" position={Position.Left}
          className="node-handle-in"
          style={HANDLE_STYLE}>
          <span className="pointer-events-none select-none leading-none">+</span>
        </Handle>
      )}
      {hasOutput && (
        <Handle id="out" type="source" position={Position.Right}
          className="node-handle-out"
          style={HANDLE_STYLE}>
          <span className="pointer-events-none select-none leading-none">+</span>
        </Handle>
      )}
    </>
  );
}

/** No-op: nodes with no port definitions render nothing */
function DefaultPortHandles() {
  return null;
}

function EditableTitle({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange?: (newTitle: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title && onTitleChange) {
      onTitleChange(trimmed);
    } else {
      setDraft(title);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="bg-transparent border-none outline-none text-xs font-medium w-full truncate"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(title);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="truncate cursor-default"
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onTitleChange) {
          setDraft(title);
          setEditing(true);
        }
      }}
    >
      {title}
    </span>
  );
}

export default function NodeShell({
  nodeId,
  title,
  icon: Icon,
  iconEmoji,
  colorClass,
  collapsed = false,
  onToggleCollapse,
  onTitleChange,
  renderLevel = 'full',
  onExpand,
  onCollapse,
  ports,
  selected = false,
  children,
}: NodeShellProps) {
  const hasPorts = ports && ports.length > 0;

  // Icon: ~40x40 rounded square with icon + expand button + hover tooltip
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 ${
          colorClass ?? 'bg-surface'
        } ${selected ? 'ring-2 ring-primary' : 'border border-border/70'}`}
        title={title}
      >
        {iconEmoji ? (
          <span className="text-base leading-none">{iconEmoji}</span>
        ) : Icon ? (
          <Icon size={18} />
        ) : (
          <span className="text-xs font-bold">?</span>
        )}
        {onExpand && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
          >
            +
          </button>
        )}
      </div>
    );
  }

  // Placeholder: simple colored rectangle with title
  if (renderLevel === 'placeholder') {
    return (
      <div
        className={`rounded-2xl min-w-[220px] relative ${colorClass ?? 'bg-background/90'} ${
          selected ? 'ring-2 ring-primary' : ''
        }`}
        style={{ minHeight: 40 }}
      >
        {hasPorts ? <PortHandles ports={ports} selected={selected} /> : <DefaultPortHandles />}
        <div className="px-3 py-2 text-xs font-medium truncate">
          {Icon && <Icon size={14} />}
          {title}
        </div>
      </div>
    );
  }

  // Simplified: title bar + ports, no children content
  if (renderLevel === 'simplified') {
    return (
      <div
        className={`rounded-2xl border border-border/70 bg-background/90 backdrop-blur shadow-lg min-w-[220px] relative ${
          selected ? 'ring-2 ring-primary' : ''
        }`}
      >
        {hasPorts ? <PortHandles ports={ports} selected={selected} /> : <DefaultPortHandles />}
        <TitleBar
          title={title}
          icon={Icon}
          colorClass={colorClass}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          onTitleChange={onTitleChange}
        />
      </div>
    );
  }

  // Full: everything
  return (
    <div
      className={`rounded-2xl border border-border/70 bg-background/90 backdrop-blur shadow-lg min-w-[220px] relative ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      {hasPorts ? <PortHandles ports={ports} selected={selected} /> : <DefaultPortHandles />}
      <TitleBar
        title={title}
        icon={Icon}
        colorClass={colorClass}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onTitleChange={onTitleChange}
      />
      {!collapsed && <div className="p-3">{children}</div>}
    </div>
  );
}

function TitleBar({
  title,
  icon: Icon,
  colorClass,
  collapsed,
  onToggleCollapse,
  onTitleChange,
}: {
  title: string;
  icon?: React.ComponentType<{ size?: number }>;
  colorClass?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onTitleChange?: (newTitle: string) => void;
}) {
  const borderClass = collapsed ? '' : 'border-b border-border';

  return (
    <div
      className={`px-3 py-2 text-xs font-medium flex items-center justify-between rounded-t-2xl ${borderClass} ${colorClass ?? 'text-textMain'}`}
    >
      <span className="flex items-center gap-2 truncate pr-2">
        {Icon && <Icon size={14} />}
        <EditableTitle title={title} onTitleChange={onTitleChange} />
      </span>
      {onToggleCollapse ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="p-0.5 hover:bg-black/20 rounded opacity-50 hover:opacity-100 transition-colors flex-shrink-0"
          type="button"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      ) : (
        <span className="text-[10px] text-textMuted">●</span>
      )}
    </div>
  );
}
