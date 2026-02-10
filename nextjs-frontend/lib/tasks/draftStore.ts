export type DraftEnvelope<TDraft> = {
  tool_key: string;
  entity_type: string;
  entity_id: string;
  task_id: string;
  task_updated_at?: string;
  draft_json: TDraft;
  ui_state?: Record<string, unknown>;
};

export function makeDraftKey(params: { tool_key: string; entity_type: string; entity_id: string }) {
  return `draft:${params.tool_key}:${params.entity_type}:${params.entity_id}`;
}

export function loadDraft<TDraft>(key: string): DraftEnvelope<TDraft> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as DraftEnvelope<TDraft>;
  } catch {
    return null;
  }
}

export function saveDraft<TDraft>(key: string, value: DraftEnvelope<TDraft>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function deleteDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

