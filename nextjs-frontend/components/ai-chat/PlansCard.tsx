"use client";

import { useState, useMemo } from "react";
import { Package, ChevronDown, ChevronRight, Check, Sparkles } from "lucide-react";
import { PlanData } from "./types";

interface PlanPreview {
  raw_output_text?: string;
  summary?: string;
  files?: Array<{ name?: string; type?: string }>;
}

interface PlanDataWithPreview {
  id: string;
  kind: string;
  tool_id: string;
  inputs: Record<string, unknown>;
  preview?: PlanPreview;
}

interface PlansCardProps {
  plans: PlanDataWithPreview[];
  onExecute?: (selectedPlans: PlanDataWithPreview[]) => void;
  isExecuting?: boolean;
  defaultExpanded?: boolean;
}

const kindLabels: Record<string, string> = {
  asset_create: "资产创建",
  episode_save: "剧集保存",
  storyboard_apply: "分镜预览",
  scene_create: "场景创建",
  character_create: "角色创建",
  prop_create: "道具创建",
  vfx_create: "特效创建",
};

export function PlansCard({ plans, onExecute, isExecuting, defaultExpanded = false }: PlansCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(plans.map((p) => p.id)));

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) {
      counts[p.kind] = (counts[p.kind] || 0) + 1;
    }
    return Object.entries(counts).map(([kind, count]) => ({
      label: kindLabels[kind] || kind,
      count,
    }));
  }, [plans]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(plans.map((p) => p.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const selectedCount = selectedIds.size;

  if (plans.length === 0) return null;

  return (
    <div className="my-2 rounded-xl border border-border bg-surface/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surfaceHighlight/30 transition-colors"
      >
        <Package size={16} className="text-primary" />
        <span className="text-sm text-text flex-1 text-left">
          已生成计划：
          {summary.map((s, i) => (
            <span key={s.label}>
              {i > 0 && "，"}
              {s.label} {s.count} 个
            </span>
          ))}
        </span>
        <span className="text-xs text-textMuted mr-2">
          {expanded ? "收起" : "展开详情"}
        </span>
        {expanded ? <ChevronDown size={16} className="text-textMuted" /> : <ChevronRight size={16} className="text-textMuted" />}
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {plans.map((plan) => {
              const isSelected = selectedIds.has(plan.id);
              const preview = plan.preview || {};
              const files = Array.isArray(preview.files) ? preview.files : [];
              
              return (
                <div
                  key={plan.id}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-textMuted/30"
                  }`}
                  onClick={() => toggleSelect(plan.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border"
                      }`}
                    >
                      {isSelected && <Check size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">
                          {kindLabels[plan.kind] || plan.kind}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceHighlight text-textMuted">
                          {plan.tool_id}
                        </span>
                      </div>
                      {files.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {files.slice(0, 4).map((f, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-textMuted"
                            >
                              {f.name || f.type || `项${idx + 1}`}
                            </span>
                          ))}
                          {files.length > 4 && (
                            <span className="text-[10px] text-textMuted">
                              +{files.length - 4} 更多
                            </span>
                          )}
                        </div>
                      )}
                      {preview.raw_output_text && (
                        <p className="mt-1.5 text-xs text-textMuted line-clamp-2">
                          {preview.raw_output_text.slice(0, 100)}
                          {preview.raw_output_text.length > 100 && "..."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {onExecute && (
            <div className="px-3 py-2 border-t border-border flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-textMuted hover:text-text transition-colors"
                >
                  全选
                </button>
                <span className="text-textMuted">|</span>
                <button
                  onClick={deselectAll}
                  className="text-xs text-textMuted hover:text-text transition-colors"
                >
                  取消全选
                </button>
              </div>
              <button
                onClick={() => onExecute(plans.filter((p) => selectedIds.has(p.id)))}
                disabled={selectedCount === 0 || isExecuting}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {isExecuting ? (
                  <>
                    <Sparkles size={12} className="animate-spin" />
                    执行中...
                  </>
                ) : (
                  <>执行所选 ({selectedCount})</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PlansCardInlineProps {
  plans: PlanData[];
}

export function PlansCardInline({ plans }: PlansCardInlineProps) {
  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) {
      counts[p.kind] = (counts[p.kind] || 0) + 1;
    }
    return Object.entries(counts).map(([kind, count]) => ({
      label: kindLabels[kind] || kind,
      count,
    }));
  }, [plans]);

  if (plans.length === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs">
      <Package size={12} className="text-primary" />
      {summary.map((s, i) => (
        <span key={s.label}>
          {i > 0 && <span className="text-textMuted mx-1">·</span>}
          <span className="text-textMuted">{s.label}</span>
          <span className="font-medium text-text ml-1">{s.count}</span>
        </span>
      ))}
    </div>
  );
}
