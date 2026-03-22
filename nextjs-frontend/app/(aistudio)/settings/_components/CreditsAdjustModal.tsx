"use client";

import { X, ArrowDownCircle, ArrowUpCircle, UserCircle, Bot, RefreshCw } from "lucide-react";
import { normalizeTransaction } from "@/components/credits/credits-history-normalizer";
import type { CreditHistoryRow } from "@/components/credits/credits-history-types";
import type { CreditTransaction } from "@/components/actions/credits-actions";

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
  creditsTransactions: CreditTransaction[];
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
          <div className="px-4 py-3 border-b border-border text-sm font-bold text-textMain">最近流水（可追溯）</div>
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {creditsTransactions.length === 0 && (
              <div className="px-4 py-6 text-sm text-textMuted">{creditsLoading ? "加载中..." : "暂无流水"}</div>
            )}
            {creditsTransactions.map((t) => {
              // Normalize raw transaction for richer display
              const row: CreditHistoryRow = normalizeTransaction(t);
              
              return (
                <TransactionRow key={t.id} row={row} rawMeta={t.meta} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Transaction Row Component - Richer Admin Traceability Display
// =============================================================================

/**
 * Badge component for trace type indication.
 * Distinguishes AI consume, Agent execution, Admin adjustments, and Init events.
 */
function TraceTypeBadge(props: { traceType: string; isRefund: boolean }) {
  const { traceType, isRefund } = props;
  
  if (isRefund) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
        <RefreshCw size={10} />
        退款
      </span>
    );
  }
  
  switch (traceType) {
    case "ai":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
          <Bot size={10} />
          AI
        </span>
      );
    case "agent":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
          <Bot size={10} />
          智能体
        </span>
      );
    case "admin":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
          <UserCircle size={10} />
          管理员
        </span>
      );
    case "init":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
          初始化
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
          未知
        </span>
      );
  }
}

/**
 * Delta display with colored indicator.
 */
function DeltaDisplay(props: { delta: number; category: string }) {
  const { delta, category } = props;
  const isPositive = delta > 0;
  const isRefund = category === "refund";
  
  let colorClass = "text-textMain";
  if (isRefund || isPositive) {
    colorClass = "text-green-400";
  } else {
    colorClass = "text-red-400";
  }
  
  const Icon = isPositive ? ArrowUpCircle : ArrowDownCircle;
  
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm font-bold ${colorClass}`}>
      <Icon size={14} />
      {isPositive ? `+${delta}` : delta}
    </span>
  );
}

/**
 * Single transaction row with enriched traceability display.
 */
function TransactionRow(props: { row: CreditHistoryRow; rawMeta?: Record<string, unknown> }) {
  const { row, rawMeta } = props;
  
  // Extract admin notes if available
  const adminNotes = row.traceType === "admin" && rawMeta?.notes 
    ? String(rawMeta.notes) 
    : null;
  
  // Extract original transaction ID for refunds
  const originalTxId = row.isRefund && rawMeta?.original_transaction_id
    ? String(rawMeta.original_transaction_id)
    : null;
  
  // Extract linked event ID for AI/Agent operations
  const linkedEventId = row.linkedEventId 
    ? String(row.linkedEventId).substring(0, 8) + "..." 
    : null;
  
  return (
    <div className="px-4 py-3 hover:bg-surfaceHighlight/10 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Left: trace type badge and operation info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TraceTypeBadge traceType={row.traceType} isRefund={row.isRefund} />
            <span className="text-sm font-medium text-textMain truncate">{row.operationLabel}</span>
          </div>
          
          {/* Secondary info row */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-textMuted">{row.formattedTime}</span>
            
            {/* Model display for AI operations */}
            {row.modelDisplay && (
              <span className="text-xs text-textMuted/70 font-mono">
                模型: {row.modelDisplay}
              </span>
            )}
            
            {/* AI category for AI operations */}
            {row.aiCategory && row.traceType === "ai" && (
              <span className="text-xs text-textMuted/70">
                类型: {row.aiCategory === "text" ? "文本" : row.aiCategory === "image" ? "图像" : row.aiCategory === "video" ? "视频" : row.aiCategory}
              </span>
            )}
          </div>
          
          {/* Admin notes */}
          {adminNotes && (
            <div className="mt-1 text-xs text-textMuted/70 italic">
              备注: {adminNotes}
            </div>
          )}
          
          {/* Debug IDs for traceability */}
          {(linkedEventId || originalTxId) && (
            <div className="mt-1 flex items-center gap-2">
              {linkedEventId && (
                <span className="text-[10px] text-textMuted/50 font-mono">
                  事件: {linkedEventId}
                </span>
              )}
              {originalTxId && (
                <span className="text-[10px] text-textMuted/50 font-mono">
                  原交易: {originalTxId.substring(0, 8)}...
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Right: delta and balance */}
        <div className="text-right shrink-0">
          <DeltaDisplay delta={row.delta} category={row.category} />
          <div className="text-xs text-textMuted mt-0.5">
            余额 → {row.balanceAfter}
          </div>
        </div>
      </div>
    </div>
  );
}

