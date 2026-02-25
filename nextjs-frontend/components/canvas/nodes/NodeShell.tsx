'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Handle, Position } from '@/lib/canvas/xyflow-compat';
import type { PortDefinition, PortDataType } from '@/lib/canvas/types';
import { PORT_COLORS } from '@/lib/canvas/port-system';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface NodeShellProps {
  nodeId: string;
  title: string;
  icon?: React.ComponentType<{ size?: number }>;
  colorClass?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onTitleChange?: (newTitle: string) => void;
  renderLevel?: 'full' | 'simplified' | 'placeholder';
  ports?: PortDefinition[];
  selected?: boolean;
  children: ReactNode;
}

function PortHandles({ ports }: { ports: PortDefinition[] }) {
  const inputPorts = ports.filter((p) => p.direction === 'input');
  const outputPorts = ports.filter((p) => p.direction === 'output');

  return (
    <>
      {inputPorts.map((port, idx) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          title={`${port.label} (${port.dataType})`}
          style={{
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: PORT_COLORS[port.dataType] ?? '#888',
            top: `${((idx + 1) / (inputPorts.length + 1)) * 100}%`,
            transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
          }}
        />
      ))}
      {outputPorts.map((port, idx) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          title={`${port.label} (${port.dataType})`}
          style={{
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: PORT_COLORS[port.dataType] ?? '#888',
            top: `${((idx + 1) / (outputPorts.length + 1)) * 100}%`,
            transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
          }}
        />
      ))}
    </>
  );
}

function DefaultPortHandles() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 10, height: 10, borderRadius: 9999 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, borderRadius: 9999 }}
      />
    </>
  );
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
  colorClass,
  collapsed = false,
  onToggleCollapse,
  onTitleChange,
  renderLevel = 'full',
  ports,
  selected = false,
  children,
}: NodeShellProps) {
  const hasPorts = ports && ports.length > 0;

  // Placeholder: simple colored rectangle with title
  if (renderLevel === 'placeholder') {
    return (
      <div
        className={`rounded-2xl min-w-[220px] relative ${colorClass ?? 'bg-background/90'} ${
          selected ? 'ring-2 ring-primary' : ''
        }`}
        style={{ minHeight: 40 }}
      >
        {hasPorts ? <PortHandles ports={ports} /> : <DefaultPortHandles />}
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
        className={`rounded-2xl border border-border bg-background/90 backdrop-blur shadow-lg min-w-[220px] relative ${
          selected ? 'ring-2 ring-primary' : ''
        }`}
      >
        {hasPorts ? <PortHandles ports={ports} /> : <DefaultPortHandles />}
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
      className={`rounded-2xl border border-border bg-background/90 backdrop-blur shadow-lg min-w-[220px] relative ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      {hasPorts ? <PortHandles ports={ports} /> : <DefaultPortHandles />}
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
