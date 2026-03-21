"use client";

import { Coins, AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface CreditCostPreviewProps {
  category: "text" | "image" | "video";
  modelConfigId?: string;
  estimatedCost?: number;
  userBalance?: number;
  showWarning?: boolean;
  loading?: boolean;
  error?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CreditCostPreview({
  category,
  modelConfigId,
  estimatedCost,
  userBalance,
  showWarning,
  loading = false,
  error = null,
  size = "md",
  className = "",
}: CreditCostPreviewProps) {
  const [actualCost, setActualCost] = useState<number | null>(estimatedCost ?? null);
  const [balance, setBalance] = useState<number | null>(userBalance ?? null);
  const [isLoading, setIsLoading] = useState(loading);
  const [errMsg, setErrMsg] = useState<string | null>(error);

  // Default costs if API fails
  const defaultCosts = {
    text: 1,
    image: 5,
    video: 50,
  };

  useEffect(() => {
    if (estimatedCost !== undefined) {
      setActualCost(estimatedCost);
    }
    if (userBalance !== undefined) {
      setBalance(userBalance);
    }
    setIsLoading(loading);
    setErrMsg(error);
  }, [estimatedCost, userBalance, loading, error]);

  // Fetch cost from API if not provided
  useEffect(() => {
    if (estimatedCost !== undefined) return;

    const fetchCost = async () => {
      setIsLoading(true);
      try {
        const body: any = { category };
        if (modelConfigId) {
          body.model_config_id = modelConfigId;
        }

        const res = await fetch("/api/ai/cost-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error("获取积分预估失败");
        }

        const data = await res.json();
        if (data.code === 200 && data.data) {
          setActualCost(data.data.estimated_cost);
          setBalance(data.data.user_balance);
        } else {
          // Use default cost as fallback
          setActualCost(defaultCosts[category]);
        }
      } catch (err) {
        setErrMsg("获取积分预估失败，使用默认价格");
        setActualCost(defaultCosts[category]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCost();
  }, [category, modelConfigId, estimatedCost]);

  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1.5",
    lg: "text-base px-4 py-2",
  };

  const isInsufficient = balance !== null && actualCost !== null && balance < actualCost;
  const shouldShowWarning = showWarning || isInsufficient;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border ${
        shouldShowWarning
          ? "bg-red-500/10 border-red-500/30 text-red-400"
          : "bg-primary/5 border-primary/20 text-primary"
      } ${sizeClasses[size]} ${className}`}
    >
      {isLoading ? (
        <Loader2 size={size === "sm" ? 12 : size === "md" ? 14 : 16} className="animate-spin" />
      ) : (
        <Coins size={size === "sm" ? 12 : size === "md" ? 14 : 16} />
      )}

      <span className="font-medium whitespace-nowrap">
        {isLoading
          ? "计算中..."
          : actualCost !== null
          ? `消耗 ${actualCost} 积分`
          : "--"}
      </span>

      {shouldShowWarning && !isLoading && (
        <AlertCircle size={size === "sm" ? 12 : size === "md" ? 14 : 16} />
      )}

      {balance !== null && !isLoading && (
        <span className="text-textMuted ml-1">(余额: {balance})</span>
      )}
    </div>
  );
}

export default CreditCostPreview;
