"use client";

import { useState, useMemo } from "react";
import { CheckSquare, Square, ChevronDown, FolderOpen } from "lucide-react";

export type EpisodeInfo = {
  id: string;
  episode_code: string;
  episode_number: number;
  title?: string | null;
};

type EpisodeSelectorProps = {
  episodes: EpisodeInfo[];
  unassignedEpisode?: EpisodeInfo | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function EpisodeSelector({
  episodes,
  unassignedEpisode,
  selectedIds,
  onChange,
}: EpisodeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const allIds = useMemo(() => {
    const ids = episodes.map((ep) => ep.id);
    if (unassignedEpisode) {
      ids.push(unassignedEpisode.id);
    }
    return ids;
  }, [episodes, unassignedEpisode]);

  const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
  const isPartialSelected = !isAllSelected && selectedIds.length > 0;

  const toggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(allIds);
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const getEpisodeLabel = (ep: EpisodeInfo) => {
    if (ep.episode_code === "UNASSIGNED") {
      return "未分集";
    }
    return `第${ep.episode_number}集${ep.title ? `: ${ep.title}` : ""}`;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-white border border-slate-600"
      >
        <FolderOpen className="w-4 h-4" />
        <span>选择剧集</span>
        <span className="text-slate-400">({selectedIds.length}/{allIds.length})</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          <div className="p-2 border-b border-slate-700">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-slate-700 rounded text-sm text-white"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-green-500" />
              ) : isPartialSelected ? (
                <div className="w-4 h-4 border border-slate-500 rounded flex items-center justify-center">
                  <div className="w-2 h-0.5 bg-slate-400" />
                </div>
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>全选</span>
            </button>
          </div>

          <div className="p-1">
            {episodes.map((ep) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => toggleOne(ep.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-slate-700 rounded text-sm text-white"
              >
                {selectedIds.includes(ep.id) ? (
                  <CheckSquare className="w-4 h-4 text-green-500" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>{getEpisodeLabel(ep)}</span>
              </button>
            ))}

            {unassignedEpisode && (
              <button
                key={unassignedEpisode.id}
                type="button"
                onClick={() => toggleOne(unassignedEpisode.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-slate-700 rounded text-sm text-amber-400 border-t border-slate-700 mt-1 pt-2"
              >
                {selectedIds.includes(unassignedEpisode.id) ? (
                  <CheckSquare className="w-4 h-4 text-green-500" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>未分集</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
