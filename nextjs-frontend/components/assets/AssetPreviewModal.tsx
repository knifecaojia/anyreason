"use client";

import { useState } from "react";
import { X, Star, Check, Download, ZoomIn } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Asset, AssetResource } from "@/lib/aistudio/types";

type AssetPreviewModalProps = {
  asset: Asset;
  onClose: () => void;
  onSetCover?: (resourceId: string) => void;
  onToggleSelect?: (resourceId: string) => void;
};

export function AssetPreviewModal({
  asset,
  onClose,
  onSetCover,
  onToggleSelect,
}: AssetPreviewModalProps) {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Collect all resources from all variants + asset itself
  const allResources: AssetResource[] = [];
  if (asset.resources) allResources.push(...asset.resources);
  if (asset.variants) {
    asset.variants.forEach(v => {
      if (v.resources) allResources.push(...v.resources);
    });
  }

  // Deduplicate by ID
  const uniqueResources = Array.from(new Map(allResources.map(r => [r.id, r])).values());

  const docContent = asset.doc_content || "";

  const isImage = (res: AssetResource) => {
    // Basic check: if it has a thumbnail or type says image
    if (res.res_type && res.res_type.startsWith("image")) return true;
    if (res.thumbnail) return true; 
    return false;
  };

  const handleSetCover = (resourceId: string) => {
    onSetCover?.(resourceId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-900">
          <div>
            <h2 className="text-xl font-semibold text-white">{asset.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-300 border border-slate-700">
                {asset.type}
              </span>
              <span className="text-sm text-slate-400">
                 · {asset.variants?.length || 0} 变体
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-900">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 h-full">
            {/* Markdown Preview */}
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 flex flex-col h-full overflow-hidden">
              <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-primary rounded-full"></span>
                文档预览
              </h3>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {docContent || "*暂无文档内容*"}
                  </ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Image Gallery */}
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 flex flex-col h-full overflow-hidden">
              <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-primary rounded-full"></span>
                资源图片 ({uniqueResources.filter(isImage).length})
              </h3>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {uniqueResources.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                       <span className="text-2xl">🖼️</span>
                    </div>
                    <p>暂无图片资源</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 content-start">
                    {uniqueResources.filter(isImage).map((res) => {
                      const url = res.thumbnail;
                      const isCover = res.is_cover;
                      
                      return (
                        <div
                          key={res.id}
                          className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all bg-slate-900 ${
                            isCover ? "border-amber-500 ring-2 ring-amber-500/20" : "border-slate-700 hover:border-slate-500"
                          }`}
                        >
                          <img
                            src={url}
                            alt="Asset Resource"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                          
                          {/* Overlay Actions */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                            <button
                              type="button"
                              onClick={() => setZoomedImage(url)}
                              className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                              title="放大"
                            >
                              <ZoomIn className="w-4 h-4" />
                            </button>
                            {onSetCover && (
                              <button
                                type="button"
                                onClick={() => handleSetCover(res.id)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isCover
                                    ? "bg-amber-500 text-white shadow-lg"
                                    : "bg-white/10 hover:bg-white/20 text-white"
                                }`}
                                title={isCover ? "当前封面" : "设为封面"}
                              >
                                <Star className="w-4 h-4" fill={isCover ? "currentColor" : "none"} />
                              </button>
                            )}
                            <a
                              href={url}
                              download={`asset-${asset.name}-${res.id}.png`}
                              className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                              title="下载"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>

                          {/* Cover Badge */}
                          {isCover && (
                            <div className="absolute top-1 right-1">
                               <div className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                 封面
                               </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt="放大预览"
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
          >
            <X className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  );
}
