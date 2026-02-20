"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Loader2, Plus, Send, Square } from "lucide-react";
import {
  AIChatSession,
  AIChatSessionListItem,
  AIChatMessage,
  PlanData,
  TraceEvent,
  SSEventType,
  ChatSessionList,
  ChatMessageList,
} from "@/components/ai-chat";

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

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function parseSseBuffer(buffer: string): { events: SSEventType[]; rest: string } {
  const parts = buffer.split("\n\n");
  const complete = parts.slice(0, -1);
  const rest = parts[parts.length - 1] ?? "";
  const events: SSEventType[] = [];
  for (const chunk of complete) {
    const lines = chunk.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      if (line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const jsonText = line.replace(/^data:\s*/, "");
      try {
        events.push(JSON.parse(jsonText) as SSEventType);
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
    "请先以【对话式】方式说明你将如何协助我完成剧本结构化：",
    "1) 你将做哪些步骤（分集/分场/分镜/资产/提示词等）",
    "2) 每一步会调用哪些工具、分别会产出什么预览结果",
    "3) 我如何在预览里选择【单条落库/批量落库】，以及如何做去重与数据健康检查",
    "",
    `当前 AI Scene：${scene?.name || scene?.scene_code || "未选择"}`,
    toolList,
  ].join("\n");
}

interface EpisodeItem {
  id: string;
  episode_number: number;
  title: string;
}

interface ScriptAIAssistantSessionPaneProps {
  projectId: string;
  episodes?: EpisodeItem[];
  initialSceneCode?: string;
  initialSessionId?: string | null;
  selectedEpisodeId?: string | null;
  onSelectEpisode?: (episodeId: string | null) => void;
}

export function ScriptAIAssistantSessionPane({
  projectId,
  episodes = [],
  initialSceneCode = "asset_extract",
  initialSessionId = null,
  selectedEpisodeId: externalSelectedEpisodeId = null,
  onSelectEpisode,
}: ScriptAIAssistantSessionPaneProps) {
  const [scenes, setScenes] = useState<SceneCatalogItem[]>([]);
  const [scenesLoading, setScenesLoading] = useState(true);
  const [selectedScene, setSelectedScene] = useState<SceneCatalogItem | null>(null);
  const [localSelectedEpisodeId, setLocalSelectedEpisodeId] = useState<string | null>(null);

  const selectedEpisodeId = externalSelectedEpisodeId ?? localSelectedEpisodeId;

  const [sessions, setSessions] = useState<AIChatSessionListItem[]>([]);
  const [currentSession, setCurrentSession] = useState<AIChatSession | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionListCollapsed, setSessionListCollapsed] = useState(false);

  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [streamingContent, setStreamingContent] = useState<string>("");
  const [streamingPlans, setStreamingPlans] = useState<PlanData[]>([]);
  const [streamingTrace, setStreamingTrace] = useState<TraceEvent[]>([]);
  const [executingPlanIds, setExecutingPlanIds] = useState<Set<string>>(new Set());
  const [applyResults, setApplyResults] = useState<Record<string, any>>({});

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sseBufferRef = useRef<string>("");

  const loadScenes = useCallback(async () => {
    setScenesLoading(true);
    try {
      const res = await fetch("/api/ai/scenes");
      const data = await res.json();
      const list = Array.isArray(data?.data?.items) ? data.data.items : Array.isArray(data?.data) ? data.data : [];
      setScenes(list);
      if (list.length > 0) {
        const match = list.find((s: SceneCatalogItem) => s.scene_code === initialSceneCode) || list[0];
        setSelectedScene(match);
      }
    } catch (e) {
      console.error("load scenes error", e);
    } finally {
      setScenesLoading(false);
    }
  }, [initialSceneCode]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/ai/chat/sessions?project_id=${projectId}&page=1&page_size=50`);
      const data = await res.json();
      const items = data?.data?.items || [];
      setSessions(items);
    } catch (e) {
      console.error("load sessions error", e);
    } finally {
      setSessionsLoading(false);
    }
  }, [projectId]);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai/chat/sessions/${sessionId}`);
      const data = await res.json();
      if (data?.data) {
        setCurrentSession(data.data);
        setMessages(data.data.messages || []);
        const scene = scenes.find((s) => s.scene_code === data.data.scene_code);
        if (scene) setSelectedScene(scene);
      }
    } catch (e) {
      console.error("load session error", e);
    }
  }, [scenes]);

  const createSession = useCallback(async () => {
    if (!selectedScene) return;
    try {
      const res = await fetch("/api/ai/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          scene_code: selectedScene.scene_code,
        }),
      });
      const data = await res.json();
      if (data?.data) {
        setCurrentSession(data.data);
        setMessages([]);
        await loadSessions();
      }
    } catch (e) {
      console.error("create session error", e);
    }
  }, [selectedScene, projectId, loadSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`/api/ai/chat/sessions/${sessionId}`, { method: "DELETE" });
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
      await loadSessions();
    } catch (e) {
      console.error("delete session error", e);
    }
  }, [currentSession, loadSessions]);

  useEffect(() => {
    loadScenes();
    loadSessions();
  }, [loadScenes, loadSessions]);

  useEffect(() => {
    if (initialSessionId && scenes.length > 0) {
      loadSession(initialSessionId);
    }
  }, [initialSessionId, scenes, loadSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleSelectSession = useCallback((id: string) => {
    loadSession(id);
  }, [loadSession]);

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || running || !currentSession) return;
    if (!selectedScene) return;

    const userContent = draft.trim();
    setDraft("");
    setErrorText(null);
    setRunning(true);
    setStreamingContent("");
    setStreamingPlans([]);
    setStreamingTrace([]);
    sseBufferRef.current = "";

    const selectedEpisode = episodes.find((ep) => ep.id === selectedEpisodeId);
    let contextPrefix = "";
    if (selectedEpisode) {
      contextPrefix = `[当前剧集：第${selectedEpisode.episode_number}集${selectedEpisode.title ? ` - ${selectedEpisode.title}` : ""}]\n\n`;
    }
    const enrichedContent = contextPrefix + userContent;

    const userMsg: AIChatMessage = {
      id: uid("user"),
      role: "user",
      content: userContent,
      plans: null,
      trace: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`/api/ai/chat/sessions/${currentSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: enrichedContent,
          scene_code: selectedScene.scene_code,
          episode_id: selectedEpisodeId || undefined,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBufferRef.current += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBuffer(sseBufferRef.current);
        sseBufferRef.current = rest;

        for (const evt of events) {
          if (evt.type === "delta" && "delta" in evt) {
            setStreamingContent((prev) => prev + evt.delta);
          } else if (evt.type === "tool_event" && "event" in evt) {
            setStreamingTrace((prev) => [...prev, evt.event]);
          } else if (evt.type === "plans" && "plans" in evt) {
            setStreamingPlans(evt.plans);
          } else if (evt.type === "done" && "message_id" in evt) {
            const assistantMsg: AIChatMessage = {
              id: evt.message_id,
              role: "assistant",
              content: evt.content,
              plans: evt.plans || null,
              trace: evt.trace || null,
              created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setStreamingContent("");
            setStreamingPlans([]);
            setStreamingTrace([]);
          } else if (evt.type === "error" && "message" in evt) {
            setErrorText(evt.message);
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      setErrorText((e as Error).message || "请求失败");
    } finally {
      setRunning(false);
      abortRef.current = null;
      await loadSessions();
    }
  }, [draft, running, currentSession, selectedScene, selectedEpisodeId, episodes, loadSessions]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const handleExecutePlans = useCallback(async (plans: PlanData[]) => {
    if (!projectId || plans.length === 0) return;

    const newExecuting = new Set(plans.map((p) => p.id));
    setExecutingPlanIds((prev) => new Set([...prev, ...newExecuting]));

    try {
      for (const plan of plans) {
        const planWithProject = {
          ...(plan || {}),
          inputs: { ...((plan || {})?.inputs || {}), project_id: projectId },
        };

        const resp = await fetch("/api/apply-plans/execute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan: planWithProject, confirm: true }),
        });

        const bodyText = await resp.text();
        let result: any;
        try {
          result = JSON.parse(bodyText);
        } catch {
          result = { status: resp.status, body: bodyText };
        }

        setApplyResults((prev) => ({
          ...prev,
          [plan.id]: result,
        }));
      }
    } finally {
      setExecutingPlanIds((prev) => {
        const next = new Set(prev);
        plans.forEach((p) => next.delete(p.id));
        return next;
      });
    }
  }, [projectId]);

  const handleHelpClick = useCallback(() => {
    if (!selectedScene) return;
    const prompt = buildIntroPrompt(selectedScene);
    setDraft(prompt);
  }, [selectedScene]);

  const placeholderText = currentSession
    ? "输入你的需求..."
    : "请先选择或创建一个会话...";

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {episodes.length > 0 && (
            <select
              value={selectedEpisodeId || ""}
              onChange={(e) => {
                const val = e.target.value;
                setLocalSelectedEpisodeId(val || null);
                onSelectEpisode?.(val || null);
              }}
              className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-textMain focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">全部剧集</option>
              {episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  第{ep.episode_number}集 {ep.title ? `- ${ep.title}` : ""}
                </option>
              ))}
            </select>
          )}
          <select
            value={selectedScene?.scene_code || ""}
            onChange={(e) => {
              const s = scenes.find((x) => x.scene_code === e.target.value);
              setSelectedScene(s || null);
            }}
            disabled={scenesLoading}
            className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-textMain focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {scenes.map((s) => (
              <option key={s.scene_code} value={s.scene_code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleHelpClick}
          className="p-2 rounded-lg hover:bg-surfaceHighlight/30 text-textMuted hover:text-text transition-colors"
          title="使用说明"
        >
          <HelpCircle size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 flex flex-col">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4">
            {messages.length === 0 && !streamingContent ? (
              <div className="h-full flex items-center justify-center text-textMuted text-sm">
                <div className="text-center">
                  <p className="font-medium mb-1">开始对话</p>
                  <p className="text-xs text-textMuted/70">在下方输入框直接输入需求即可。右上角"？"提供使用说明模板。</p>
                </div>
              </div>
            ) : (
              <ChatMessageList
                messages={messages}
                onExecutePlans={handleExecutePlans}
                isExecutingPlans={executingPlanIds.size > 0}
                streamingContent={streamingContent}
                streamingPlans={streamingPlans}
                streamingTrace={streamingTrace}
              />
            )}
          </div>

          <div className="border-t border-border bg-surface p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={placeholderText}
                disabled={!currentSession || running}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-textMain placeholder:text-textMuted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />

              <button
                type="button"
                onClick={sendMessage}
                disabled={running || !currentSession || !draft.trim()}
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

            {errorText && (
              <div className="mt-2 text-xs text-red-400">{errorText}</div>
            )}
          </div>
        </div>

        <ChatSessionList
          sessions={sessions}
          currentSessionId={currentSession?.id || null}
          onSelectSession={handleSelectSession}
          onNewSession={createSession}
          onDeleteSession={deleteSession}
          isLoading={sessionsLoading}
          collapsed={sessionListCollapsed}
          onToggleCollapse={() => setSessionListCollapsed(!sessionListCollapsed)}
        />
      </div>
    </div>
  );
}
