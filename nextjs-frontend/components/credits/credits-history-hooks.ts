/**
 * Credit History Hooks
 * 
 * React hooks for loading and managing credit history data.
 * Uses existing credits-actions.ts as the data source.
 * 
 * Features:
 * - Loading state management
 * - Error handling
 * - Empty/populated state support
 * - Pagination support
 * - Balance refresh
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  creditsMy,
  creditsMyTransactions,
  type CreditTransaction,
} from "../actions/credits-actions";
import type {
  CreditHistoryRow,
  CreditHistoryState,
  CreditHistoryQueryOptions,
} from "./credits-history-types";
import {
  normalizeTransactions,
  sortByNewest,
} from "./credits-history-normalizer";

// =============================================================================
// Hook: useCreditHistory
// =============================================================================

/**
 * Hook for loading user's credit transaction history.
 * 
 * Note: Backend API only supports limit, not offset pagination.
 * Use useCreditHistoryWithLoadAll() if you need refresh capability.
 * 
 * @param options - Query options (limit only; offset not supported by backend)
 * @returns History state with rows, loading, error, and actions
 * 
 * @example
 * ```tsx
 * function HistoryList() {
 *   const { rows, isLoading, error, refresh } = useCreditHistory();
 *   
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Error message={error} />;
 *   if (rows.length === 0) return <EmptyState />;
 *   
 *   return rows.map(row => <HistoryRow key={row.id} row={row} />);
 * }
 * ```
 */
export function useCreditHistory(options: CreditHistoryQueryOptions = {}) {
  const { limit = 50 } = options;

  const [state, setState] = useState<CreditHistoryState>({
    rows: [],
    isLoading: true,
    error: null,
    balance: null,
    hasMore: false,
    offset: 0, // Kept for interface compatibility; not used in API
  });

  const [shouldRefresh, setShouldRefresh] = useState(0);

  const refresh = useCallback(() => {
    setShouldRefresh((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Fetch balance and transactions in parallel
        const [balanceResult, transactionsResult] = await Promise.all([
          creditsMy(),
          creditsMyTransactions(limit),
        ]);

        if (cancelled) return;

        // Extract data from API response wrappers
        const balance = balanceResult.data?.balance ?? null;
        const rawTransactions: CreditTransaction[] =
          transactionsResult.data ?? [];

        // Normalize transactions
        const normalizedRows = normalizeTransactions(rawTransactions);
        const sortedRows = sortByNewest(normalizedRows);

        setState({
          rows: sortedRows,
          isLoading: false,
          error: null,
          balance,
          hasMore: rawTransactions.length >= limit,
          offset: 0,
        });
      } catch (err) {
        if (cancelled) return;

        const message =
          err instanceof Error ? err.message : "加载积分流水失败";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [limit, shouldRefresh]);

  return {
    ...state,
    refresh,
  };
}

// =============================================================================
// Hook: useCreditHistoryList
// =============================================================================

/**
 * Simplified hook that returns just the rows and loading state.
 * Good for cases where you just need the list without full state management.
 * 
 * @param options - Query options
 * @returns Simple tuple of [rows, isLoading, error]
 * 
 * @example
 * ```tsx
 * function SimpleHistory() {
 *   const [rows, isLoading, error] = useCreditHistoryList();
 *   // ...
 * }
 * ```
 */
export function useCreditHistoryList(options: CreditHistoryQueryOptions = {}) {
  const { rows, isLoading, error } = useCreditHistory(options);
  return [rows, isLoading, error] as const;
}

// =============================================================================
// Hook: useCreditHistoryWithRefresh
// =============================================================================

/**
 * Hook that provides history with manual refresh capability.
 * Ideal for the history drawer that needs to refresh after operations.
 * 
 * @param options - Query options
 * @returns History state with explicit refresh function
 */
export function useCreditHistoryWithRefresh(
  options: CreditHistoryQueryOptions = {}
) {
  const [state, setState] = useState<CreditHistoryState>({
    rows: [],
    isLoading: false,
    error: null,
    balance: null,
    hasMore: false,
    offset: 0,
  });

  const refreshHistory = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const [balanceResult, transactionsResult] = await Promise.all([
        creditsMy(),
        creditsMyTransactions(options.limit ?? 50),
      ]);

      const balance = balanceResult.data?.balance ?? null;
      const rawTransactions: CreditTransaction[] =
        transactionsResult.data ?? [];

      const normalizedRows = normalizeTransactions(rawTransactions);
      const sortedRows = sortByNewest(normalizedRows);

      setState({
        rows: sortedRows,
        isLoading: false,
        error: null,
        balance,
        hasMore: rawTransactions.length >= (options.limit ?? 50),
        offset: options.offset ?? 0,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "刷新失败",
      }));
    }
  }, [options.limit, options.offset]);

  // Initial load
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  return {
    ...state,
    refreshHistory,
  };
}

// =============================================================================
// Hook: useCreditHistoryWithLoadAll
// =============================================================================

/**
 * Hook for loading all available transaction history with refresh capability.
 * 
 * IMPORTANT: The backend API only supports limit, not offset-based pagination.
 * This hook provides a full refresh (re-fetch all) rather than true page-by-page loading.
 * The `hasMore` flag indicates if there might be more records beyond the limit,
 * but `loadMore` will simply re-fetch the same limit and deduplicate.
 * 
 * For true offset-based pagination, the backend must first add offset support
 * to the /api/v1/credits/my/transactions endpoint.
 * 
 * @param limit - Maximum transactions to fetch (default 50)
 * @returns History state with refresh function
 */
export function useCreditHistoryWithLoadAll(limit = 50) {
  const [rows, setRows] = useState<CreditHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [balanceResult, transactionsResult] = await Promise.all([
        creditsMy(),
        creditsMyTransactions(limit),
      ]);

      const newBalance = balanceResult.data?.balance ?? null;
      const rawTransactions: CreditTransaction[] = transactionsResult.data ?? [];
      const normalizedRows = normalizeTransactions(rawTransactions);
      const sortedRows = sortByNewest(normalizedRows);

      setRows(sortedRows);
      setBalance(newBalance);
      setHasMore(rawTransactions.length >= limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [limit]);

  // Initial load
  useEffect(() => {
    load(false);
  }, [load]);

  // Refresh function for manual reload
  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return {
    rows,
    isLoading,
    isRefreshing,
    error,
    balance,
    hasMore,
    refresh,
    /**
     * @deprecated Use `refresh` instead. Backend does not support offset-based
     * pagination yet, so this will re-fetch the same data. True pagination
     * requires backend endpoint changes.
     */
    loadMore: refresh,
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Formats a delta for display with color class.
 * Returns tuple of [formatted string, color class].
 * 
 * @param delta - The delta value
 * @returns [formatted string, tailwind color class]
 */
export function getDeltaDisplay(delta: number): [string, string] {
  if (delta > 0) {
    return [`+${delta}`, "text-green-500"];
  }
  if (delta < 0) {
    return [`${delta}`, "text-red-500"];
  }
  return [`${delta}`, "text-textMuted"];
}
