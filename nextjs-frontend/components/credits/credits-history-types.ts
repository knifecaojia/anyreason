/**
 * Credit History Types
 * 
 * UI-facing types for credit transaction history, derived from the
 * enriched backend response contract defined in Task 2/6.
 * 
 * These types represent view-ready data after normalization.
 */

// =============================================================================
// Raw API Response Types (mirroring backend CreditTransactionRead)
// =============================================================================

export interface CreditTransactionRaw {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  actor_user_id?: string | null;
  meta?: Record<string, unknown>;
  created_at: string;
  // Computed fields from Task 6 backend enrichment
  trace_type?: string | null;
  operation_display?: string | null;
  is_refund?: boolean;
  linked_event_id?: string | null;
  category?: string | null;
  model_display?: string | null;
}

// =============================================================================
// Trace Type Discriminators
// =============================================================================

/**
 * Discriminator for transaction origin, derived from backend trace_type.
 * - 'ai': AI text/image/video generation
 * - 'agent': Agent execution
 * - 'admin': Manual admin adjustment
 * - 'init': Account initialization
 * - 'unknown': Legacy transactions without trace metadata
 */
export type TraceType = "ai" | "agent" | "admin" | "init" | "unknown";

// =============================================================================
// UI-Ready Transaction Row
// =============================================================================

/**
 * View-ready transaction row for user-facing history display.
 * All fields are prepared for direct rendering without additional transformation.
 */
export interface CreditHistoryRow {
  /** Unique transaction identifier */
  id: string;
  
  /** Delta amount: positive for additions, negative for deductions */
  delta: number;
  
  /** Human-readable sign prefix: '+' or '' (already negative in delta) */
  signedDelta: string;
  
  /** Balance after this transaction */
  balanceAfter: number;
  
  /** Human-readable operation description (e.g., "文本生成: GPT-4") */
  operationLabel: string;
  
  /** Formatted timestamp for display */
  formattedTime: string;
  
  /** ISO timestamp for data attributes */
  isoTime: string;
  
  /** Transaction category: 'consume', 'refund', 'admin-adjust' */
  category: CreditHistoryCategory;
  
  /** Raw trace type from backend */
  traceType: TraceType;
  
  /** Whether this is a refund transaction */
  isRefund: boolean;
  
  /** Optional linked AI usage event ID for traceability */
  linkedEventId?: string | null;
  
  /** Optional AI category (text/image/video) */
  aiCategory?: string | null;
  
  /** Optional model display name */
  modelDisplay?: string | null;
  
  /** Raw meta for debugging/admin views */
  rawMeta?: Record<string, unknown>;
}

// =============================================================================
// Transaction Categories
// =============================================================================

/**
 * Transaction category for UI display and filtering.
 * Covers all three semantic types from the plan:
 * - consume: AI/Agent operation that deducted credits
 * - refund: Reversal of a previous consume
 * - admin-adjust: Manual admin balance adjustment
 */
export type CreditHistoryCategory = "consume" | "refund" | "admin-adjust";

// =============================================================================
// History List State
// =============================================================================

/**
 * Complete state for credit history display.
 * Supports both empty and populated states cleanly.
 */
export interface CreditHistoryState {
  /** Transaction rows ready for rendering */
  rows: CreditHistoryRow[];
  
  /** Whether the data is currently loading */
  isLoading: boolean;
  
  /** Error message if fetch failed */
  error: string | null;
  
  /** Current balance (refreshed with history) */
  balance: number | null;
  
  /** Whether there are more transactions to load (pagination) */
  hasMore: boolean;
  
  /** Offset for pagination cursor */
  offset: number;
}

// =============================================================================
// Pagination Support
// =============================================================================

export interface CreditHistoryQueryOptions {
  /** Maximum number of transactions to return */
  limit?: number;
  /**
   * @deprecated Backend does not support offset-based pagination.
   * Included for interface compatibility only. Will be removed
   * when backend adds offset support.
   */
  offset?: never;
}

// =============================================================================
// Loading State Helpers
// =============================================================================

/**
 * Initial/empty state for credit history.
 * Used to render loading skeletons and empty states consistently.
 */
export function createEmptyHistoryState(): CreditHistoryState {
  return {
    rows: [],
    isLoading: false,
    error: null,
    balance: null,
    hasMore: false,
    offset: 0,
  };
}

/**
 * Loading state for credit history.
 */
export function createLoadingHistoryState(): CreditHistoryState {
  return {
    rows: [],
    isLoading: true,
    error: null,
    balance: null,
    hasMore: false,
    offset: 0,
  };
}

/**
 * Error state for credit history.
 */
export function createErrorHistoryState(error: string): CreditHistoryState {
  return {
    rows: [],
    isLoading: false,
    error,
    balance: null,
    hasMore: false,
    offset: 0,
  };
}
