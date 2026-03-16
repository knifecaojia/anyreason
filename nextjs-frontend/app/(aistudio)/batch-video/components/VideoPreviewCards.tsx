"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  BatchVideoPreviewCard,
  BatchVideoPreviewTask,
  BatchVideoStopTaskResponse,
  BatchVideoTaskActionResponse,
} from "../types";

type Props = {
  cards: BatchVideoPreviewCard[];
  onReload: () => Promise<void>;
};

function getStatusLabel(status?: string | null) {
  switch (status) {
    case "queued":
      return "等待中";
    case "running":
      return "处理中";
    case "waiting_external":
      return "云端生成中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "canceled":
      return "已停止";
    default:
      return "未开始";
  }
}

function getStatusClass(status?: string | null) {
  switch (status) {
    case "succeeded":
      return "bg-green-100 text-green-700";
    case "failed":
      return "bg-red-100 text-red-700";
    case "canceled":
      return "bg-gray-200 text-gray-700";
    case "waiting_external":
      return "bg-purple-100 text-purple-700";
    case "running":
    case "queued":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function canStop(task?: BatchVideoPreviewTask | null) {
  return task && ["queued", "running", "waiting_external"].includes(task.status);
}

function canRetry(task?: BatchVideoPreviewTask | null) {
  return task && ["failed", "canceled"].includes(task.status);
}

export function VideoPreviewCards({ cards, onReload }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [imageFallbacks, setImageFallbacks] = useState<Record<string, boolean>>({});

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => a.index - b.index),
    [cards]
  );

  const handleStop = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch(`/api/batch-video/tasks/${taskId}/stop`, { method: "POST" });
      const result = (await response.json()) as { code: number; msg?: string; data?: BatchVideoStopTaskResponse };
      if (!response.ok || result.code !== 200 || !result.data) {
        throw new Error(result.msg || "停止任务失败");
      }
      if (result.data.external_cancel.attempted && !result.data.external_cancel.supported) {
        toast.success("已停止本地任务跟踪，云端任务可能仍继续执行");
      } else {
        toast.success("任务已停止");
      }
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "停止任务失败");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleRetry = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch(`/api/batch-video/tasks/${taskId}/retry`, { method: "POST" });
      const result = (await response.json()) as { code: number; msg?: string; data?: BatchVideoTaskActionResponse };
      if (!response.ok || result.code !== 200 || !result.data) {
        throw new Error(result.msg || "重试任务失败");
      }
      toast.success("已创建新的重试任务");
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重试任务失败");
    } finally {
      setBusyTaskId(null);
    }
  };

  if (!sortedCards.length) {
    return (
      <div className="rounded-xl border border-border bg-background p-6 text-sm text-textMuted">
        暂无生成历史。选中 cards 后点击“生成视频”，任务会出现在这里。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedCards.map((card) => {
        const task = card.latest_task;
        const isExpanded = expanded[card.asset_id] ?? false;
        const isBusy = busyTaskId === task?.task_id;

        return (
          <div key={card.asset_id} className="rounded-xl border border-border bg-background overflow-hidden">
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-textMuted">#{card.index + 1}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusClass(task?.status)}`}>
                      {getStatusLabel(task?.status)}
                    </span>
                    {task?.progress != null && task.status !== "succeeded" && (
                      <span className="text-xs text-textMuted">{task.progress}%</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-md border border-border text-textMuted hover:text-textMain"
                    onClick={() => setExpanded((prev) => ({ ...prev, [card.asset_id]: !isExpanded }))}
                  >
                    {isExpanded ? "收起任务历史" : "展开任务历史"}
                  </button>
                  {canRetry(task) && task?.task_id && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs rounded-md bg-primary text-white disabled:opacity-50"
                      disabled={isBusy}
                      onClick={() => handleRetry(task.task_id)}
                    >
                      重试
                    </button>
                  )}
                  {canStop(task) && task?.task_id && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs rounded-md border border-red-200 text-red-600 disabled:opacity-50"
                      disabled={isBusy}
                      onClick={() => handleStop(task.task_id)}
                    >
                      停止
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4">
                <div className="rounded-lg overflow-hidden border border-border bg-secondary/30 aspect-video">
                  <img
                    src={imageFallbacks[card.asset_id] ? (card.card_source_url || card.card_thumbnail_url) : card.card_thumbnail_url}
                    alt={card.prompt || `asset-${card.index + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => {
                      if (card.card_source_url && card.card_source_url !== card.card_thumbnail_url) {
                        setImageFallbacks((prev) => ({ ...prev, [card.asset_id]: true }));
                      }
                    }}
                  />
                </div>

                <div className="space-y-3 min-w-0">
                  <div>
                    <div className="text-xs text-textMuted mb-1">提示词</div>
                    <p className="text-sm text-textMain whitespace-pre-wrap break-words">{card.prompt || "暂无提示词"}</p>
                  </div>

                  <div>
                    <div className="text-xs text-textMuted mb-1">视频预览</div>
                    {card.latest_success?.result_url ? (
                      <video controls className="w-full rounded-lg border border-border bg-black" src={card.latest_success.result_url} />
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-6 text-sm text-textMuted min-h-[140px] flex items-center justify-center text-center">
                        {task?.status === "waiting_external"
                          ? "云端生成中"
                          : task?.status === "running" || task?.status === "queued"
                            ? "任务处理中"
                            : task?.status === "failed"
                              ? task.error_message || "任务失败，可重试"
                              : task?.status === "canceled"
                                ? "任务已停止"
                                : "暂无视频结果"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {task && task.status !== "succeeded" && (
                <div>
                  <div className="flex items-center justify-between text-xs text-textMuted mb-1">
                    <span>进度</span>
                    <span>{task.progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
              )}
            </div>

            {isExpanded && (
              <div className="border-t border-border bg-secondary/10 divide-y divide-border">
                {/* 排除 latest_task，避免与主区域状态重复显示 */}
                {card.history
                  .filter((item) => item.task_id !== card.latest_task?.task_id)
                  .map((item) => (
                  <div key={item.task_id} className="px-4 py-3">
                    {/* 任务信息头部 */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <div className="text-sm text-textMain">{item.task_id}</div>
                        <div className="text-xs text-textMuted mt-1">
                          {new Date(item.created_at).toLocaleString()}
                          {item.external_task_id ? ` · 外部任务 ${item.external_task_id}` : ""}
                        </div>
                        {item.error_message && <div className="text-xs text-red-500 mt-1">{item.error_message}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`inline-flex px-2 py-0.5 text-xs rounded-full ${getStatusClass(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </div>
                        <div className="text-xs text-textMuted mt-1">{item.progress}%</div>
                        <div className="mt-2 flex items-center justify-end gap-2">
                          {canRetry(item) && (
                            <button
                              type="button"
                              className="px-2 py-1 text-xs rounded-md bg-primary text-white disabled:opacity-50"
                              disabled={busyTaskId === item.task_id}
                              onClick={() => handleRetry(item.task_id)}
                            >
                              重试
                            </button>
                          )}
                          {canStop(item) && (
                            <button
                              type="button"
                              className="px-2 py-1 text-xs rounded-md border border-red-200 text-red-600 disabled:opacity-50"
                              disabled={busyTaskId === item.task_id}
                              onClick={() => handleStop(item.task_id)}
                            >
                              停止
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 该任务生成的视频 - 避免与主区域重复显示 */}
                    {item.status === "succeeded" ? (
                      // 成功的任务视频已在主区域显示，这里只显示提示
                      <div className="mt-3 text-xs text-textMuted">
                        视频已在上方预览区显示
                      </div>
                    ) : item.result_url ? (
                      // 非成功状态但有视频（异常情况）
                      <div className="mt-3">
                        <div className="text-xs text-textMuted mb-1">该任务生成的视频</div>
                        <video 
                          controls 
                          className="w-full max-w-md rounded-lg border border-border bg-black" 
                          src={item.result_url} 
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
