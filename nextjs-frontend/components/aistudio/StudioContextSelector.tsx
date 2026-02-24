"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search, BookOpen, FolderOpen, Image, X } from "lucide-react";

export type ScriptItem = {
  id: string;
  title: string;
};

export type HierarchyEpisode = {
  id: string;
  episode_code: string;
  episode_number: number;
  title?: string | null;
  assets?: any[];
};

export type Asset = {
  id: string;
  name: string;
  type: string;
  thumbnail?: string;
};

interface StudioContextSelectorProps {
  scripts: ScriptItem[];
  selectedScriptId: string | null;
  onScriptChange: (id: string) => void;

  episodes: HierarchyEpisode[];
  selectedEpisodeId: string | null;
  onEpisodeChange: (id: string) => void;

  assets: Asset[];
  selectedAssetId: string | null;
  onAssetChange: (id: string) => void;
  
  className?: string;
}

export function StudioContextSelector({
  scripts,
  selectedScriptId,
  onScriptChange,
  episodes,
  selectedEpisodeId,
  onEpisodeChange,
  assets,
  selectedAssetId,
  onAssetChange,
  className,
}: StudioContextSelectorProps) {
  const [scriptOpen, setScriptOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [scriptSearch, setScriptSearch] = useState("");
  const [assetSearch, setAssetSearch] = useState("");

  const scriptRef = useRef<HTMLDivElement>(null);
  const assetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (scriptRef.current && !scriptRef.current.contains(event.target as Node)) {
        setScriptOpen(false);
      }
      if (assetRef.current && !assetRef.current.contains(event.target as Node)) {
        setAssetOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedScript = scripts.find(s => s.id === selectedScriptId);
  const selectedEpisode = episodes.find(e => e.id === selectedEpisodeId);
  const selectedAsset = assets.find(a => a.id === selectedAssetId);

  const filteredScripts = useMemo(() => {
    if (!scriptSearch) return scripts;
    return scripts.filter(s => 
      s.title.toLowerCase().includes(scriptSearch.toLowerCase())
    );
  }, [scripts, scriptSearch]);

  const filteredAssets = useMemo(() => {
    if (!assetSearch) return assets;
    return assets.filter(a => 
      a.name.toLowerCase().includes(assetSearch.toLowerCase()) ||
      a.type.toLowerCase().includes(assetSearch.toLowerCase())
    );
  }, [assets, assetSearch]);

  return (
    <div className={cn("flex flex-col gap-4 p-4 bg-surface border-b border-border", className)}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Script Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-textMuted uppercase">剧本 (Script)</label>
          <div className="relative" ref={scriptRef}>
            <button
              onClick={() => setScriptOpen(!scriptOpen)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors border",
                scriptOpen || selectedScriptId 
                  ? "bg-primary/10 border-primary/20 text-primary" 
                  : "bg-surfaceHighlight/50 border-border text-textMain hover:bg-surfaceHighlight"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen size={16} className="shrink-0" />
                <span className="truncate">
                  {selectedScript ? selectedScript.title : "选择剧本..."}
                </span>
              </div>
              <ChevronDown size={14} className={cn("shrink-0 transition-transform", scriptOpen && "rotate-180")} />
            </button>

            {scriptOpen && (
              <div className="absolute top-full left-0 mt-2 w-full min-w-[250px] bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-2 border-b border-border">
                  <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5">
                    <Search size={14} className="text-textMuted shrink-0" />
                    <input 
                      type="text"
                      value={scriptSearch}
                      onChange={(e) => setScriptSearch(e.target.value)}
                      placeholder="搜索剧本..."
                      className="bg-transparent border-none outline-none text-sm text-textMain placeholder:text-textMuted flex-1"
                      autoFocus
                    />
                    {scriptSearch && (
                      <button onClick={() => setScriptSearch("")} className="text-textMuted hover:text-textMain">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {filteredScripts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-textMuted">
                      {scriptSearch ? "未找到匹配剧本" : "无可用剧本"}
                    </div>
                  ) : (
                    filteredScripts.map(script => (
                      <button
                        key={script.id}
                        onClick={() => {
                          onScriptChange(script.id);
                          setScriptOpen(false);
                          setScriptSearch("");
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group",
                          selectedScriptId === script.id 
                            ? "bg-primary/10 text-primary" 
                            : "text-textMain hover:bg-surfaceHighlight"
                        )}
                      >
                        <span className="truncate">{script.title}</span>
                        {selectedScriptId === script.id && <Check size={14} className="shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Episode Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-textMuted uppercase">分集 (Episode)</label>
          <Select
            value={selectedEpisodeId || "ALL"}
            onValueChange={(val) => onEpisodeChange(val === "ALL" ? "" : val)}
            disabled={!selectedScriptId}
          >
            <SelectTrigger className="bg-surfaceHighlight/50 border-border text-textMain data-[disabled]:opacity-50">
              <SelectValue placeholder="选择分集 (可选)" />
            </SelectTrigger>
            <SelectContent className="bg-surface border-border">
              <SelectItem value="ALL">全部 / 不限</SelectItem>
              {episodes.map(ep => (
                <SelectItem key={ep.id} value={ep.id}>
                  {`EP${ep.episode_number.toString().padStart(2, '0')} ${ep.title || ''}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Asset Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-textMuted uppercase">资产 (Asset)</label>
          <div className="relative" ref={assetRef}>
            <button
              onClick={() => selectedScriptId && setAssetOpen(!assetOpen)}
              disabled={!selectedScriptId}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors border",
                !selectedScriptId 
                  ? "opacity-50 cursor-not-allowed bg-surfaceHighlight/50 border-border text-textMuted"
                  : assetOpen || selectedAssetId 
                    ? "bg-primary/10 border-primary/20 text-primary" 
                    : "bg-surfaceHighlight/50 border-border text-textMain hover:bg-surfaceHighlight"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Image size={16} className="shrink-0" />
                {selectedAsset ? (
                  <div className="flex items-center gap-2 min-w-0">
                    {selectedAsset.thumbnail && (
                      <img 
                        src={selectedAsset.thumbnail} 
                        className="w-5 h-5 rounded-sm object-cover shrink-0" 
                        alt="" 
                      />
                    )}
                    <span className="truncate">{selectedAsset.name}</span>
                  </div>
                ) : (
                  <span>选择绑定资产 (可选)...</span>
                )}
              </div>
              <ChevronDown size={14} className={cn("shrink-0 transition-transform", assetOpen && "rotate-180")} />
            </button>

            {assetOpen && selectedScriptId && (
              <div className="absolute top-full left-0 mt-2 w-full min-w-[300px] bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-2 border-b border-border">
                  <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5">
                    <Search size={14} className="text-textMuted shrink-0" />
                    <input 
                      type="text"
                      value={assetSearch}
                      onChange={(e) => setAssetSearch(e.target.value)}
                      placeholder="搜索资产..."
                      className="bg-transparent border-none outline-none text-sm text-textMain placeholder:text-textMuted flex-1"
                      autoFocus
                    />
                    {assetSearch && (
                      <button onClick={() => setAssetSearch("")} className="text-textMuted hover:text-textMain">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {filteredAssets.length === 0 ? (
                    <div className="p-3 text-center text-xs text-textMuted">
                      {assetSearch ? "未找到匹配资产" : "无可用资产"}
                    </div>
                  ) : (
                    filteredAssets.map(asset => (
                      <button
                        key={asset.id}
                        onClick={() => {
                          onAssetChange(asset.id);
                          setAssetOpen(false);
                          setAssetSearch("");
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-3 group",
                          selectedAssetId === asset.id 
                            ? "bg-primary/10 text-primary" 
                            : "text-textMain hover:bg-surfaceHighlight"
                        )}
                      >
                        <div className="w-8 h-8 bg-black/20 rounded flex items-center justify-center overflow-hidden shrink-0">
                          {asset.thumbnail ? (
                            <img src={asset.thumbnail} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <span className="text-[10px] text-white/50">{asset.type?.[0] || "?"}</span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate">{asset.name}</span>
                          <span className="text-[10px] text-textMuted">{asset.type}</span>
                        </div>
                        {selectedAssetId === asset.id && <Check size={14} className="shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
