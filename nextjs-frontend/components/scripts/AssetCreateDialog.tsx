"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

export function AssetCreateDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; type: string; category?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("character");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("请输入资产名称");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), type, category: category.trim() || undefined });
      onClose();
      setName("");
      setType("character");
      setCategory("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        <div className="h-12 px-4 border-b border-border flex items-center justify-between">
          <div className="font-bold text-sm">新建资产</div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
            type="button"
            disabled={submitting}
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded">{error}</div>}
          
          <div className="space-y-2">
            <label className="text-xs text-textMuted">资产名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：主角张三"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-textMain placeholder:text-textMuted/50 focus:outline-none focus:border-primary"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-textMuted">资产类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-textMain focus:outline-none focus:border-primary"
            >
              <option value="character">角色 (Character)</option>
              <option value="scene">场景 (Scene)</option>
              <option value="prop">道具 (Prop)</option>
              <option value="vfx">特效 (VFX)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-textMuted">分类（可选）</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例如：主要角色"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-textMain placeholder:text-textMuted/50 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              创建
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
