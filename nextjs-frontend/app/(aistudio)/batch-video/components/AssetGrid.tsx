"use client";

import { useState } from "react";
import { BatchVideoAsset } from "../types";

interface AssetGridProps {
  assets: BatchVideoAsset[];
  selectedAssets: Set<string>;
  onSelectAsset: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onUpdatePrompt: (assetId: string, prompt: string) => void;
  onDeleteAsset: (assetId: string) => void;
  onDeleteSelected?: () => void;
  onOpenAIPolish?: () => void;
}

export function AssetGrid({
  assets,
  selectedAssets,
  onSelectAsset,
  onSelectAll,
  onUpdatePrompt,
  onDeleteAsset,
  onDeleteSelected,
  onOpenAIPolish,
}: AssetGridProps) {
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleStartEditPrompt = (asset: BatchVideoAsset) => {
    setEditingPromptId(asset.id);
    setPromptValue(asset.prompt || "");
  };

  const handleSavePrompt = (assetId: string) => {
    onUpdatePrompt(assetId, promptValue);
    setEditingPromptId(null);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-gray-100 text-gray-700",
      generating: "bg-blue-100 text-blue-700 animate-pulse",
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = {
      pending: "等待中",
      generating: "生成中",
      completed: "已完成",
      failed: "失败",
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-textMuted">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-4 opacity-50"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p>暂无资产，请上传图片</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-textMuted">
            已选择 {selectedAssets.size} / {assets.length}
          </span>
          <button
            onClick={() => onSelectAll(assets.map((a) => a.id))}
            className="text-sm text-primary hover:text-primary/80"
          >
            全选
          </button>
          <button
            onClick={() => onSelectAll([])}
            className="text-sm text-textMuted hover:text-textMain"
          >
            取消
          </button>
          {selectedAssets.size > 0 && onDeleteSelected && (
            <button
              onClick={onDeleteSelected}
              className="text-sm text-red-500 hover:text-red-600"
            >
              删除所选
            </button>
          )}
          <button
            onClick={onOpenAIPolish}
            disabled={!onOpenAIPolish || selectedAssets.size === 0}
            className="text-sm text-primary hover:text-primary/80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            AI 润色
          </button>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded ${viewMode === "grid" ? "bg-background" : ""}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded ${viewMode === "list" ? "bg-background" : ""}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                selectedAssets.has(asset.id)
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent hover:border-border"
              }`}
            >
              <div className="aspect-[4/5] bg-secondary/50 relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewImage(asset.source_url || asset.thumbnail_url || null);
                  }}
                  className="absolute top-2 left-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-background/90 text-textMuted hover:text-textMain"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 3 6 6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAsset(asset.id);
                  }}
                  className={`absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full border ${
                    selectedAssets.has(asset.id)
                      ? "bg-primary border-primary text-white"
                      : "bg-background/90 border-border text-textMuted hover:text-textMain"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </button>
                <img
                  src={asset.thumbnail_url || asset.source_url}
                  alt=""
                  className="w-full h-full object-contain bg-black/5 cursor-zoom-in"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewImage(asset.source_url || asset.thumbnail_url || null);
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder-image.png";
                  }}
                />
                {asset.status === "completed" && asset.result_url && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={asset.result_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 text-sm bg-white text-black rounded-md hover:bg-gray-100"
                    >
                      查看视频
                    </a>
                  </div>
                )}
              </div>
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between">
                  {getStatusBadge(asset.status)}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("确定删除此资产吗？")) {
                        onDeleteAsset(asset.id);
                      }
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded-full text-textMuted hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
                {editingPromptId === asset.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={promptValue}
                      onChange={(e) => setPromptValue(e.target.value)}
                      onBlur={() => handleSavePrompt(asset.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSavePrompt(asset.id);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs bg-background border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      rows={2}
                      autoFocus
                    />
                  </div>
                ) : (
                  <p
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditPrompt(asset);
                    }}
                    title={asset.prompt || "点击添加提示词..."}
                    className="text-xs text-textMuted line-clamp-2 cursor-pointer hover:text-textMain"
                  >
                    {asset.prompt || "点击添加提示词..."}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className={`flex items-center gap-4 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                selectedAssets.has(asset.id)
                  ? "border-primary bg-primary/5"
                  : "border-transparent bg-secondary/30 hover:bg-secondary/50"
              }`}
            >
              <img
                src={asset.thumbnail_url || asset.source_url}
                alt=""
                className="w-16 h-12 object-cover rounded cursor-zoom-in"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(asset.source_url || asset.thumbnail_url || null);
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder-image.png";
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {getStatusBadge(asset.status)}
                  <span className="text-xs text-textMuted">#{asset.index + 1}</span>
                </div>
                {editingPromptId === asset.id ? (
                  <textarea
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    onBlur={() => handleSavePrompt(asset.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSavePrompt(asset.id);
                      }
                    }}
                    className="w-full mt-1 px-2 py-1 text-sm bg-background border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={2}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditPrompt(asset);
                    }}
                    title={asset.prompt || "点击添加提示词..."}
                    className="text-sm text-textMuted mt-1 line-clamp-2 cursor-pointer hover:text-textMain"
                  >
                    {asset.prompt || "点击添加提示词..."}
                  </p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAsset(asset.id);
                }}
                className={`w-7 h-7 flex items-center justify-center rounded-full border ${
                  selectedAssets.has(asset.id)
                    ? "bg-primary border-primary text-white"
                    : "bg-background border-border text-textMuted hover:text-textMain"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("确定删除此资产吗？")) {
                    onDeleteAsset(asset.id);
                  }
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full text-textMuted hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div className="max-w-6xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="preview" className="max-w-full max-h-[90vh] object-contain rounded-lg bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
