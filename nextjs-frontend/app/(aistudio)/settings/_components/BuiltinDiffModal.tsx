"use client";

import { X } from "lucide-react";

export function BuiltinDiffModal(props: {
  open: boolean;
  agentCode: string;
  error: string | null;
  versions: any[];
  from: number;
  to: number;
  setFrom: (v: number) => void;
  setTo: (v: number) => void;
  loading: boolean;
  diffText: string;
  onRun: () => void;
  onClose: () => void;
}) {
  const { open, agentCode, error, versions, from, to, setFrom, setTo, loading, diffText, onRun, onClose } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-textMain">版本对比</div>
            <div className="text-sm text-textMuted mt-1">{agentCode || "-"}</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-surfaceHighlight border border-border flex items-center justify-center text-textMuted hover:text-textMain"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">{error}</div>}

        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <div className="text-xs text-textMuted">from</div>
              <select
                value={String(from)}
                onChange={(e) => setFrom(Number(e.target.value))}
                className="bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
              >
                {versions.map((v) => (
                  <option key={`from-${v.id}`} value={String(v.version)}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-textMuted">to</div>
              <select
                value={String(to)}
                onChange={(e) => setTo(Number(e.target.value))}
                className="bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
              >
                {versions.map((v) => (
                  <option key={`to-${v.id}`} value={String(v.version)}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={onRun}
              disabled={loading || versions.length === 0}
              className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              type="button"
            >
              {loading ? "对比中..." : "生成 Diff"}
            </button>
          </div>
          <div className="text-xs text-textMuted">统一 diff（unified diff）</div>
        </div>

        <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
          <pre className="max-h-[420px] overflow-auto p-4 text-xs text-textMain font-mono whitespace-pre-wrap">{diffText || ""}</pre>
        </div>
      </div>
    </div>
  );
}

