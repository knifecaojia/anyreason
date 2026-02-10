"use client";

import Link from "next/link";
import { RefreshCcw } from "lucide-react";

import { TASK_TYPES } from "@/lib/tasks/constants";
import type { Task, TaskStatus } from "@/lib/tasks/types";

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

function getContinueHref(t: Task) {
  const input = (t.input_json || {}) as Record<string, unknown>;
  const scriptId = typeof input.script_id === "string" && input.script_id ? input.script_id : null;
  if (!scriptId) return null;

  const to = new URL("/scripts", "http://local");
  to.searchParams.set("mode", "studio");
  to.searchParams.set("seriesId", scriptId);
  to.searchParams.set("taskId", t.id);

  if (t.type === TASK_TYPES.episodeSceneStructurePreview) {
    const episodeId = typeof input.episode_id === "string" && input.episode_id ? input.episode_id : null;
    if (!episodeId) return null;
    to.searchParams.set("episodeId", episodeId);
    to.searchParams.set("tool", "scene-structure");
    return `${to.pathname}?${to.searchParams.toString()}`;
  }

  if (t.type === TASK_TYPES.episodeAssetExtractionPreview) {
    const episodeId = typeof input.episode_id === "string" && input.episode_id ? input.episode_id : null;
    if (!episodeId) return null;
    to.searchParams.set("episodeId", episodeId);
    to.searchParams.set("tool", "asset-extraction");
    return `${to.pathname}?${to.searchParams.toString()}`;
  }

  if (t.type === TASK_TYPES.sceneStoryboardPreview) {
    const sceneId = typeof input.scene_id === "string" && input.scene_id ? input.scene_id : null;
    if (!sceneId) return null;
    if (typeof input.episode_id === "string" && input.episode_id) {
      to.searchParams.set("episodeId", input.episode_id);
    }
    to.searchParams.set("sceneId", sceneId);
    to.searchParams.set("tool", "storyboard");
    return `${to.pathname}?${to.searchParams.toString()}`;
  }

  return null;
}

export function TaskList({
  title,
  tasks,
  onRefresh,
  onCancel,
  onRetry,
  compact,
}: {
  title?: string;
  tasks: Task[];
  onRefresh?: () => void;
  onCancel?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surfaceHighlight/30">
        <div className="text-sm font-bold text-textMain">{title || "任务清单"}</div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              className="p-2 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
              onClick={onRefresh}
              title="刷新"
            >
              <RefreshCcw size={16} />
            </button>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="p-6 text-sm text-textMuted">暂无任务</div>
      ) : (
        <div className="divide-y divide-border">
          {tasks.map((t) => (
            <div key={t.id} className="px-5 py-4 hover:bg-surfaceHighlight/40 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-textMain truncate">{t.type}</div>
                    <div className={`text-xs font-semibold ${statusColor(t.status)}`}>{statusLabel(t.status)}</div>
                    {t.entity_type && t.entity_id && (
                      <div className="text-[10px] text-textMuted/70 tabular-nums">
                        {t.entity_type}:{t.entity_id.slice(0, 8)}
                      </div>
                    )}
                  </div>
                  {!compact && (
                    <div className="mt-1 text-xs text-textMuted tabular-nums">
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-xs text-textMuted tabular-nums w-10 text-right">{t.progress}%</div>
                  {(() => {
                    const href = getContinueHref(t);
                    if (!href) return null;
                    if (t.status !== "succeeded") return null;
                    return (
                      <Link
                        href={href}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-xs font-bold text-primary hover:border-primary/50 hover:bg-primary/15 transition-colors"
                      >
                        继续
                      </Link>
                    );
                  })()}
                  {onCancel && (t.status === "queued" || t.status === "running") && (
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-bold text-textMuted hover:text-red-300 hover:border-red-500/40 transition-colors"
                      onClick={() => onCancel(t.id)}
                    >
                      取消
                    </button>
                  )}
                  {onRetry && (t.status === "failed" || t.status === "canceled") && (
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-bold text-textMuted hover:text-primary hover:border-primary/40 transition-colors"
                      onClick={() => onRetry(t.id)}
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 h-1.5 bg-background/60 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    t.status === "failed"
                      ? "bg-red-500"
                      : t.status === "succeeded"
                        ? "bg-green-500"
                        : t.status === "canceled"
                          ? "bg-textMuted/40"
                          : "bg-primary"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, t.progress || 0))}%` }}
                />
              </div>

              {t.error && <div className="mt-2 text-xs text-red-400 line-clamp-2">{t.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function filterTasks(tasks: Task[], filter: "all" | "active" | TaskStatus) {
  if (filter === "all") return tasks;
  if (filter === "active") return tasks.filter((t) => t.status === "queued" || t.status === "running");
  return tasks.filter((t) => t.status === filter);
}
