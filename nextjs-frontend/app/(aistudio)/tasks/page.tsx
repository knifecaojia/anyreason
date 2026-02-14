"use client";

import { useEffect, useMemo, useState } from "react";
import { ListTodo } from "lucide-react";

import { useTasks } from "@/components/tasks/TaskProvider";
import { TaskList, filterTasks } from "@/components/tasks/TaskList";
import type { Task, TaskStatus } from "@/lib/tasks/types";

type Filter = "all" | "active" | TaskStatus;

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`px-4 py-2 rounded-xl border text-xs font-bold transition-colors ${
        active
          ? "bg-primary/15 border-primary/40 text-primary"
          : "bg-surface border-border text-textMuted hover:text-textMain hover:bg-surfaceHighlight"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function Page() {
  const { tasks, refreshTasks, upsertTask } = useTasks();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 50;

  const visible = useMemo(() => {
    return filterTasks(tasks, filter);
  }, [filter, tasks]);

  const refresh = async (opts?: { page?: number }) => {
    setBusy(true);
    try {
      const nextPage = opts?.page && opts.page > 0 ? opts.page : 1;
      let res: { items: Task[]; page: number; size: number };
      if (filter === "active") res = await refreshTasks({ status: ["queued", "running"], page: nextPage, size: pageSize });
      else if (filter === "all") res = await refreshTasks({ page: nextPage, size: pageSize });
      else res = await refreshTasks({ status: [filter], page: nextPage, size: pageSize });
      if (nextPage === 1) {
        setPage(1);
        setHasMore(res.items.length >= pageSize);
      } else {
        setPage(nextPage);
        if (res.items.length < pageSize) setHasMore(false);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setHasMore(true);
    void refresh({ page: 1 });
  }, [filter]);

  const cancelTask = async (taskId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      try {
        const body = (await res.json()) as { data?: Task };
        if (body?.data) upsertTask(body.data);
      } catch {
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const retryTask = async (taskId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/retry`, { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      try {
        const body = (await res.json()) as { data?: Task };
        if (body?.data) upsertTask(body.data);
      } catch {
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
              <ListTodo size={18} />
            </div>
            <h2 className="text-2xl font-bold text-textMain tracking-tight">任务清单</h2>
          </div>
          <p className="text-textMuted mt-2 text-sm">这里展示你的异步任务执行状态与结果。</p>
        </div>

        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-surface border border-border text-xs font-bold text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? "处理中..." : "刷新"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterButton active={filter === "active"} label="进行中" onClick={() => setFilter("active")} />
        <FilterButton active={filter === "all"} label="全部" onClick={() => setFilter("all")} />
        <FilterButton active={filter === "queued"} label="排队中" onClick={() => setFilter("queued")} />
        <FilterButton active={filter === "running"} label="执行中" onClick={() => setFilter("running")} />
        <FilterButton active={filter === "succeeded"} label="已完成" onClick={() => setFilter("succeeded")} />
        <FilterButton active={filter === "failed"} label="失败" onClick={() => setFilter("failed")} />
        <FilterButton active={filter === "canceled"} label="已取消" onClick={() => setFilter("canceled")} />
      </div>

      <TaskList
        title={filter === "all" ? "全部任务" : filter === "active" ? "进行中任务" : "筛选结果"}
        tasks={visible}
        onRefresh={() => void refresh()}
        onCancel={(id) => void cancelTask(id)}
        onRetry={(id) => void retryTask(id)}
      />

      <div className="flex items-center justify-center">
        <button
          type="button"
          disabled={busy || !hasMore}
          onClick={() => void refresh({ page: page + 1 })}
          className="px-4 py-2 rounded-xl bg-surface border border-border text-xs font-bold text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors disabled:opacity-50"
        >
          {!hasMore ? "没有更多了" : busy ? "加载中..." : "加载更多"}
        </button>
      </div>
    </div>
  );
}
