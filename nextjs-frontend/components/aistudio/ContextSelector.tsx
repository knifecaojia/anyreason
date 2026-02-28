"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { 
  ChevronDown, 
  Check, 
  Search, 
  Filter, 
  LayoutGrid, 
  List,
  FolderOpen,
  BookOpen,
  X,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

// Define types compatible with the page
export interface ScriptItem {
  id: string;
  title: string;
}

export interface EpisodeItem {
  id: string;
  episode_code: string;
  episode_number: number;
  title?: string | null;
}

export type AssetTypeFilter = "ALL" | "CHARACTER" | "SCENE" | "PROP" | "EFFECT";

interface ContextSelectorProps {
  // Scripts
  scripts: ScriptItem[];
  selectedScriptId: string | null;
  onScriptChange: (id: string) => void;

  // Episodes
  episodes: EpisodeItem[];
  selectedEpisodeIds: string[];
  onEpisodeChange: (ids: string[]) => void;

  // Asset Filters
  searchTerm: string;
  onSearchChange: (term: string) => void;
  assetType: AssetTypeFilter;
  onAssetTypeChange: (type: AssetTypeFilter) => void;
  onRefresh?: () => void;
  
  className?: string;
}

export function ContextSelector({
  scripts,
  selectedScriptId,
  onScriptChange,
  episodes,
  selectedEpisodeIds,
  onEpisodeChange,
  searchTerm,
  onSearchChange,
  assetType,
  onAssetTypeChange,
  onRefresh,
  className
}: ContextSelectorProps) {
  const [scriptOpen, setScriptOpen] = useState(false);
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  const scriptRef = useRef<HTMLDivElement>(null);
  const episodeRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (scriptRef.current && !scriptRef.current.contains(event.target as Node)) {
        setScriptOpen(false);
      }
      if (episodeRef.current && !episodeRef.current.contains(event.target as Node)) {
        setEpisodeOpen(false);
      }
      if (typeRef.current && !typeRef.current.contains(event.target as Node)) {
        setTypeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Script Label
  const selectedScript = scripts.find(s => s.id === selectedScriptId);

  // Episode Logic
  const allEpisodeIds = useMemo(() => episodes.map(e => e.id), [episodes]);
  const isAllEpisodesSelected = allEpisodeIds.length > 0 && allEpisodeIds.every(id => selectedEpisodeIds.includes(id));
  const isPartialEpisodesSelected = !isAllEpisodesSelected && selectedEpisodeIds.length > 0;

  const toggleAllEpisodes = () => {
    if (isAllEpisodesSelected) {
      onEpisodeChange([]);
    } else {
      onEpisodeChange(allEpisodeIds);
    }
  };

  const toggleEpisode = (id: string) => {
    if (selectedEpisodeIds.includes(id)) {
      onEpisodeChange(selectedEpisodeIds.filter(x => x !== id));
    } else {
      onEpisodeChange([...selectedEpisodeIds, id]);
    }
  };

  const getEpisodeLabel = (ep: EpisodeItem) => {
    if (ep.episode_code === "UNASSIGNED") return "未分集";
    return `第${ep.episode_number}集${ep.title ? `: ${ep.title}` : ""}`;
  };

  const assetTypeLabels: Record<AssetTypeFilter, string> = {
    ALL: "全部类型",
    CHARACTER: "角色 (Character)",
    SCENE: "场景 (Scene)",
    PROP: "道具 (Prop)",
    EFFECT: "特效 (Effect)"
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-3 p-2 bg-surface border border-border rounded-xl", className)}>
      
      {/* Script Selector */}
      <div className="relative" ref={scriptRef}>
        <button
          onClick={() => setScriptOpen(!scriptOpen)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
            scriptOpen || selectedScriptId ? "bg-primary/10 border-primary/20 text-primary" : "bg-background border-border text-textMain hover:bg-surfaceHighlight"
          )}
        >
          <BookOpen size={16} />
          <span className="max-w-[120px] truncate">
            {selectedScript ? selectedScript.title : "选择剧本"}
          </span>
          <ChevronDown size={14} className={cn("transition-transform", scriptOpen && "rotate-180")} />
        </button>

        {scriptOpen && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="max-h-64 overflow-y-auto p-1">
              {scripts.length === 0 ? (
                <div className="p-3 text-center text-xs text-textMuted">无可用剧本</div>
              ) : (
                scripts.map(script => (
                  <button
                    key={script.id}
                    onClick={() => {
                      onScriptChange(script.id);
                      setScriptOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group",
                      selectedScriptId === script.id ? "bg-primary/10 text-primary" : "text-textMain hover:bg-surfaceHighlight"
                    )}
                  >
                    <span className="truncate">{script.title}</span>
                    {selectedScriptId === script.id && <Check size={14} />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Episode Selector */}
      <div className="relative" ref={episodeRef}>
        <button
          onClick={() => setEpisodeOpen(!episodeOpen)}
          disabled={!selectedScriptId}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
            !selectedScriptId 
              ? "opacity-50 cursor-not-allowed bg-surfaceHighlight border-transparent text-textMuted"
              : episodeOpen || selectedEpisodeIds.length > 0 
                ? "bg-primary/10 border-primary/20 text-primary" 
                : "bg-background border-border text-textMain hover:bg-surfaceHighlight"
          )}
        >
          <FolderOpen size={16} />
          <span>
            {selectedEpisodeIds.length === 0 
              ? "选择分集" 
              : selectedEpisodeIds.length === allEpisodeIds.length && allEpisodeIds.length > 0
                ? "全部集数"
                : `已选 ${selectedEpisodeIds.length} 集`}
          </span>
          <ChevronDown size={14} className={cn("transition-transform", episodeOpen && "rotate-180")} />
        </button>

        {episodeOpen && selectedScriptId && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="p-2 border-b border-border bg-surfaceHighlight/30">
                <button
                  onClick={toggleAllEpisodes}
                  className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-surfaceHighlight rounded text-xs font-medium text-textMain"
                >
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                    isAllEpisodesSelected ? "bg-primary border-primary" : "border-textMuted bg-background"
                  )}>
                    {isAllEpisodesSelected && <Check size={12} className="text-white" />}
                    {isPartialEpisodesSelected && !isAllEpisodesSelected && <div className="w-2 h-0.5 bg-primary" />}
                  </div>
                  <span>全选所有分集</span>
                </button>
             </div>
             <div className="max-h-64 overflow-y-auto p-1">
                {episodes.length === 0 ? (
                  <div className="p-4 text-center text-xs text-textMuted">暂无分集数据</div>
                ) : (
                  episodes.map(ep => {
                    const isSelected = selectedEpisodeIds.includes(ep.id);
                    return (
                      <button
                        key={ep.id}
                        onClick={() => toggleEpisode(ep.id)}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 hover:bg-surfaceHighlight text-textMain"
                      >
                         <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                            isSelected ? "bg-primary border-primary" : "border-textMuted bg-background"
                          )}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                          <span className="truncate flex-1">{getEpisodeLabel(ep)}</span>
                      </button>
                    );
                  })
                )}
             </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {onRefresh && (
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg bg-background border border-border text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
          title="刷新资产"
        >
          <RefreshCw size={16} />
        </button>
      )}

      {/* Search & Filter */}
      <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5 focus-within:ring-1 focus-within:ring-primary/50 transition-shadow">
        <Search size={14} className="text-textMuted" />
        <input 
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索资产名称..."
          className="bg-transparent border-none outline-none text-sm text-textMain placeholder:text-textMuted w-32 focus:w-48 transition-all"
        />
        {searchTerm && (
          <button onClick={() => onSearchChange("")} className="text-textMuted hover:text-textMain">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="relative" ref={typeRef}>
        <button
          onClick={() => setTypeOpen(!typeOpen)}
          className={cn(
             "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
             assetType !== "ALL" ? "bg-primary/10 border-primary/20 text-primary" : "bg-background border-border text-textMain hover:bg-surfaceHighlight"
          )}
        >
          <Filter size={14} />
          <span className="hidden sm:inline">{assetTypeLabels[assetType].split(' ')[0]}</span>
          <ChevronDown size={14} className={cn("transition-transform", typeOpen && "rotate-180")} />
        </button>
        
        {typeOpen && (
          <div className="absolute top-full right-0 mt-2 w-48 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-1">
              {(Object.keys(assetTypeLabels) as AssetTypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    onAssetTypeChange(type);
                    setTypeOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group",
                    assetType === type ? "bg-primary/10 text-primary" : "text-textMain hover:bg-surfaceHighlight"
                  )}
                >
                  <span>{assetTypeLabels[type]}</span>
                  {assetType === type && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
