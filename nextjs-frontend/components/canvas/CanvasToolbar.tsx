'use client';

import { Download, Upload, Save, Loader2, Check, AlertCircle } from 'lucide-react';

// ===== Props =====

export interface CanvasToolbarProps {
  onExportWorkflow: () => void;
  onImportWorkflow: () => void;
  onSave: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

// ===== Sub-components =====

function Divider() {
  return <div className="w-px h-5 bg-border/60 mx-1.5" />;
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
  icon: typeof Save;
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

// ===== Save button with status =====

function SaveButton({
  onSave,
  saveStatus,
}: {
  onSave: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}) {
  const isSaving = saveStatus === 'saving';

  let icon: typeof Save = Save;
  let label = '保存';
  let className = 'text-primary hover:text-primary/80 hover:bg-surfaceHighlight';

  if (saveStatus === 'saving') {
    icon = Loader2;
    label = '保存中…';
    className = 'text-textMuted hover:bg-surfaceHighlight';
  } else if (saveStatus === 'saved') {
    icon = Check;
    label = '已保存';
    className = 'text-green-400 hover:bg-surfaceHighlight';
  } else if (saveStatus === 'error') {
    icon = AlertCircle;
    label = '保存失败';
    className = 'text-red-400 hover:bg-surfaceHighlight';
  }

  return (
    <TBtn
      onClick={isSaving ? undefined : onSave}
      disabled={isSaving}
      title="保存画布 (Ctrl+S)"
      icon={icon}
      label={label}
      className={className}
    />
  );
}

// ===== Main Component =====

export default function CanvasToolbar({
  onExportWorkflow,
  onImportWorkflow,
  onSave,
  saveStatus,
}: CanvasToolbarProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-2 py-1 bg-surface/90 backdrop-blur border border-border rounded-xl shadow-xl z-10">
      {/* ── Save ── */}
      <SaveButton onSave={onSave} saveStatus={saveStatus} />

      <Divider />

      {/* ── Import / Export ── */}
      <TBtn onClick={onImportWorkflow} title="导入工作流" icon={Upload} label="导入" className="text-textMuted hover:text-textMain hover:bg-surfaceHighlight" />
      <TBtn onClick={onExportWorkflow} title="导出工作流" icon={Download} label="导出" className="text-textMuted hover:text-textMain hover:bg-surfaceHighlight" />
    </div>
  );
}
