"use client";

import { RefreshCw } from "lucide-react";

export function AuditSection(props: {
  rbacError: string | null;
  rbacLoading: boolean;
  auditLogs: any[];
  onRefresh: () => void;
  auditTotal: number;
  auditOffset: number;
  setAuditOffset: (value: number) => void;
}) {
  const { rbacError, rbacLoading, auditLogs, onRefresh, auditTotal, auditOffset, setAuditOffset } = props;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">系统审计日志</h2>
          <p className="text-textMuted text-sm">记录关键管理操作，用于追溯与排障。</p>
        </div>
        <button
          onClick={onRefresh}
          className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          type="button"
        >
          <RefreshCw size={16} /> 刷新
        </button>
      </div>

      {rbacError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{rbacError}</div>}

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
            <tr>
              <th className="px-6 py-4">时间</th>
              <th className="px-6 py-4">动作</th>
              <th className="px-6 py-4">资源</th>
              <th className="px-6 py-4">操作者</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4">Request</th>
              <th className="px-6 py-4">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rbacLoading && auditLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-6 text-textMuted">
                  加载中...
                </td>
              </tr>
            )}
            {!rbacLoading && auditLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-6 text-textMuted">
                  暂无审计记录
                </td>
              </tr>
            )}
            {auditLogs.map((row) => (
              <tr key={row.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                <td className="px-6 py-4 text-xs text-textMuted font-mono">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-6 py-4 font-mono text-xs text-textMain">{row.action}</td>
                <td className="px-6 py-4 text-xs text-textMuted font-mono">
                  {(row.resource_type || "-") + (row.resource_id ? `:${row.resource_id.slice(0, 8)}` : "")}
                </td>
                <td className="px-6 py-4 text-xs text-textMuted font-mono">{row.actor_user_id ? row.actor_user_id.slice(0, 8) : "-"}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                      row.success ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${row.success ? "bg-green-400" : "bg-red-400"}`} />
                    {row.success ? "SUCCESS" : "FAILED"}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-textMuted font-mono">{row.request_id || "-"}</td>
                <td className="px-6 py-4 text-xs text-textMuted font-mono">{row.ip || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-textMuted">
        <div>
          共 <span className="text-textMain font-medium">{auditTotal}</span> 条
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAuditOffset(Math.max(0, auditOffset - 50))}
            disabled={auditOffset === 0}
            className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg disabled:opacity-50"
            type="button"
          >
            上一页
          </button>
          <button
            onClick={() => setAuditOffset(auditOffset + 50)}
            disabled={auditOffset + 50 >= auditTotal}
            className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg disabled:opacity-50"
            type="button"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
