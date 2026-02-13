"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Plus, RefreshCw, X } from "lucide-react";

import {
  agentAdminActivatePromptVersion,
  agentAdminCreatePromptVersion,
  agentAdminDeletePromptVersion,
  agentAdminDiffPromptVersions,
  agentAdminListPromptVersions,
  agentAdminUpdatePromptVersion,
  type Agent,
  type AgentPromptVersion,
} from "@/components/actions/agent-actions";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

function safePrettyJson(input: string) {
  try {
    const obj = input.trim() ? JSON.parse(input) : {};
    return JSON.stringify(obj, null, 2);
  } catch (_e) {
    return null;
  }
}

type EditorPayload = {
  system_prompt: string;
  user_prompt_template: string;
  description: string;
  metaText: string;
};

function AgentPromptVersionEditorDialog(props: {
  open: boolean;
  agent: Pick<Agent, "id" | "name">;
  editing: AgentPromptVersion | null;
  initial: EditorPayload;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: EditorPayload) => void;
}) {
  const { open, agent, editing, initial, submitting, error, onClose, onSubmit } = props;
  const [activeTab, setActiveTab] = useState<"system" | "user">("system");
  const [systemPrompt, setSystemPrompt] = useState(initial.system_prompt);
  const [userTemplate, setUserTemplate] = useState(initial.user_prompt_template);
  const [description, setDescription] = useState(initial.description);
  const [metaText, setMetaText] = useState(initial.metaText);
  const [metaOpen, setMetaOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActiveTab("system");
    setSystemPrompt(initial.system_prompt);
    setUserTemplate(initial.user_prompt_template);
    setDescription(initial.description);
    setMetaText(initial.metaText);
    setMetaOpen(false);
  }, [open, editing?.version, initial.system_prompt, initial.user_prompt_template, initial.description, initial.metaText]);

  const metaStatus = useMemo(() => {
    if (!metaText.trim()) return { kind: "empty" as const, label: "未设置" };
    const pretty = safePrettyJson(metaText);
    if (pretty === null) return { kind: "invalid" as const, label: "JSON 无效" };
    return { kind: "ok" as const, label: "JSON 已就绪", pretty };
  }, [metaText]);

  const canSubmit = (systemPrompt.trim().length > 0 || userTemplate.trim().length > 0) && metaStatus.kind !== "invalid" && !submitting;

  const title = editing ? `提示词版本 v${editing.version}` : "新增提示词版本";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
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
                  {agent.name}
                </span>
              </div>
              <div className="text-xs text-textMuted mt-1">system_prompt / user_prompt_template 支持 Markdown（user 模板可用 {"{input}"} 等变量）</div>
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
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl px-4 py-3 text-sm">{error}</div>}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_1px_minmax(0,8fr)] gap-6 items-stretch">
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3 pb-1">
                <div className="text-sm font-bold text-textMain">版本信息</div>
                <div className="text-xs text-textMuted font-mono">{editing ? `v${editing.version}` : "new"}</div>
              </div>
              <div className="bg-surfaceHighlight/30 border border-border rounded-xl p-4 space-y-3 flex-1">
                <div className="space-y-2">
                  <label className="text-xs text-textMuted">描述</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                    placeholder="例如：强化JSON输出、修正变量注入"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setMetaOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surfaceHighlight transition-all"
                >
                  <div className="text-sm font-bold text-textMain">高级配置（meta）</div>
                  <div className="text-xs text-textMuted">{metaOpen ? "收起" : "展开"}</div>
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
                        onClick={() => {
                          if (metaStatus.kind === "ok") setMetaText(metaStatus.pretty);
                        }}
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
                      meta 用于存放版本元信息（标签、实验分组、兼容性说明等），不直接参与模型输入。
                    </div>
                  </div>
                )}

                <div className="pt-1 mt-auto grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(systemPrompt)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surfaceHighlight text-sm font-bold text-textMain flex items-center justify-center gap-2"
                  >
                    <Copy size={14} /> 复制 system
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy(userTemplate)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surfaceHighlight text-sm font-bold text-textMain flex items-center justify-center gap-2"
                  >
                    <Copy size={14} /> 复制 user
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden lg:block bg-border/80 rounded-full" />

            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3 pb-1">
                <div className="flex items-center gap-1 bg-surfaceHighlight p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setActiveTab("system")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === "system" ? "bg-surface text-textMain border border-border/60 shadow-sm" : "text-textMuted hover:text-textMain"
                    }`}
                  >
                    system_prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("user")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === "user" ? "bg-surface text-textMain border border-border/60 shadow-sm" : "text-textMuted hover:text-textMain"
                    }`}
                  >
                    user_template
                  </button>
                </div>
                <div className="text-xs text-textMuted font-mono">{activeTab === "system" ? systemPrompt.length : userTemplate.length} chars</div>
              </div>

              <div className="flex-1">
                {activeTab === "system" ? (
                  <MarkdownEditor
                    value={systemPrompt}
                    onChange={setSystemPrompt}
                    placeholder="编辑 system_prompt（支持 Markdown）..."
                    heightClassName="h-[520px]"
                  />
                ) : (
                  <MarkdownEditor
                    value={userTemplate}
                    onChange={setUserTemplate}
                    placeholder="编辑 user_prompt_template（支持 Markdown）..."
                    heightClassName="h-[520px]"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-surface flex items-center justify-between gap-3">
          <div className="text-xs text-textMuted">激活某个版本后，该版本会成为默认并用于运行 Agent。</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surfaceHighlight border border-border rounded-lg text-sm font-bold text-textMain hover:bg-surface transition-all"
              type="button"
            >
              取消
            </button>
            <button
              onClick={() => onSubmit({ system_prompt: systemPrompt, user_prompt_template: userTemplate, description, metaText })}
              disabled={!canSubmit}
              className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              type="button"
            >
              {submitting ? "处理中..." : editing ? "保存修改" : "创建版本"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentPromptVersionsDialog(props: {
  open: boolean;
  agent: Agent | null;
  onClose: () => void;
}) {
  const { open, agent, onClose } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AgentPromptVersion[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSubmitting, setEditorSubmitting] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentPromptVersion | null>(null);
  const [editorInitial, setEditorInitial] = useState<EditorPayload>({
    system_prompt: "",
    user_prompt_template: "{input}",
    description: "",
    metaText: "{}",
  });

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffFrom, setDiffFrom] = useState<number>(1);
  const [diffTo, setDiffTo] = useState<number>(1);
  const [diffText, setDiffText] = useState<string>("");

  const refresh = async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await agentAdminListPromptVersions(agent.id);
      const list = res.data || [];
      setVersions(list);
      if (list.length > 0) {
        setDiffFrom(list[list.length - 1].version);
        setDiffTo(list[0].version);
      } else {
        setDiffFrom(1);
        setDiffTo(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setError(msg);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, agent?.id]);

  const openCreate = () => {
    if (!agent) return;
    setEditing(null);
    setEditorError(null);
    setEditorInitial({
      system_prompt: agent.system_prompt || "",
      user_prompt_template: agent.user_prompt_template || "{input}",
      description: "",
      metaText: "{}",
    });
    setEditorOpen(true);
  };

  const openEdit = (v: AgentPromptVersion) => {
    setEditing(v);
    setEditorError(null);
    setEditorInitial({
      system_prompt: v.system_prompt || "",
      user_prompt_template: v.user_prompt_template || "{input}",
      description: v.description || "",
      metaText: JSON.stringify(v.meta || {}, null, 2),
    });
    setEditorOpen(true);
  };

  const submitEditor = async (payload: EditorPayload) => {
    if (!agent) return;
    setEditorSubmitting(true);
    setEditorError(null);
    const pretty = safePrettyJson(payload.metaText);
    if (pretty === null) {
      setEditorSubmitting(false);
      setEditorError("meta 不是合法 JSON");
      return;
    }
    const meta = payload.metaText.trim() ? (JSON.parse(payload.metaText) as Record<string, unknown>) : {};
    try {
      if (editing) {
        await agentAdminUpdatePromptVersion(agent.id, editing.version, {
          system_prompt: payload.system_prompt,
          user_prompt_template: payload.user_prompt_template,
          description: payload.description || null,
          meta,
        });
      } else {
        await agentAdminCreatePromptVersion(agent.id, {
          system_prompt: payload.system_prompt,
          user_prompt_template: payload.user_prompt_template,
          description: payload.description || null,
          meta,
        });
      }
      setEditorOpen(false);
      setEditing(null);
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setEditorError(msg);
    } finally {
      setEditorSubmitting(false);
    }
  };

  const activate = async (v: AgentPromptVersion) => {
    if (!agent) return;
    try {
      await agentAdminActivatePromptVersion(agent.id, v.version);
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失败";
      setError(msg);
    }
  };

  const remove = async (v: AgentPromptVersion) => {
    if (!agent) return;
    if (!window.confirm(`确认删除 v${v.version}？`)) return;
    try {
      await agentAdminDeletePromptVersion(agent.id, v.version);
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setError(msg);
    }
  };

  const openDiff = () => {
    setDiffError(null);
    setDiffText("");
    setDiffOpen(true);
  };

  const runDiff = async () => {
    if (!agent) return;
    setDiffLoading(true);
    setDiffError(null);
    try {
      const res = await agentAdminDiffPromptVersions(agent.id, diffFrom, diffTo);
      setDiffText((res.data as unknown as { diff?: string })?.diff || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "对比失败";
      setDiffError(msg);
      setDiffText("");
    } finally {
      setDiffLoading(false);
    }
  };

  if (!open || !agent) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-5xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-surface">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-textMain">提示词版本管理</div>
                <div className="text-sm text-textMuted mt-1">{agent.name}</div>
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
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl px-4 py-3 text-sm">{error}</div>}

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-textMuted">默认版本会同步到 Agent 当前 system_prompt/user_template，并用于运行。</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void refresh()}
                  className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                  type="button"
                >
                  <RefreshCw size={16} /> 刷新
                </button>
                <button
                  onClick={() => openDiff()}
                  className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                  type="button"
                  disabled={versions.length < 2}
                >
                  <Eye size={16} /> 对比版本
                </button>
                <button
                  onClick={() => openCreate()}
                  className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                  type="button"
                >
                  <Plus size={16} /> 新增版本
                </button>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                  <tr>
                    <th className="px-6 py-4">版本</th>
                    <th className="px-6 py-4">描述</th>
                    <th className="px-6 py-4">创建时间</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading && versions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-6 text-textMuted">
                        加载中...
                      </td>
                    </tr>
                  )}
                  {!loading && versions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-6 text-textMuted">
                        暂无版本
                      </td>
                    </tr>
                  )}
                  {versions.map((v) => (
                    <tr key={v.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                      <td className="px-6 py-4 text-xs text-textMain font-mono">v{v.version}</td>
                      <td className="px-6 py-4 text-xs text-textMuted">{v.description || "-"}</td>
                      <td className="px-6 py-4 text-xs text-textMuted font-mono">{new Date(v.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                            v.is_default
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${v.is_default ? "bg-green-400" : "bg-gray-500"}`} />
                          {v.is_default ? "DEFAULT" : "VERSION"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(v)}
                            className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain"
                            type="button"
                          >
                            查看/编辑
                          </button>
                          {!v.is_default && (
                            <button
                              onClick={() => void activate(v)}
                              className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain"
                              type="button"
                            >
                              设为默认
                            </button>
                          )}
                          {!v.is_default && (
                            <button
                              onClick={() => void remove(v)}
                              className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold text-red-400"
                              type="button"
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <AgentPromptVersionEditorDialog
        open={editorOpen}
        agent={agent}
        editing={editing}
        initial={editorInitial}
        submitting={editorSubmitting}
        error={editorError}
        onClose={() => {
          setEditorOpen(false);
          setEditorError(null);
        }}
        onSubmit={(payload) => void submitEditor(payload)}
      />

      {diffOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-surface">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold text-textMain">版本对比</div>
                  <div className="text-sm text-textMuted mt-1">{agent.name}</div>
                </div>
                <button
                  onClick={() => {
                    setDiffOpen(false);
                    setDiffError(null);
                  }}
                  className="w-9 h-9 rounded-lg bg-surfaceHighlight border border-border flex items-center justify-center text-textMuted hover:text-textMain"
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {diffError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl px-4 py-3 text-sm">{diffError}</div>}

              <div className="flex items-end justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-textMuted">from</div>
                    <select
                      value={String(diffFrom)}
                      onChange={(e) => setDiffFrom(Number(e.target.value))}
                      className="bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                    >
                      {versions.map((v) => (
                        <option key={`from-${v.id}`} value={String(v.version)}>
                          v{v.version}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-textMuted">to</div>
                    <select
                      value={String(diffTo)}
                      onChange={(e) => setDiffTo(Number(e.target.value))}
                      className="bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                    >
                      {versions.map((v) => (
                        <option key={`to-${v.id}`} value={String(v.version)}>
                          v{v.version}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => void runDiff()}
                    disabled={diffLoading || versions.length < 2}
                    className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                    type="button"
                  >
                    {diffLoading ? "对比中..." : "生成 Diff"}
                  </button>
                </div>
                <div className="text-xs text-textMuted">统一 diff（含 system/user 两段）</div>
              </div>

              <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
                <pre className="max-h-[520px] overflow-auto p-4 text-xs text-textMain font-mono whitespace-pre-wrap">{diffText || ""}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

