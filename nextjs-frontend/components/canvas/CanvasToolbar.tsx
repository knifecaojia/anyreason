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
  // Batch queue
  onRunAll: () => void;
  onRunSelected: () => void;
  onStopAll: () => void;
  queueState: {
    completedCount: number;
    totalCount: number;
    isRunning: boolean;
  } | null;

  // Import/Export
  onExportWorkflow: () => void;
  onImportWorkflow: () => void;
  onExportSelected: () => void;
  hasSelection: boolean;

  // Batch generate for storyboard nodes (Req 4.7)
  hasStoryboardSelection?: boolean;
  onBatchGenerateImage?: () => void;
  onBatchGenerateVideo?: () => void;

  // Performance mode
  performanceMode: PerformanceMode;
  onPerformanceModeChange: (mode: PerformanceMode) => void;

  // Layout mode
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

/** Separator between toolbar groups */
function Divider() {
  return <div className="w-px h-5 bg-border/60 mx-1.5" />;
}

/** Queue progress bar shown when batch is running */
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

/** Performance mode dropdown */
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
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
        title="性能模式"
      >
        <SelectedIcon size={15} />
        <span className="hidden md:inline">{selected.label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Backdrop to close dropdown */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-32 bg-surface border border-border rounded-lg shadow-xl z-30 py-1">
            {PERFORMANCE_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  onChange(mode);
                  setOpen(false);
                }}
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
    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 bg-surface/90 backdrop-blur border border-border rounded-xl shadow-xl z-10">
      {/* ── Execution controls ── */}
      <button
        type="button"
        onClick={onRunAll}
        disabled={isRunning}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-primary hover:text-primary/80 hover:bg-surfaceHighlight disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="全部执行"
      >
        <Play size={15} />
        <span className="hidden md:inline">全部执行</span>
      </button>

      <button
        type="button"
        onClick={onRunSelected}
        disabled={!hasSelection || isRunning}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-textMuted hover:text-textMain hover:bg-surfaceHighlight disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="执行选中"
      >
        <CheckSquare size={15} />
        <span className="hidden md:inline">执行选中</span>
      </button>

      {/* Batch generate buttons — visible when storyboard nodes are selected (Req 4.7) */}
      {hasStoryboardSelection && (
        <>
          <button
            type="button"
            onClick={onBatchGenerateImage}
            disabled={isRunning}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="批量生成图像"
          >
            <Image size={15} />
            <span className="hidden md:inline">批量生成图像</span>
          </button>
          <button
            type="button"
            onClick={onBatchGenerateVideo}
            disabled={isRunning}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-green-400 hover:text-green-300 hover:bg-green-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="批量生成视频"
          >
            <Video size={15} />
            <span className="hidden md:inline">批量生成视频</span>
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onStopAll}
        disabled={!isRunning}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${isRunning ? 'animate-pulse' : ''}`}
        title="停止全部"
      >
        <Square size={15} />
        <span className="hidden md:inline">停止全部</span>
      </button>

      {/* Queue progress (visible when running) */}
      {isRunning && queueState && (
        <QueueProgress
          completedCount={queueState.completedCount}
          totalCount={queueState.totalCount}
        />
      )}

      <Divider />

      {/* ── Import / Export ── */}
      <button
        type="button"
        onClick={onExportWorkflow}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
        title="导出工作流"
      >
        <Download size={15} />
        <span className="hidden md:inline">导出</span>
      </button>

      <button
        type="button"
        onClick={onImportWorkflow}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
        title="导入工作流"
      >
        <Upload size={15} />
        <span className="hidden md:inline">导入</span>
      </button>

      <button
        type="button"
        onClick={onExportSelected}
        disabled={!hasSelection}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-textMuted hover:text-textMain hover:bg-surfaceHighlight disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="导出选中"
      >
        <Download size={15} />
        <span className="hidden md:inline">导出选中</span>
      </button>

      <Divider />

      {/* ── View controls ── */}
      <PerformanceModeDropdown
        current={performanceMode}
        onChange={onPerformanceModeChange}
      />

      {/* Layout mode toggle */}
      <div className="flex items-center bg-surfaceHighlight rounded-md p-0.5">
        <button
          type="button"
          onClick={() => onLayoutModeChange('card')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${
            layoutMode === 'card'
              ? 'bg-surface text-textMain shadow-sm'
              : 'text-textMuted hover:text-textMain'
          }`}
          title="卡片视图"
        >
          <LayoutGrid size={15} />
          <span className="hidden md:inline">卡片</span>
        </button>
        <button
          type="button"
          onClick={() => onLayoutModeChange('timeline')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${
            layoutMode === 'timeline'
              ? 'bg-surface text-textMain shadow-sm'
              : 'text-textMuted hover:text-textMain'
          }`}
          title="时间线视图"
        >
          <Clock size={15} />
          <span className="hidden md:inline">时间线</span>
        </button>
      </div>
    </div>
  );
}
