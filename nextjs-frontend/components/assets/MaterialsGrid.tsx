"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Loader2, Image as ImageIcon, Film, Search } from "lucide-react";
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
}: {
  materials: VfsNode[];
  materialsLoading: boolean;
  selectedMaterialIds: Set<string>;
  setSelectedMaterialIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLightboxUrl: (url: string) => void;
  setLightboxVideo?: (url: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-textMain">素材库</h2>
        <div className="text-sm text-textMuted">
          共 {materials.length} 个素材
          {hasMore && ` · 已加载 ${visibleCount}`}
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
            className="px-4 py-2 bg-surfaceHighlight text-textMain rounded-lg text-sm font-medium hover:bg-surfaceHighlight/80 transition-colors"
            onClick={() => setSelectedMaterialIds(new Set())}
          >
            取消选择
          </button>
        </div>
      )}
    </div>
  );
}
