"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Image as ImageIcon, FileText, User, MapPin, Sparkles, Package, Copy, Wand2 } from "lucide-react";
import type { Asset, AssetType } from "@/lib/aistudio/types";
import { AssetPreviewModal } from "./AssetPreviewModal";
import { toast } from "sonner";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AssetPanelProps = {
  episodeId: string;
  episodeLabel: string;
  assets: Asset[];
  storyboards: StoryboardItem[];
  onAssetClick?: (asset: Asset) => void;
};

export type StoryboardItem = {
  id: string;
  shot_code: string;
  scene_code: string;
  description?: string | null;
};

// Helper to fetch storyboard markdown
async function fetchStoryboardMarkdown(id: string): Promise<string> {
    // In VFS structure, storyboards are stored as markdown files
    // But we need the NODE ID for the file content. 
    // Wait, the `storyboards` prop here comes from `ScriptHierarchyRead` which contains DB records.
    // The DB record for Storyboard doesn't directly link to a FileNode ID for content easily in the frontend types.
    // However, the backend logic writes a markdown file to VFS.
    // We might need to fetch the content via an API that resolves it.
    // Actually, let's use the `/api/storyboards/{id}/preview` if it existed, or check if we can get it from the hierarchy.
    // The `StoryboardItem` type above is minimal.
    // Let's assume for now we display the structured fields we have, 
    // OR we fetch the markdown if the backend provides a link.
    // Since we don't have a direct link, let's render the fields nicely first.
    return "";
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof ImageIcon; color: string }> = {
  SCENE: { label: "场景", icon: MapPin, color: "text-blue-400" },
  CHARACTER: { label: "角色", icon: User, color: "text-green-400" },
  PROP: { label: "道具", icon: Package, color: "text-amber-400" },
  EFFECT: { label: "特效", icon: Sparkles, color: "text-purple-400" },
  OTHER: { label: "其他", icon: FileText, color: "text-slate-400" },
};

