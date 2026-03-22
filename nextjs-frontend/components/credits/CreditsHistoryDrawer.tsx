"use client";

import { Coins, X, History, Loader2, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";
import { useCreditHistory } from "./credits-history-hooks";
import type { CreditHistoryRow } from "./credits-history-types";
import { getDeltaDisplay } from "./credits-history-hooks";

interface CreditsHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Format a date to a human-readable string with relative dates.
 */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
  
  if (isToday) {
    return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (isYesterday) {
    return `昨天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renders a single transaction row using Task 8 normalized data.
 */
function TransactionRow({ row }: { row: CreditHistoryRow }) {
  const [deltaText, deltaColor] = getDeltaDisplay(row.delta);
  
  return (
    <div className="px-5 py-3 hover:bg-surfaceHighlight/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Left: reason and time */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium text-textMain ${row.isRefund ? "opacity-80" : ""}`}>
              {row.operationLabel}
            </span>
            {row.isRefund && (
              <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-medium rounded">
                退款
              </span>
            )}
          </div>
          <div className="text-xs text-textMuted mt-0.5">
            {formatRelativeDate(row.isoTime)}
          </div>
        </div>
        
        {/* Right: delta and balance */}
        <div className="text-right flex-shrink-0">
          <div className={`text-sm font-semibold ${deltaColor}`}>
            {deltaText}
          </div>
          <div className="text-xs text-textMuted mt-0.5">
            余额 {row.balanceAfter}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreditsHistoryDrawer({ open, onClose }: CreditsHistoryDrawerProps) {
  // Use Task 8 reusable data layer
  const { rows, isLoading, error, balance, refresh } = useCreditHistory({ limit: 50 });

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-full bg-surface border-l border-border shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="h-14 px-5 border-b border-border flex items-center justify-between bg-surface/95 backdrop-blur flex-shrink-0">
          <div className="flex items-center gap-2">
            <Coins className="text-primary" size={20} />
            <span className="text-lg font-bold text-textMain">积分流水</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surfaceHighlight transition-colors text-textMuted hover:text-textMain"
          >
            <X size={18} />
          </button>
        </div>

        {/* Balance Summary */}
        <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/40">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-textMuted">当前余额</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Coins className="text-primary" size={16} />
                <span className="text-xl font-bold text-textMain">{balance}</span>
                <span className="text-sm text-textMuted">积分</span>
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-surfaceHighlight transition-colors text-textMuted hover:text-textMain disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="animate-spin text-primary mb-3" size={32} />
              <span className="text-textMuted">加载中...</span>
            </div>
          ) : error && rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h3 className="text-base font-medium text-textMain mb-1">加载失败</h3>
              <p className="text-sm text-textMuted mb-4">{error}</p>
              <button
                onClick={refresh}
                className="inline-flex items-center gap-2 px-4 py-2 bg-surfaceHighlight hover:bg-surface border border-border rounded-lg text-sm font-medium text-textMain transition-colors"
              >
                <RefreshCw size={14} />
                重试
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-surfaceHighlight flex items-center justify-center mb-4">
                <History size={28} className="text-textMuted" />
              </div>
              <h3 className="text-base font-medium text-textMain mb-1">暂无积分流水</h3>
              <p className="text-sm text-textMuted max-w-[240px]">
                开始使用 AI 功能后，这里将显示您的积分变动记录
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {rows.map((row) => (
                <TransactionRow key={row.id} row={row} />
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {rows.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-surfaceHighlight/20 flex items-center justify-between">
            <span className="text-xs text-textMuted">最近 50 条记录</span>
            <div className="flex items-center gap-1 text-xs text-textMuted">
              <span>查看更多</span>
              <ChevronRight size={12} />
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
      `}</style>
    </>
  );
}
