"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Loader2, Image as ImageIcon, Film, Search, Trash2, AlertTriangle, Clock, CheckSquare, Square, X } from "lucide-react";
import { toast } from "sonner";

type VfsNode = {
  id: string;
  name: string;
  is_folder: boolean;
  content_type?: string | null;
  size_bytes?: number;
  created_at?: string;
  thumb_minio_key?: string;
};

const PAGE_SIZE = 30;
export function MaterialsGrid({
  materials,
  materialsLoading,
  selectedMaterialIds,
  setSelectedMaterialIds,
  setLightboxUrl,
  setLightboxVideo,
  onDeleteSelected,
  onDeleteAll,
}: {
  materials: VfsNode[];
  materialsLoading: boolean;
  selectedMaterialIds: Set<string>;
  setSelectedMaterialIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLightboxUrl: (url: string) => void;
  setLightboxVideo?: (url: string) => void;
  onDeleteSelected?: (ids: string[]) => Promise<void>;
  onDeleteAll?: () => Promise<void>;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isDeleting, setIsDeleting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset visible count when materials change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [materials]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, materials.length));
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [materials.length]);

  const visibleMaterials = materials.slice(0, visibleCount);
  const hasMore = visibleCount < materials.length;

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedMaterialIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setSelectedMaterialIds],
  );

  const toggleSelectAll = useCallback(() => {
    if (selectedMaterialIds.size === materials.length) {
      setSelectedMaterialIds(new Set());
    } else {
      setSelectedMaterialIds(new Set(materials.map(m => m.id)));
    }
  }, [materials, selectedMaterialIds, setSelectedMaterialIds]);

  const handleDeleteSelected = async () => {
    if (!onDeleteSelected || selectedMaterialIds.size === 0) return;
    setIsDeleting(true);
    try {
      await onDeleteSelected(Array.from(selectedMaterialIds));
      setSelectedMaterialIds(new Set());
      setDeleteConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartDeleteAll = () => {
    setCountdown(5);
    setDeleteAllConfirmOpen(true);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAll || countdown > 0) return;
    setIsDeleting(true);
    try {
      await onDeleteAll();
      setSelectedMaterialIds(new Set());
      setDeleteAllConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("清理失败");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-textMain">素材库</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-textMuted">
            共 {materials.length} 个素材
            {hasMore && ` · 已加载 ${visibleCount}`}
          </div>
          {materials.length > 0 && (
            <div className="flex items-center gap-2 border-l border-border pl-4">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors text-xs font-medium"
                onClick={toggleSelectAll}
              >
                {selectedMaterialIds.size === materials.length ? (
                  <><CheckSquare size={14} /> 取消全选</>
                ) : (
                  <><Square size={14} /> 全选</>
                )}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-textMuted hover:text-red-500 transition-colors text-xs font-medium"
                onClick={handleStartDeleteAll}
              >
                <Trash2 size={14} /> 清空素材库
              </button>
            </div>
          )}
        </div>
      </div>

      {materialsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : materials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-textMuted gap-4">
          <ImageIcon size={48} className="opacity-50" />
          <p>暂无素材</p>
          <p className="text-sm">在 Studio 中创作的图片和视频会自动保存在这里</p>
        </div>
      ) : (
        <>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-3 [column-fill:_balance]">
            {visibleMaterials.map((mat) => (
              <div
                key={mat.id}
                className={`relative mb-3 break-inside-avoid rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-surface group ${
                  selectedMaterialIds.has(mat.id)
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-transparent hover:border-slate-500"
                }`}
                onClick={() => toggleSelect(mat.id)}
              >
                {mat.content_type?.startsWith("video/") ? (
                  <div className="relative">
                    <video
                      src={`/api/vfs/nodes/${mat.id}/download`}
                      className="w-full h-auto block"
                      muted
                      preload="metadata"
                      onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                      onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                    />
                    <div className="absolute top-2 left-2 bg-black/60 rounded px-1.5 py-0.5 pointer-events-none">
                      <Film size={14} className="text-white" />
                    </div>
                  </div>
                ) : (
                  <img
                    src={`/api/vfs/nodes/${mat.id}/thumbnail`}
                    alt={mat.name}
                    className="w-full h-auto block"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.onerror = null; // Prevent infinite loop
                      target.src = `/api/vfs/nodes/${mat.id}/download`;
                    }}
                  />
                )}
                {selectedMaterialIds.has(mat.id) && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <CheckCircle size={16} className="text-white" />
                  </div>
                )}
                {/* Hover overlay: name tooltip + zoom button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                  <button
                    className="p-2 bg-white/20 rounded-full hover:bg-white/30 text-white backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `/api/vfs/nodes/${mat.id}/download`;
                      if (mat.content_type?.startsWith("video/") && setLightboxVideo) {
                        setLightboxVideo(url);
                      } else {
                        setLightboxUrl(url);
                      }
                    }}
                    aria-label="放大预览"
                  >
                    <Search size={20} />
                  </button>
                </div>
                {/* Hover-only filename tooltip at bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <p className="text-xs text-white truncate" title={mat.name}>{mat.name}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-4" />
          {hasMore && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="animate-spin text-primary" size={20} />
              <span className="ml-2 text-sm text-textMuted">加载更多...</span>
            </div>
          )}
        </>
      )}

      {selectedMaterialIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-xl shadow-xl px-6 py-4 flex items-center gap-4 z-50">
          <span className="text-sm text-textMuted">
            已选择 {selectedMaterialIds.size} 个素材
          </span>
          <button
            type="button"
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={() => {
              toast.success("功能开发中：创建资产");
            }}
          >
            创建资产
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 size={14} /> 批量删除
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-surfaceHighlight text-textMain rounded-lg text-sm font-medium hover:bg-surfaceHighlight/80 transition-colors"
            onClick={() => setSelectedMaterialIds(new Set())}
          >
            取消选择
          </button>
        </div>
      )}

      {/* 批量删除确认 */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="h-12 px-4 border-b border-border flex items-center justify-between bg-red-500/5">
              <div className="font-bold text-sm flex items-center gap-2 text-red-500">
                <Trash2 size={16} /> 确认删除所选素材？
              </div>
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                type="button"
                disabled={isDeleting}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20 text-red-700 text-sm flex gap-3">
                <AlertTriangle className="shrink-0" size={18} />
                <p>此操作将永久删除选中的 <strong>{selectedMaterialIds.size}</strong> 个素材。如果素材已绑定到资产或被分镜引用，会导致显示异常。</p>
              </div>
              <p className="text-textMuted text-sm text-center">此操作不可逆，确定要继续吗？</p>
              
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg text-sm font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    handleDeleteSelected();
                  }}
                  disabled={isDeleting}
                  className="px-6 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 清空全部确认 (倒计时) */}
      {deleteAllConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="h-12 px-4 border-b border-border flex items-center justify-between bg-orange-500/5">
              <div className="font-bold text-sm flex items-center gap-2 text-orange-600">
                <AlertTriangle size={16} /> 极其危险：清空整个素材库？
              </div>
              <button
                onClick={() => setDeleteAllConfirmOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                type="button"
                disabled={isDeleting}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-700 text-sm">
                <p className="font-bold mb-2">警告：操作不可逆！</p>
                <p>这将删除素材库中的所有 <strong>{materials.length}</strong> 个原始素材。所有依赖这些素材的资产将无法正常工作。</p>
              </div>
              
              {countdown > 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-4 text-orange-600">
                  <div className="relative flex items-center justify-center">
                    <Clock size={48} className="animate-pulse opacity-20" />
                    <span className="absolute text-2xl font-black">{countdown}</span>
                  </div>
                  <p className="text-sm font-bold">请在确认前冷静思考 {countdown} 秒...</p>
                </div>
              ) : (
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg text-red-600 text-sm font-bold text-center animate-bounce">
                  冷静期已过，请慎重点击确认按钮！
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteAllConfirmOpen(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg text-sm font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    handleConfirmDeleteAll();
                  }}
                  disabled={countdown > 0 || isDeleting}
                  className="px-6 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:bg-slate-500/30 disabled:text-textMuted/50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : "我已完全知晓风险，确认清空"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
