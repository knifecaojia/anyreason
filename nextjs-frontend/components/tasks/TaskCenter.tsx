"use client";

import { useMemo, useState } from "react";
import { Bell, RefreshCcw, X } from "lucide-react";

import { useTasks } from "@/components/tasks/TaskProvider";
import type { Task } from "@/lib/tasks/types";

function statusLabel(status: Task["status"]) {
  if (status === "queued") return "排队中";
  if (status === "running") return "执行中";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  if (status === "canceled") return "已取消";
  return status;
}

function statusColor(status: Task["status"]) {
  if (status === "running") return "text-blue-400";
  if (status === "queued") return "text-yellow-400";
  if (status === "succeeded") return "text-green-400";
  if (status === "failed") return "text-red-400";
  return "text-textMuted";
}

export function TaskCenter() {
  const { tasks, refreshTasks } = useTasks();
  const [open, setOpen] = useState(false);

  const activeCount = useMemo(() => {
    return tasks.filter((t) => t.status === "queued" || t.status === "running").length;
  }, [tasks]);

  return (
    <div className="relative">
      <button
        type="button"
        className="relative text-textMuted hover:text-textMain transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} />
        {activeCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[420px] max-w-[90vw] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold text-textMain">任务中心</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-2 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
                onClick={() => void refreshTasks({ status: ["queued", "running"] })}
                title="刷新"
              >
                <RefreshCcw size={16} />
              </button>
              <button
                type="button"
                className="p-2 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
                onClick={() => setOpen(false)}
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto">
            {tasks.length === 0 ? (
              <div className="p-6 text-sm text-textMuted">暂无任务</div>
            ) : (
              <div className="divide-y divide-border">
                {tasks.slice(0, 50).map((t) => (
                  <div key={t.id} className="px-4 py-3 hover:bg-surfaceHighlight/60 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-textMain truncate">{t.type}</div>
                        <div className={`text-xs ${statusColor(t.status)}`}>{statusLabel(t.status)}</div>
                      </div>
                      <div className="text-xs text-textMuted tabular-nums">{t.progress}%</div>
                    </div>
                    <div className="mt-2 h-1.5 bg-background/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${t.status === "failed" ? "bg-red-500" : t.status === "succeeded" ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${Math.max(0, Math.min(100, t.progress || 0))}%` }}
                      />
                    </div>
                    {t.error && <div className="mt-2 text-xs text-red-400 line-clamp-2">{t.error}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
