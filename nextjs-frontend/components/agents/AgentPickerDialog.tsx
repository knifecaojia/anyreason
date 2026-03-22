"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

type AgentRow = {
  id: string;
  name: string;
  category: string;
  purpose: string;
  capabilities: string[];
  credits_per_call: number;
  enabled: boolean;
};

type Props = {
  open: boolean;
  title: string;
  purpose: string;
  onClose: () => void;
  onPick: (agent: AgentRow) => void;
};

export function AgentPickerDialog({ open, title, purpose, onClose, onPick }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const res = await fetch(`/api/agents?purpose=${encodeURIComponent(purpose)}`, { cache: "no-store" });
      if (!res.ok) {
        if (cancelled) return;
        setError(await res.text());
        setAgents([]);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { data?: AgentRow[] };
      if (cancelled) return;
      setAgents(Array.isArray(json.data) ? json.data : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, purpose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => a.name.toLowerCase().includes(q));
  }, [agents, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        <div className="h-12 px-4 border-b border-border flex items-center justify-between">
          <div className="font-bold text-sm">{title}</div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
            type="button"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
            <Search size={16} className="text-textMuted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="搜索 Agent 名称"
            />
          </div>

          {error && <div className="text-xs text-red-400 whitespace-pre-wrap">{error}</div>}

          {!loading && filtered.length > 0 ? (
            <div className="rounded-xl border border-border bg-background/30 px-3 py-2">
              <div className="text-[11px] font-medium text-textMain">执行前积分提示</div>
              <div className="mt-1 text-[10px] text-textMuted">
                选择 Agent 后会立即按该 Agent 的单次调用价格扣费。
              </div>
              <div className="mt-1 text-[10px] text-textMuted">
                若余额不足，请先通过顶部积分入口查看余额与历史后再执行。
              </div>
            </div>
          ) : null}

          <div className="max-h-[55vh] overflow-y-auto space-y-2">
            {loading ? (
              <div className="py-10 flex items-center justify-center text-sm text-textMuted gap-2">
                <Loader2 size={16} className="animate-spin" /> 加载中...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-sm text-textMuted text-center">暂无可用 Agent</div>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onPick(a)}
                  className="w-full text-left p-3 rounded-xl border border-border bg-surfaceHighlight/20 hover:bg-surfaceHighlight/40 hover:border-primary/30 transition-all"
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-sm text-textMain truncate">{a.name}</div>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary whitespace-nowrap">
                      消耗 {a.credits_per_call} 积分
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-textMuted/70 truncate">{(a.capabilities || []).join(", ")}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
