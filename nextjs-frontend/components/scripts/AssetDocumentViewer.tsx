"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { stripMarkdownMetadata } from "@/lib/utils/markdown";

export function AssetDocumentViewer({
  open,
  title,
  content,
  loading,
  generateHref,
  onClose,
}: {
  open: boolean;
  title: string;
  content: string;
  loading: boolean;
  generateHref?: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        <div className="h-12 px-4 border-b border-border flex items-center justify-between">
          <div className="font-bold text-sm truncate">{title}</div>
          <div className="flex items-center gap-2">
            {generateHref && (
              <a
                href={generateHref}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                生成图片
              </a>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
              type="button"
            >
              关闭
            </button>
          </div>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-textMuted flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> 加载中...
            </div>
          ) : (
            <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripMarkdownMetadata(content)}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
