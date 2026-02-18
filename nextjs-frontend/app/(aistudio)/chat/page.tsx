"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Send,
  Square,
  ChevronDown,
  Sparkles,
  Wrench,
  FileText,
  User,
  RefreshCw,
  PanelRightClose,
  PanelRightOpen,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
} from "lucide-react";
import { AssetList } from "@/components/chat/AssetCard";

type SceneItem = {
  scene_code: string;
  name: string;
  description?: string | null;
  type?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
};

type TraceEvent = {
  id: string;
  type: string;
  tool_id?: string;
  label?: string;
  status?: "pending" | "running" | "done" | "error";
  preview?: Record<string, unknown>;
  timestamp: Date;
};

type PlanPreview = {
  id: string;
  kind: string;
  tool_id: string;
  preview: Record<string, unknown>;
};

type SseEvent = {
  type?: string;
  delta?: string;
  output_text?: string;
  plans?: PlanPreview[];
  tool_id?: string;
  label?: string;
  status?: string;
  preview?: Record<string, unknown>;
  [k: string]: unknown;
};

function parseSseLines(buffer: string): { events: SseEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const complete = parts.slice(0, -1);
  const rest = parts[parts.length - 1] ?? "";
  const events: SseEvent[] = [];
  for (const chunk of complete) {
    const lines = chunk.split("\n").filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonText = line.slice(6);
        try {
          events.push(JSON.parse(jsonText));
        } catch {
          events.push({ type: "error", message: "invalid_event" });
        }
      }
    }
  }
  return { events, rest };
}

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={12} className="text-green-400" />;
    case "running":
      return <Clock size={12} className="text-amber-400 animate-pulse" />;
    case "error":
      return <AlertCircle size={12} className="text-red-400" />;
    default:
      return <Clock size={12} className="text-textMuted" />;
  }
}

