"use client";

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { useTasks } from "@/components/tasks/TaskProvider";
import { filterTasks } from "@/components/tasks/TaskList";

export function NotificationCenter() {
  const { tasks, refreshTasks } = useTasks();
  const [open, setOpen] = useState(false);

  const activeCount = useMemo(() => {
    return tasks.filter((t) => t.status === "queued" || t.status === "running").length;
  }, [tasks]);

  const activeTasks = useMemo(() => filterTasks(tasks, "active").slice(0, 8), [tasks]);

  return (
    <div className="relative">
      <button
        type="button"
        className="relative text-textMuted hover:text-textMain transition-colors"
        onClick={() => setOpen((v) => !v)}
        title="系统通知"
      >
        <Bell size={18} />
        {activeCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[420px] max-w-[90vw] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surfaceHighlight/20">
            <div className="text-sm font-semibold text-textMain">系统通知</div>
            <button
              type="button"
              className="text-xs font-bold text-textMuted hover:text-textMain"
              onClick={() => void refreshTasks({ status: ["queued", "running"] })}
            >
              刷新进行中任务
            </button>
          </div>

          <div className="max-h-[420px] overflow-auto">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-textMuted uppercase tracking-wider">任务</div>
                <Link href="/tasks" className="text-xs font-bold text-primary hover:text-blue-400 flex items-center gap-1">
                  查看全部
                  <ChevronRight size={14} />
                </Link>
              </div>
            </div>

            {activeTasks.length === 0 ? (
              <div className="px-4 pb-6 text-sm text-textMuted">暂无进行中任务</div>
            ) : (
              <div className="divide-y divide-border">
                {activeTasks.map((t) => (
                  <div key={t.id} className="px-4 py-3 hover:bg-surfaceHighlight/60 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-textMain truncate">{t.type}</div>
                        <div className="text-xs text-textMuted">{t.status === "queued" ? "排队中" : "执行中"}</div>
                      </div>
                      <div className="text-xs text-textMuted tabular-nums">{t.progress}%</div>
                    </div>
                    <div className="mt-2 h-1.5 bg-background/60 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, t.progress || 0))}%` }} />
                    </div>
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
