"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Loader2, Send, Square, Image as ImageIcon, FileText, Maximize2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTasks } from "@/components/tasks/TaskProvider";
import type { TaskEventPayload } from "@/lib/tasks/types";

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

type SceneCatalogItem = {
  scene_code: string;
  name: string;
  type: string;
  description?: string | null;
  builtin_agent_code?: string | null;
  required_tools?: string[];
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  ui_config?: Record<string, unknown>;
};

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type SseEvent = {
  type?: string;
  [k: string]: any;
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function normalizeNameKey(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，,。．·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const complete = parts.slice(0, -1);
  const rest = parts[parts.length - 1] ?? "";
  const events: SseEvent[] = [];
  for (const chunk of complete) {
    const lines = chunk.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      if (line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const jsonText = line.replace(/^data:\s*/, "");
      try {
        events.push(JSON.parse(jsonText));
      } catch {
        events.push({ type: "error", message: "invalid_event" });
      }
    }
  }
  return { events, rest };
}

function buildIntroPrompt(scene: SceneCatalogItem | null) {
  const tools = Array.isArray(scene?.required_tools) ? scene?.required_tools : [];
  const toolList = tools.length ? `可用工具：${tools.join(", ")}` : "可用工具：未声明（以系统实际可调用为准）";
  return [
    "请先以“对话式”方式说明你将如何协助我完成剧本结构化：",
    "1) 你将做哪些步骤（分集/分场/分镜/资产/提示词等）",
    "2) 每一步会调用哪些工具、分别会产出什么预览结果",
    "3) 我如何在预览里选择“单条落库/批量落库”，以及如何做去重与数据健康检查",
    "",
    `当前 AI Scene：${scene?.name || scene?.scene_code || "未选择"}`,
    toolList,
  ].join("\n");
}

function Bubble(props: { role: ChatRole; children: React.ReactNode }) {
  const { role } = props;
  const isUser = role === "user";
  return (
    <div className={`w-full flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[82%] rounded-2xl border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser ? "bg-primary/15 border-primary/25 text-textMain" : "bg-surfaceHighlight/20 border-border text-textMain",
        ].join(" ")}
      >
        {props.children}
      </div>
    </div>
  );
}

function MappingHint(props: { kind: string }) {
  const kind = props.kind;
  const text =
    kind === "episode_save"
      ? "映射：分集 Markdown → VFS /分集/ + episodes.episode_doc_node_id"
      : kind === "storyboard_apply"
        ? "映射：镜头列表 → storyboards 表"
        : kind === "image_prompt_upsert"
          ? "映射：提示词 → image_prompts 表"
          : kind === "video_prompt_upsert"
            ? "映射：提示词 → video_prompts 表"
            : kind === "asset_create"
              ? "映射：资产文档 → VFS /资产/<类型>/（md+json）"
              : "";
  if (!text) return null;
  return <div className="text-[11px] text-textMuted truncate">{text}</div>;
}

export function ScriptAIAssistantChatboxPane(props: {
  projectId: string;
  scriptText: string;
  episodeHint?: { episode_id?: string | null; episode_code?: string | null } | null;
  episodes?: { id: string; episode_code: string; title?: string | null }[];
  activeEpisodeId?: string | null;
  onEpisodeChange?: (episodeId: string | null) => void;
}) {
  const { projectId, scriptText, episodeHint, episodes = [], activeEpisodeId, onEpisodeChange } = props;
  const { subscribeTask } = useTasks();

  const [scenes, setScenes] = useState<SceneCatalogItem[]>([]);
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [trace, setTrace] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [applyResult, setApplyResult] = useState<any | null>(null);
  const [assetSelections, setAssetSelections] = useState<Record<string, Record<string, boolean>>>({});
  const [rightTab, setRightTab] = useState<"plans" | "trace">("plans");

  const [previewAsset, setPreviewAsset] = useState<{ name: string; detailsMd: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const taskUnsubRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const lastPayloadRef = useRef<{ scene: string; payload: any } | null>(null);

  const selected = useMemo(() => scenes.find((s) => s.scene_code === selectedScene) || null, [scenes, selectedScene]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadScenes = useCallback(async () => {
    const res = await fetch("/api/ai/scenes", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    const data: SceneCatalogItem[] = json?.data || [];
    setScenes(data);
    if (!selectedScene && data.length) setSelectedScene(data[0].scene_code);
  }, [selectedScene]);

  useEffect(() => {
    void loadScenes();
  }, [loadScenes]);

  const syncDraftHeight = useCallback(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 220);
    el.style.height = `${Math.max(next, 52)}px`;
  }, []);

  useEffect(() => {
    syncDraftHeight();
  }, [draft, syncDraftHeight]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (taskUnsubRef.current) {
      taskUnsubRef.current();
      taskUnsubRef.current = null;
    }
    setRunning(false);
  }, []);

  const applyPlan = useCallback(
    async (plan: any) => {
      setApplyResult(null);
      const planWithProject = {
        ...(plan || {}),
        inputs: { ...((plan || {})?.inputs || {}), project_id: projectId || null },
      };
      const resp = await fetch("/api/apply-plans/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: planWithProject, confirm: true }),
      });
      const bodyText = await resp.text();
      try {
        setApplyResult(JSON.parse(bodyText));
      } catch {
        setApplyResult({ status: resp.status, body: bodyText });
      }
    },
    [projectId],
  );

  const applySelectedAssets = useCallback(
    async (plan: any, selectedKeys: string[]) => {
      const rawAssets: any[] = Array.isArray(plan?.inputs?.assets) ? plan.inputs.assets : [];
      const selectedSet = new Set(selectedKeys);
      const filtered = rawAssets.filter((a: any) => selectedSet.has(String(a?._client_key)));
      const planWithSelection = {
        ...(plan || {}),
        inputs: {
          ...((plan || {})?.inputs || {}),
          project_id: projectId || null,
          assets: filtered,
        },
      };
      setApplyResult(null);
      const resp = await fetch("/api/apply-plans/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: planWithSelection, confirm: true }),
      });
      const bodyText = await resp.text();
      try {
        setApplyResult(JSON.parse(bodyText));
      } catch {
        setApplyResult({ status: resp.status, body: bodyText });
      }
    },
    [projectId],
  );

  const pullOnce = useCallback(async () => {
    const last = lastPayloadRef.current;
    if (!last) return;
    setRunning(true);
    setErrorText(null);
    try {
      const resp = await fetch(`/api/ai/scenes/${encodeURIComponent(last.scene)}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(last.payload),
      });
      if (!resp.ok) {
        setErrorText(`http_${resp.status}`);
        return;
      }
      const json = await resp.json();
      const data = json?.data || {};
      if (typeof data?.output_text === "string") {
        setMessages((m) => {
          const next = [...m];
          const lastAssistant = [...next].reverse().findIndex((x) => x.role === "assistant");
          if (lastAssistant >= 0) {
            const idx = next.length - 1 - lastAssistant;
            next[idx] = { ...next[idx], content: data.output_text };
            return next;
          }
          return [...next, { id: uid("assistant"), role: "assistant", content: data.output_text }];
        });
      }
      setPlans(Array.isArray(data?.plans) ? data.plans : []);
      setTrace(Array.isArray(data?.trace_events) ? data.trace_events : []);
      setRightTab("plans");
    } catch (e: any) {
      setErrorText(String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const run = useCallback(async () => {
    if (!selectedScene || running) return;
    const userText = draft.trim();
    if (!userText) return;

    setRunning(true);
    setErrorText(null);
    setPlans([]);
    setTrace([]);
    setApplyResult(null);
    setAssetSelections({});

    const episodeLine = episodeHint?.episode_code ? `episode=${episodeHint.episode_code}` : episodeHint?.episode_id ? `episode_id=${episodeHint.episode_id}` : "";
    const userContent = [episodeLine, userText].filter(Boolean).join("\n");
    const userMsg: ChatMessage = { id: uid("user"), role: "user", content: userContent };
    const assistantMsgId = uid("assistant");

    setMessages((prev) => [...prev, userMsg, { id: assistantMsgId, role: "assistant", content: "" }]);
    setDraft("");

    const payloadMessages = [...messages, userMsg]
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => String(m.content || "").trim().length > 0);

    const payload = {
      project_id: projectId || null,
      script_text: scriptText || "",
      messages: payloadMessages,
      context_exclude_types: [],
    };
    lastPayloadRef.current = { scene: selectedScene, payload };

    const controller = new AbortController();
    abortRef.current = controller;

    if (taskUnsubRef.current) {
      taskUnsubRef.current();
      taskUnsubRef.current = null;
    }

    try {
      const resp = await fetch(`/api/ai/scenes/${encodeURIComponent(selectedScene)}/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!resp.ok) {
        setErrorText(`http_${resp.status}`);
        setRunning(false);
        return;
      }

      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        // Handle Async Task
        const json = await resp.json();
        const taskData = json?.data;
        if (!taskData?.id) {
          setErrorText("Task creation failed");
          setRunning(false);
          return;
        }
        
        // Subscribe to task events
        taskUnsubRef.current = subscribeTask(taskData.id, (ev: TaskEventPayload) => {
          if (ev.event_type === "log" && ev.payload?.payload) {
             const p = ev.payload.payload as { type?: string; delta?: string };
             if (p.type === "delta" && typeof p.delta === "string") {
                setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + p.delta } : m)));
             } else if (p.type && p.type !== "start" && p.type !== "archive") {
                setTrace((t) => [...t, p]);
             }
          } else if (ev.event_type === "succeeded") {
             const res = ev.result_json;
             if (res) {
                if (typeof res.output_text === "string") {
                   const outputText = res.output_text as string;
                   setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: outputText } : m)));
                }
                if (Array.isArray(res.plans)) {
                   setPlans(res.plans);
                   setRightTab("plans");
                }
                if (Array.isArray(res.trace_events)) {
                   // Merge or replace trace? Replace is safer for final state
                   setTrace(res.trace_events);
                }
             }
             setRunning(false);
             if (taskUnsubRef.current) {
               taskUnsubRef.current();
               taskUnsubRef.current = null;
             }
          } else if (ev.event_type === "failed") {
             setErrorText(ev.error || "Task failed");
             setRunning(false);
             if (taskUnsubRef.current) {
               taskUnsubRef.current();
               taskUnsubRef.current = null;
             }
          }
        });
        return;
      }

      if (!resp.body) {
        setErrorText("No response body");
        setRunning(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let lastAssistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.rest;

        for (const evt of parsed.events) {
          if (evt.type === "delta" && typeof evt.delta === "string") {
            lastAssistantText += evt.delta;
            const txt = lastAssistantText;
            setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: txt } : m)));
          } else if (evt.type === "plans") {
            setPlans(Array.isArray(evt.plans) ? evt.plans : []);
            setRightTab("plans");
          } else if (evt.type === "done") {
            if (typeof evt.output_text === "string") {
              lastAssistantText = evt.output_text;
              const txt = lastAssistantText;
              setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: txt } : m)));
            }
          } else if (evt.type !== "start" && evt.type !== "archive") {
            setTrace((t) => [...t, evt]);
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setErrorText(String(e));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [draft, episodeHint?.episode_code, episodeHint?.episode_id, messages, projectId, running, scriptText, selectedScene]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void run();
      }
    },
    [run],
  );

  const plansPanel = (
    <div className="space-y-3">
      {plans.length === 0 ? (
        <div className="text-xs text-textMuted">暂无 plans（当工具产出结构化预览时会显示在这里）</div>
      ) : (
        plans.map((p: any, idx: number) => {
          const planId = String(p?.id || idx);
          const kind = String(p?.kind || "");
          const toolId = String(p?.tool_id || "");
          const rawOutputText = typeof p?.preview?.raw_output_text === "string" ? p.preview.raw_output_text : "";
          const assetType = String(p?.inputs?.asset_type || "");
          const rawAssets: any[] = Array.isArray(p?.inputs?.assets) ? p.inputs.assets : [];
          const assets = rawAssets.map((a, i) => ({ ...(a || {}), _client_key: String(i) }));
          const selectedMap = assetSelections[planId] || {};
          const allKeys = assets.map((a) => String(a._client_key));
          const selectedKeys = allKeys.filter((k) => selectedMap[k] !== false);
          const hasAssets = kind === "asset_create" && assets.length > 0;

          const dupGroups = (() => {
            if (!hasAssets) return [];
            const m = new Map<string, string[]>();
            for (const a of assets) {
              const k = normalizeNameKey(String(a?.name || ""));
              if (!k) continue;
              const list = m.get(k) || [];
              list.push(String(a._client_key));
              m.set(k, list);
            }
            return Array.from(m.entries())
              .map(([k, keys]) => ({ k, keys }))
              .filter((g) => g.keys.length > 1);
          })();

          const applyOnlyDedupRecommended = () => {
            const next: Record<string, boolean> = {};
            for (const key of allKeys) next[key] = false;
            for (const g of dupGroups) {
              const keep = g.keys[0];
              next[keep] = true;
            }
            const nonDup = new Set<string>();
            for (const key of allKeys) nonDup.add(key);
            for (const g of dupGroups) for (const k of g.keys) nonDup.delete(k);
            for (const k of nonDup) next[k] = true;
            setAssetSelections((s) => ({ ...s, [planId]: next }));
          };

          const selectAllAssets = (on: boolean) => {
            const next: Record<string, boolean> = {};
            for (const key of allKeys) next[key] = on;
            setAssetSelections((s) => ({ ...s, [planId]: next }));
          };

          const toggleAsset = (key: string, on: boolean) => {
            setAssetSelections((s) => ({ ...s, [planId]: { ...(s[planId] || {}), [key]: on } }));
          };

          return (
            <div key={planId} className="rounded-xl border border-border bg-background/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-textMain truncate">
                    {kind} / {toolId}
                  </div>
                  <div className="mt-1">
                    <MappingHint kind={kind} />
                  </div>
                </div>
                <div className="shrink-0">
                  {hasAssets ? (
                    <button
                      onClick={() => void applySelectedAssets({ ...p, inputs: { ...(p.inputs || {}), assets } }, selectedKeys)}
                      disabled={!selectedKeys.length}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                      type="button"
                    >
                      执行所选（{selectedKeys.length}）
                    </button>
                  ) : (
                    <button
                      onClick={() => void applyPlan(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
                      type="button"
                    >
                      执行落库
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {hasAssets ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-textMuted">
                        {assetType ? `资产类型：${assetType}` : "资产列表"}
                        {dupGroups.length ? <span className="ml-2 text-yellow-400 font-bold">发现重复：{dupGroups.length} 组</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => selectAllAssets(true)}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                          type="button"
                        >
                          全选
                        </button>
                        <button
                          onClick={() => selectAllAssets(false)}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                          type="button"
                        >
                          全不选
                        </button>
                        {dupGroups.length ? (
                          <button
                            onClick={applyOnlyDedupRecommended}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors"
                            type="button"
                          >
                            仅保留推荐
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assets.map((a) => {
                        const key = String(a._client_key);
                        const checked = selectedMap[key] !== false;
                        const name = String(a?.name || "");
                        const keywords = Array.isArray(a?.keywords) ? a.keywords.map(String).filter(Boolean) : [];
                        const detailsMd = stripMarkdownMetadata(String(a?.details_md || ""));
                        return (
                          <div key={key} className="group relative flex flex-col rounded-xl border border-border bg-gradient-to-br from-surface/80 to-surface/40 overflow-hidden hover:border-primary/50 transition-all hover:shadow-lg h-64">
                            {/* Checkbox Overlay */}
                            <div className="absolute top-2 left-2 z-20">
                              <input 
                                type="checkbox" 
                                checked={checked} 
                                onChange={(e) => toggleAsset(key, e.target.checked)} 
                                className="w-4 h-4 rounded border-gray-400 bg-white/80 checked:bg-primary"
                              />
                            </div>
                            
                            {/* Top Preview Area (Click to open full preview) */}
                            <div 
                              className="h-28 relative bg-black/10 flex-shrink-0 cursor-pointer"
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
                            <div className="flex-1 p-3 border-t border-border/50 bg-surface/30 overflow-hidden relative flex flex-col cursor-pointer" onClick={() => setPreviewAsset({ name, detailsMd })}>
                               <div className="font-bold text-sm text-textMain truncate mb-1" title={name}>
                                 {name || "(未命名)"}
                               </div>
                               <div className="flex-1 overflow-hidden relative">
                                 {detailsMd ? (
                                   <div className="markdown-body prose prose-invert prose-xs max-w-none text-[10px] leading-relaxed opacity-80 pointer-events-none select-none line-clamp-4">
                                     <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailsMd}</ReactMarkdown>
                                   </div>
                                 ) : (
                                   <div className="text-[10px] text-textMuted opacity-50">无文档内容</div>
                                 )}
                                 <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface/30 to-transparent pointer-events-none" />
                               </div>
                            </div>
                            
                            {/* Footer Area */}
                            <div className="px-3 py-2 border-t border-border/50 bg-surface/60 backdrop-blur-sm flex items-center justify-between gap-2 flex-shrink-0 text-[10px] text-textMuted">
                               <div className="truncate flex-1" title={keywords.join(", ")}>
                                 {keywords.length ? keywords.slice(0, 2).join(" · ") : "无关键词"}
                               </div>
                               <div className="bg-surfaceHighlight px-1.5 py-0.5 rounded text-[9px] truncate max-w-[60px]">
                                 {String(a?.type || assetType || "未知")}
                               </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <pre className="text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[240px] overflow-y-auto">{JSON.stringify(p.preview || {}, null, 2)}</pre>
                )}

                {rawOutputText ? (
                  <details>
                    <summary className="text-[11px] text-textMuted cursor-pointer">原始输出（raw_output_text）</summary>
                    <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[240px] overflow-y-auto">{rawOutputText}</pre>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      {applyResult ? (
        <div className="rounded-xl border border-border bg-background/20 p-3">
          <div className="text-[11px] text-textMuted">落库结果</div>
          <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto">{JSON.stringify(applyResult, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );

  const helpText = useMemo(() => buildIntroPrompt(selected), [selected]);

  return (
    <div className="chatbox-pane rounded-2xl border border-border bg-surface overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="px-5 py-4 border-b border-border bg-surfaceHighlight/30 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-sm text-textMain">AI 助手（Chatbox 模式）</div>
          <div className="mt-1 text-[11px] text-textMuted truncate">
            Scene：{selected?.name || selectedScene || "未选择"}
            {episodeHint?.episode_code ? ` · ${episodeHint.episode_code}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <select
            value={activeEpisodeId || ""}
            onChange={(e) => onEpisodeChange?.(e.target.value || null)}
            disabled={episodes.length === 0 || running}
            className="bg-background border border-border rounded-lg px-3 py-2 text-xs"
          >
            {episodes.length === 0 ? (
              <option value="">暂无剧集</option>
            ) : (
              <>
                <option value="">全部剧集</option>
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.episode_code} {ep.title || ""}
                  </option>
                ))}
              </>
            )}
          </select>

          <select
            value={selectedScene}
            onChange={(e) => setSelectedScene(e.target.value)}
            disabled={!scenes.length || running}
            className="bg-background border border-border rounded-lg px-3 py-2 text-xs"
          >
            {scenes.map((s) => (
              <option key={s.scene_code} value={s.scene_code}>
                {s.name} ({s.scene_code})
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-lg border border-border overflow-hidden bg-surface/60">
            <button
              type="button"
              onClick={() => setRightTab("plans")}
              className={`px-3 py-2 text-xs font-bold transition-colors ${rightTab === "plans" ? "bg-surfaceHighlight text-textMain" : "text-textMuted hover:text-textMain"}`}
            >
              Plans
            </button>
            <button
              type="button"
              onClick={() => setRightTab("trace")}
              className={`px-3 py-2 text-xs font-bold transition-colors ${rightTab === "trace" ? "bg-surfaceHighlight text-textMain" : "text-textMuted hover:text-textMain"}`}
            >
              Trace
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              className="h-9 w-9 rounded-lg border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors flex items-center justify-center"
              title="使用说明"
            >
              <HelpCircle size={16} />
            </button>
            {helpOpen ? (
              <div className="absolute right-0 top-11 z-50 w-[380px] max-w-[80vw] rounded-xl border border-border bg-surface shadow-xl">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                  <div className="text-xs font-bold text-textMain">使用说明</div>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    关闭
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="text-[11px] text-textMuted">建议：先用一句话说明目标 + 明确要调用的工具 + 要求产出 ApplyPlan。</div>
                  <pre className="text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto rounded-lg border border-border bg-background/20 p-3">
                    {helpText}
                  </pre>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(helpText);
                        setHelpOpen(false);
                        requestAnimationFrame(() => syncDraftHeight());
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
                    >
                      填入到输入框
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] flex-1 min-h-0">
        <div className="flex flex-col h-full min-h-0">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-background/20">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-border bg-background/30 p-4">
                <div className="text-sm font-bold text-textMain">开始对话</div>
                <div className="mt-2 text-xs text-textMuted">在下方输入框直接输入需求即可。右上角“？”提供使用说明模板。</div>
              </div>
            ) : (
              messages.map((m) => (
                <Bubble key={m.id} role={m.role}>
                  {m.content || (m.role === "assistant" && running ? "…" : "")}
                </Bubble>
              ))
            )}
          </div>

          <div className="border-t border-border bg-surface p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 rounded-2xl border border-border bg-background/20 overflow-hidden">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  ref={draftRef}
                  className="w-full bg-transparent p-3 text-sm text-textMain outline-none resize-none overflow-hidden"
                  placeholder="输入消息…（Ctrl/⌘ + Enter 发送）"
                  spellCheck={false}
                  disabled={running}
                />
              </div>

              <button
                type="button"
                onClick={() => void run()}
                disabled={running || !selectedScene || !draft.trim()}
                className="h-[52px] px-4 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {running ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                发送
              </button>

              <button
                type="button"
                onClick={stop}
                disabled={!running}
                className="h-[52px] px-4 rounded-2xl border border-border bg-surface/60 hover:bg-surfaceHighlight text-sm font-bold text-textMuted hover:text-textMain transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Square size={16} />
                停止
              </button>
            </div>

            {errorText ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-xs text-red-400 whitespace-pre-wrap">{errorText}</div>
                <button
                  type="button"
                  onClick={() => void pullOnce()}
                  className="px-3 py-2 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                >
                  拉取结果
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="hidden lg:block border-l border-border bg-surface p-4 h-full min-h-0 overflow-y-auto">
          {rightTab === "plans" ? (
            plansPanel
          ) : (
            <div className="rounded-xl border border-border bg-background/20 p-3">
              <div className="text-[11px] text-textMuted">Trace（工具/事件）</div>
              <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[720px] overflow-y-auto">
                {trace.length ? JSON.stringify(trace, null, 2) : ""}
              </pre>
            </div>
          )}
        </div>
      </div>
      
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
