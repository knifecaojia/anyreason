"use client";

import { useCallback, useEffect, useState } from "react";
import { useCredits } from "./CreditsContext";

interface TextChatCostPreviewState {
  /** Estimated cost in credits (null if still loading/fetching) */
  estimatedCost: number | null;
  /** Whether we're currently fetching the cost estimate */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manual refresh function to re-fetch cost estimate */
  refresh: () => void;
}

/**
 * Hook for text/chat operations to get cost preview.
 * 
 * This hook:
 * 1. Fetches the estimated cost for "text" category from the API
 * 2. Combines with user's current balance from CreditsContext
 * 3. Shows a warning if insufficient balance
 * 
 * Usage:
 * ```tsx
 * const { estimatedCost, isLoading, error, refresh } = useTextChatCostPreview();
 * 
 * return (
 *   <CreditCostPreview
 *     category="text"
 *     estimatedCost={estimatedCost}
 *     userBalance={balance}
 *     loading={isLoading}
 *     error={error}
 *   />
 * );
 * ```
 */
export function useTextChatCostPreview(): TextChatCostPreviewState {
  const { balance } = useCredits();
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCost = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/cost-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "text" }),
      });

      if (!res.ok) {
        throw new Error("获取积分预估失败");
      }

      const data = await res.json();
      if (data.code === 200 && data.data?.estimated_cost !== undefined) {
        setEstimatedCost(data.data.estimated_cost);
      } else {
        // Use default text cost as fallback
        setEstimatedCost(1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取积分预估失败");
      // Use default text cost as fallback
      setEstimatedCost(1);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCost();
  }, [fetchCost]);

  return {
    estimatedCost,
    isLoading,
    error,
    refresh: fetchCost,
  };
}

export default useTextChatCostPreview;
