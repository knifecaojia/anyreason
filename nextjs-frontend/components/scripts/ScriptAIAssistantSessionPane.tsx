"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Loader2, Plus, Send, Square, Check } from "lucide-react";
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
import { useTasks } from "@/components/tasks/TaskProvider";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

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
/**
 * Validate and map raw plan objects from backend result_json to PlanData[].
 *
 * Backend `ApplyPlan.model_dump(mode='json')` produces:
 *   { id: string, kind: string, tool_id: string, inputs: object, preview: object }
 * which already matches the frontend PlanData interface.
 *
 * This function ensures each item has the required fields and correct types,
 * filtering out any malformed entries rather than crashing at render time.
 */
export function mapResultPlans(raw: unknown): PlanData[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const mapped: PlanData[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    // Best-effort mapping with defaults instead of silently dropping plans
    const id = typeof obj.id === "string" ? obj.id : (console.warn(`mapResultPlans: plan[${i}] missing/invalid 'id', defaulting`), String(i));
    const kind = typeof obj.kind === "string" ? obj.kind : (console.warn(`mapResultPlans: plan[${i}] missing/invalid 'kind', defaulting`), "unknown");
    const tool_id = typeof obj.tool_id === "string" ? obj.tool_id : (console.warn(`mapResultPlans: plan[${i}] missing/invalid 'tool_id', defaulting`), "");
    
    let inputs = (typeof obj.inputs === "object" && obj.inputs !== null ? obj.inputs : {}) as Record<string, unknown>;
    // Handle case where inputs might be a JSON string (sometimes happens with LLM outputs)
     if (typeof obj.inputs === "string") {
         try {
             let jsonStr = obj.inputs.trim();
             // Try standard JSON parse first
             inputs = JSON.parse(jsonStr);
         } catch (e) {
             // Fallback: Try to parse Python-style dict string
             try {
                 const fixed = (obj.inputs as string)
                    .replace(/'/g, '"')
                    .replace(/None/g, 'null')
                    .replace(/True/g, 'true')
                    .replace(/False/g, 'false');
                 inputs = JSON.parse(fixed);
             } catch (e2) {
                 console.warn("mapResultPlans: failed to parse inputs string (JSON and Python-style)", e, e2);
             }
         }
     }

    const preview = (typeof obj.preview === "object" && obj.preview !== null ? obj.preview : undefined) as PlanData["preview"];
    
    // Parse JSON strings in inputs if they are stringified
    if (typeof inputs.shots === "string") {
      try {
        inputs.shots = JSON.parse(inputs.shots as string);
      } catch (e) {
        // Try Python-style list string parsing heuristic
        const raw = (inputs.shots as string).trim();
        if (raw.startsWith("[") && raw.includes("'")) {
             try {
                 // Dangerous heuristic: convert Python repr to JSON
                 const fixed = raw
                    .replace(/'/g, '"')
                    .replace(/None/g, 'null')
                    .replace(/True/g, 'true')
                    .replace(/False/g, 'false');
                 inputs.shots = JSON.parse(fixed);
             } catch {}
        }
      }
    }

    mapped.push({
      id,
      kind,
      tool_id,
      inputs,
      preview,
    });
  }
  return mapped.length > 0 ? mapped : null;
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

import { TaskProgressMonitor } from "@/components/tasks/TaskProgressMonitor";

export function ScriptAIAssistantSessionPane({
  projectId,
  episodes = [],
  initialSceneCode = "asset_extract",
  initialSessionId = null,
  selectedEpisodeId: externalSelectedEpisodeId = null,
  onSelectEpisode,
}: ScriptAIAssistantSessionPaneProps) {
  const { subscribeTask, upsertTask } = useTasks();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<SceneCatalogItem[]>([]);
  const [scenesLoading, setScenesLoading] = useState(true);
  const [selectedScene, setSelectedScene] = useState<SceneCatalogItem | null>(null);
  const [localSelectedEpisodeIds, setLocalSelectedEpisodeIds] = useState<string[]>([]);
  
  // Use either external selected ID (as array) or local selection
  const effectiveSelectedEpisodeIds = useMemo(() => {
    if (externalSelectedEpisodeId) return [externalSelectedEpisodeId];
    return localSelectedEpisodeIds;
  }, [externalSelectedEpisodeId, localSelectedEpisodeIds]);

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
  const streamingTraceRef = useRef<TraceEvent[]>([]);
  const [executingPlanIds, setExecutingPlanIds] = useState<Set<string>>(new Set());
  const [applyResults, setApplyResults] = useState<Record<string, any>>({});

  const abortRef = useRef<AbortController | null>(null);
  const loadingSessionRef = useRef<string | null>(null);
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
    // Dedup: skip if already loading this session (prevents double/triple calls from click+dblclick)
    if (loadingSessionRef.current === sessionId) return;
    loadingSessionRef.current = sessionId;

    // Clean up previous session state to avoid memory leaks and stale subscriptions.
    // Setting activeTaskId to null triggers the useEffect cleanup which calls unsubscribe().
    setActiveTaskId(null);
    setRunning(false);
    setStreamingContent("");
    setStreamingPlans([]);
    setStreamingTrace([]);
    streamingTraceRef.current = [];
    setErrorText(null);

    try {
      const res = await fetch(`/api/ai/chat/sessions/${sessionId}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.data) {
        setCurrentSession(data.data);
        // Validate plans in loaded messages through mapResultPlans to ensure
        // data consistency with live task results (same validation path).
        const rawMessages: AIChatMessage[] = data.data.messages || [];
        const validatedMessages = rawMessages.map((msg: AIChatMessage) => ({
          ...msg,
          plans: msg.plans ? mapResultPlans(msg.plans) : null,
        }));
        setMessages(validatedMessages);
        
        // Try to restore active task if any
        // The session data doesn't have active task ID, but we can infer or fetch it?
        // Actually, for now, if we switch session, we lose the "active task monitoring" unless we persist it.
        // But the user issue is "double click card -> cannot load task progress (unfinished)".
        // If the task is unfinished, it should be in "running" state in backend.
        // We can search for running tasks associated with this session?
        // The Task model has input_json which contains session_id.
        
        // Let's try to find a running task for this session
        try {
            // We need an API to list tasks by session_id in input_json, which is hard with current API.
            // But we can list tasks by user and filter client side or ask backend to support filter.
            // Current list_tasks supports entity_type/id.
            // Maybe we can assume entity_type="scene" and entity_id=scene_id? No.
            // The task was created with entity_type="scene" and entity_id=scene.id.
            
            // However, the input_json has session_id.
            // Let's fetch recent tasks and check?
            // Or better, let's just not support "resume monitoring after refresh/switch" for now
            // unless we store task_id in the session model?
            
            // Wait, the user said "Double click card -> cannot load task progress".
            // This implies they expect to see the progress bar if the task is still running.
            // Since we don't store task_id in AIChatSession, we can't easily know which task belongs to this session.
            
            // But wait, if the task is running, there is no message in the session yet (or just user message).
            // So the chat looks "stuck".
            
            // Workaround: fetch recent running tasks and check their input_json.session_id
            const tasksRes = await fetch(`/api/tasks?status=queued,running&size=20`);
            const tasksData = await tasksRes.json();
            const runningTasks = tasksData?.data?.items || [];
            // 匹配 session_id（在 input_json 中），取所有匹配项
            const matchingTasks = runningTasks.filter(
                (t: any) => t.input_json?.session_id === sessionId
            );
            if (matchingTasks.length > 0) {
                // 取最新的 running task（列表按创建时间倒序，第一个即最新）
                setActiveTaskId(matchingTasks[0].id);
                setRunning(true);
            } else {
                setActiveTaskId(null);
                setRunning(false);
                
                // Check if we need to recover messages from task results.
                // Case 1: session has no messages at all (backend save may have failed)
                // Case 2: session has assistant messages but plans are missing/null
                const hasAssistantWithoutPlans = validatedMessages.some(
                  (m: AIChatMessage) => m.role === "assistant" && (!m.plans || m.plans.length === 0)
                );
                
                // Relaxed recovery condition: recover if ANY assistant message is missing plans, or no messages at all.
                // Previously we skipped recovery if *any* message had plans, which caused the latest message to be ignored if missing plans.
                const needsRecovery = rawMessages.length === 0 || hasAssistantWithoutPlans;
                
                if (needsRecovery) {
                  try {
                    // Fetch tasks explicitly linked to this session (new API)
                     // This avoids fetching unrelated tasks and reduces payload size (4MB -> relevant only)
                     const sessionTasksRes = await fetch(`/api/ai/chat/sessions/${sessionId}/tasks`);
                     let matchedSucceeded: any[] = [];
                     
                     if (sessionTasksRes.ok) {
                          const sessionTasksData = await sessionTasksRes.json();
                          matchedSucceeded = sessionTasksData?.data || [];
                     } 
                     
                     // If new API returns nothing (e.g. old session without links), try fallback
                     if (matchedSucceeded.length === 0) {
                          // Fallback for old sessions or if API fails: try the old heuristic (but with smaller size)
                          // We keep this for backward compatibility or if the backend migration isn't applied yet
                          console.warn("[loadSession] No linked tasks found, falling back to heuristic search");
                          const succeededRes = await fetch(`/api/tasks?status=succeeded&type=ai_assistant_chat&size=20`);
                          const succeededData = await succeededRes.json();
                          const succeededTasks = succeededData?.data?.items || [];
                          const normalizeId = (id: unknown) => String(id || "").toLowerCase().trim();
                          const targetSid = normalizeId(sessionId);
                          matchedSucceeded = succeededTasks.filter(
                            (t: any) => normalizeId(t.input_json?.session_id) === targetSid
                          );
                     }

                    if (matchedSucceeded.length > 0) {
                      if (rawMessages.length === 0) {
                        // Full reconstruction: no messages at all
                        const reconstructed: AIChatMessage[] = [];
                        // Sort by created_at asc for reconstruction
                        const sortedTasks = [...matchedSucceeded].sort((a, b) => 
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        );
                        
                        for (const t of sortedTasks) {
                          const inputMsgs = t.input_json?.messages || [];
                          const lastUserMsg = [...inputMsgs].reverse().find((m: any) => m.role === "user");
                          if (lastUserMsg) {
                            reconstructed.push({
                              id: `recovered-user-${t.id}`,
                              role: "user",
                              content: lastUserMsg.content || t.input_json?.script_text || "",
                              plans: null,
                              trace: null,
                              created_at: t.created_at || new Date().toISOString(),
                            });
                          }
                          const result = t.result_json;
                          if (result) {
                            reconstructed.push({
                              id: `recovered-assistant-${t.id}`,
                              role: "assistant",
                              content: String(result.output_text || ""),
                              plans: mapResultPlans(result.plans),
                              trace: result.trace_events || null,
                              created_at: t.finished_at || new Date().toISOString(),
                            });
                          }
                        }
                        if (reconstructed.length > 0) {
                          console.warn("[loadSession] session had no messages, reconstructed from tasks:", reconstructed.length);
                          setMessages(reconstructed);
                        }
                      } else {
                        // Partial recovery: messages exist but plans are missing
                        // Try to patch plans from the most recent matching task
                        // matchedSucceeded is usually desc if from API list, but let's ensure we get the latest
                        const latestTask = matchedSucceeded.sort((a, b) => 
                            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        )[0];
                        
                        const taskPlans = mapResultPlans(latestTask.result_json?.plans);
                        const taskTrace = latestTask.result_json?.trace_events || null;
                        
                        if (taskPlans && taskPlans.length > 0) {
                          // Only patch the LATEST assistant message to avoid incorrect history patching
                          // Find the last assistant message index
                          const lastAssistantIdx = validatedMessages.map(m => m.role).lastIndexOf("assistant");
                          
                          if (lastAssistantIdx >= 0) {
                              const targetMsg = validatedMessages[lastAssistantIdx];
                              if (!targetMsg.plans || targetMsg.plans.length === 0) {
                                  const patched = [...validatedMessages];
                                  patched[lastAssistantIdx] = {
                                      ...targetMsg,
                                      plans: taskPlans,
                                      trace: targetMsg.trace || taskTrace
                                  };
                                  console.warn("[loadSession] patched latest assistant message from task result");
                                  setMessages(patched);
                              }
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.error("check succeeded tasks error", e);
                  }
                }
            }
        } catch (e) {
            console.error("check running tasks error", e);
        }

        const scene = scenes.find((s) => s.scene_code === data.data.scene_code);
        if (scene) setSelectedScene(scene);
      }
    } catch (e) {
      console.error("load session error", e);
    } finally {
      loadingSessionRef.current = null;
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
        
        // Auto-inject context if we have episodes selected
        if (effectiveSelectedEpisodeIds.length > 0) {
            let contextPrefix = "";
            const selectedEps = episodes.filter(ep => effectiveSelectedEpisodeIds.includes(ep.id));
            if (selectedEps.length > 0) {
                if (selectedEps.length === 1) {
                   const ep = selectedEps[0];
                   contextPrefix = `[当前剧集：第${ep.episode_number}集${ep.title ? ` - ${ep.title}` : ""}]`;
                } else {
                   const epNums = selectedEps.map(ep => `第${ep.episode_number}集`).join("、");
                   contextPrefix = `[选定剧集范围：${epNums}]`;
                }
                
                // Add a system-like message to context (but displayed as user message for visibility?)
                // Or just prepopulate draft? 
                // Let's prepopulate draft with context so user knows what's happening
                // setDraft(prev => prev ? `${contextPrefix}\n\n${prev}` : `${contextPrefix}\n\n`);
                
                // Actually, the user asked to "inject scene info".
                // If we mean "system context", we might want to send an initial message invisibly?
                // But the user usually wants to ASK something about the scene.
                // Let's just set the draft so the user sees the context is active.
                // OR better: Just ensure the NEXT message sends the context (which sendMessage already does).
                
                // However, if the user wants "All new sessions to have scene info", 
                // maybe we should just trigger the "Help" prompt automatically?
                // Or just let the user type.
                
                // The issue "click + is invalid" might be because selectedScene is null initially?
                // check loadScenes logic.
            }
        }
      }
    } catch (e) {
      console.error("create session error", e);
    }
  }, [selectedScene, projectId, loadSessions, effectiveSelectedEpisodeIds, episodes]);

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

  const deleteAllSessions = useCallback(async () => {
    try {
      const url = projectId 
        ? `/api/ai/chat/sessions?project_id=${projectId}` 
        : `/api/ai/chat/sessions`;
        
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      setCurrentSession(null);
      setMessages([]);
      await loadSessions();
    } catch (e) {
      console.error("delete all sessions error", e);
      alert("删除失败，请重试");
    }
  }, [projectId, loadSessions]);

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
    setActiveTaskId(null);

    // Build context based on selection
    let contextPrefix = "";
    if (effectiveSelectedEpisodeIds.length > 0) {
      // Find selected episodes
      const selectedEps = episodes.filter(ep => effectiveSelectedEpisodeIds.includes(ep.id));
      if (selectedEps.length > 0) {
        if (selectedEps.length === 1) {
           const ep = selectedEps[0];
           contextPrefix = `[当前剧集：第${ep.episode_number}集${ep.title ? ` - ${ep.title}` : ""}]\n\n`;
        } else {
           // Multiple episodes
           const epNums = selectedEps.map(ep => `第${ep.episode_number}集`).join("、");
           contextPrefix = `[选定剧集范围：${epNums}]\n\n`;
        }
      }
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

    try {
      const res = await fetch(`/api/ai/scenes/${selectedScene.scene_code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          session_id: currentSession.id,
          script_text: enrichedContent, // For now we pass content as script_text, or we should use messages?
          // The backend ai_scene_chat uses AISceneRunChatRequest which has script_text AND messages.
          // But here we are integrating with the session-based chat UI which usually sends messages.
          // However, the `ai_scene_chat` endpoint creates a TASK.
          // We need to decide if we want to use the session API (which stores messages in DB) 
          // or the direct scene API (which is stateless or task-based).
          
          // Wait, the previous implementation used `/api/ai/chat/sessions/${currentSession.id}/messages`.
          // That endpoint likely calls `ai_scene_chat` internally or similar logic.
          // If we want to "align with scene test and use task", we should probably 
          // let the session API create the task, OR call the scene API directly and handle the task here.
          
          // If we call `/api/ai/chat/sessions/.../messages`, it currently returns SSE.
          // The user wants "full async task". 
          // So we should probably modify the frontend to call the SCENE API (which now returns a task),
          // and then poll/listen to that task.
          
          // But we also want to persist the chat history in the session.
          // The `ai_scene_chat` endpoint (Task) does NOT automatically save to `AIChatSession`.
          
          // Option A: Update `/api/ai/chat/sessions/.../messages` to return a Task ID instead of SSE.
          // Option B: Frontend calls `ai_scene_chat` (Task), and MANUALLY adds messages to the UI.
          //           But then history is lost on refresh unless we also save it.
          
          // Given the user wants "align to scene test", let's use the scene API directly for now
          // and treat this as a "Task Runner" rather than a persistent chat session if needed,
          // OR we accept that we might lose history if we don't save it.
          
          // actually, the user said "AI助手对齐到ai场景测试", which implies using the same mechanism.
          // The Scene Test page uses `ai_scene_test_chat` task.
          // Let's call the scene API which now returns a Task.
          
          messages: [{ role: "user", content: enrichedContent }],
          context_exclude_types: [],
          episode_ids: effectiveSelectedEpisodeIds, // Pass explicitly selected episodes
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const json = await res.json();
      const taskData = json.data;
      if (!taskData?.id) {
        throw new Error("Task creation failed");
      }
      
      // Upsert the new task immediately so TaskProgressMonitor can find it
      if (taskData) {
        upsertTask(taskData as any);
      }

      setActiveTaskId(taskData.id);

      // We need to subscribe to the task to get updates and eventually the result
      // The result will contain output_text, plans, etc.
      // We can then simulate an "assistant" message being added.
      
    } catch (e: unknown) {
      setErrorText((e as Error).message || "请求失败");
      setRunning(false);
    }
  }, [draft, running, currentSession, selectedScene, effectiveSelectedEpisodeIds, episodes, projectId]);

  const currentSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id || null;
  }, [currentSession]);

  // Effect to listen to active task
  useEffect(() => {
    if (!activeTaskId) return;

    let assistantMsgId = uid("assistant");
    
    const unsubscribe = subscribeTask(activeTaskId, (event) => {
      if (event.event_type === "log" && event.payload) {
         const payload = event.payload as any;
         // Handle trace events from log
         if (payload.type === "tool_event" || payload.type === "agent_run_start" || payload.type === "agent_run_done" || payload.type === "tool_start" || payload.type === "tool_done") {
             // Map to TraceEvent — update both state (for rendering) and ref (for succeeded callback)
             setStreamingTrace(prev => {
               const next = [...prev, payload];
               streamingTraceRef.current = next;
               return next;
             });
         }
      }
      
      if (event.event_type === "succeeded") {
        // Defect 1 fix: fallback fetch when WebSocket payload is incomplete
        // Defect 2 fix: read trace from ref instead of stale closure
        // Defect 3 fix: fetch-then-append only, no loadSession call
        // Defect 4 fix: defer setActiveTaskId(null) and setRunning(false) until after message append
        const buildAndAppendMessage = (resultJson: Record<string, unknown> | undefined) => {
          const assistantMsg: AIChatMessage = {
            id: assistantMsgId,
            role: "assistant",
            content: String(resultJson?.output_text || ""),
            plans: mapResultPlans(resultJson?.plans),
            trace: streamingTraceRef.current, // Defect 2: use ref, not stale closure
            created_at: new Date().toISOString(),
          };

          // Defect 3: single write strategy — append only, no loadSession
          setMessages((prev) => {
            if (prev.some((m) => m.id === assistantMsgId)) return prev;
            return [...prev, assistantMsg];
          });
          setStreamingContent("");
          setStreamingPlans([]);
          setStreamingTrace([]);
          streamingTraceRef.current = [];
          // Defect 4: defer cleanup until AFTER message is appended
          setActiveTaskId(null);
          setRunning(false);
        };

        const result = event.result_json;
        const isIncomplete = !result || !result.plans || !result.output_text;

        if (isIncomplete) {
          // Fallback: fetch full task details from API
          (async () => {
            try {
              const res = await fetch(`/api/tasks/${encodeURIComponent(activeTaskId)}`, { cache: "no-store" });
              if (res.ok) {
                const json = await res.json();
                const fetchedResult = json?.data?.result_json;
                buildAndAppendMessage(fetchedResult ?? result);
              } else {
                console.warn("Fallback fetch for task result failed, using WebSocket payload", res.status);
                buildAndAppendMessage(result);
              }
            } catch (e) {
              console.warn("Fallback fetch for task result errored, using WebSocket payload", e);
              buildAndAppendMessage(result);
            }
          })();
        } else {
          buildAndAppendMessage(result);
        }
      }
      
      if (event.event_type === "failed") {
        setErrorText(event.error || "任务失败");
        setActiveTaskId(null);
        setRunning(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeTaskId, subscribeTask]);

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
        const baseInputs = { ...((plan || {})?.inputs || {}), project_id: projectId } as Record<string, unknown>;
        const hasStoryboardId = String((baseInputs as any)?.storyboard_id || "").trim().length > 0;
        
        // Use first selected episode if multiple? or require explicit?
        // For simplicity, if multiple selected, we might fail or just pick first.
        const targetEpId = effectiveSelectedEpisodeIds.length > 0 ? effectiveSelectedEpisodeIds[0] : null;

        if (plan.kind === "storyboard_apply" && !hasStoryboardId && !targetEpId) {
          setApplyResults((prev) => ({
            ...prev,
            [plan.id]: { code: 400, msg: "请选择目标剧集后再执行分镜落库（需要 episode_id 或 storyboard_id）" },
          }));
          continue;
        }
        const planWithProject: PlanData = {
          ...(plan || {}),
          inputs:
            plan.kind === "storyboard_apply" && !hasStoryboardId && targetEpId
              ? { ...baseInputs, episode_id: targetEpId, storyboard_id: null } // Explicitly set storyboard_id to null for new creation
              : baseInputs,
        };

        const taskResp = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "apply_plan_execute",
            entity_type: "project",
            entity_id: projectId,
            input_json: { plan: planWithProject, confirm: true },
          }),
        });
        const taskText = await taskResp.text();
        let taskJson: any = null;
        try {
          taskJson = JSON.parse(taskText);
        } catch {
          taskJson = null;
        }
        const taskId = String(taskJson?.data?.id || "").trim();
        if (!taskId) {
          setApplyResults((prev) => ({
            ...prev,
            [plan.id]: { code: taskResp.status, msg: "任务创建失败", body: taskText },
          }));
          continue;
        }

        setApplyResults((prev) => ({
          ...prev,
          [plan.id]: { code: 200, msg: "已提交后台任务", data: { task_id: taskId } },
        }));

        const unsub = subscribeTask(taskId, async (ev) => {
          if (ev.event_type !== "succeeded" && ev.event_type !== "failed" && ev.event_type !== "canceled") return;
          try {
            const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
            const txt = await res.text();
            let detail: any;
            try {
              detail = JSON.parse(txt);
            } catch {
              detail = { status: res.status, body: txt };
            }
            const resultJson = detail?.data?.result_json;
            setApplyResults((prev) => ({
              ...prev,
              [plan.id]: resultJson || { code: res.status, msg: "任务无结果", data: detail?.data || null },
            }));
          } finally {
            unsub();
          }
        });
      }
    } finally {
      setExecutingPlanIds((prev) => {
        const next = new Set(prev);
        plans.forEach((p) => next.delete(p.id));
        return next;
      });
    }
  }, [projectId, effectiveSelectedEpisodeIds, subscribeTask]);

  const handleHelpClick = useCallback(() => {
    if (!selectedScene) return;
    const prompt = buildIntroPrompt(selectedScene);
    setDraft(prompt);
  }, [selectedScene]);

  const placeholderText = currentSession
    ? "输入你的需求..."
    : "请先选择或创建一个会话...";

  const selectedEpisodeSummary = useMemo(() => {
    if (effectiveSelectedEpisodeIds.length === 0) return "未选择剧集";
    if (effectiveSelectedEpisodeIds.length === episodes.length) return "全部剧集";
    const selected = episodes.filter(ep => effectiveSelectedEpisodeIds.includes(ep.id));
    if (selected.length === 1) return `第${selected[0].episode_number}集`;
    return `已选 ${selected.length} 集`;
  }, [effectiveSelectedEpisodeIds, episodes]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {episodes.length > 0 && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-textMain focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between min-w-[120px]">
                  <span className="truncate max-w-[150px]">{selectedEpisodeSummary}</span>
                  <span className="ml-2 opacity-50">▼</span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="min-w-[200px] bg-surface border border-border rounded-lg shadow-lg p-1 z-50 max-h-[300px] overflow-y-auto">
                   <DropdownMenu.Item 
                      className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-surfaceHighlight outline-none"
                      onSelect={(e) => {
                        e.preventDefault();
                        if (effectiveSelectedEpisodeIds.length === episodes.length) {
                            setLocalSelectedEpisodeIds([]);
                        } else {
                            setLocalSelectedEpisodeIds(episodes.map(ep => ep.id));
                        }
                      }}
                   >
                      <div className={`w-4 h-4 mr-2 border border-textMuted rounded flex items-center justify-center ${effectiveSelectedEpisodeIds.length === episodes.length ? 'bg-primary border-primary text-white' : ''}`}>
                         {effectiveSelectedEpisodeIds.length === episodes.length && <Check size={12} />}
                      </div>
                      全选
                   </DropdownMenu.Item>
                   {episodes.map(ep => {
                     const isSelected = effectiveSelectedEpisodeIds.includes(ep.id);
                     return (
                       <DropdownMenu.Item 
                          key={ep.id} 
                          className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-surfaceHighlight outline-none"
                          onSelect={(e) => {
                            e.preventDefault();
                            setLocalSelectedEpisodeIds(prev => {
                                if (isSelected) return prev.filter(id => id !== ep.id);
                                return [...prev, ep.id];
                            });
                          }}
                       >
                          <div className={`w-4 h-4 mr-2 border border-textMuted rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-white' : ''}`}>
                             {isSelected && <Check size={12} />}
                          </div>
                          第{ep.episode_number}集 {ep.title ? `- ${ep.title}` : ""}
                       </DropdownMenu.Item>
                     );
                   })}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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
            {messages.length === 0 && !streamingContent && !activeTaskId ? (
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
                applyResultsByPlanId={applyResults as Record<string, unknown>}
              />
            )}
            {activeTaskId && (
                <div className="mt-4 px-4">
                    <TaskProgressMonitor taskId={activeTaskId} title="AI 正在思考中..." showLogs={true} />
                </div>
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
          onDeleteAllSessions={deleteAllSessions}
          isLoading={sessionsLoading}
          collapsed={sessionListCollapsed}
          onToggleCollapse={() => setSessionListCollapsed(!sessionListCollapsed)}
        />
      </div>
    </div>
  );
}
