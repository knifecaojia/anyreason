"use client";

import { X } from "lucide-react";

export function CreditsAdjustModal(props: {
  open: boolean;
  user: any | null;
  onClose: () => void;
  creditsError: string | null;
  creditsAccount: any | null;
  creditsReason: string;
  setCreditsReason: (value: string) => void;
  creditsAdjustDelta: number;
  setCreditsAdjustDelta: (value: number) => void;
  creditsSetBalance: number;
  setCreditsSetBalance: (value: number) => void;
  creditsLoading: boolean;
  submitCreditsAdjust: () => Promise<void>;
  submitCreditsSet: () => Promise<void>;
  creditsTransactions: any[];
}) {
  const {
    open,
    user,
    onClose,
    creditsError,
    creditsAccount,
    creditsReason,
    setCreditsReason,
    creditsAdjustDelta,
    setCreditsAdjustDelta,
    creditsSetBalance,
    setCreditsSetBalance,
    creditsLoading,
    submitCreditsAdjust,
    submitCreditsSet,
    creditsTransactions,
  } = props;

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-textMain">积分调整</div>
            <div className="text-sm text-textMuted mt-1">{user.email}</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-surfaceHighlight border border-border flex items-center justify-center text-textMuted hover:text-textMain"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {creditsError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">{creditsError}</div>}

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surfaceHighlight/40 border border-border rounded-xl p-4">
            <div className="text-xs text-textMuted">当前余额</div>
            <div className="text-2xl font-bold text-textMain mt-1">{creditsAccount?.balance ?? "-"}</div>
          </div>
          <div className="col-span-2 bg-surfaceHighlight/40 border border-border rounded-xl p-4 space-y-2">
            <div className="text-xs text-textMuted">调整原因</div>
            <input
              value={creditsReason}
              onChange={(e) => setCreditsReason(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
              placeholder="admin.adjust"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surfaceHighlight/40 border border-border rounded-xl p-4 space-y-3">
            <div className="text-sm font-bold text-textMain">加/减积分</div>
            <input
              type="number"
              value={creditsAdjustDelta}
              onChange={(e) => setCreditsAdjustDelta(Number(e.target.value))}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
            />
            <button
              onClick={() => void submitCreditsAdjust()}
              disabled={creditsLoading || Number(creditsAdjustDelta || 0) === 0}
              className="w-full bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              type="button"
            >
              {creditsLoading ? "处理中..." : "提交调整"}
            </button>
          </div>

          <div className="bg-surfaceHighlight/40 border border-border rounded-xl p-4 space-y-3">
            <div className="text-sm font-bold text-textMain">直接设置余额</div>
            <input
              type="number"
              value={creditsSetBalance}
              onChange={(e) => setCreditsSetBalance(Number(e.target.value))}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
            />
            <button
              onClick={() => void submitCreditsSet()}
              disabled={creditsLoading}
              className="w-full bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              type="button"
            >
              {creditsLoading ? "处理中..." : "设置余额"}
            </button>
          </div>
        </div>

        <div className="bg-surfaceHighlight/20 border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-bold text-textMain">最近流水</div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {creditsTransactions.length === 0 && (
              <div className="px-4 py-6 text-sm text-textMuted">{creditsLoading ? "加载中..." : "暂无流水"}</div>
            )}
            {creditsTransactions.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-textMain font-mono truncate">{t.reason}</div>
                  <div className="text-xs text-textMuted font-mono truncate">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div className="text-xs text-textMain font-mono">
                  {t.delta > 0 ? `+${t.delta}` : `${t.delta}`} → {t.balance_after}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

