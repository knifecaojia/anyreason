"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, CircleDashed, Cloud, Loader2, XCircle, ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTasks } from "@/components/tasks/TaskProvider";
import type { Task } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

interface TaskProgressMonitorProps {
  taskId: string;
  title?: string;
  onComplete?: (task: Task) => void;
  className?: string;
  showLogs?: boolean;
}

export function TaskProgressMonitor({ taskId, title = "AI 处理中", onComplete, className, showLogs = true }: TaskProgressMonitorProps) {
  const { tasks, subscribeTask } = useTasks();
  const [logs, setLogs] = useState<{ message: string; time: string; level: string }[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // 获取当前任务状态
  const task = tasks.find((t) => t.id === taskId);
  const status = task?.status || "queued";
  const progress = task?.progress || 0;

  // 监听任务事件
  useEffect(() => {
    if (!taskId) return;

    console.log("[TaskProgressMonitor] Subscribing to task:", taskId);
    const unsubscribe = subscribeTask(taskId, (event) => {
      console.log("[TaskProgressMonitor] Event received:", event.event_type, event.payload);
      // 处理日志事件
      if (event.event_type === "log" && event.payload) {
        const payload = event.payload as any;
        setLogs((prev) => [
          ...prev,
          {
            message: payload.message || "",
            level: payload.level || "info",
            time: new Date().toLocaleTimeString(),
          },
        ]);
        // 自动滚动到底部
        if (isLogsOpen) {
          setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      }

      // 处理完成事件
      if (event.event_type === "succeeded" || event.event_type === "failed") {
        if (task && onComplete) {
           onComplete(task);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [taskId, subscribeTask, onComplete, task, isLogsOpen]);

  const effectiveStatus = task?.status || "queued";
  const effectiveProgress = task?.progress || 0;
  const effectiveError = task?.error;

  // 渲染状态图标
  const renderIcon = () => {
    switch (effectiveStatus) {
      case "queued":
        return <CircleDashed className="h-5 w-5 text-yellow-500 animate-pulse" />;
      case "running":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case "waiting_external":
        return <Cloud className="h-5 w-5 text-purple-500 animate-pulse" />;
      case "succeeded":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <CircleDashed className="h-5 w-5 text-gray-400" />;
    }
  };

  // 渲染进度条颜色
  const progressColor = effectiveStatus === "failed" ? "bg-red-500" : effectiveStatus === "succeeded" ? "bg-green-500" : effectiveStatus === "waiting_external" ? "bg-purple-500" : "bg-blue-500";

  return (
    <div className={cn("rounded-xl border border-border bg-surface/50 p-4 shadow-sm transition-all", className)}>
      {/* 头部：标题与状态 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {renderIcon()}
          <div>
            <h4 className="text-sm font-medium text-textMain">{title}</h4>
            <p className="text-xs text-textMuted mt-0.5">
              {effectiveStatus === "queued" && "排队等待中..."}
              {effectiveStatus === "running" && `正在执行... ${effectiveProgress}%`}
              {effectiveStatus === "waiting_external" && "云端生成中，请耐心等待..."}
              {effectiveStatus === "succeeded" && "执行完成"}
              {effectiveStatus === "failed" && "执行失败"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-textMain tabular-nums">{effectiveProgress}%</span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-2 w-full bg-surfaceHighlight rounded-full overflow-hidden mb-3">
        <div
          className={cn("h-full transition-all duration-500 ease-out", progressColor)}
          style={{ width: `${Math.max(5, effectiveProgress)}%` }}
        />
      </div>

      {/* 错误信息 */}
      {effectiveError && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          {effectiveError}
        </div>
      )}

      {/* 日志区域 (可折叠) */}
      {showLogs && (
        <div className="mt-2">
          <button
            onClick={() => setIsLogsOpen(!isLogsOpen)}
            className="flex items-center gap-1 text-xs text-textMuted hover:text-textMain transition-colors mb-2"
          >
            {isLogsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Terminal size={12} />
            执行日志 ({logs.length})
          </button>
          
          {isLogsOpen && (
            <div className="bg-black/80 rounded-lg p-2 font-mono text-xs border border-white/10">
              <ScrollArea className="h-[120px] w-full">
                <div className="space-y-1">
                  {logs.length === 0 && <div className="text-gray-500 italic">暂无日志...</div>}
                  {logs.slice(-50).map((log, i) => (
                    <div key={i} className="flex gap-2 text-gray-300">
                      <span className="text-gray-600 select-none">[{log.time}]</span>
                      <span className={cn(log.level === "error" ? "text-red-400" : "text-gray-300")}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