export default function ChatPage() {
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [plans, setPlans] = useState<PlanPreview[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [panelTab, setPanelTab] = useState<"trace" | "plans">("trace");
  const [scenesLoading, setScenesLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  const selectedSceneInfo = useMemo(
    () => scenes.find((s) => s.scene_code === selectedScene) || null,
    [scenes, selectedScene]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadScenes = useCallback(async () => {
    setScenesLoading(true);
    try {
      const res = await fetch("/api/ai/scenes", { cache: "no-store" });
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      const data: SceneItem[] = json?.data || [];
      setScenes(data);
      if (!selectedScene && data.length) {
        setSelectedScene(data[0].scene_code);
      }
    } catch (e) {
      console.error("加载场景失败:", e);
    } finally {
      setScenesLoading(false);
    }
  }, [selectedScene]);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !selectedScene || isStreaming) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const assistantMessageId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);
    setTraceEvents([]);
    setPlans([]);
    streamingMessageIdRef.current = assistantMessageId;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`/api/ai/scenes/${selectedScene}/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: null,
          script_text: "",
          messages: [{ role: "user", content: text }],
          context_exclude_types: [],
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseLines(buffer);
        buffer = parsed.rest;

        for (const evt of parsed.events) {
          if (evt.type === "delta" && typeof evt.delta === "string") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + evt.delta }
                  : m
              )
            );
          } else if (evt.type === "done" && typeof evt.output_text === "string") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: evt.output_text ?? "", isStreaming: false }
                  : m
              )
            );
          } else if (evt.type === "plans" && Array.isArray(evt.plans)) {
            setPlans(
              evt.plans.map((p) => ({
                id: generateId(),
                kind: String(p.kind || ""),
                tool_id: String(p.tool_id || ""),
                preview: (p.preview || {}) as Record<string, unknown>,
              }))
            );
          } else if (evt.type === "trace" || evt.tool_id) {
            const traceEvt: TraceEvent = {
              id: generateId(),
              type: String(evt.type || "tool_call"),
              tool_id: evt.tool_id ? String(evt.tool_id) : undefined,
              label: evt.label ? String(evt.label) : undefined,
              status: (evt.status as TraceEvent["status"]) || "done",
              preview: (evt.preview || {}) as Record<string, unknown>,
              timestamp: new Date(),
            };
            setTraceEvents((prev) => [...prev, traceEvt]);
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") {
        return;
      }
      const errMsg = e instanceof Error ? e.message : "请求失败";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: `错误: ${errMsg}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      streamingMessageIdRef.current = null;
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
      );
    }
  }, [input, selectedScene, isStreaming]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
    setTraceEvents([]);
    setPlans([]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="h-14 px-4 border-b border-border bg-surface/80 backdrop-blur-sm flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
          <div className="relative">
            <select
              value={selectedScene}
              onChange={(e) => setSelectedScene(e.target.value)}
              disabled={scenesLoading || isStreaming}
              className="appearance-none bg-surfaceHighlight border border-border rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-textMain cursor-pointer hover:border-textMuted focus:outline-none focus:border-primary disabled:opacity-50"
            >
              {scenes.map((s) => (
                <option key={s.scene_code} value={s.scene_code}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
            />
          </div>
          {selectedSceneInfo?.description && (
            <span className="text-xs text-textMuted hidden md:inline max-w-xs truncate">
              {selectedSceneInfo.description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={messages.length === 0 || isStreaming}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors disabled:opacity-50"
          >
            清空
          </button>
          <button
            type="button"
            onClick={() => setShowPanel(!showPanel)}
            className="p-2 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
            title={showPanel ? "隐藏面板" : "显示面板"}
          >
            {showPanel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-textMuted">
                <div className="w-16 h-16 rounded-2xl bg-surfaceHighlight flex items-center justify-center mb-4">
                  <Sparkles size={28} className="text-primary" />
                </div>
                <div className="text-lg font-medium text-textMain mb-2">开始对话</div>
                <div className="text-sm text-center max-w-sm">
                  选择一个 AI 场景，输入你的需求，开始与 AI 助手交互。
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                    <Bot size={14} className="text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-white"
                      : "bg-surface border border-border"
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse" />
                    )}
                  </div>
                  <div
                    className={`text-[10px] mt-2 ${
                      msg.role === "user" ? "text-white/60" : "text-textMuted"
                    }`}
                  >
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-surfaceHighlight flex items-center justify-center flex-shrink-0 border border-border">
                    <User size={14} className="text-textMuted" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-border bg-surface/50">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                    disabled={isStreaming}
                    rows={1}
                    className="w-full resize-none rounded-xl bg-surface border border-border px-4 py-3 text-sm text-textMain placeholder-textMuted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50 transition-all"
                    style={{ minHeight: "48px", maxHeight: "160px" }}
                  />
                </div>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                  >
                    <Square size={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || !selectedScene}
                    className="px-4 rounded-xl bg-primary hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {showPanel && (
          <div className="w-80 border-l border-border bg-surface/50 flex flex-col flex-shrink-0">
            <div className="h-12 px-4 border-b border-border flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPanelTab("trace")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  panelTab === "trace"
                    ? "bg-surfaceHighlight text-textMain"
                    : "text-textMuted hover:text-textMain"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Wrench size={14} />
                  追踪
                  {traceEvents.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      {traceEvents.length}
                    </span>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPanelTab("plans")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  panelTab === "plans"
                    ? "bg-surfaceHighlight text-textMain"
                    : "text-textMuted hover:text-textMain"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <FileText size={14} />
                  结果
                  {plans.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
                      {plans.length}
                    </span>
                  )}
                </div>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {panelTab === "trace" && (
                <>
                  {traceEvents.length === 0 && (
                    <div className="text-sm text-textMuted text-center py-8">
                      工具调用追踪将在这里显示
                    </div>
                  )}
                  {traceEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 rounded-lg bg-background border border-border space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusIcon status={evt.status} />
                          <span className="text-xs font-medium text-textMain">
                            {evt.label || evt.tool_id || evt.type}
                          </span>
                        </div>
                        <span className="text-[10px] text-textMuted">
                          {formatTime(evt.timestamp)}
                        </span>
                      </div>
                      {evt.preview && Object.keys(evt.preview).length > 0 && (
                        <pre className="text-[10px] text-textMuted bg-surfaceHighlight rounded p-2 overflow-x-auto">
                          {JSON.stringify(evt.preview, null, 2).slice(0, 200)}
                        </pre>
                      )}
                    </div>
                  ))}
                </>
              )}

              {panelTab === "plans" && (
                <>
                  {plans.length === 0 && (
                    <div className="text-sm text-textMuted text-center py-8">
                      预览结果将在这里显示
                    </div>
                  )}
                  {plans.map((plan) => {
                    const isAssetPlan = plan.kind === "asset_create";
                    const files = isAssetPlan && plan.preview?.files;
                    const assetList = Array.isArray(files)
                      ? files.map((f: Record<string, unknown>) => ({
                          type: (f?.type || "character") as "character" | "prop" | "location" | "vfx",
                          name: String(f?.name || "未命名"),
                          description: undefined,
                          keywords: [],
                        }))
                      : [];

                    return (
                      <div
                        key={plan.id}
                        className="p-3 rounded-lg bg-background border border-border space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {isAssetPlan ? (
                              <Layers size={12} className="text-green-400" />
                            ) : (
                              <FileText size={12} className="text-primary" />
                            )}
                            <span className={`text-xs font-bold ${isAssetPlan ? "text-green-400" : "text-primary"}`}>
                              {plan.kind}
                            </span>
                          </div>
                          <span className="text-[10px] text-textMuted">
                            {plan.tool_id}
                          </span>
                        </div>

                        {assetList.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-[10px] text-textMuted">
                              已提取 {assetList.length} 个资产
                            </div>
                            <AssetList assets={assetList} maxCompact={2} />
                          </div>
                        ) : (
                          <pre className="text-[10px] text-textMuted bg-surfaceHighlight rounded p-2 overflow-x-auto max-h-40">
                            {JSON.stringify(plan.preview, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
