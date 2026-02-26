"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { Task, TaskEventPayload, TaskStatus } from "@/lib/tasks/types";

type TaskContextValue = {
  tasks: Task[];
  upsertTask: (task: Task) => void;
  refreshTasks: (opts?: { status?: TaskStatus[]; page?: number; size?: number }) => Promise<{ items: Task[]; page: number; size: number }>;
  subscribeTask: (taskId: string, handler: (ev: TaskEventPayload) => void) => () => void;
};

const TaskContext = createContext<TaskContextValue | null>(null);

export function shouldRefetchTaskOnEvent(eventType: string) {
  return (
    eventType === "created" ||
    eventType === "running" ||
    eventType === "progress" ||
    eventType === "succeeded" ||
    eventType === "failed" ||
    eventType === "canceled" ||
    eventType === "retried"
  );
}

function getWsUrl(ticket: string) {
  // 浏览器端：基于当前页面 origin 构建 WebSocket URL，自动适配 HTTP/HTTPS
  const loc = typeof window !== "undefined" ? window.location : undefined;
  const protocol = loc?.protocol === "https:" ? "wss:" : "ws:";
  const host = loc?.host || "localhost:8000";
  return `${protocol}//${host}/ws/tasks?ticket=${encodeURIComponent(ticket)}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as T;
}

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [tasksById, setTasksById] = useState<Record<string, Task>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const listenersByTaskIdRef = useRef<Map<string, Set<(ev: TaskEventPayload) => void>>>(new Map());

  const upsertTask = useCallback((task: Task) => {
    setTasksById((prev) => ({ ...prev, [task.id]: task }));
  }, []);

  const refreshTasks = useCallback(async (opts?: { status?: TaskStatus[]; page?: number; size?: number }) => {
    const page = opts?.page && opts.page > 0 ? String(opts.page) : "1";
    const size = opts?.size && opts.size > 0 ? String(opts.size) : "50";
    const params = new URLSearchParams();
    params.set("page", page);
    params.set("size", size);
    if (opts?.status?.length) {
      params.set("status", opts.status.join(","));
    }
    const data = await fetchJson<{ data?: { items?: Task[] } }>(`/api/tasks?${params.toString()}`);
    const items = data?.data?.items || [];
    setTasksById((prev) => {
      const next = { ...prev };
      for (const t of items) next[t.id] = t;
      return next;
    });
    return { items, page: parseInt(page, 10), size: parseInt(size, 10) };
  }, []);

  const subscribeTask = useCallback((taskId: string, handler: (ev: TaskEventPayload) => void) => {
    const id = String(taskId || "").trim();
    if (!id) return () => {};
    const map = listenersByTaskIdRef.current;
    const set = map.get(id) || new Set();
    set.add(handler);
    map.set(id, set);
    return () => {
      const s = map.get(id);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) map.delete(id);
    };
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current) return;
    const ticketRes = await fetchJson<{ data?: { ticket: string } }>("/api/tasks/ws-ticket", {
      method: "POST",
    });
    const ticket = ticketRes?.data?.ticket;
    if (!ticket) return;

    const ws = new WebSocket(getWsUrl(ticket));
    wsRef.current = ws;

    ws.onmessage = async (ev) => {
      let payload: TaskEventPayload | null = null;
      try {
        payload = JSON.parse(String(ev.data));
      } catch {
        payload = null;
      }
      if (!payload?.task_id) return;

      const listeners = listenersByTaskIdRef.current.get(payload.task_id);
      if (listeners && listeners.size) {
        for (const fn of listeners) {
          try {
            fn(payload);
          } catch {
            continue;
          }
        }
      }

      if (shouldRefetchTaskOnEvent(payload.event_type)) {
        try {
          const res = await fetchJson<{ data?: Task }>(`/api/tasks/${payload.task_id}`);
          if (res?.data) upsertTask(res.data);
        } catch {
          return;
        }
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(() => void connectRef.current?.(), 1000);
    };
  }, [upsertTask]);

  useEffect(() => {
    connectRef.current = connect;
    void refreshTasks({ status: ["queued", "running"] });
    void connect();
    return () => {
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      wsRef.current?.close();
      wsRef.current = null;
      connectRef.current = null;
      listenersByTaskIdRef.current.clear();
    };
  }, [connect, refreshTasks]);

  const tasks = useMemo(() => {
    return Object.values(tasksById).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [tasksById]);

  const value = useMemo<TaskContextValue>(
    () => ({ tasks, upsertTask, refreshTasks, subscribeTask }),
    [refreshTasks, subscribeTask, tasks, upsertTask]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) {
    throw new Error("useTasks must be used within TaskProvider");
  }
  return ctx;
}