export function AssetPanel({ episodeId, episodeLabel, assets, storyboards, onAssetClick }: AssetPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [storyboardsExpanded, setStoryboardsExpanded] = useState(true);
  const [categoryExpanded, setCategoryExpanded] = useState<Record<string, boolean>>({
    SCENE: true,
    CHARACTER: true,
    PROP: true,
    EFFECT: true,
    OTHER: true,
  });
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  
  // State to store markdown content for storyboards (fetched on expand)
  // Since fetching 15+ files might be slow, we'll just render the structured data nicely for now
  // as per "comprehensive content" request.

  const groupedAssets = assets.reduce(
    (acc, asset) => {
      const type = asset.type as AssetType;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(asset);
      return acc;
    },
    {} as Record<string, Asset[]>
  );

  const toggleCategory = (type: string) => {
    setCategoryExpanded((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const handleAssetClick = (asset: Asset) => {
    setSelectedAsset(asset);
    onAssetClick?.(asset);
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
  };

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/10 flex justify-between items-center">
        <div>
            <h3 className="text-lg font-bold text-textMain">{episodeLabel}</h3>
            <p className="text-xs text-textMuted mt-1">
            {assets.length} 资产 · {storyboards.length} 故事板
            </p>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Storyboards Section */}
        <div>
          <button
            type="button"
            onClick={() => setStoryboardsExpanded(!storyboardsExpanded)}
            className="flex items-center gap-2 w-full text-left text-sm font-bold text-textMain hover:text-primary transition-colors mb-3"
          >
            {storyboardsExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <FileText className="w-4 h-4 text-textMuted" />
            <span>故事板 ({storyboards.length})</span>
          </button>

          {storyboardsExpanded && storyboards.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pl-2">
              {storyboards.map((sb: any) => {
                  // Construct markdown-like preview from available fields
                  const mdContent = `
**景别/视角**: ${sb.shot_type || '-'} / ${sb.camera_move || '-'}
**画面**: ${sb.description || ''}
**对白**: ${sb.dialogue || ''}
**地点**: ${sb.location || '-'} (${sb.time_of_day || '-'})
`.trim();

                  return (
                    <div
                      key={sb.id}
                      className="group relative flex flex-col bg-surfaceHighlight/5 rounded-xl border border-border hover:border-primary/50 transition-colors overflow-hidden"
                    >
                      <div className="px-3 py-2 bg-surfaceHighlight/20 border-b border-border flex justify-between items-center">
                          <span className="text-xs font-mono font-bold text-textMain">{sb.shot_code}</span>
                          <button 
                            onClick={() => copyToClipboard(mdContent)}
                            className="p-1 hover:bg-surfaceHighlight rounded text-textMuted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                            title="复制内容"
                          >
                              <Copy size={12} />
                          </button>
                      </div>
                      
                      <div className="p-3 text-xs space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                          {sb.description && (
                              <div>
                                  <span className="text-textMuted font-medium">画面：</span>
                                  <span className="text-textMain">{sb.description}</span>
                              </div>
                          )}
                          {sb.dialogue && (
                              <div>
                                  <span className="text-textMuted font-medium">对白：</span>
                                  <span className="text-textMain">{sb.dialogue}</span>
                              </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-textMuted pt-1 border-t border-border/50">
                              <div>景别: {sb.shot_type || '-'}</div>
                              <div>运镜: {sb.camera_move || '-'}</div>
                              <div>地点: {sb.location || '-'}</div>
                              <div>时间: {sb.time_of_day || '-'}</div>
                          </div>
                      </div>
                    </div>
                  );
              })}
            </div>
          )}
        </div>

        {/* Asset Categories */}
        {(Object.keys(CATEGORY_CONFIG) as AssetType[]).map((type) => {
          const config = CATEGORY_CONFIG[type];
          const categoryAssets = groupedAssets[type] || [];
          const isExpanded = categoryExpanded[type];

          if (categoryAssets.length === 0) return null;

          return (
            <div key={type}>
              <button
                type="button"
                onClick={() => toggleCategory(type)}
                className="flex items-center gap-2 w-full text-left text-sm font-bold text-textMain hover:text-primary transition-colors mb-3"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <config.icon className={`w-4 h-4 ${config.color}`} />
                <span>{config.label}</span>
                <span className="text-textMuted font-normal">({categoryAssets.length})</span>
              </button>

              {isExpanded && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 pl-2">
                  {categoryAssets.map((asset) => {
                    const thumb = asset.thumbnail || asset.cover_url || (asset.resources?.[0]?.thumbnail) || "";
                    return (
                      <div
                        key={asset.id}
                        onClick={() => handleAssetClick(asset)}
                        className="group flex flex-col gap-2 p-2 bg-surfaceHighlight/5 rounded-xl border border-border hover:border-primary/50 hover:bg-surfaceHighlight/10 transition-all text-left cursor-pointer relative"
                      >
                        <div className="aspect-[4/3] bg-surfaceHighlight/20 rounded-lg flex items-center justify-center overflow-hidden relative">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={asset.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-textMuted/50" />
                          )}
                          <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${asset.lifecycle_status === 'published' ? 'bg-green-500' : 'bg-amber-500'}`} />
                          
                          {/* Asset Creation/Edit Button */}
                          <div 
                            className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                const params = new URLSearchParams(searchParams.toString());
                                params.set("mode", "create");
                                params.set("assetId", asset.id);
                                if (asset.project_id) {
                                    params.set("projectId", asset.project_id);
                                }
                                if (asset.doc_node_id) {
                                    params.set("sourceNodeId", asset.doc_node_id);
                                }
                                router.push(`${pathname}?${params.toString()}`);
                            }}
                          >
                             <div className="bg-black/50 backdrop-blur-sm p-1 rounded-md hover:bg-primary text-white transition-colors cursor-pointer" title="资产创作">
                                 <Wand2 size={12} />
                             </div>
                          </div>
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-xs font-bold text-textMain truncate" title={asset.name}>
                            {asset.name}
                            </div>
                            {asset.tags && asset.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {asset.tags.slice(0, 2).map((tag, i) => (
                                <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-surfaceHighlight/30 text-textMuted truncate max-w-[50px]">{tag}</span>
                                ))}
                            </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Asset Preview Modal */}
      {selectedAsset && (
        <AssetPreviewModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  );
}
