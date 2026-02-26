'use client';

import { useState } from 'react';
import {
  Play,
  CheckSquare,
  Square,
  Download,
  Upload,
  LayoutGrid,
  Clock,
  Zap,
  Sparkles,
  Gauge,
  ChevronDown,
  Image,
  Video,
} from 'lucide-react';
import type { PerformanceMode } from '@/lib/canvas/types';

// ===== Props =====

export interface CanvasToolbarProps {
  onRunAll: () => void;
  onRunSelected: () => void;
  onStopAll: () => void;
  queueState: {
    completedCount: number;
    totalCount: number;
    isRunning: boolean;
  } | null;
  onExportWorkflow: () => void;
  onImportWorkflow: () => void;
  onExportSelected: () => void;
  hasSelection: boolean;
  hasStoryboardSelection?: boolean;
  onBatchGenerateImage?: () => void;
  onBatchGenerateVideo?: () => void;
  performanceMode: PerformanceMode;
  onPerformanceModeChange: (mode: PerformanceMode) => void;
  layoutMode: 'card' | 'timeline';
  onLayoutModeChange: (mode: 'card' | 'timeline') => void;
}

// ===== Performance mode options =====

const PERFORMANCE_OPTIONS: {
  mode: PerformanceMode;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { mode: 'high-quality', label: '高质量', icon: Sparkles },
  { mode: 'normal', label: '普通', icon: Gauge },
  { mode: 'fast', label: '极速', icon: Zap },
];

// ===== Sub-components =====

function Divider() {
  return <div className="w-px h-5 bg-border/60 mx-1.5" />;
}

function QueueProgress({
  completedCount,
  totalCount,
}: {
  completedCount: number;
  totalCount: number;
}) {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return (
    <div className="flex items-center gap-2 px-2">
      <div className="w-20 h-1.5 rounded-full bg-surfaceHighlight overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-textMuted whitespace-nowrap">
        {completedCount}/{totalCount}
      </span>
    </div>
  );
}

function PerformanceModeDropdown({
  current,
  onChange,
}: {
  current: PerformanceMode;
  onChange: (mode: PerformanceMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = PERFORMANCE_OPTIONS.find((o) => o.mode === current) ?? PERFORMANCE_OPTIONS[1];
  const SelectedIcon = selected.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors whitespace-nowrap"
        title="性能模式"
      >
        <SelectedIcon size={14} />
        <span>{selected.label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 w-32 bg-surface border border-border rounded-lg shadow-xl z-30 py-1">
            {PERFORMANCE_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => { onChange(mode); setOpen(false); }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors ${
                  mode === current
                    ? 'text-primary bg-primary/10'
                    : 'text-textMuted hover:text-textMain hover:bg-surfaceHighlight'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ===== Toolbar button helper =====

function TBtn({
  onClick,
  disabled,
  title,
  icon: Icon,
  label,
  className = '',
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  icon: typeof Play;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${className}`}
      title={title}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

// ===== Main Component =====

export default function CanvasToolbar({
  onRunAll,
  onRunSelected,
  onStopAll,
  queueState,
  onExportWorkflow,
  onImportWorkflow,
  onExportSelected,
  hasSelection,
  hasStoryboardSelection,
  onBatchGenerateImage,
  onBatchGenerateVideo,
  performanceMode,
  onPerformanceModeChange,
  layoutMode,
  onLayoutModeChange,
}: CanvasToolbarProps) {
  const isRunning = queueState?.isRunning ?? false;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-2 py-1 bg-surface/90 backdrop-blur border border-border rounded-xl shadow-xl z-10">
      {/* ── Execution ── */}
      <TBtn onClick={onRunAll} disabled={isRunning} title="全部执行" icon={Play} label="全部执行" className="text-primary hover:text-primary/80 hover:bg-surfaceHighlight" />
      <TBtn onClick={onRunSelected} disabled={!hasSelection || isRunning} title="执行选中" icon={CheckSquare} label="执行选中" className="text-textMuted hover:text-textMain hover:bg-surfaceHighlight" />

      {hasStoryboardSelection && (
        <>
          <TBtn onClick={onBatchGenerateImage} disabled={isRunning} title="批量生成图像" icon={Image} label="批量图像" className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10" />
          <TBtn onClick={onBatchGenerateVideo} disabled={isRunning} title="批量生成视频" icon={Video} label="批量视频" className="text-green-400 hover:text-green-300 hover:bg-green-500/10" />
        </>
      )}

      <TBtn
        onClick={onStopAll}
        disabled={!isRunning}
        title="停止全部"
        icon={Square}
        label="停止"
        className={`text-red-400 hover:text-red-300 hover:bg-red-500/10 ${isRunning ? 'animate-pulse' : ''}`}
      />

      {isRunning && queueState && (
        <QueueProgress completedCount={queueState.completedCount} totalCount={queueState.totalCount} />
      )}

      <Divider />

      {/* ── Import / Export ── */}
      <TBtn onClick={onExportWorkflow} title="导出工作流" icon={Download} label="导出" className="text-textMuted hover:text-textMain hover:bg-surfaceHighlight" />
      <TBtn onClick={onImportWorkflow} title="导入工作流" icon={Upload} label="导入" className="text-textMuted hover:text-textMain hover:bg-surfaceHighlight" />
      <TBtn onClick={onExportSelected} disabled={!hasSelection} title="导出选中" icon={Download} label="导出选中" className="text-textMuted hover:text-textMain hover:bg-surfaceHighlight" />

      <Divider />

      {/* ── View controls ── */}
      <PerformanceModeDropdown current={performanceMode} onChange={onPerformanceModeChange} />

      <div className="flex items-center bg-surfaceHighlight rounded-md p-0.5">
        <button
          type="button"
          onClick={() => onLayoutModeChange('card')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
            layoutMode === 'card' ? 'bg-surface text-textMain shadow-sm' : 'text-textMuted hover:text-textMain'
          }`}
          title="卡片视图"
        >
          <LayoutGrid size={14} />
          <span>卡片</span>
        </button>
        <button
          type="button"
          onClick={() => onLayoutModeChange('timeline')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
            layoutMode === 'timeline' ? 'bg-surface text-textMain shadow-sm' : 'text-textMuted hover:text-textMain'
          }`}
          title="时间线视图"
        >
          <Clock size={14} />
          <span>时间线</span>
        </button>
      </div>
    </div>
  );
}
