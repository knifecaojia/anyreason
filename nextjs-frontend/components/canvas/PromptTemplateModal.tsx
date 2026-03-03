'use client';

/**
 * PromptTemplateModal — modal for selecting, creating, editing, and deleting prompt presets.
 *
 * Data source: backend AIPromptPreset API (`/api/ai/prompt-presets`).
 * Each preset belongs to a `tool_key` (e.g. 'canvas_text_gen', 'canvas_image_gen',
 * 'canvas_video_gen'). The modal fetches presets for the given tool_key on open.
 *
 * Supports full CRUD:
 * - Select: fills preset's prompt_template into the target node
 * - Create: inline form to add new preset
 * - Edit: inline editing of existing preset
 * - Delete: remove preset with confirmation
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Sparkles, Star, Loader2, Plus, Pencil, Trash2, Check, ArrowLeft } from 'lucide-react';

// ===== Types =====

export interface PromptPreset {
  id: string;
  tool_key: string;
  name: string;
  provider: string | null;
  model: string | null;
  prompt_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplateModalProps {
  open: boolean;
  toolKey: string;
  onClose: () => void;
  onSelect: (preset: PromptPreset) => void;
}

const TOOL_KEY_LABELS: Record<string, string> = {
  canvas_text_gen: '文本生成',
  canvas_image_gen: '图片生成',
  canvas_video_gen: '视频生成',
};

type ModalView = 'list' | 'create' | 'edit';

// ===== API helpers (client-side fetch) =====

async function apiCreatePreset(body: {
  tool_key: string; name: string; prompt_template: string; is_default?: boolean;
}): Promise<PromptPreset | null> {
  const res = await fetch('/api/ai/prompt-presets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return json?.data ?? null;
}

async function apiUpdatePreset(
  id: string,
  body: { name?: string; prompt_template?: string; is_default?: boolean },
): Promise<PromptPreset | null> {
  const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return json?.data ?? null;
}

async function apiDeletePreset(id: string): Promise<boolean> {
  const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.ok;
}

// ===== Component =====

export default function PromptTemplateModal({
  open,
  toolKey,
  onClose,
  onSelect,
}: PromptTemplateModalProps) {
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ModalView>('list');
  const [saving, setSaving] = useState(false);

  // Edit/create form state
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formTemplate, setFormTemplate] = useState('');
  const [formDefault, setFormDefault] = useState(false);

  // Fetch presets
  const fetchPresets = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/ai/prompt-presets?tool_key=${encodeURIComponent(toolKey)}`)
      .then((res) => res.json())
      .then((json) => setPresets((json?.data ?? []) as PromptPreset[]))
      .catch((err) => setError(String(err?.message ?? err)))
      .finally(() => setLoading(false));
  }, [toolKey]);

  useEffect(() => {
    if (open) {
      setView('list');
      setSearch('');
      fetchPresets();
    }
  }, [open, fetchPresets]);

  const filtered = presets.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.prompt_template.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // --- Handlers ---

  const handleSelect = useCallback((preset: PromptPreset) => {
    onSelect(preset);
    onClose();
  }, [onSelect, onClose]);

  const openCreate = useCallback(() => {
    setEditId(null);
    setFormName('');
    setFormTemplate('');
    setFormDefault(false);
    setView('create');
  }, []);

  const openEdit = useCallback((preset: PromptPreset) => {
    setEditId(preset.id);
    setFormName(preset.name);
    setFormTemplate(preset.prompt_template);
    setFormDefault(preset.is_default);
    setView('edit');
  }, []);

  const handleSave = useCallback(async () => {
    if (!formName.trim() || !formTemplate.trim()) return;
    setSaving(true);
    try {
      if (view === 'create') {
        await apiCreatePreset({
          tool_key: toolKey,
          name: formName.trim(),
          prompt_template: formTemplate.trim(),
          is_default: formDefault,
        });
      } else if (view === 'edit' && editId) {
        await apiUpdatePreset(editId, {
          name: formName.trim(),
          prompt_template: formTemplate.trim(),
          is_default: formDefault,
        });
      }
      fetchPresets();
      setView('list');
    } catch {
      // stay on form
    } finally {
      setSaving(false);
    }
  }, [view, editId, formName, formTemplate, formDefault, toolKey, fetchPresets]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定删除此模板？')) return;
    await apiDeletePreset(id);
    fetchPresets();
  }, [fetchPresets]);

  if (!open) return null;

  const toolLabel = TOOL_KEY_LABELS[toolKey] ?? toolKey;

  // --- Create / Edit form view ---
  if (view === 'create' || view === 'edit') {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-[520px] rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setView('list')}
                className="w-6 h-6 rounded hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
                <ArrowLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-textMain">
                {view === 'create' ? '新建模板' : '编辑模板'}
              </span>
            </div>
            <button type="button" onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Form */}
          <div className="p-5 space-y-4">
            <div>
              <label className="text-[11px] font-medium text-textMuted mb-1 block">模板名称</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：动漫场景描述"
                className="w-full h-8 px-3 rounded-lg border border-border bg-background text-xs text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-textMuted mb-1 block">提示词内容</label>
              <textarea value={formTemplate} onChange={(e) => setFormTemplate(e.target.value)}
                placeholder="输入提示词模板内容...&#10;支持变量: {scene_text}, {asset_names}, {asset_descriptions}"
                rows={8}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30 resize-y font-mono leading-relaxed" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formDefault} onChange={(e) => setFormDefault(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-purple-500" />
              <span className="text-[11px] text-textMuted">设为默认模板</span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60">
            <button type="button" onClick={() => setView('list')}
              className="h-8 px-4 rounded-lg border border-border text-xs text-textMuted hover:text-textMain transition-colors">
              取消
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !formName.trim() || !formTemplate.trim()}
              className="h-8 px-4 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {view === 'create' ? '创建' : '保存'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // --- List view ---
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[560px] max-h-[70vh] rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Sparkles size={14} className="text-purple-400" />
            </div>
            <span className="text-sm font-semibold text-textMain">提示词模板</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceHighlight text-textMuted">{toolLabel}</span>
            <span className="text-xs text-textMuted">({sorted.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={openCreate}
              className="h-7 px-2.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-[11px] font-medium flex items-center gap-1 transition-colors">
              <Plus size={12} /> 新建
            </button>
            <button type="button" onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-border/40">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模板名称或内容..."
              className="w-full h-8 pl-9 pr-3 rounded-lg border border-border bg-background text-xs text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-textMuted">
              <Loader2 size={16} className="animate-spin" /> 加载中...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-sm text-red-400">
              加载失败: {error}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-textMuted">
              <span className="text-sm">暂无提示词模板</span>
              <button type="button" onClick={openCreate}
                className="h-8 px-4 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-medium flex items-center gap-1.5 transition-colors">
                <Plus size={12} /> 创建第一个模板
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {sorted.map((preset) => (
                <div key={preset.id}
                  className="group text-left p-3 rounded-xl border border-border hover:border-purple-500/40 bg-surface/50 hover:bg-purple-500/5 transition-all relative">
                  {/* Click area for selection */}
                  <button type="button" onClick={() => handleSelect(preset)} className="w-full text-left">
                    <div className="flex items-center justify-between mb-1 pr-14">
                      <div className="flex items-center gap-1.5">
                        {preset.is_default && <Star size={10} className="text-yellow-400 fill-yellow-400" />}
                        <span className="text-xs font-medium text-textMain group-hover:text-purple-400 transition-colors">
                          {preset.name}
                        </span>
                      </div>
                      {preset.model && (
                        <span className="text-[9px] font-mono text-textMuted px-1.5 py-0.5 rounded bg-surfaceHighlight">
                          {preset.provider}/{preset.model}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-textMuted line-clamp-3 leading-relaxed whitespace-pre-wrap">
                      {preset.prompt_template}
                    </div>
                    <div className="text-[9px] text-textMuted/50 mt-1">
                      更新于 {new Date(preset.updated_at).toLocaleDateString('zh-CN')}
                    </div>
                  </button>
                  {/* Edit / Delete actions (top-right) */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(preset); }}
                      className="w-6 h-6 rounded hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-blue-400 transition-colors"
                      title="编辑">
                      <Pencil size={10} />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(preset.id); }}
                      className="w-6 h-6 rounded hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-red-400 transition-colors"
                      title="删除">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
