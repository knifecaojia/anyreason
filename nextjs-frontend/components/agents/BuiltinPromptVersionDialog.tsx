"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Sparkles, X } from "lucide-react";

import { MarkdownEditor } from "@/components/ui/markdown-editor";

type Props = {
  open: boolean;
  agentCode: string;
  editingVersion: { version: number } | null;
  initialSystemPrompt: string;
  initialModelConfigId: string | null;
  initialDescription: string;
  initialMetaText: string;
  modelConfigs: Array<{ id: string; category: string; manufacturer: string; model: string }>;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: { system_prompt: string; ai_model_config_id: string | null; description: string; metaText: string }) => void;
};

function safePrettyJson(input: string) {
  try {
    const obj = input.trim() ? JSON.parse(input) : {};
    return JSON.stringify(obj, null, 2);
  } catch (_e) {
    return null;
  }
}

export function BuiltinPromptVersionDialog({
  open,
  agentCode,
  editingVersion,
  initialSystemPrompt,
  initialModelConfigId,
  initialDescription,
  initialMetaText,
  modelConfigs,
  submitting,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const [modelConfigId, setModelConfigId] = useState<string | null>(initialModelConfigId);
  const [description, setDescription] = useState(initialDescription);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaText, setMetaText] = useState(initialMetaText);

  const title = editingVersion ? `编辑内置提示词 v${editingVersion.version}` : "新增内置提示词版本";

  const metaStatus = useMemo(() => {
    if (!metaText.trim()) return { kind: "empty" as const, label: "未设置" };
    const pretty = safePrettyJson(metaText);
    if (pretty === null) return { kind: "invalid" as const, label: "JSON 无效" };
    return { kind: "ok" as const, label: "JSON 已就绪", pretty };
  }, [metaText]);

  const canSubmit = systemPrompt.trim().length > 0 && metaStatus.kind !== "invalid" && !submitting;

  useEffect(() => {
    if (!open) return;
    setSystemPrompt(initialSystemPrompt);
    setModelConfigId(initialModelConfigId);
    setDescription(initialDescription);
    setMetaText(initialMetaText);
    setMetaOpen(false);
  }, [open, editingVersion?.version, initialSystemPrompt, initialModelConfigId, initialDescription, initialMetaText]);

  const applyPrettyMeta = () => {
    if (metaStatus.kind !== "ok") return;
    setMetaText(metaStatus.pretty);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(systemPrompt);
    } catch (_e) {
      return;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-surface">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-lg font-bold text-textMain">{title}</div>
                <span className="px-2 py-1 rounded-full text-[10px] font-bold border border-border text-textMuted bg-surfaceHighlight/40">
                  {agentCode || "-"}
                </span>
              </div>
              <div className="text-xs text-textMuted mt-1">
                system_prompt 支持 Markdown（便于结构化：标题/列表/引用/代码块）
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-surfaceHighlight border border-border flex items-center justify-center text-textMuted hover:text-textMain"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_1px_minmax(0,8fr)] gap-6 items-stretch">
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3 pb-1">
                <div className="text-sm font-bold text-textMain">版本信息</div>
                <div className="text-xs text-textMuted font-mono">{editingVersion ? `v${editingVersion.version}` : "new"}</div>
              </div>
              <div className="bg-surfaceHighlight/30 border border-border rounded-xl p-4 space-y-3 flex-1">

                <div className="space-y-2">
                  <label className="text-xs text-textMuted">描述</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                    placeholder="例如：更严格的 JSON 输出、补充字段解释"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-textMuted">默认模型（随版本生效）</label>
                  <select
                    value={modelConfigId || ""}
                    onChange={(e) => setModelConfigId(e.target.value || null)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                  >
                    <option value="">继承 Agent 默认模型</option>
                    {modelConfigs
                      .filter((c) => c.category === "text")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.manufacturer} · {c.model}
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setMetaOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surfaceHighlight transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-blue-300" />
                    <div className="text-sm font-bold text-textMain">高级配置（meta）</div>
                  </div>
                  <ChevronDown size={16} className={`text-textMuted transition-transform ${metaOpen ? "rotate-180" : ""}`} />
                </button>

                {metaOpen && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                          metaStatus.kind === "invalid"
                            ? "border-red-500/30 text-red-300 bg-red-500/10"
                            : metaStatus.kind === "ok"
                              ? "border-green-500/30 text-green-300 bg-green-500/10"
                              : "border-border text-textMuted bg-surfaceHighlight/30"
                        }`}
                      >
                        {metaStatus.label}
                      </div>
                      <button
                        type="button"
                        onClick={applyPrettyMeta}
                        className="px-2 py-1 rounded-md text-[10px] font-bold text-textMain border border-border bg-surface hover:bg-surfaceHighlight disabled:opacity-50"
                        disabled={metaStatus.kind !== "ok"}
                      >
                        美化
                      </button>
                    </div>
                    <textarea
                      value={metaText}
                      onChange={(e) => setMetaText(e.target.value)}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-textMain outline-none font-mono h-[240px] focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                      placeholder='{"tags":["stable"],"notes":"..."}'
                    />
                    <div className="text-[11px] leading-relaxed text-textMuted">
                      meta 用于存放“版本元信息”（例如标签、实验分组、兼容性说明、UI 提示、未来的运行参数），不会直接参与模型输入。
                    </div>
                  </div>
                )}

                <div className="pt-1 mt-auto">
                  <button
                    type="button"
                    onClick={() => copyToClipboard()}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surfaceHighlight text-sm font-bold text-textMain flex items-center justify-center gap-2"
                  >
                    <Copy size={14} /> 复制 system_prompt
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden lg:block bg-border/80 rounded-full" />

            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3 pb-1">
                <div className="text-sm font-bold text-textMain">system_prompt</div>
                <div className="text-xs text-textMuted font-mono">{systemPrompt.length} chars</div>
              </div>
              <div className="flex-1">
                <MarkdownEditor
                  value={systemPrompt}
                  onChange={setSystemPrompt}
                  placeholder="在这里编辑提示词（支持 Markdown）..."
                  heightClassName="h-[520px]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-surface flex items-center justify-between gap-3">
          <div className="text-xs text-textMuted">
            保存后可在版本列表中设为默认。默认版本会影响未覆盖用户。
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surfaceHighlight border border-border rounded-lg text-sm font-bold text-textMain hover:bg-surface transition-all"
              type="button"
            >
              取消
            </button>
            <button
              onClick={() => onSubmit({ system_prompt: systemPrompt, ai_model_config_id: modelConfigId, description, metaText })}
              disabled={!canSubmit}
              className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              type="button"
            >
              {submitting ? "处理中..." : editingVersion ? "保存修改" : "创建版本"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
