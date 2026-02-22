export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type Task = {
  id: string;
  user_id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  entity_type?: string | null;
  entity_id?: string | null;
  input_json?: Record<string, unknown>;
  result_json?: Record<string, unknown>;
  error?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
};

export type TaskEventPayload = {
  user_id: string;
  task_id: string;
  event_type: string;
  status?: TaskStatus;
  progress?: number;
  error?: string;
  payload?: Record<string, unknown>;
  result_json?: Record<string, unknown>;
};
