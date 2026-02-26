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
  if (typeof window === "undefined") return "";

  // 优先从环境变量读取后端地址，与 API route 的 getApiBaseUrl() 保持一致
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBase) {
    try {
      const u = new URL(apiBase);
      const protocol = u.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${u.host}/ws/tasks?ticket=${encodeURIComponent(ticket)}`;
    } catch {
      // fall through to location-based detection
    }
  }

  // Fallback：基于当前页面 origin 构建 WebSocket URL
  const loc = window.location;
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${loc.host}/ws/tasks?ticket=${encodeURIComponent(ticket)}`;
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
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const listenersByTaskIdRef = useRef<Map<string, Set<(ev: TaskEventPayload) => void>>>(new Map());

  // Use a ref to store the connect function to avoid dependency cycles in useEffect
  const connectRef = useRef<(() => Promise<void>) | null>(null);

  const upsertTask = useCallback((task: Task) => {
    setTasksById((prev) => ({ ...prev, [task.id]: task }));
  }, []);
  
  // Define refreshTasks...
  const refreshTasks = useCallback(async (opts?: { status?: TaskStatus[]; page?: number; size?: number }) => {
    // ... (same implementation)
    const page = opts?.page && opts.page > 0 ? String(opts.page) : "1";
    const size = opts?.size && opts.size > 0 ? String(opts.size) : "50";
    const params = new URLSearchParams();
    params.set("page", page);
    params.set("size", size);
    if (opts?.status?.length) {
      params.set("status", opts.status.join(","));
    }
    
    try {
        const res = await fetch(`/api/tasks?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const items = data?.data?.items || [];
        setTasksById((prev) => {
          const next = { ...prev };
          for (const t of items) next[t.id] = t;
          return next;
        });
        return { items, page: parseInt(page, 10), size: parseInt(size, 10) };
    } catch (e) {
        console.error("refreshTasks error", e);
        return { items: [], page: 1, size: 50 };
    }
  }, []);

  const subscribeTask = useCallback((taskId: string, handler: (ev: TaskEventPayload) => void) => {
    const id = String(taskId || "").trim();
    if (!id) return () => {};
    
    // Store handler
    const map = listenersByTaskIdRef.current;
    if (!map.has(id)) map.set(id, new Set());
    map.get(id)!.add(handler);
    
    return () => {
      const s = map.get(id);
      if (s) {
          s.delete(handler);
          if (s.size === 0) map.delete(id);
      }
    };
  }, []);

  const connect = useCallback(async () => {
    // Prevent multiple connections
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
    
    if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
    }

    try {
      const ticketRes = await fetch("/api/tasks/ws-ticket", {
        method: "POST",
        cache: "no-store"
      });
      if (!ticketRes.ok) return; // Silent fail, will retry
      
      const json = await ticketRes.json();
      const ticket = json?.data?.ticket;
      if (!ticket) return;

      const wsUrl = getWsUrl(ticket);
      console.log("[TaskProvider] Connecting to WebSocket:", wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[TaskProvider] WebSocket connected");
      };

      ws.onerror = (e) => {
        // WebSocket error event is usually generic in browsers for security reasons
        console.error("[TaskProvider] WebSocket error. Check network tab for details.");
      };

      ws.onmessage = async (ev) => {
        let payload: TaskEventPayload | null = null;
        try {
          payload = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!payload?.task_id) return;
        
        console.log("[TaskProvider] Received event:", payload.event_type, payload.task_id);

        const listeners = listenersByTaskIdRef.current.get(payload.task_id);
        if (listeners) {
          listeners.forEach(fn => {
              try { fn(payload!); } catch (e) { console.error(e); }
          });
        }

        // Optimistic update: immediately apply progress/status/error from the WS event
        // so that TaskProgressMonitor reflects changes without waiting for the async refetch.
        if (payload.progress !== undefined || payload.status) {
          setTasksById((prev) => {
            const existing = prev[payload!.task_id];
            if (!existing) return prev;
            return {
              ...prev,
              [payload!.task_id]: {
                ...existing,
                ...(payload!.progress !== undefined ? { progress: payload!.progress } : {}),
                ...(payload!.status ? { status: payload!.status } : {}),
                ...(payload!.error ? { error: payload!.error } : {}),
                // For succeeded events, also write result_json so subscribeTask
                // callbacks can immediately access the result data (e.g. plans).
                ...(payload!.event_type === "succeeded" && payload!.result_json
                  ? { result_json: payload!.result_json }
                  : {}),
              },
            };
          });
        }

        if (shouldRefetchTaskOnEvent(payload.event_type)) {
            // Refetch task details
            try {
                const res = await fetch(`/api/tasks/${payload.task_id}`, { cache: "no-store" });
                if (res.ok) {
                    const json = await res.json();
                    if (json.data) upsertTask(json.data);
                }
            } catch (e) {
                console.error("Refetch task error", e);
            }
        }
      };

      ws.onclose = (ev) => {
        console.log(`[TaskProvider] WebSocket closed: ${ev.code} ${ev.reason}`);
        wsRef.current = null;
        // Reconnect after 3s
        reconnectTimer.current = setTimeout(() => {
            void connectRef.current?.();
        }, 3000);
      };
    } catch (e) {
      console.error("[TaskProvider] Connection failed:", e);
      // Retry after 5s
      reconnectTimer.current = setTimeout(() => {
          void connectRef.current?.();
      }, 5000);
    }
  }, [upsertTask]); // Only depend on stable upsertTask

  // Initial setup
  useEffect(() => {
    connectRef.current = connect;
    
    // Initial fetch
    void refreshTasks({ status: ["queued", "running"] });
    
    // Initial connect
    void connect();

    return () => {
      connectRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
      }
      listenersByTaskIdRef.current.clear();
    };
  }, []); // Run once on mount

  // ... (rest of the component)

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
