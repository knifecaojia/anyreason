// Task statuses including video slot queue lifecycle:
// - queued: Initial state, waiting to be picked up by worker
// - queued_for_slot: Waiting in FIFO queue for API key capacity
// - running: Actively processing (non-two-phase handlers)
// - submitting: Submitting to external provider after slot acquisition
// - waiting_external: Waiting for external provider to complete generation
// - succeeded/failed/canceled: Terminal states
export type TaskStatus =
  | "queued"
  | "queued_for_slot"
  | "running"
  | "submitting"
  | "waiting_external"
  | "succeeded"
  | "failed"
  | "canceled";

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
  // Queue metadata for video slot queue lifecycle
  // Only populated when status is "queued_for_slot"
  queue_position?: number | null;
  queued_at?: string | null;
  // Slot owner metadata for tracking which task owns which slot
  // Populated when task has acquired a slot or is submitting
  slot_owner_token?: string | null;
  slot_config_id?: string | null;
  slot_acquired_at?: string | null;
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
