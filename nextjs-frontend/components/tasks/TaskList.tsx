"use client";

import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  if (t.type === TASK_TYPES.aiSceneTestChat) {
    const to = new URL("/ai-scenes", "http://local");
    to.searchParams.set("chatTaskId", t.id);
    to.searchParams.set("openChat", "1");
    return `${to.pathname}?${to.searchParams.toString()}`;
  }

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
  const [logOpen, setLogOpen] = useState(false);
  const [logTaskId, setLogTaskId] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [events, setEvents] = useState<
    Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: string }>
  >([]);

  useEffect(() => {
    if (!logOpen || !logTaskId) return;
    let cancelled = false;
    setLogLoading(true);
    setLogError(null);
    (async () => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(logTaskId)}/events?order=asc&limit=200`, { cache: "no-store" });
      if (!res.ok) {
        if (cancelled) return;
        setLogError(await res.text());
        setEvents([]);
        setLogLoading(false);
        return;
      }
      const json = (await res.json()) as { data?: Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: string }> };
      if (cancelled) return;
      setEvents(Array.isArray(json.data) ? json.data : []);
      setLogLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [logOpen, logTaskId]);

  const groupedText = useMemo(() => {
    return events
      .map((e) => {
        const ts = e.created_at ? new Date(e.created_at).toLocaleString() : "";
        if (e.event_type === "log") {
          const level = typeof e.payload?.level === "string" ? e.payload.level : "info";
          const message = typeof e.payload?.message === "string" ? e.payload.message : "";
          return `[${ts}] [${level}] ${message}`;
        }
        if (e.event_type === "failed") {
          const error = typeof e.payload?.error === "string" ? e.payload.error : "";
          const details = (e.payload?.details || {}) as Record<string, unknown>;
          const tb = typeof details.traceback === "string" ? details.traceback : "";
          return [`[${ts}] [failed] ${error}`, tb ? tb : ""].filter(Boolean).join("\n");
        }
        if (e.event_type === "progress") {
          const p = typeof e.payload?.progress === "number" ? e.payload.progress : "";
          return `[${ts}] [progress] ${p}%`;
        }
        return `[${ts}] [${e.event_type}]`;
      })
      .join("\n");
  }, [events]);

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
                    if (t.type !== TASK_TYPES.aiSceneTestChat && t.status !== "succeeded") return null;
                    return (
                      <Link
                        href={href}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-xs font-bold text-primary hover:border-primary/50 hover:bg-primary/15 transition-colors"
                      >
                        {t.type === TASK_TYPES.aiSceneTestChat ? "查看" : "继续"}
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
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-bold text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
                    onClick={() => {
                      setLogTaskId(t.id);
                      setLogOpen(true);
                    }}
                  >
                    日志
                  </button>
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

      {logOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
            <div className="h-12 px-4 border-b border-border flex items-center justify-between">
              <div className="font-bold text-sm truncate">任务日志 {logTaskId ? `(${logTaskId.slice(0, 8)})` : ""}</div>
              <button
                onClick={() => {
                  setLogOpen(false);
                  setLogTaskId(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                type="button"
              >
                关闭
              </button>
            </div>
            <div className="p-4">
              {logError && <div className="mb-3 text-xs text-red-400 whitespace-pre-wrap">{logError}</div>}
              {logLoading ? (
                <div className="text-sm text-textMuted">加载中...</div>
              ) : events.length === 0 ? (
                <div className="text-sm text-textMuted">暂无日志</div>
              ) : (
                <pre className="text-xs leading-relaxed whitespace-pre-wrap bg-background/40 border border-border rounded-xl p-4 max-h-[70vh] overflow-y-auto">
                  {groupedText}
                </pre>
              )}
            </div>
          </div>
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
