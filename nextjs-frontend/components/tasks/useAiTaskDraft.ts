"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTasks } from "@/components/tasks/TaskProvider";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { deleteDraft, loadDraft, makeDraftKey, saveDraft } from "@/lib/tasks/draftStore";

type CreateTaskPayload = {
  type: string;
  entity_type: string;
  entity_id: string;
  input_json: Record<string, unknown>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export type AiTaskDraftState<TDraft> = {
  draft: TDraft | null;
  setDraft: (updater: TDraft | ((prev: TDraft | null) => TDraft | null)) => void;
  clearDraft: () => void;
  taskId: string | null;
  status: TaskStatus | null;
  progress: number;
  locked: boolean;
  error: string | null;
  createTask: () => Promise<string>;
  resume: () => Promise<void>;
};

export function useAiTaskDraft<TDraft>(opts: {
  toolKey: string;
  taskType: string;
  entityType: string;
  entityId: string | null;
  preferredTaskId?: string | null;
  buildInputJson: () => Record<string, unknown>;
  mapResultToDraft: (resultJson: Record<string, unknown>) => TDraft;
}) : AiTaskDraftState<TDraft> {
  const { tasks, refreshTasks } = useTasks();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, _setDraft] = useState<TDraft | null>(null);

  const mapResultToDraftRef = useRef(opts.mapResultToDraft);
  const buildInputJsonRef = useRef(opts.buildInputJson);
  const preferredTaskIdRef = useRef(opts.preferredTaskId || null);

  useEffect(() => {
    mapResultToDraftRef.current = opts.mapResultToDraft;
  }, [opts.mapResultToDraft]);

  useEffect(() => {
    buildInputJsonRef.current = opts.buildInputJson;
  }, [opts.buildInputJson]);

  useEffect(() => {
    preferredTaskIdRef.current = opts.preferredTaskId || null;
  }, [opts.preferredTaskId]);

  const draftKey = useMemo(() => {
    if (!opts.entityId) return null;
    return makeDraftKey({ tool_key: opts.toolKey, entity_type: opts.entityType, entity_id: opts.entityId });
  }, [opts.entityId, opts.entityType, opts.toolKey]);

  const isInScope = useCallback(
    (t: Task) => {
      if (!opts.entityId) return false;
      return t.type === opts.taskType && t.entity_type === opts.entityType && t.entity_id === opts.entityId;
    },
    [opts.entityId, opts.entityType, opts.taskType],
  );

  const locked = useMemo(() => {
    if (!opts.entityId) return false;
    if (status === "queued" || status === "running") return true;
    return tasks.some((t) => isInScope(t) && (t.status === "queued" || t.status === "running"));
  }, [isInScope, opts.entityId, status, tasks]);

  const persistDraft = useCallback(
    (nextDraft: TDraft | null, nextTaskId: string | null, nextTaskUpdatedAt?: string) => {
      if (!draftKey || !opts.entityId) return;
      if (!nextDraft || !nextTaskId) return;
      saveDraft(draftKey, {
        tool_key: opts.toolKey,
        entity_type: opts.entityType,
        entity_id: opts.entityId,
        task_id: nextTaskId,
        task_updated_at: nextTaskUpdatedAt,
        draft_json: nextDraft,
      });
    },
    [draftKey, opts.entityId, opts.entityType, opts.toolKey],
  );

  const setDraft = useCallback(
    (updater: TDraft | ((prev: TDraft | null) => TDraft | null)) => {
      _setDraft((prev) => {
        const next = typeof updater === "function" ? (updater as (p: TDraft | null) => TDraft | null)(prev) : updater;
        persistDraft(next, taskId || null);
        return next;
      });
    },
    [persistDraft, taskId],
  );

  const clearDraft = useCallback(() => {
    _setDraft(null);
    setError(null);
    setTaskId(null);
    setStatus(null);
    setProgress(0);
    if (draftKey) deleteDraft(draftKey);
  }, [draftKey]);

  const applyTaskToState = useCallback(
    (t: Task) => {
      if (!isInScope(t)) return false;
      setTaskId(t.id);
      setStatus(t.status);
      setProgress(t.progress || 0);
      setError(t.error || null);
      if (t.status === "succeeded" && t.result_json) {
        const mapped = mapResultToDraftRef.current(t.result_json as Record<string, unknown>);
        _setDraft(mapped);
        persistDraft(mapped, t.id, t.updated_at);
      }
      return true;
    },
    [isInScope, persistDraft],
  );

  useEffect(() => {
    setError(null);
    setTaskId(null);
    setStatus(null);
    setProgress(0);
    _setDraft(null);
    if (!draftKey) return;
    const saved = loadDraft<TDraft>(draftKey);
    if (saved?.draft_json) _setDraft(saved.draft_json);
    if (saved?.task_id) setTaskId(saved.task_id);
  }, [draftKey]);

  const createTask = useCallback(async () => {
    if (!opts.entityId) throw new Error("missing entityId");
    setError(null);
    setProgress(0);
    const existing = tasks
      .filter((t) => isInScope(t))
      .filter((t) => t.status === "queued" || t.status === "running")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (existing) {
      applyTaskToState(existing);
      return existing.id;
    }
    const payload: CreateTaskPayload = {
      type: opts.taskType,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      input_json: buildInputJsonRef.current(),
    };
    const res = await fetchJson<{ data?: { id: string } }>("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const id = res?.data?.id;
    if (!id) throw new Error("task id missing");
    setTaskId(id);
    setStatus("queued");
    return id;
  }, [applyTaskToState, isInScope, opts, tasks]);

  const resume = useCallback(async () => {
    if (!opts.entityId) return;
    setError(null);

    if (preferredTaskIdRef.current) {
      try {
        const t = await fetchJson<{ data?: Task }>(`/api/tasks/${encodeURIComponent(preferredTaskIdRef.current)}`);
        if (t?.data && applyTaskToState(t.data)) return;
      } catch {
        // ignore
      }
    }

    if (draftKey) {
      const saved = loadDraft<TDraft>(draftKey);
      if (saved?.draft_json) {
        _setDraft(saved.draft_json);
      }
      if (saved?.task_id) {
        setTaskId(saved.task_id);
        try {
          const t = await fetchJson<{ data?: Task }>(`/api/tasks/${encodeURIComponent(saved.task_id)}`);
          if (t?.data && applyTaskToState(t.data)) return;
        } catch {
          // ignore
        }
      }
    }

    try {
      const qs = new URLSearchParams();
      qs.set("page", "1");
      qs.set("size", "10");
      qs.set("status", "queued,running,succeeded");
      qs.set("entity_type", opts.entityType);
      qs.set("entity_id", opts.entityId);
      const list = await fetchJson<{ data?: { items?: Task[] } }>(`/api/tasks?${qs.toString()}`);
      const items = list?.data?.items || [];
      const latest = items.filter((t) => t.type === opts.taskType).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      if (latest && applyTaskToState(latest)) return;
    } catch {
      await refreshTasks({ status: ["queued", "running"] });
    }
    const candidates = tasks
      .filter((t) => isInScope(t))
      .filter((t) => t.status === "queued" || t.status === "running" || t.status === "succeeded")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (candidates[0]) applyTaskToState(candidates[0]);
  }, [applyTaskToState, draftKey, isInScope, opts, refreshTasks, tasks]);

  useEffect(() => {
    if (!taskId) return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    applyTaskToState(t);
  }, [applyTaskToState, taskId, tasks]);

  return { draft, setDraft, clearDraft, taskId, status, progress, locked, error, createTask, resume };
}
