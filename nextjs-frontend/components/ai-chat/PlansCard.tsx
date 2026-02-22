"use client";

import { useState, useMemo } from "react";
import { Package, ChevronDown, ChevronRight, Check, Sparkles } from "lucide-react";
import { PlanData } from "./types";

interface PlansCardProps {
  plans: PlanData[];
  onExecute?: (selectedPlans: PlanData[]) => void;
  isExecuting?: boolean;
  defaultExpanded?: boolean;
  applyResultsByPlanId?: Record<string, unknown>;
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

export function PlansCard({ plans, onExecute, isExecuting, defaultExpanded = false, applyResultsByPlanId }: PlansCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(plans.map((p) => p.id)));

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("复制失败，请手动复制：", text);
    }
  };

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
              const applyResult = applyResultsByPlanId ? (applyResultsByPlanId[plan.id] as any) : null;
              const shots = plan.kind === "storyboard_apply" && Array.isArray((plan.inputs as any)?.shots) ? (((plan.inputs as any).shots as any[]) || []) : [];
              const storyboardCount = typeof (preview as any)?.count === "number" ? Number((preview as any).count) : shots.length;
              const storyboardWarning = typeof (preview as any)?.warning === "string" ? String((preview as any).warning) : "";
              const storyboardVirtual = Boolean((preview as any)?.virtual);
              const createdList = Array.isArray(applyResult?.data?.created) ? (applyResult.data.created as any[]) : [];
              const createdShotCodes = createdList
                .map((x) => (x && typeof x === "object" && typeof (x as any).shot_code === "string" ? String((x as any).shot_code) : ""))
                .filter((x) => x);
              const appliedOk = typeof applyResult?.code === "number" ? applyResult.code === 200 : false;
              const appliedErr =
                typeof applyResult?.msg === "string"
                  ? String(applyResult.msg)
                  : typeof applyResult?.detail === "string"
                    ? String(applyResult.detail)
                    : typeof applyResult?.body === "string"
                      ? String(applyResult.body)
                      : "";
              
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

                      {plan.kind === "storyboard_apply" && (
                        <div className="mt-2 text-xs text-textMuted">
                          镜头 {storyboardCount}
                          {storyboardVirtual ? " · virtual" : ""}
                          {storyboardWarning ? ` · ${storyboardWarning}` : ""}
                        </div>
                      )}

                      {plan.kind === "storyboard_apply" && shots.length > 0 && (
                        <details
                          className="mt-2 px-3 py-2 rounded-md bg-background/30 border border-border"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <summary className="cursor-pointer text-xs font-bold text-textMain">查看分镜预览</summary>
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyText(JSON.stringify(shots, null, 2));
                                }}
                                className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
                              >
                                复制 shots JSON
                              </button>
                            </div>
                            <div className="space-y-2">
                              {shots.slice(0, 20).map((s: any, idx: number) => {
                                const shotType = String(s?.shot_type || "");
                                const angle = String(s?.camera_angle || "");
                                const move = String(s?.camera_move || "");
                                const desc = String(s?.description || "");
                                const dialogue = String(s?.dialogue || "");
                                const md = [
                                  `#${idx + 1} ${shotType || "shot"}`,
                                  "",
                                  "## 画面描述",
                                  desc || "（无画面描述）",
                                  dialogue ? ["", "## 台词", dialogue].join("\n") : "",
                                ]
                                  .filter((x) => typeof x === "string" && x.length > 0)
                                  .join("\n");
                                return (
                                  <details key={idx} className="px-3 py-2 rounded-md bg-background border border-border">
                                    <summary className="cursor-pointer text-sm font-bold text-textMain">
                                      #{idx + 1} {shotType || "shot"} {angle ? `· ${angle}` : ""} {move ? `· ${move}` : ""}
                                    </summary>
                                    <pre className="mt-2 w-full max-h-[220px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                                      {md}
                                    </pre>
                                  </details>
                                );
                              })}
                              {shots.length > 20 && <div className="text-[11px] text-textMuted">仅展示前 20 条，完整内容请复制 JSON。</div>}
                            </div>
                          </div>
                        </details>
                      )}

                      {applyResult && (
                        <div
                          className={`mt-2 px-3 py-2 rounded-md border text-xs ${
                            appliedOk ? "border-green-500/30 bg-green-500/10 text-green-200" : "border-border bg-background/30 text-textMuted"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-bold">{appliedOk ? "已执行" : "执行结果"}</div>
                              {createdShotCodes.length > 0 && <div className="mt-1 break-words">创建：{createdShotCodes.slice(0, 10).join("、")}</div>}
                              {!appliedOk && appliedErr ? <div className="mt-1 break-words">{appliedErr}</div> : null}
                            </div>
                            {createdShotCodes.length > 0 && (
                              <button
                                type="button"
                                className="shrink-0 px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyText(createdShotCodes.join("\n"));
                                }}
                              >
                                复制 shot_code
                              </button>
                            )}
                          </div>
                        </div>
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
