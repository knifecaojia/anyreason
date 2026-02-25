"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Image as ImageIcon, FileText, User, MapPin, Sparkles, Package } from "lucide-react";
import type { Asset, AssetType } from "@/lib/aistudio/types";
import { AssetPreviewModal } from "./AssetPreviewModal";

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

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof ImageIcon; color: string }> = {
  SCENE: { label: "场景", icon: MapPin, color: "text-blue-400" },
  CHARACTER: { label: "角色", icon: User, color: "text-green-400" },
  PROP: { label: "道具", icon: Package, color: "text-amber-400" },
  EFFECT: { label: "特效", icon: Sparkles, color: "text-purple-400" },
  OTHER: { label: "其他", icon: FileText, color: "text-slate-400" },
};

export function AssetPanel({ episodeId, episodeLabel, assets, storyboards, onAssetClick }: AssetPanelProps) {
  const [storyboardsExpanded, setStoryboardsExpanded] = useState(true);
  const [categoryExpanded, setCategoryExpanded] = useState<Record<string, boolean>>({
    SCENE: true,
    CHARACTER: true,
    PROP: true,
    EFFECT: true,
    OTHER: true,
  });
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

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

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/80 rounded-t-lg">
        <h3 className="text-lg font-medium text-white">{episodeLabel}</h3>
        <p className="text-sm text-slate-400 mt-1">
          {assets.length} 资产 · {storyboards.length} 故事板
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Storyboards Section */}
        <div>
          <button
            type="button"
            onClick={() => setStoryboardsExpanded(!storyboardsExpanded)}
            className="flex items-center gap-2 w-full text-left text-sm font-medium text-slate-300 hover:text-white"
          >
            {storyboardsExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <FileText className="w-4 h-4 text-slate-400" />
            <span>故事板 ({storyboards.length})</span>
          </button>

          {storyboardsExpanded && storyboards.length > 0 && (
            <div className="mt-2 space-y-2 pl-6">
              {storyboards.map((sb) => (
                <div
                  key={sb.id}
                  className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                >
                  <div className="text-xs text-slate-500 font-mono">
                    {sb.shot_code}
                  </div>
                  <div className="text-sm text-slate-300 mt-1 line-clamp-2">
                    {sb.description || "无描述"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asset Categories */}
        {(Object.keys(CATEGORY_CONFIG) as AssetType[]).map((type) => {
          const config = CATEGORY_CONFIG[type];
          const categoryAssets = groupedAssets[type] || [];
          const isExpanded = categoryExpanded[type];

          return (
            <div key={type}>
              <button
                type="button"
                onClick={() => toggleCategory(type)}
                className="flex items-center gap-2 w-full text-left text-sm font-medium text-slate-300 hover:text-white"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <config.icon className={`w-4 h-4 ${config.color}`} />
                <span>{config.label}</span>
                <span className="text-slate-500">({categoryAssets.length})</span>
              </button>

              {isExpanded && categoryAssets.length > 0 && (
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 pl-6">
                  {categoryAssets.map((asset) => {
                    const thumb = asset.thumbnail || asset.cover_url || (asset.resources?.[0]?.thumbnail) || "";
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleAssetClick(asset)}
                        className="p-2 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-500 transition-colors text-left"
                      >
                        <div className="aspect-[4/3] bg-slate-800 rounded mb-1.5 flex items-center justify-center overflow-hidden">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-600" />
                          )}
                        </div>
                        <div className="text-xs text-white font-medium truncate" title={asset.name}>
                          {asset.name}
                        </div>
                        {asset.tags && asset.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {asset.tags.slice(0, 2).map((tag, i) => (
                              <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-slate-700/60 text-slate-400 truncate max-w-[50px]">{tag}</span>
                            ))}
                          </div>
                        )}
                      </button>
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
