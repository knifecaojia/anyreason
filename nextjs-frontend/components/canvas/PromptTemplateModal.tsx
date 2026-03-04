'use client';

/**
 * PromptTemplateModal — dual-panel modal for managing prompt presets with group support.
 *
 * Data source: backend AIPromptPreset API (`/api/ai/prompt-presets`).
 * Each preset belongs to a `tool_key` (e.g. 'canvas_text_gen', 'canvas_image_gen',
 * 'canvas_video_gen') and an optional `group` for categorization.
 *
 * Layout: left sidebar for group navigation, right panel for preset cards.
 * Supports full CRUD for both presets and groups.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Search, Sparkles, Star, Loader2, Plus, Pencil, Trash2, Check,
  FolderOpen, Folder, MoreHorizontal, GripVertical,
} from 'lucide-react';

// ===== Types =====

export interface PromptPreset {
  id: string;
  tool_key: string;
  group: string | null;
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

const ALL_GROUP = '__all__';
const UNGROUPED = '__ungrouped__';

// ===== API helpers =====

async function apiFetchPresets(toolKey: string): Promise<PromptPreset[]> {
  const res = await fetch(`/api/ai/prompt-presets?tool_key=${encodeURIComponent(toolKey)}`);
  const json = await res.json().catch(() => null);
  return (json?.data ?? []) as PromptPreset[];
}

async function apiCreatePreset(body: {
  tool_key: string; group?: string | null; name: string; prompt_template: string; is_default?: boolean;
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
  body: { group?: string | null; name?: string; prompt_template?: string; is_default?: boolean },
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
  const [saving, setSaving] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>(ALL_GROUP);

  // Form state (inline editing in right panel)
  const [editingId, setEditingId] = useState<string | null>(null); // null = create mode when formOpen
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formGroup, setFormGroup] = useState('');
  const [formTemplate, setFormTemplate] = useState('');
  const [formDefault, setFormDefault] = useState(false);

  // Group rename
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Group context menu
  const [groupMenu, setGroupMenu] = useState<string | null>(null);

  // New group inline input
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const newGroupRef = useRef<HTMLInputElement>(null);

  // Fetch presets
  const fetchPresets = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetchPresets(toolKey)
      .then((data) => setPresets(data))
      .catch((err) => setError(String(err?.message ?? err)))
      .finally(() => setLoading(false));
  }, [toolKey]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setActiveGroup(ALL_GROUP);
      setFormOpen(false);
      setEditingId(null);
      setGroupMenu(null);
      setRenamingGroup(null);
      setCreatingGroup(false);
      fetchPresets();
    }
  }, [open, fetchPresets]);

  // Derived: groups from presets
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const p of presets) {
      if (p.group) set.add(p.group);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [presets]);

  const ungroupedCount = useMemo(() => presets.filter((p) => !p.group).length, [presets]);

  // Filtered + sorted presets
  const displayPresets = useMemo(() => {
    let list = presets;
    // Group filter
    if (activeGroup === UNGROUPED) {
      list = list.filter((p) => !p.group);
    } else if (activeGroup !== ALL_GROUP) {
      list = list.filter((p) => p.group === activeGroup);
    }
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.prompt_template.toLowerCase().includes(q),
      );
    }
    // Sort: default first, then by updated_at desc
    return [...list].sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [presets, activeGroup, search]);

  // --- Handlers ---

  const handleSelect = useCallback((preset: PromptPreset) => {
    onSelect(preset);
    onClose();
  }, [onSelect, onClose]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setFormName('');
    setFormGroup(activeGroup === ALL_GROUP || activeGroup === UNGROUPED ? '' : activeGroup);
    setFormTemplate('');
    setFormDefault(false);
    setFormOpen(true);
  }, [activeGroup]);

  const openEdit = useCallback((preset: PromptPreset) => {
    setEditingId(preset.id);
    setFormName(preset.name);
    setFormGroup(preset.group ?? '');
    setFormTemplate(preset.prompt_template);
    setFormDefault(preset.is_default);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingId(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formName.trim() || !formTemplate.trim()) return;
    setSaving(true);
    try {
      const groupVal = formGroup.trim() || null;
      if (!editingId) {
        await apiCreatePreset({
          tool_key: toolKey,
          group: groupVal,
          name: formName.trim(),
          prompt_template: formTemplate.trim(),
          is_default: formDefault,
        });
      } else {
        await apiUpdatePreset(editingId, {
          group: groupVal,
          name: formName.trim(),
          prompt_template: formTemplate.trim(),
          is_default: formDefault,
        });
      }
      fetchPresets();
      closeForm();
    } catch {
      // stay on form
    } finally {
      setSaving(false);
    }
  }, [editingId, formName, formGroup, formTemplate, formDefault, toolKey, fetchPresets, closeForm]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定删除此模板？')) return;
    await apiDeletePreset(id);
    fetchPresets();
    if (editingId === id) closeForm();
  }, [fetchPresets, editingId, closeForm]);

  // --- Group rename ---
  const startRenameGroup = useCallback((g: string) => {
    setRenamingGroup(g);
    setRenameValue(g);
    setGroupMenu(null);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRenameGroup = useCallback(async () => {
    if (!renamingGroup || !renameValue.trim() || renameValue.trim() === renamingGroup) {
      setRenamingGroup(null);
      return;
    }
    const newName = renameValue.trim();
    // Update all presets in the old group
    const toUpdate = presets.filter((p) => p.group === renamingGroup);
    await Promise.all(toUpdate.map((p) => apiUpdatePreset(p.id, { group: newName })));
    setRenamingGroup(null);
    fetchPresets();
    if (activeGroup === renamingGroup) setActiveGroup(newName);
  }, [renamingGroup, renameValue, presets, fetchPresets, activeGroup]);

  // --- Group delete (moves presets to ungrouped) ---
  const deleteGroup = useCallback(async (g: string) => {
    if (!confirm(`删除分组「${g}」？其中的模板将移至"未分组"。`)) return;
    setGroupMenu(null);
    const toUpdate = presets.filter((p) => p.group === g);
    await Promise.all(toUpdate.map((p) => apiUpdatePreset(p.id, { group: null })));
    fetchPresets();
    if (activeGroup === g) setActiveGroup(ALL_GROUP);
  }, [presets, fetchPresets, activeGroup]);

  // --- Create new group inline ---
  const startCreateGroup = useCallback(() => {
    setCreatingGroup(true);
    setNewGroupName('');
    setGroupMenu(null);
    setTimeout(() => newGroupRef.current?.focus(), 0);
  }, []);

  const commitCreateGroup = useCallback(() => {
    const name = newGroupName.trim();
    setCreatingGroup(false);
    if (!name || groups.includes(name)) return;
    // Create a group by opening the preset create form with this group pre-filled
    setEditingId(null);
    setFormName('');
    setFormGroup(name);
    setFormTemplate('');
    setFormDefault(false);
    setFormOpen(true);
  }, [newGroupName, groups]);

  if (!open) return null;

  const toolLabel = TOOL_KEY_LABELS[toolKey] ?? toolKey;

  // --- Render: Dual-panel layout ---
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[1000px] h-[800px] max-w-[95vw] max-h-[95vh] rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
        {/* ===== Header ===== */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Sparkles size={14} className="text-purple-400" />
            </div>
            <span className="text-sm font-semibold text-textMain">提示词模板库</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceHighlight text-textMuted">{toolLabel}</span>
            <span className="text-xs text-textMuted">({presets.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索模板..."
                className="w-56 h-7 pl-8 pr-3 rounded-lg border border-border bg-background text-[11px] text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <button type="button" onClick={openCreate}
              className="h-7 px-3 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-[11px] font-medium flex items-center gap-1 transition-colors">
              <Plus size={12} /> 新建
            </button>
            <button type="button" onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ===== Body: dual panel ===== */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* --- Left sidebar: groups --- */}
          <div className="w-48 shrink-0 border-r border-border/40 flex flex-col bg-surface/30">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
              <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider">分组</span>
              <button type="button" onClick={startCreateGroup} title="新建分组"
                className="w-5 h-5 rounded hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
                <Plus size={11} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {/* All */}
              <button type="button" onClick={() => setActiveGroup(ALL_GROUP)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                  activeGroup === ALL_GROUP ? 'bg-purple-500/10 text-purple-400 font-medium' : 'text-textMuted hover:text-textMain hover:bg-surfaceHighlight'
                }`}>
                <Folder size={13} />
                <span className="truncate flex-1 text-left">全部</span>
                <span className="text-[9px] tabular-nums opacity-60">{presets.length}</span>
              </button>

              {/* Ungrouped */}
              {ungroupedCount > 0 && (
                <button type="button" onClick={() => setActiveGroup(UNGROUPED)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                    activeGroup === UNGROUPED ? 'bg-purple-500/10 text-purple-400 font-medium' : 'text-textMuted hover:text-textMain hover:bg-surfaceHighlight'
                  }`}>
                  <FolderOpen size={13} />
                  <span className="truncate flex-1 text-left">未分组</span>
                  <span className="text-[9px] tabular-nums opacity-60">{ungroupedCount}</span>
                </button>
              )}

              {/* Divider */}
              {groups.length > 0 && <div className="h-px bg-border/40 my-1 mx-3" />}

              {/* Named groups */}
              {groups.map((g) => {
                const count = presets.filter((p) => p.group === g).length;
                const isRenaming = renamingGroup === g;
                return (
                  <div key={g} className="relative group/grp">
                    {isRenaming ? (
                      <div className="px-2 py-1">
                        <input ref={renameInputRef} type="text" value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRenameGroup}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRenameGroup(); if (e.key === 'Escape') setRenamingGroup(null); }}
                          className="w-full h-6 px-2 rounded border border-purple-500/40 bg-background text-[11px] text-textMain outline-none" />
                      </div>
                    ) : (
                      <button type="button" onClick={() => setActiveGroup(g)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                          activeGroup === g ? 'bg-purple-500/10 text-purple-400 font-medium' : 'text-textMuted hover:text-textMain hover:bg-surfaceHighlight'
                        }`}>
                        <Folder size={13} />
                        <span className="truncate flex-1 text-left">{g}</span>
                        <span className="text-[9px] tabular-nums opacity-60">{count}</span>
                        <span
                          onClick={(e) => { e.stopPropagation(); setGroupMenu(groupMenu === g ? null : g); }}
                          className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover/grp:opacity-100 hover:bg-surfaceHighlight transition-all">
                          <MoreHorizontal size={10} />
                        </span>
                      </button>
                    )}
                    {/* Group context menu */}
                    {groupMenu === g && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setGroupMenu(null)} />
                        <div className="absolute left-full top-0 ml-1 z-20 w-28 bg-surface border border-border rounded-lg shadow-xl py-1">
                          <button type="button" onClick={() => startRenameGroup(g)}
                            className="w-full px-3 py-1.5 text-[11px] text-left text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors flex items-center gap-2">
                            <Pencil size={10} /> 重命名
                          </button>
                          <button type="button" onClick={() => deleteGroup(g)}
                            className="w-full px-3 py-1.5 text-[11px] text-left text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">
                            <Trash2 size={10} /> 删除分组
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* New group inline input */}
              {creatingGroup && (
                <div className="px-2 py-1">
                  <input ref={newGroupRef} type="text" value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onBlur={commitCreateGroup}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitCreateGroup(); if (e.key === 'Escape') setCreatingGroup(false); }}
                    placeholder="分组名称…"
                    className="w-full h-6 px-2 rounded border border-purple-500/40 bg-background text-[11px] text-textMain placeholder:text-textMuted/50 outline-none" />
                </div>
              )}
            </div>
          </div>

          {/* --- Right panel: presets --- */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {formOpen ? (
              /* ===== Create / Edit form ===== */
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-textMain">
                    {editingId ? '编辑模板' : '新建模板'}
                  </span>
                  <button type="button" onClick={closeForm}
                    className="text-[11px] text-textMuted hover:text-textMain transition-colors">
                    取消
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-textMuted mb-1 block">模板名称</label>
                    <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                      placeholder="例如：动漫场景描述"
                      className="w-full h-8 px-3 rounded-lg border border-border bg-background text-xs text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-textMuted mb-1 block">所属分组</label>
                    <input type="text" value={formGroup} onChange={(e) => setFormGroup(e.target.value)}
                      placeholder="输入或留空"
                      list="prompt-group-datalist"
                      className="w-full h-8 px-3 rounded-lg border border-border bg-background text-xs text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30" />
                    <datalist id="prompt-group-datalist">
                      {groups.map((g) => <option key={g} value={g} />)}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-medium text-textMuted mb-1 block">提示词内容</label>
                  <textarea value={formTemplate} onChange={(e) => setFormTemplate(e.target.value)}
                    placeholder={'输入提示词模板内容...\n支持变量: {scene_text}, {asset_names}, {asset_descriptions}'}
                    className="w-full h-[280px] px-3 py-2 rounded-lg border border-border bg-background text-xs text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30 resize-y font-mono leading-relaxed" />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formDefault} onChange={(e) => setFormDefault(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-border accent-purple-500" />
                    <span className="text-[11px] text-textMuted">设为默认模板</span>
                  </label>
                  <button type="button" onClick={handleSave} disabled={saving || !formName.trim() || !formTemplate.trim()}
                    className="h-8 px-5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {editingId ? '保存' : '创建'}
                  </button>
                </div>
              </div>
            ) : (
              /* ===== Preset card list ===== */
              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-sm text-textMuted">
                    <Loader2 size={16} className="animate-spin" /> 加载中...
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center py-16 text-sm text-red-400">
                    加载失败: {error}
                  </div>
                ) : displayPresets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-textMuted">
                    <span className="text-sm">{search ? '无匹配结果' : '暂无提示词模板'}</span>
                    {!search && (
                      <button type="button" onClick={openCreate}
                        className="h-8 px-4 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-medium flex items-center gap-1.5 transition-colors">
                        <Plus size={12} /> 创建第一个模板
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {displayPresets.map((preset) => (
                      <div key={preset.id}
                        className="group text-left p-3.5 rounded-xl border border-border hover:border-purple-500/40 bg-surface/50 hover:bg-purple-500/5 transition-all relative">
                        <button type="button" onClick={() => handleSelect(preset)} className="w-full text-left">
                          <div className="flex items-center justify-between mb-1.5 pr-16">
                            <div className="flex items-center gap-1.5">
                              {preset.is_default && <Star size={10} className="text-yellow-400 fill-yellow-400" />}
                              <span className="text-xs font-medium text-textMain group-hover:text-purple-400 transition-colors">
                                {preset.name}
                              </span>
                              {preset.group && activeGroup === ALL_GROUP && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400/70">
                                  {preset.group}
                                </span>
                              )}
                            </div>
                            {preset.model && (
                              <span className="text-[9px] font-mono text-textMuted px-1.5 py-0.5 rounded bg-surfaceHighlight">
                                {preset.provider}/{preset.model}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-textMuted line-clamp-4 leading-relaxed whitespace-pre-wrap">
                            {preset.prompt_template}
                          </div>
                          <div className="text-[9px] text-textMuted/50 mt-1.5">
                            更新于 {new Date(preset.updated_at).toLocaleDateString('zh-CN')}
                          </div>
                        </button>
                        {/* Edit / Delete actions */}
                        <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(preset); }}
                            className="w-6 h-6 rounded hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-blue-400 transition-colors"
                            title="编辑">
                            <Pencil size={11} />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(preset.id); }}
                            className="w-6 h-6 rounded hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-red-400 transition-colors"
                            title="删除">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
