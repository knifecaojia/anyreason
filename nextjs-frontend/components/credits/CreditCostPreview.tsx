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
  const [usingFallbackCost, setUsingFallbackCost] = useState(false);

  // Default costs if API fails
  const defaultCosts = {
    text: 1,
    image: 5,
    video: 50,
  };

  useEffect(() => {
    if (estimatedCost !== undefined) {
      setActualCost(estimatedCost);
      setUsingFallbackCost(false);
    }
    if (userBalance !== undefined) {
      setBalance(userBalance);
    }
    setIsLoading(loading);
    setErrMsg(error);
    if (error) {
      setUsingFallbackCost(false);
    }
  }, [estimatedCost, userBalance, loading, error]);

  // Fetch cost from API if not provided
  useEffect(() => {
    if (estimatedCost !== undefined) return;

    const fetchCost = async () => {
      setIsLoading(true);
      try {
        setErrMsg(null);
        setUsingFallbackCost(false);
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
          setUsingFallbackCost(false);
        } else {
          // Use default cost as fallback
          setActualCost(defaultCosts[category]);
          setErrMsg("预估暂不可用，已显示默认价格");
          setUsingFallbackCost(true);
        }
      } catch (err) {
        setErrMsg("预估暂不可用，已显示默认价格");
        setActualCost(defaultCosts[category]);
        setUsingFallbackCost(true);
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
  const toneClasses = shouldShowWarning
    ? "bg-red-500/10 border-red-500/30 text-red-400"
    : usingFallbackCost || !!errMsg
      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
      : "bg-primary/5 border-primary/20 text-primary";
  const helperText = shouldShowWarning
    ? "余额不足，请先充值后再执行"
    : usingFallbackCost || !!errMsg
      ? errMsg || "预估暂不可用，已显示默认价格"
      : null;

  return (
    <div
      className={`inline-flex flex-col items-start gap-1 rounded-lg border ${toneClasses} ${sizeClasses[size]} ${className}`}
    >
      <div className="inline-flex items-center gap-2">
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
          <span className="text-textMuted ml-1 whitespace-nowrap">(余额: {balance})</span>
        )}
      </div>

      {helperText ? (
        <div className="text-[10px] leading-4 opacity-90">
          {helperText}
        </div>
      ) : null}
    </div>
  );
}

export default CreditCostPreview;
