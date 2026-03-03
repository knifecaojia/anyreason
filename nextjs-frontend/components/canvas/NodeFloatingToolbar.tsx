'use client';

/**
 * NodeFloatingToolbar — appears above selected node(s) with quick actions.
 * Uses @xyflow/react NodeToolbar (via compat shim) for automatic positioning.
 */

import { useCallback } from 'react';
import { NodeToolbar } from '@/lib/canvas/xyflow-compat';
import { Copy, Trash2, Play, Lock, Unlock, Palette } from 'lucide-react';

export interface NodeFloatingToolbarProps {
  nodeId: string;
  isLocked?: boolean;
  onDuplicate?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onRun?: (nodeId: string) => void;
  onToggleLock?: (nodeId: string) => void;
}

export default function NodeFloatingToolbar({
  nodeId,
  isLocked = false,
  onDuplicate,
  onDelete,
  onRun,
  onToggleLock,
}: NodeFloatingToolbarProps) {
  const handleDuplicate = useCallback(() => onDuplicate?.(nodeId), [nodeId, onDuplicate]);
  const handleDelete = useCallback(() => onDelete?.(nodeId), [nodeId, onDelete]);
  const handleRun = useCallback(() => onRun?.(nodeId), [nodeId, onRun]);
  const handleToggleLock = useCallback(() => onToggleLock?.(nodeId), [nodeId, onToggleLock]);

  return (
    <NodeToolbar
      isVisible
      position="top"
      align="center"
      offset={8}
      className="flex items-center gap-0.5 px-1.5 py-1 rounded-xl border border-border bg-background/95 backdrop-blur-xl shadow-xl"
    >
      {onRun && (
        <ToolbarButton icon={Play} label="运行" onClick={handleRun} className="text-green-400 hover:bg-green-500/20" />
      )}
      {onDuplicate && (
        <ToolbarButton icon={Copy} label="复制" onClick={handleDuplicate} />
      )}
      {onToggleLock && (
        <ToolbarButton
          icon={isLocked ? Lock : Unlock}
          label={isLocked ? '解锁' : '锁定'}
          onClick={handleToggleLock}
          className={isLocked ? 'text-yellow-400' : ''}
        />
      )}
      {onDelete && (
        <ToolbarButton icon={Trash2} label="删除" onClick={handleDelete} className="text-red-400 hover:bg-red-500/20" />
      )}
    </NodeToolbar>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  className = '',
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-7 h-7 rounded-lg flex items-center justify-center text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors ${className}`}
      title={label}
    >
      <Icon size={14} />
    </button>
  );
}
