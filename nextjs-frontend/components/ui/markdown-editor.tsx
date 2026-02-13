"use client";

import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  heightClassName?: string;
};

function wrapSelection(text: string, start: number, end: number, left: string, right: string) {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  return {
    nextText: `${before}${left}${selected}${right}${after}`,
    nextSelectionStart: start + left.length,
    nextSelectionEnd: end + left.length,
  };
}

function insertAtLineStart(text: string, start: number, end: number, prefix: string) {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const lines = selected.length ? selected.split("\n") : [""];
  const nextSelected = lines.map((l) => (l.startsWith(prefix) ? l : `${prefix}${l}`)).join("\n");
  return {
    nextText: `${before}${nextSelected}${after}`,
    nextSelectionStart: start,
    nextSelectionEnd: start + nextSelected.length,
  };
}

export function MarkdownEditor({ value, onChange, placeholder, heightClassName }: Props) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const preview = useMemo(() => value || "", [value]);

  const applyTransform = (fn: (text: string, start: number, end: number) => { nextText: string; nextSelectionStart: number; nextSelectionEnd: number }) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const { nextText, nextSelectionStart, nextSelectionEnd } = fn(value, start, end);
    onChange(nextText);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surfaceHighlight/50 border-b border-border">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === "write" ? "bg-surface text-textMain border border-border/60 shadow-sm" : "text-textMuted hover:text-textMain"
            }`}
          >
            编辑
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === "preview" ? "bg-surface text-textMain border border-border/60 shadow-sm" : "text-textMuted hover:text-textMain"
            }`}
          >
            预览
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyTransform((t, s, e) => wrapSelection(t, s, e, "**", "**"))}
            className="px-2 py-1 rounded-md text-xs font-bold text-textMain border border-border/60 bg-surface hover:bg-surfaceHighlight transition-all"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => applyTransform((t, s, e) => wrapSelection(t, s, e, "_", "_"))}
            className="px-2 py-1 rounded-md text-xs font-bold text-textMain border border-border/60 bg-surface hover:bg-surfaceHighlight transition-all"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => applyTransform((t, s, e) => wrapSelection(t, s, e, "`", "`"))}
            className="px-2 py-1 rounded-md text-xs font-bold text-textMain border border-border/60 bg-surface hover:bg-surfaceHighlight transition-all"
          >
            ``
          </button>
          <button
            type="button"
            onClick={() => applyTransform((t, s, e) => wrapSelection(t, s, e, "```\n", "\n```"))}
            className="px-2 py-1 rounded-md text-xs font-bold text-textMain border border-border/60 bg-surface hover:bg-surfaceHighlight transition-all"
          >
            code
          </button>
          <div className="w-px h-6 bg-border mx-1" />
          <button
            type="button"
            onClick={() => applyTransform((t, s, e) => insertAtLineStart(t, s, e, "# "))}
            className="px-2 py-1 rounded-md text-xs font-bold text-textMain border border-border/60 bg-surface hover:bg-surfaceHighlight transition-all"
          >
            H
          </button>
          <button
            type="button"
            onClick={() => applyTransform((t, s, e) => insertAtLineStart(t, s, e, "- "))}
            className="px-2 py-1 rounded-md text-xs font-bold text-textMain border border-border/60 bg-surface hover:bg-surfaceHighlight transition-all"
          >
            列表
          </button>
          <button
            type="button"
            onClick={() => applyTransform((t, s, e) => insertAtLineStart(t, s, e, "> "))}
            className="px-2 py-1 rounded-md text-xs font-bold text-textMain border border-border/60 bg-surface hover:bg-surfaceHighlight transition-all"
          >
            引用
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-surface px-4 py-3 text-xs text-textMain outline-none font-mono ${heightClassName || "h-[420px]"} resize-none`}
        />
      ) : (
        <div className={`w-full ${heightClassName || "h-[420px]"} overflow-auto px-4 py-3`}>
          <div className="prose prose-invert max-w-none prose-pre:bg-black/30 prose-pre:border prose-pre:border-border prose-code:text-blue-200 prose-a:text-blue-300 prose-strong:text-textMain">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview || " "}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

