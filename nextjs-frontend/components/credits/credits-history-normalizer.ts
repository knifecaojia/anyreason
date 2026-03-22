/**
 * Credit History Normalizer
 * 
 * Transforms raw API responses from the backend into view-ready data
 * for the user-facing credit history display.
 * 
 * Normalization includes:
 * - Deriving trace_type from reason prefix when not provided by backend
 * - Mapping operation types to user-friendly labels
 * - Formatting timestamps
 * - Computing signed delta strings
 * - Classifying transactions into consume/refund/admin-adjust categories
 */

import type {
  CreditTransactionRaw,
  CreditHistoryRow,
  CreditHistoryCategory,
  TraceType,
} from "./credits-history-types";

// =============================================================================
// Operation Display Mapping
// =============================================================================

/**
 * Operation display templates for different trace types.
 * Used when backend doesn't provide operation_display.
 */
const OPERATION_DISPLAY_TEMPLATES: Record<string, string> = {
  "ai.text": "文本生成",
  "ai.image": "图像生成",
  "ai.video": "视频生成",
  "ai": "AI操作",
  "agent": "智能体",
  "admin": "管理员调整",
  "init": "账户初始化",
  "unknown": "积分变动",
};

/**
 * Fallback labels for transaction categories when no meta is available.
 */
const REASON_PREFIX_LABELS: Record<string, string> = {
  "ai.consume": "AI消耗",
  "ai.refund": "AI退款",
  "agent.consume": "智能体消耗",
  "agent.refund": "智能体退款",
  "admin.adjust": "管理员调整",
  "admin.set": "管理员设置",
  "refund": "退款",
};

/**
 * Human-readable operation label for a transaction.
 * Prefers backend-provided operation_display, falls back to local mapping.
 */
export function getOperationLabel(tx: CreditTransactionRaw): string {
  // Use backend-provided display if available
  if (tx.operation_display) {
    return tx.operation_display;
  }

  // Derive from trace_type and category
  const traceType = tx.trace_type || detectTraceType(tx);
  const category = tx.category || detectCategory(tx);

  if (traceType === "ai" && category) {
    const template = OPERATION_DISPLAY_TEMPLATES[`ai.${category}`];
    if (template) {
      const modelDisplay = tx.model_display || tx.meta?.model as string || "";
      return modelDisplay ? `${template}: ${modelDisplay}` : template;
    }
  }

  if (traceType === "agent") {
    const agentName = tx.meta?.agent_name as string || "";
    const template = OPERATION_DISPLAY_TEMPLATES.agent;
    return agentName ? `${template}: ${agentName}` : template;
  }

  if (traceType === "admin") {
    return OPERATION_DISPLAY_TEMPLATES.admin;
  }

  if (traceType === "init") {
    return OPERATION_DISPLAY_TEMPLATES.init;
  }

  // Fallback: use reason prefix mapping
  const reasonLower = tx.reason.toLowerCase();
  for (const [prefix, label] of Object.entries(REASON_PREFIX_LABELS)) {
    if (reasonLower.startsWith(prefix)) {
      return label;
    }
  }

  // Final fallback: humanize reason
  return humanizeReason(tx.reason);
}

// =============================================================================
// Trace Type Detection
// =============================================================================

/**
 * Detects trace type from transaction metadata when not provided by backend.
 * Used for backward compatibility with legacy transactions.
 */
export function detectTraceType(tx: CreditTransactionRaw): TraceType {
  // Use backend-provided value if available
  if (tx.trace_type) {
    return normalizeTraceType(tx.trace_type);
  }

  // Derive from reason prefix
  const reasonLower = tx.reason.toLowerCase();
  if (reasonLower.startsWith("ai.")) return "ai";
  if (reasonLower.startsWith("agent.")) return "agent";
  if (reasonLower.startsWith("admin.")) return "admin";
  if (reasonLower.startsWith("init.")) return "init";

  // Derive from meta fields
  if (tx.meta) {
    const traceType = tx.meta.trace_type as string | undefined;
    if (traceType) return normalizeTraceType(traceType);
    if (tx.meta.ai_usage_event_id) return "ai";
    if (tx.meta.agent_id) return "agent";
    if (tx.meta.notes) return "admin"; // Admin adjustments often have notes
  }

  // Default to unknown for unclassified transactions
  return "unknown";
}

/**
 * Normalizes trace type string to the TraceType union.
 */
function normalizeTraceType(value: string): TraceType {
  const normalized = value.toLowerCase() as TraceType;
  if (["ai", "agent", "admin", "init", "unknown"].includes(normalized)) {
    return normalized;
  }
  return "unknown";
}

// =============================================================================
// Category Detection
// =============================================================================

/**
 * Detects the transaction category (consume/refund/admin-adjust).
 */
export function detectCategory(tx: CreditTransactionRaw): CreditHistoryCategory {
  // Use backend-provided is_refund flag if available
  if (tx.is_refund !== undefined) {
    return tx.is_refund ? "refund" : "consume";
  }

  // Check meta.refunded flag
  if (tx.meta?.refunded === true) {
    return "refund";
  }

  // Derive from reason
  const reasonLower = tx.reason.toLowerCase();
  if (reasonLower.includes("refund")) return "refund";
  if (reasonLower.includes("退款")) return "refund";
  if (reasonLower.startsWith("admin.")) return "admin-adjust";

  // Negative delta = consume, positive = not consume
  if (tx.delta < 0) return "consume";

  // Positive delta without refund indicator could be admin adjust or init
  if (tx.delta > 0) return "admin-adjust";

  return "consume";
}

