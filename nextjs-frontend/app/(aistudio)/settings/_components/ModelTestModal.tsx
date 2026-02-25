"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { Download, LoaderCircle, X, ZoomIn } from "lucide-react";
import { ImagePromptComposer } from "@/components/aistudio/ImagePromptComposer";
import { CapabilityParams } from "@/components/aistudio/CapabilityParams";
import { listModelsWithCapabilities } from "@/components/actions/ai-media-actions";
import type { AICategory } from "@/components/actions/ai-model-actions";
import type { ModelCapabilities, ManufacturerWithModels } from "@/lib/aistudio/types";

export function ModelTestModal(props: {
  open: boolean;
  onClose: () => void;
  activeModelTab: AICategory;
  aiModelConfigs: any[];
  modelTestModelConfigId: string;
  setModelTestModelConfigId: (value: string) => void;
  modelTestSubmitting: boolean;
  resetModelTestChat: () => void;
  modelTestError: string | null;
  modelTestMessages: any[];
  modelTestSessionsLoading: boolean;
  modelTestSessions: any[];
  modelTestSessionId: string;
  setModelTestSessionId: (value: string) => void;
  createModelTestSession: (opts: { category: AICategory; aiModelConfigId?: string }) => Promise<unknown>;
  modelTestImageRuns: any[];
  modelTestVideoRuns: any[];
  modelTestLastRaw: unknown;
  modelTestInput: string;
  setModelTestInput: (value: string) => void;
  submitModelTestChat: () => Promise<void>;
  modelTestSessionImageAttachmentNodeIds: string[];
  parseMentionIndices: (text: string) => number[];
  insertModelTestImageMention: (n: number) => void;
  removeModelTestSessionImageAttachment: (nodeId: string) => void;
  addModelTestImages: (files: FileList | null) => void;
  modelTestImagePromptRef: RefObject<HTMLTextAreaElement | null>;
  modelTestImagePrompt: string;
  handlePromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  mentionPopupOpen: boolean;
  mentionPosition: { top: number; left: number } | null;
  handleMentionSelect: (idx: number) => void;
  setMentionPopupOpen: (open: boolean) => void;
  submitModelTestImage: () => Promise<void>;
  modelTestImageResolution: string;
  setModelTestImageResolution: (value: string) => void;
  /** 动态参数 — 由 CapabilityParams 驱动 */
  capParams: Record<string, any>;
  onCapParamsChange: (params: Record<string, any>) => void;
}) {
  const {
    open,
    onClose,
    activeModelTab,
    aiModelConfigs,
    modelTestModelConfigId,
    setModelTestModelConfigId,
    modelTestSubmitting,
    resetModelTestChat,
    modelTestError,
    modelTestMessages,
    modelTestSessionsLoading,
    modelTestSessions,
    modelTestSessionId,
    setModelTestSessionId,
    createModelTestSession,
    modelTestImageRuns,
    modelTestVideoRuns,
    modelTestLastRaw,
    modelTestInput,
    setModelTestInput,
    submitModelTestChat,
    modelTestSessionImageAttachmentNodeIds,
    parseMentionIndices,
    insertModelTestImageMention,
    removeModelTestSessionImageAttachment,
    addModelTestImages,
    modelTestImagePromptRef,
    modelTestImagePrompt,
    handlePromptChange,
    mentionPopupOpen,
    mentionPosition,
    handleMentionSelect,
    setMentionPopupOpen,
    submitModelTestImage,
    modelTestImageResolution,
    setModelTestImageResolution,
    capParams,
    onCapParamsChange,
  } = props;

  // ---- 加载 catalog capabilities ----
  const [catalogData, setCatalogData] = useState<ManufacturerWithModels[]>([]);
  useEffect(() => {
    if (!open || activeModelTab === "text") return;
    listModelsWithCapabilities(activeModelTab)
      .then((data) => setCatalogData(data || []))
      .catch(() => setCatalogData([]));
  }, [open, activeModelTab]);

  // 根据选中的 model config 匹配 catalog 中的 capabilities
  const selectedCaps: ModelCapabilities = useMemo(() => {
    if (!modelTestModelConfigId) return {};
    const cfg = aiModelConfigs.find((c) => c.id === modelTestModelConfigId);
    if (!cfg) return {};
    // 遍历所有厂商，优先选有 capabilities 的匹配（同一 model code 可能存在于多个厂商下）
    let fallback: ModelCapabilities | null = null;
    for (const mfr of catalogData) {
      const model = mfr.models.find(
        (m) => m.code === cfg.model,
      );
      if (model) {
        const caps = model.model_capabilities || {};
        if (Object.keys(caps).length > 0) return caps;
        if (!fallback) fallback = caps;
      }
    }
    return fallback || {};
  }, [modelTestModelConfigId, aiModelConfigs, catalogData]);

  const hasCaps = Object.keys(selectedCaps).length > 0;

  // 切换模型时重置参数为默认值（与 ModelSelector 逻辑一致）
  useEffect(() => {
    if (!hasCaps) return;
    const defaults: Record<string, any> = {};
    if (Array.isArray(selectedCaps.resolution_tiers) && selectedCaps.resolution_tiers.length > 0) {
      // 简单档位数组（如 ["1K", "2K", "4K"]），默认选 "2K" 或第一个
      const preferred = selectedCaps.resolution_tiers.includes("2K") ? "2K" : selectedCaps.resolution_tiers[0];
      defaults.size = preferred;
    } else if (selectedCaps.resolution_tiers && typeof selectedCaps.resolution_tiers === "object" && !Array.isArray(selectedCaps.resolution_tiers) && Object.keys(selectedCaps.resolution_tiers).length > 0) {
      const tierKeys = Object.keys(selectedCaps.resolution_tiers);
      defaults.resolution_tier = tierKeys[0];
      const tierRes = selectedCaps.resolution_tiers[tierKeys[0]];
      if (tierRes?.length) defaults.resolution = tierRes[0];
    } else if (selectedCaps.resolutions?.length) {
      defaults.resolution = selectedCaps.resolutions[0];
    }
    if (selectedCaps.aspect_ratios?.length) defaults.aspect_ratio = selectedCaps.aspect_ratios[0];
    if (selectedCaps.duration_options?.length) {
      defaults.duration = selectedCaps.duration_options[0];
    } else if (selectedCaps.duration_range) {
      defaults.duration = selectedCaps.duration_range.min;
    }
    if (selectedCaps.input_modes?.length) defaults.input_mode = selectedCaps.input_modes[0];
    onCapParamsChange(defaults);
    if (defaults.resolution) setModelTestImageResolution(String(defaults.resolution));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaps]);

  const [imagePreview, setImagePreview] = useState<{
    src: string;
    downloadHref: string;
    title: string;
  } | null>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        onClose();
      }}
    >
      <div className="h-full w-full p-4 flex items-center justify-center">
        <div className="w-full max-w-6xl h-[90vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col">
          <div className="h-14 px-6 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
            <div className="font-bold text-base text-textMain">模型测试</div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-textMuted font-bold">选择模型配置</label>
                <select
                  value={modelTestModelConfigId}
                  onChange={(e) => setModelTestModelConfigId(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                  disabled={modelTestSubmitting}
                >
                  {aiModelConfigs.length === 0 ? (
                    <option value="">暂无可用模型配置</option>
                  ) : (
                    <>
                      <option value="">请选择…</option>
                      {aiModelConfigs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.manufacturer} · {c.model}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-textMuted font-bold">快捷操作</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetModelTestChat}
                    className="px-4 py-2 rounded-lg text-sm font-bold border border-border bg-surfaceHighlight hover:bg-surfaceHighlight/70 text-textMain transition-colors disabled:opacity-60"
                    disabled={modelTestSubmitting}
                  >
                    清空对话
                  </button>
                </div>
              </div>
            </div>

            {modelTestError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{modelTestError}</div>
            )}

            {(["text", "image", "video"] as AICategory[]).includes(activeModelTab) ? (
              <div className="rounded-2xl border border-border bg-gradient-to-b from-surfaceHighlight/25 to-background/10 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] h-[62vh]">
                  <div className="border-b md:border-b-0 md:border-r border-border bg-surfaceHighlight/15 p-4 flex flex-col min-h-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-textMain">测试会话</div>
                        <div className="text-[11px] text-textMuted mt-1">聊天模式查看与回溯生成记录。</div>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg text-xs font-bold border border-border bg-background hover:bg-surfaceHighlight transition-colors disabled:opacity-60"
                        onClick={() => void createModelTestSession({ category: activeModelTab, aiModelConfigId: modelTestModelConfigId })}
                        disabled={modelTestSubmitting || !modelTestModelConfigId}
                      >
                        新建
                      </button>
                    </div>

                    <div className="mt-3 flex-1 overflow-auto pr-1">
                      {modelTestSessionsLoading ? (
                        <div className="text-xs text-textMuted">加载中...</div>
                      ) : modelTestSessions.length === 0 ? (
                        <div className="text-xs text-textMuted">暂无历史会话。</div>
                      ) : (
                        <div className="space-y-2">
                          {modelTestSessions.map((s) => {
                            const active = s.id === modelTestSessionId;
                            const count = typeof (s as any).run_count === "number" ? (s as any).run_count : (s as any).image_run_count || 0;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setModelTestSessionId(s.id)}
                                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                                  active ? "border-primary/40 bg-primary/10" : "border-border bg-background/30 hover:bg-surfaceHighlight/40"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-bold text-textMain truncate">{s.title}</div>
                                  <div className="text-[11px] text-textMuted whitespace-nowrap">{count}</div>
                                </div>
                                <div className="text-[11px] text-textMuted mt-1 truncate">{s.updated_at || s.id}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col min-h-0 bg-background/20">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                      <div className="text-xs text-textMuted">
                        {modelTestSessionId ? <span className="font-mono">{modelTestSessionId}</span> : <span>请先新建会话或选择历史会话。</span>}
                      </div>
                      <div className="text-xs text-textMuted">
                        {(() => {
                          const cfg = aiModelConfigs.find((c) => c.id === modelTestModelConfigId);
                          if (!cfg) return "未选择模型";
                          return `${cfg.manufacturer} · ${cfg.model}`;
                        })()}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                      {activeModelTab === "text" ? (
                        <>
                          {modelTestSessionId && modelTestMessages.length <= 1 ? <div className="text-sm text-textMuted">该会话暂无记录。</div> : null}
                          {modelTestMessages.map((m, idx) => {
                            const isUser = m.role === "user";
                            const label = m.role === "system" ? "SYSTEM" : isUser ? "YOU" : "AI";
                            const bubble =
                              m.role === "system"
                                ? "bg-surfaceHighlight/40 text-textMain"
                                : isUser
                                  ? "bg-primary/10 text-textMain"
                                  : "bg-background/40 text-textMain";
                            return (
                              <div key={`${m.role}-${idx}`} className={isUser ? "flex justify-end" : "flex justify-start"}>
                                <div className={`max-w-[82%] rounded-xl border border-border px-3 py-2 text-sm whitespace-pre-wrap ${bubble}`}>
                                  <div className="text-[10px] font-bold text-textMuted mb-1">{label}</div>
                                  <div>{m.content}</div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : activeModelTab === "video" ? (
                        <>
                          {modelTestSessionId && modelTestVideoRuns.length === 0 && !modelTestSubmitting ? <div className="text-sm text-textMuted">该会话暂无记录。</div> : null}
                          {modelTestVideoRuns.map((r: any) => {
                            const refCount = r.input_file_node_ids.length || 0;
                            const meta = `${r.aspect_ratio || "auto"} · 参考图 ${refCount}`;
                            const outUrl = r.output_file_node_id ? `/api/vfs/nodes/${encodeURIComponent(r.output_file_node_id)}/download` : null;
                            const isVideoOut = Boolean(outUrl && (r.output_content_type || "").toLowerCase().startsWith("video/"));
                            return (
                              <div key={r.id} className="space-y-2">
                                <div className="flex justify-end">
                                  <div className="max-w-[78%] rounded-2xl border border-border bg-primary/10 px-4 py-3">
                                    <div className="text-[11px] text-textMuted font-bold">YOU</div>
                                    <div className="mt-1 text-sm text-textMain whitespace-pre-wrap">{r.prompt}</div>
                                    <div className="mt-2 text-[11px] text-textMuted">{meta}</div>
                                  </div>
                                </div>

                                <div className="flex justify-start">
                                  <div className="max-w-[78%] rounded-2xl border border-border bg-background/40 px-4 py-3">
                                    <div className="text-[11px] text-textMuted font-bold">AI</div>
                                    {isVideoOut ? (
                                      <video controls className="mt-2 w-full max-h-[320px] rounded-xl border border-border bg-black/20" src={outUrl || ""} />
                                    ) : outUrl ? (
                                      <a href={outUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-primary hover:underline">
                                        下载生成结果
                                      </a>
                                    ) : r.output_url ? (
                                      <a href={r.output_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-primary hover:underline break-all">
                                        打开原始链接
                                      </a>
                                    ) : r.error_message ? (
                                      <div className="mt-2 text-sm text-red-200 whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">{r.error_message}</div>
                                    ) : (
                                      <div className="mt-2 text-sm text-textMuted">（空响应）</div>
                                    )}
                                    <div className="mt-2 text-[11px] text-textMuted">{r.created_at}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {modelTestSubmitting && (
                            <div className="flex justify-start">
                              <div className="max-w-[78%] rounded-2xl border border-border bg-background/40 px-4 py-3 flex items-center gap-2">
                                <LoaderCircle size={16} className="animate-spin text-primary" />
                                <span className="text-sm text-textMuted">视频生成任务已提交，请等待…</span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {modelTestSessionId && modelTestImageRuns.length === 0 ? <div className="text-sm text-textMuted">该会话暂无记录。</div> : null}
                          {modelTestImageRuns.map((r: any) => {
                            const refCount = r.input_file_node_ids.length || r.input_image_count || 0;
                            const meta = `${r.resolution || "auto"} · 参考图 ${refCount}`;
                            const outUrl = r.output_file_node_id ? `/api/vfs/nodes/${encodeURIComponent(r.output_file_node_id)}/download` : null;
                            const isImageOut = Boolean(outUrl && (r.output_content_type || "").toLowerCase().startsWith("image/"));
                            return (
                              <div key={r.id} className="space-y-2">
                                <div className="flex justify-end">
                                  <div className="max-w-[78%] rounded-2xl border border-border bg-primary/10 px-4 py-3">
                                    <div className="text-[11px] text-textMuted font-bold">YOU</div>
                                    <div className="mt-1 text-sm text-textMain whitespace-pre-wrap">{r.prompt}</div>
                                    {r.input_file_node_ids.length > 0 && (
                                      <div className="mt-3 flex items-center gap-2 overflow-x-auto">
                                        {r.input_file_node_ids.map((id: string) => (
                                          <button
                                            key={id}
                                            type="button"
                                            className="h-10 w-10 rounded-xl overflow-hidden border border-border bg-black/10 shrink-0 cursor-pointer hover:border-primary/40 transition-colors"
                                            onClick={() =>
                                              setImagePreview({
                                                src: `/api/vfs/nodes/${encodeURIComponent(id)}/download`,
                                                downloadHref: `/api/vfs/nodes/${encodeURIComponent(id)}/download`,
                                                title: "参考图",
                                              })
                                            }
                                            aria-label="预览参考图"
                                          >
                                            <img src={`/api/vfs/nodes/${encodeURIComponent(id)}/download`} alt="ref" className="h-full w-full object-cover" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="mt-2 text-[11px] text-textMuted">{meta}</div>
                                  </div>
                                </div>

                                <div className="flex justify-start">
                                  <div className="max-w-[78%] rounded-2xl border border-border bg-background/40 px-4 py-3">
                                    <div className="text-[11px] text-textMuted font-bold">AI</div>
                                    {isImageOut ? (
                                      <button
                                        type="button"
                                        className="mt-2 block w-full rounded-xl overflow-hidden border border-border bg-black/20 cursor-pointer hover:border-primary/40 transition-colors"
                                        onClick={() =>
                                          setImagePreview({
                                            src: outUrl || "",
                                            downloadHref: outUrl || "",
                                            title: "生成结果",
                                          })
                                        }
                                        aria-label="预览生成图片"
                                      >
                                        <img src={outUrl || ""} alt="generated" className="w-full max-h-[320px] object-contain" />
                                      </button>
                                    ) : outUrl ? (
                                      <a href={outUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-primary hover:underline">
                                        下载生成结果
                                      </a>
                                    ) : r.output_url ? (
                                      <a href={r.output_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-primary hover:underline break-all">
                                        打开原始链接
                                      </a>
                                    ) : r.error_message ? (
                                      <div className="mt-2 text-sm text-red-200 whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">{r.error_message}</div>
                                    ) : (
                                      <div className="mt-2 text-sm text-textMuted">（空响应）</div>
                                    )}
                                    {isImageOut && outUrl ? (
                                      <div className="mt-2 flex items-center gap-3">
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                                          onClick={() =>
                                            setImagePreview({
                                              src: outUrl,
                                              downloadHref: outUrl,
                                              title: "生成结果",
                                            })
                                          }
                                        >
                                          <ZoomIn size={16} />
                                          放大预览
                                        </button>
                                        <a
                                          href={outUrl}
                                          download
                                          className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                                        >
                                          <Download size={16} />
                                          下载
                                        </a>
                                      </div>
                                    ) : null}
                                    <div className="mt-2 text-[11px] text-textMuted">{r.created_at}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {modelTestSubmitting && (
                            <div className="flex justify-start">
                              <div className="max-w-[78%] rounded-2xl border border-border bg-background/40 px-4 py-3 flex items-center gap-2">
                                <LoaderCircle size={16} className="animate-spin text-primary" />
                                <span className="text-sm text-textMuted">图片生成任务已提交，请等待…</span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-background/20 p-4 text-sm text-textMuted">暂不支持该类型测试。</div>
            )}

            {Boolean(modelTestLastRaw) && (
              <details className="rounded-xl border border-border bg-background/20 p-3">
                <summary className="text-xs font-bold text-textMain cursor-pointer select-none">查看 raw</summary>
                <pre className="mt-3 text-xs text-textMuted overflow-x-auto whitespace-pre-wrap">{JSON.stringify(modelTestLastRaw, null, 2)}</pre>
              </details>
            )}
          </div>

          <div className="border-t border-border bg-surfaceHighlight/20 p-4">
            <div>
              {activeModelTab === "text" ? (
                <div className="flex items-start gap-2">
                  <textarea
                    value={modelTestInput}
                    onChange={(e) => setModelTestInput(e.target.value)}
                    className="flex-1 bg-background border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                    placeholder="输入一条消息，例如：hello"
                    rows={2}
                    disabled={modelTestSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => void submitModelTestChat()}
                    className="bg-primary hover:bg-blue-600 disabled:opacity-60 text-white px-4 py-3 rounded-lg text-sm font-bold transition-all"
                    disabled={modelTestSubmitting || !modelTestInput.trim()}
                  >
                    {modelTestSubmitting ? "发送中..." : "发送"}
                  </button>
                </div>
              ) : (activeModelTab as AICategory) === "image" || (activeModelTab as AICategory) === "video" ? (
                <div className="flex gap-3">
                  {/* 左侧：提示词输入 */}
                  <div className={hasCaps ? "flex-1 min-w-0" : "w-full"}>
                    <ImagePromptComposer
                      prompt={modelTestImagePrompt}
                      onPromptChange={handlePromptChange}
                      onPromptKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setMentionPopupOpen(false);
                          return;
                        }
                        if (e.key !== "Enter") return;
                        if (e.shiftKey) return;
                        e.preventDefault();
                        void submitModelTestImage();
                      }}
                      promptRef={modelTestImagePromptRef}
                      images={modelTestSessionImageAttachmentNodeIds.map((id, idx) => ({
                        id,
                        url: `/api/vfs/nodes/${encodeURIComponent(id)}/download`,
                        index: idx + 1,
                        isSelected: parseMentionIndices(modelTestImagePrompt).includes(idx + 1),
                      }))}
                      mentionPopupOpen={mentionPopupOpen}
                      mentionPosition={mentionPosition}
                      onMentionSelect={handleMentionSelect}
                      onCloseMention={() => setMentionPopupOpen(false)}
                      onUpload={addModelTestImages}
                      onPreview={(url, title) =>
                        setImagePreview({
                          src: url,
                          downloadHref: url,
                          title,
                        })
                      }
                      onInsertMention={insertModelTestImageMention}
                      onRemoveAttachment={removeModelTestSessionImageAttachment}
                      disabled={modelTestSubmitting}
                      submitDisabled={modelTestSubmitting || !modelTestImagePrompt.trim()}
                      submitting={modelTestSubmitting}
                      onSubmit={() => void submitModelTestImage()}
                      placeholder={(activeModelTab as AICategory) === "video" ? "请输入视频生成提示词，输入 @ 引用参考图..." : selectedCaps.supports_reference_image === false ? "请描述你想生成的图片" : "请描述你想生成的图片，输入 @ 引用参考图"}
                      generationLabel={(activeModelTab as AICategory) === "video" ? "视频生成" : "图片生成"}
                      modelLabel={(() => {
                        const cfg = aiModelConfigs.find((c) => c.id === modelTestModelConfigId);
                        if (!cfg) return "未选择模型";
                        return `${cfg.model}`;
                      })()}
                      attachmentCountLabel={`参考 ${modelTestSessionImageAttachmentNodeIds.length}/14`}
                      hideUpload={(activeModelTab as AICategory) === "image" && selectedCaps.supports_reference_image === false}
                    />
                  </div>
                  {/* 右侧：模型参数面板 */}
                  {hasCaps && (
                    <div className="w-[260px] shrink-0 rounded-2xl border border-border bg-surfaceHighlight/20 overflow-hidden flex flex-col">
                      <div className="px-3 py-2 border-b border-border bg-surfaceHighlight/30">
                        <div className="text-xs font-bold text-textMain">生成参数</div>
                      </div>
                      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
                        <CapabilityParams
                          caps={selectedCaps}
                          params={capParams}
                          onChange={(key, value) => {
                            const next = { ...capParams, [key]: value };
                            onCapParamsChange(next);
                            if (key === "resolution") setModelTestImageResolution(String(value));
                          }}
                          onBatchChange={(updates) => {
                            const next = { ...capParams, ...updates };
                            onCapParamsChange(next);
                            if (updates.resolution) setModelTestImageResolution(String(updates.resolution));
                          }}
                          category={activeModelTab === "video" ? "video" : "image"}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-textMuted p-4">请选择测试类型</div>
              )}
              <div className="mt-2 text-xs text-textMuted">该测试接口不扣积分，仅用于验证模型配置可用性。</div>
            </div>
          </div>
        </div>
      </div>

      {imagePreview && (
        <div
          className="fixed inset-0 z-[60] bg-black/70"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setImagePreview(null);
          }}
        >
          <div className="h-full w-full p-4 flex items-center justify-center">
            <div className="w-full max-w-6xl h-[90vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col">
              <div className="h-14 px-6 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
                <div className="font-bold text-base text-textMain truncate">{imagePreview.title}</div>
                <div className="flex items-center gap-2">
                  <a
                    href={imagePreview.downloadHref}
                    download
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-border bg-background hover:bg-surfaceHighlight transition-colors text-textMain inline-flex items-center gap-2"
                  >
                    <Download size={16} />
                    下载
                  </a>
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="p-2 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                    aria-label="关闭预览"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-black/30 flex items-center justify-center p-4">
                <img src={imagePreview.src} alt={imagePreview.title} className="max-h-full max-w-full object-contain rounded-xl border border-border bg-black/20" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


