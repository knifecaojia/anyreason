export interface AIChatSession {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  scene_code: string;
  created_at: string;
  updated_at: string;
  messages: AIChatMessage[];
}

export interface AIChatSessionListItem {
  id: string;
  title: string;
  scene_code: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface AIChatSessionListResponse {
  items: AIChatSessionListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  plans: PlanData[] | null;
  trace: TraceEvent[] | null;
  created_at: string;
}

export interface PlanData {
  id: string;
  kind: string;
  tool_id: string;
  inputs: Record<string, unknown>;
  preview?: {
    raw_output_text?: string;
    summary?: string;
    files?: Array<{ name?: string; type?: string }>;
  };
}

export interface TraceEvent {
  type: string;
  [key: string]: unknown;
}

export type SSEventType = 
  | { type: "start"; session_id: string }
  | { type: "delta"; delta: string }
  | { type: "tool_event"; event: TraceEvent }
  | { type: "plans"; plans: PlanData[] }
  | { type: "done"; message_id: string; content: string; plans: PlanData[] | null; trace: TraceEvent[] | null }
  | { type: "error"; message: string };