// =============================================================================
// Timestamp Formatting
// =============================================================================

/**
 * Formats timestamp for display in history rows.
 * Format: YYYY-MM-DD HH:mm
 */
export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

// =============================================================================
// Signed Delta
// =============================================================================

/**
 * Returns the delta with sign prefix for display.
 * Positive: "+N", Negative: already has "-" in delta value
 */
export function getSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

// =============================================================================
// Reason Humanization
// =============================================================================

/**
 * Converts a raw reason string to a human-readable label.
 * Used as final fallback when no other mapping applies.
 */
function humanizeReason(reason: string): string {
  if (!reason) return "积分变动";

  // Truncate long reasons
  if (reason.length > 30) {
    return reason.substring(0, 27) + "...";
  }

  // Remove common prefixes
  let normalized = reason
    .replace(/^(ai\.|agent\.|admin\.|init\.)/, "")
    .replace(/_/g, " ")
    .trim();

  // Capitalize first letter
  if (normalized) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return normalized || "积分变动";
}

// =============================================================================
// Main Normalization Function
// =============================================================================

/**
 * Normalizes a single raw transaction into a view-ready row.
 */
export function normalizeTransaction(tx: CreditTransactionRaw): CreditHistoryRow {
  const traceType = detectTraceType(tx);
  const category = detectCategory(tx);

  return {
    id: tx.id,
    delta: tx.delta,
    signedDelta: getSignedDelta(tx.delta),
    balanceAfter: tx.balance_after,
    operationLabel: getOperationLabel(tx),
    formattedTime: formatTimestamp(tx.created_at),
    isoTime: tx.created_at,
    category,
    traceType,
    isRefund: category === "refund",
    linkedEventId: typeof tx.linked_event_id === 'string' 
      ? tx.linked_event_id 
      : typeof tx.meta?.ai_usage_event_id === 'string' 
        ? tx.meta.ai_usage_event_id 
        : null,
    aiCategory: tx.category ?? (tx.meta?.category as string | undefined) ?? null,
    modelDisplay: tx.model_display ?? (tx.meta?.model as string | undefined) ?? null,
    rawMeta: tx.meta,
  };
}

/**
 * Normalizes a list of raw transactions into view-ready rows.
 */
export function normalizeTransactions(
  transactions: CreditTransactionRaw[]
): CreditHistoryRow[] {
  return transactions.map(normalizeTransaction);
}

// =============================================================================
// Filtering Utilities
// =============================================================================

/**
 * Filters transactions by category.
 */
export function filterByCategory(
  rows: CreditHistoryRow[],
  category: CreditHistoryCategory
): CreditHistoryRow[] {
  return rows.filter((row) => row.category === category);
}

/**
 * Filters out refund transactions from consume list.
 */
export function filterOutRefunds(rows: CreditHistoryRow[]): CreditHistoryRow[] {
  return rows.filter((row) => row.category !== "refund");
}

/**
 * Returns only refund transactions.
 */
export function filterRefunds(rows: CreditHistoryRow[]): CreditHistoryRow[] {
  return rows.filter((row) => row.category === "refund");
}

// =============================================================================
// Sorting Utilities
// =============================================================================

/**
 * Sorts transactions by creation date, newest first.
 */
export function sortByNewest(rows: CreditHistoryRow[]): CreditHistoryRow[] {
  return [...rows].sort((a, b) => {
    const dateA = new Date(a.isoTime).getTime();
    const dateB = new Date(b.isoTime).getTime();
    return dateB - dateA; // Descending
  });
}

/**
 * Sorts transactions by creation date, oldest first.
 */
export function sortByOldest(rows: CreditHistoryRow[]): CreditHistoryRow[] {
  return [...rows].sort((a, b) => {
    const dateA = new Date(a.isoTime).getTime();
    const dateB = new Date(b.isoTime).getTime();
    return dateA - dateB; // Ascending
  });
}

// =============================================================================
// Aggregation Utilities
// =============================================================================

/**
 * Calculates total credits consumed (excluding refunds).
 */
export function calculateTotalConsumed(rows: CreditHistoryRow[]): number {
  return rows
    .filter((row) => row.category === "consume" && row.delta < 0)
    .reduce((sum, row) => sum + Math.abs(row.delta), 0);
}

/**
 * Calculates total credits refunded.
 */
export function calculateTotalRefunded(rows: CreditHistoryRow[]): number {
  return rows
    .filter((row) => row.category === "refund")
    .reduce((sum, row) => sum + row.delta, 0);
}

/**
 * Groups transactions by date (YYYY-MM-DD).
 */
export function groupByDate(
  rows: CreditHistoryRow[]
): Map<string, CreditHistoryRow[]> {
  const groups = new Map<string, CreditHistoryRow[]>();
  for (const row of rows) {
    const date = row.formattedTime.split(" ")[0]; // YYYY-MM-DD
    const existing = groups.get(date) || [];
    existing.push(row);
    groups.set(date, existing);
  }
  return groups;
}
