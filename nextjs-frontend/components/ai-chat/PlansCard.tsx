"use client";

import { useState, useMemo, useEffect } from "react";
import { Package, ChevronDown, ChevronRight, Check, Sparkles, Image as ImageIcon, Maximize2, FileText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PlanData } from "./types";

function stripMarkdownMetadata(raw: string): string {
  const text = String(raw || "");
  if (!text.trim()) return "";
  let lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] && lines[0].charCodeAt(0) === 0xfeff) {
    lines[0] = lines[0].slice(1);
  }
  const firstNonEmpty = lines.findIndex((line) => line.trim() !== "");
  if (firstNonEmpty !== -1 && lines[firstNonEmpty].trim() === "---") {
    const endIndex = lines.slice(firstNonEmpty + 1).findIndex((line) => line.trim() === "---");
    lines = endIndex === -1 ? lines.slice(firstNonEmpty + 1) : lines.slice(firstNonEmpty + endIndex + 2);
  }
  const isMarkdownLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return /^(#{1,6}\s|[-*+]\s+|\d+\.\s+|>\s+|```|`{3}|!\[|\[.+\]\(.+\))/.test(trimmed);
  };
  const isMetadataLine = (line: string) => /^[a-z_][a-z0-9_]*\s*:\s*/.test(line.trim());
  let start = 0;
  for (; start < lines.length; start += 1) {
    const line = lines[start];
    if (isMarkdownLine(line)) break;
    if (!line.trim()) continue;
    if (isMetadataLine(line)) continue;
    break;
  }
  return lines.slice(start).join("\n").trim();
}

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
  const [assetSelections, setAssetSelections] = useState<Record<string, Record<string, boolean>>>({});
  const [previewAsset, setPreviewAsset] = useState<{ name: string; detailsMd: string } | null>(null);

  // Initialize asset selections
  useEffect(() => {
    const next: Record<string, Record<string, boolean>> = {};
    for (const plan of plans) {
      if (plan.kind === "asset_create") {
        const assets = Array.isArray(plan.inputs?.assets) ? plan.inputs.assets : [];
        const map: Record<string, boolean> = {};
        assets.forEach((_, idx) => {
          map[String(idx)] = true;
        });
        next[plan.id] = map;
      }
    }
    setAssetSelections(next);
  }, [plans]);

  const toggleAssetSelection = (planId: string, assetIndex: string, checked: boolean) => {
    setAssetSelections(prev => ({
      ...prev,
      [planId]: {
        ...(prev[planId] || {}),
        [assetIndex]: checked
      }
    }));
  };

  const handleExecute = () => {
    if (!onExecute) return;
    
    // Filter plans and their assets
    const plansToExecute = plans
      .filter(p => selectedIds.has(p.id))
      .map(p => {
        if (p.kind === "asset_create") {
          const rawAssets = Array.isArray(p.inputs?.assets) ? p.inputs.assets : [];
          const selectedIndices = assetSelections[p.id] || {};
          const filteredAssets = rawAssets.filter((_, idx) => selectedIndices[String(idx)] !== false);
          
          // If no assets selected for this plan, we might want to skip it or send empty
          // But usually we just filter inputs.
          return {
            ...p,
            inputs: {
              ...(p.inputs || {}),
              assets: filteredAssets
            }
          };
        }
        return p;
      });
      
    onExecute(plansToExecute);
  };
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
    <div className="my-2 rounded-xl border border-border bg-surface/50 overflow-hidden relative">
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
          <div className="p-3 space-y-2 max-h-[600px] overflow-y-auto">
            {plans.map((plan) => {
              const isSelected = selectedIds.has(plan.id);
              const preview = plan.preview || {};
              const files = Array.isArray(preview.files) ? preview.files : [];
              const applyResult = applyResultsByPlanId ? (applyResultsByPlanId[plan.id] as any) : null;
              
              // Asset Create Logic
              const isAssetCreate = plan.kind === "asset_create";
              const rawAssets: any[] = isAssetCreate && Array.isArray(plan.inputs?.assets) ? plan.inputs.assets : [];
              const assetSelectionsForPlan = assetSelections[plan.id] || {};
              const assetType = String(plan.inputs?.asset_type || "");

              const shots = plan.kind === "storyboard_apply" && Array.isArray((plan.inputs as any)?.shots) ? (((plan.inputs as any).shots as any[]) || []) : [];
              const storyboardCount = typeof (preview as any)?.count === "number" ? Number((preview as any).count) : shots.length;
              const storyboardWarning = typeof (preview as any)?.warning === "string" ? String((preview as any).warning) : "";
              const storyboardVirtual = Boolean((preview as any)?.virtual);
              const mdPreview = typeof (preview as any)?.markdown_preview === "string" ? (preview as any).markdown_preview : "";
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
                  className={`p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-textMuted/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border"
                      }`}
                      onClick={() => toggleSelect(plan.id)}
                    >
                      {isSelected && <Check size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSelect(plan.id)}>
                        <span className="text-sm font-medium text-text">
                          {kindLabels[plan.kind] || plan.kind}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceHighlight text-textMuted">
                          {plan.tool_id}
                        </span>
                      </div>

                      {/* Asset Grid View */}
                      {isAssetCreate && rawAssets.length > 0 ? (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {rawAssets.map((a, idx) => {
                            const key = String(idx);
                            const checked = assetSelectionsForPlan[key] !== false;
                            const name = String(a?.name || "");
                            const keywords = Array.isArray(a?.keywords) ? a.keywords.map(String).filter(Boolean) : [];
                            const detailsMd = stripMarkdownMetadata(String(a?.details_md || ""));
                            
                            return (
                              <div key={key} className="group relative flex flex-col rounded-xl border border-border bg-gradient-to-br from-surface/80 to-surface/40 overflow-hidden hover:border-primary/50 transition-all hover:shadow-lg h-56">
                                {/* Checkbox Overlay */}
                                <div className="absolute top-2 left-2 z-20">
                                  <input 
                                    type="checkbox" 
                                    checked={checked} 
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleAssetSelection(plan.id, key, e.target.checked);
                                      if (e.target.checked && !isSelected) toggleSelect(plan.id);
                                    }} 
                                    className="w-4 h-4 rounded border-gray-400 bg-white/80 checked:bg-primary cursor-pointer"
                                  />
                                </div>
                                
                                {/* Top Preview Area */}
                                <div 
                                  className="h-24 relative bg-black/10 flex-shrink-0 cursor-pointer"
                                  onClick={() => setPreviewAsset({ name, detailsMd })}
                                >
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-textMuted opacity-40 bg-surface/50">
                                    <ImageIcon size={20} />
                                    <span className="text-[9px] mt-1">无预览图</span>
                                  </div>
                                  <button className="absolute top-2 right-2 p-1 text-textMuted hover:text-primary bg-surface/80 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Maximize2 size={12} />
                                  </button>
                                </div>

                                {/* Content Area */}
                                <div className="flex-1 p-2 border-t border-border/50 bg-surface/30 overflow-hidden relative flex flex-col cursor-pointer" onClick={() => setPreviewAsset({ name, detailsMd })}>
                                   <div className="font-bold text-xs text-textMain truncate mb-1" title={name}>
                                     {name || "(未命名)"}
                                   </div>
                                   <div className="flex-1 overflow-hidden relative">
                                     {detailsMd ? (
                                       <div className="markdown-body prose prose-invert prose-xs max-w-none text-[9px] leading-relaxed opacity-80 pointer-events-none select-none line-clamp-3">
                                         <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailsMd}</ReactMarkdown>
                                       </div>
                                     ) : (
                                       <div className="text-[9px] text-textMuted opacity-50">无文档内容</div>
                                     )}
                                     <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-surface/30 to-transparent pointer-events-none" />
                                   </div>
                                </div>
                                
                                {/* Footer Area */}
                                <div className="px-2 py-1.5 border-t border-border/50 bg-surface/60 backdrop-blur-sm flex items-center justify-between gap-2 flex-shrink-0 text-[9px] text-textMuted">
                                   <div className="truncate flex-1" title={keywords.join(", ")}>
                                     {keywords.length ? keywords.slice(0, 2).join(" · ") : "无关键词"}
                                   </div>
                                   <div className="bg-surfaceHighlight px-1 py-0.5 rounded text-[8px] truncate max-w-[50px]">
                                     {String(a?.type || assetType || "未知")}
                                   </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        // Standard Preview for other types
                        <>
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
                            <p className="mt-1.5 text-xs text-textMuted line-clamp-2" onClick={() => toggleSelect(plan.id)}>
                              {preview.raw_output_text.slice(0, 100)}
                              {preview.raw_output_text.length > 100 && "..."}
                            </p>
                          )}
                        </>
                      )}

                      {plan.kind === "storyboard_apply" && (
                        <>
                        <details className="mt-2 px-3 py-2 rounded-md bg-background border border-border">
                            <summary className="cursor-pointer text-xs font-bold text-textMain">DEBUG: Raw Data</summary>
                            <pre className="mt-2 w-full max-h-[150px] overflow-auto text-[10px] text-textMuted whitespace-pre-wrap">
                            Preview: {JSON.stringify(preview, null, 2)}
                            Inputs: {JSON.stringify(plan.inputs, null, 2)}
                            </pre>
                        </details>
                        <div className="mt-2 text-xs text-textMuted">
                          镜头 {storyboardCount}
                          {storyboardVirtual ? " · virtual" : ""}
                          {storyboardWarning ? ` · ${storyboardWarning}` : ""}
                        </div>

                        {mdPreview && (
                          <details
                            className="mt-2 px-3 py-2 rounded-md bg-background/30 border border-border"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <summary className="cursor-pointer text-xs font-bold text-textMain">查看 Markdown 预览</summary>
                            <div className="mt-2 space-y-2">
                              <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void copyText(mdPreview);
                                  }}
                                  className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
                                >
                                  复制 Markdown
                              </button>
                              <pre className="w-full max-h-[220px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                                {mdPreview}
                              </pre>
                            </div>
                          </details>
                        )}
                        </>
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
                onClick={handleExecute}
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
      {previewAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewAsset(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="h-12 px-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-surface/95 backdrop-blur">
              <div className="font-bold text-sm text-textMain truncate pr-4">{previewAsset.name}</div>
              <button
                onClick={() => setPreviewAsset(null)}
                className="p-1.5 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {previewAsset.detailsMd ? (
                <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewAsset.detailsMd}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-textMuted gap-2 py-10">
                  <FileText size={32} className="opacity-20" />
                  <div className="text-sm">暂无详细内容</div>
                </div>
              )}
            </div>
          </div>
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
