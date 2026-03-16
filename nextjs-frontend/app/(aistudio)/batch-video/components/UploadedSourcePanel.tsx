"use client";

import Image from "next/image";
import { useState } from "react";
import { GridMode, UploadedSource } from "../types";

interface UploadedSourcePanelProps {
  sources: UploadedSource[];
  onModeChange: (id: string, mode: GridMode) => void;
  onRemove: (id: string) => void;
  onProcess: (id: string) => void;
  filteredSourceId?: string | null;
  onToggleFilter?: (id: string) => void;
  onClearFilter?: () => void;
}

export function UploadedSourcePanel({
  sources,
  onModeChange,
  onRemove,
  onProcess,
  filteredSourceId,
  onToggleFilter,
  onClearFilter,
}: UploadedSourcePanelProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (sources.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-textMuted">
        暂无待处理图片。上传后的原图会先显示在这里，确认后再做九宫格拆分。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-textMain">待处理图片</h3>
        <div className="flex items-center gap-2">
          {filteredSourceId && onClearFilter && (
            <button
              type="button"
              aria-label="清除待处理图片过滤"
              onClick={onClearFilter}
              className="w-6 h-6 flex items-center justify-center rounded-full border border-border text-textMuted hover:text-textMain hover:border-primary"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          <span className="text-xs text-textMuted">{sources.length} 张</span>
        </div>
      </div>
      <div className="space-y-2">
        {sources.map((source) => (
            <div
              key={source.id}
              className={`rounded-xl border bg-background p-2 ${filteredSourceId === source.id ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
            >
              <div className="flex items-start gap-2">
              <div className="relative w-20 h-14 rounded-md overflow-hidden bg-secondary/30 shrink-0">
                <Image
                  src={source.preview}
                  alt="uploaded"
                  fill
                  unoptimized
                  className="object-cover cursor-zoom-in"
                  onClick={() => setPreviewImage(source.preview)}
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-textMuted truncate">{source.file?.name ?? source.originalFilename ?? "未命名图片"}</div>
                  <div className="flex items-center gap-2">
                    {onToggleFilter && (
                      <button
                        type="button"
                        aria-label={`筛选待处理图片 ${source.id}`}
                        onClick={() => onToggleFilter(source.id)}
                        className={`text-[11px] rounded px-1.5 py-0.5 ${filteredSourceId === source.id ? "bg-primary/10 text-primary" : "text-textMuted hover:text-textMain"}`}
                      >
                        筛选
                      </button>
                    )}
                    <button onClick={() => onRemove(source.id)} className="text-[11px] text-red-500 hover:text-red-600">删除</button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => onModeChange(source.id, "16:9")}
                    className={`px-2 py-1 text-[11px] rounded-full ${source.mode === "16:9" ? "bg-primary text-white" : "bg-secondary text-textMuted"}`}
                  >
                    16:9 九宫格
                  </button>
                  <button
                    onClick={() => onModeChange(source.id, "9:16")}
                    className={`px-2 py-1 text-[11px] rounded-full ${source.mode === "9:16" ? "bg-primary text-white" : "bg-secondary text-textMuted"}`}
                  >
                    9:16 四宫格
                  </button>
                </div>

                <button
                  onClick={() => onProcess(source.id)}
                  disabled={source.processed || (!source.file && !source.sourceUrl)}
                  className="w-full px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {source.processed ? "已拆分" : "拆分为卡片"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative w-full max-w-6xl h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={previewImage}
              alt="preview"
              fill
              unoptimized
              className="object-contain rounded-lg bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
