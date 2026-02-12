"use client";

import type { LucideIcon } from "lucide-react";

type StatCardVariant = "default" | "compact";

export function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  color,
  onClick,
  variant = "default",
}: {
  label: string;
  value: string;
  trend?: string;
  icon?: LucideIcon;
  color?: string;
  onClick?: () => void;
  variant?: StatCardVariant;
}) {
  const Root = onClick ? "button" : "div";
  const padding = variant === "compact" ? "p-4" : "p-6";
  const valueClass = variant === "compact" ? "text-2xl" : "text-3xl";
  const iconSize = variant === "compact" ? 20 : 24;

  return (
    <Root
      {...(onClick ? { type: "button", onClick } : {})}
      className={[
        "bg-surface border border-border rounded-2xl flex items-start justify-between hover:border-border/80 transition-colors",
        padding,
        onClick ? "text-left cursor-pointer" : "",
      ].join(" ")}
    >
      <div>
        <p className="text-textMuted text-sm font-medium mb-1">{label}</p>
        <h3 className={`${valueClass} font-bold text-textMain tracking-tight`}>{value}</h3>
        {trend ? (
          <p className={`text-xs mt-2 ${trend.startsWith("+") ? "text-green-400" : "text-red-400"}`}>{trend} 较上月</p>
        ) : null}
      </div>
      {Icon && color ? (
        <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
          <Icon size={iconSize} className={color.replace("bg-", "text-")} />
        </div>
      ) : null}
    </Root>
  );
}

