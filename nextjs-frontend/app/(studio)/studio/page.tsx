"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  MoreHorizontal,
  Copy,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  Layers,
  ArrowLeft,
} from "lucide-react";

// ===== Types =====

type CanvasStatus = "draft" | "active" | "archived";

interface CanvasMeta {
  id: string;
  name: string;
  description?: string | null;
  status: CanvasStatus;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

// ===== Canvas API helpers =====

const API_BASE = "/api/canvases";

interface ApiResponse<T> { code: number; msg: string; data?: T }
interface PageResponse<T> { items: T[]; total: number; page: number; pages: number; size: number }

async function apiListCanvases(params: {
  status?: string; q?: string; page?: number; size?: number;
}): Promise<CanvasMeta[]> {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  sp.set("page", String(params.page ?? 1));
  sp.set("size", String(params.size ?? 100));

  const res = await fetch(`${API_BASE}?${sp.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as ApiResponse<PageResponse<any>>;
  const items = json.data?.items ?? [];
  return items.map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status as CanvasStatus,
    nodeCount: c.node_count ?? 0,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
}

async function apiCreateCanvas(body: { name: string; description?: string }): Promise<CanvasMeta> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as ApiResponse<any>;
  const c = json.data;
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status as CanvasStatus,
    nodeCount: c.node_count ?? 0,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

async function apiUpdateCanvas(
  canvasId: string,
  body: { name?: string; description?: string; status?: string },
): Promise<void> {
  const res = await fetch(`${API_BASE}/${canvasId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function apiDeleteCanvas(canvasId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${canvasId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ===== Status badge =====

const STATUS_CONFIG: Record<CanvasStatus, { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-yellow-500/20 text-yellow-400" },
  active: { label: "活跃", className: "bg-green-500/20 text-green-400" },
  archived: { label: "归档", className: "bg-gray-500/20 text-gray-400" },
};

function StatusBadge({ status }: { status: CanvasStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ===== Canvas Card =====

function CanvasCard({
  canvas,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: {
  canvas: CanvasMeta;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative flex flex-col rounded-xl border border-border bg-surface/60 hover:bg-surface hover:border-primary/30 transition-all cursor-pointer overflow-hidden"
      onClick={onOpen}
    >
      {/* Thumbnail area */}
      <div className="h-36 bg-surfaceHighlight flex items-center justify-center">
        <Layers size={32} className="text-textMuted/30" />
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-textMain truncate flex-1">{canvas.name}</h3>
          <StatusBadge status={canvas.status} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-textMuted">
          <span>{canvas.nodeCount} 节点</span>
          <span>{new Date(canvas.updatedAt).toLocaleDateString("zh-CN")}</span>
        </div>
      </div>

      {/* Menu button */}
      <button
        type="button"
        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-surface/80 backdrop-blur border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surfaceHighlight z-10"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={14} className="text-textMuted" />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div
            className="absolute top-10 right-2 w-36 bg-surface border border-border rounded-lg shadow-xl z-30 py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <MenuBtn icon={Pencil} label="重命名" onClick={() => { setMenuOpen(false); onRename(); }} />
            <MenuBtn icon={Copy} label="复制" onClick={() => { setMenuOpen(false); onDuplicate(); }} />
            {canvas.status !== "archived" ? (
              <MenuBtn icon={Archive} label="归档" onClick={() => { setMenuOpen(false); onArchive(); }} />
            ) : (
              <MenuBtn icon={RotateCcw} label="恢复" onClick={() => { setMenuOpen(false); onRestore(); }} />
            )}
            <div className="h-px bg-border my-1" />
            <MenuBtn icon={Trash2} label="删除" onClick={() => { setMenuOpen(false); onDelete(); }} className="text-red-400 hover:bg-red-500/10" />
          </div>
        </>
      )}
    </div>
  );
}

function MenuBtn({
  icon: Icon,
  label,
  onClick,
  className = "text-textMuted hover:bg-surfaceHighlight",
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${className}`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

// ===== Rename Dialog =====

function RenameDialog({
  currentName,
  onConfirm,
  onCancel,
}: {
  currentName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(currentName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-96 bg-surface border border-border rounded-xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-textMain">重命名画布</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()); }}
          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-textMain outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="画布名称"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-xs text-textMuted hover:bg-surfaceHighlight transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Create Dialog =====

function CreateDialog({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-96 bg-surface border border-border rounded-xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-textMain">新建画布</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()); }}
          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-textMain outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="输入画布名称"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-xs text-textMuted hover:bg-surfaceHighlight transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Confirm Dialog =====

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-96 bg-surface border border-border rounded-xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-textMain">{title}</h3>
        <p className="text-xs text-textMuted">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-xs text-textMuted hover:bg-surfaceHighlight transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Filter Tabs =====

const FILTER_TABS: { value: CanvasStatus | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "活跃" },
  { value: "draft", label: "草稿" },
  { value: "archived", label: "归档" },
];

// ===== Main Page =====

export default function StudioListPage() {
  const router = useRouter();
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CanvasStatus | "all">("all");
  const [search, setSearch] = useState("");

  // Dialog states
  const [showCreate, setShowCreate] = useState(false);
  const [renaming, setRenaming] = useState<CanvasMeta | null>(null);
  const [deleting, setDeleting] = useState<CanvasMeta | null>(null);

  // Load canvases from API
  const loadCanvases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const metas = await apiListCanvases({});
      setCanvases(metas);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  // Create canvas
  const handleCreate = useCallback(async (name: string) => {
    setShowCreate(false);
    try {
      const created = await apiCreateCanvas({ name });
      router.push(`/studio/${created.id}`);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, [router]);

  // Rename canvas
  const handleRename = useCallback(async (canvas: CanvasMeta, newName: string) => {
    setRenaming(null);
    try {
      await apiUpdateCanvas(canvas.id, { name: newName });
      await loadCanvases();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, [loadCanvases]);

  // Duplicate canvas
  const handleDuplicate = useCallback(async (canvas: CanvasMeta) => {
    try {
      await apiCreateCanvas({ name: `${canvas.name} (副本)` });
      await loadCanvases();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, [loadCanvases]);

  // Archive / Restore
  const handleSetStatus = useCallback(async (canvas: CanvasMeta, status: CanvasStatus) => {
    try {
      if (status === "archived") {
        await apiDeleteCanvas(canvas.id);
      } else {
        await apiUpdateCanvas(canvas.id, { status });
      }
      await loadCanvases();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, [loadCanvases]);

  // Delete canvas (soft-delete via archive)
  const handleDelete = useCallback(async (canvas: CanvasMeta) => {
    setDeleting(null);
    try {
      await apiDeleteCanvas(canvas.id);
      await loadCanvases();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, [loadCanvases]);

  // Filter + search
  const filtered = canvases.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-border bg-surface/50 backdrop-blur flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="w-8 h-8 rounded-lg hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors"
            title="返回主页"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold text-textMain">创作工坊</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          新建画布
        </button>
      </header>

      {/* Filters + Search */}
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.value
                  ? "bg-primary/15 text-primary"
                  : "text-textMuted hover:text-textMain hover:bg-surfaceHighlight"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索画布..."
            className="w-56 h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-textMain outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-textMuted">加载中...</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button type="button" onClick={loadCanvases} className="text-xs text-primary hover:underline">
              重试
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Layers size={40} className="text-textMuted/30" />
            <p className="text-sm text-textMuted">
              {canvases.length === 0 ? "还没有画布，点击「新建画布」开始创作" : "没有匹配的画布"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((canvas) => (
              <CanvasCard
                key={canvas.id}
                canvas={canvas}
                onOpen={() => router.push(`/studio/${canvas.id}`)}
                onRename={() => setRenaming(canvas)}
                onDuplicate={() => handleDuplicate(canvas)}
                onArchive={() => handleSetStatus(canvas, "archived")}
                onRestore={() => handleSetStatus(canvas, "active")}
                onDelete={() => setDeleting(canvas)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showCreate && <CreateDialog onConfirm={handleCreate} onCancel={() => setShowCreate(false)} />}
      {renaming && (
        <RenameDialog
          currentName={renaming.name}
          onConfirm={(name) => handleRename(renaming, name)}
          onCancel={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="删除画布"
          message={`确定要删除「${deleting.name}」吗？此操作不可撤销。`}
          confirmLabel="删除"
          danger
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
