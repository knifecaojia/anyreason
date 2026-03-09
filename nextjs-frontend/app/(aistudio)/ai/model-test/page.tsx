"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ModelCapabilities } from "@/lib/aistudio/types";
import { generateMedia } from "@/components/actions/ai-media-actions";
import { ModelSelector } from "@/components/ai/ModelSelector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, X, ZoomIn, AlertCircle, Image as ImageIcon, Play, Pause, Repeat, Video, Clock, Send, Trash2, Square, Paperclip, User, Bot } from "lucide-react";
import { aiAdminListModelConfigs, type AIModelConfig } from "@/components/actions/ai-model-actions";

// --------------- Types ---------------

type CategoryType = "text" | "image" | "video";

interface TextMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

interface TestSession {
  id: string;
  category: CategoryType;
  modelConfigId: string;
  createdAt: string;
  runCount: number;
}

/** Per-session content snapshot for save/restore on session switch */
interface SessionData {
  selectedModelCode: string;
  caps: ModelCapabilities;
  capParams: Record<string, any>;
  prompt: string;
  negativePrompt: string;
  textMessages: TextMessage[];
  imageRuns: ImageRun[];
  videoRuns: VideoRun[];
}

interface ImageRun {
  id: string;
  url?: string;
  usageId?: string;
  cost?: number;
  elapsed?: number;
  error?: { code: string; message: string };
  timestamp: string;
  prompt: string;
}

type VideoTaskStatus = "idle" | "submitting" | "queued" | "generating" | "completed" | "failed";

interface VideoRun {
  id: string;
  status: VideoTaskStatus;
  url?: string;
  usageId?: string;
  cost?: number;
  duration?: number;
  resolution?: string;
  error?: { code: string; message: string };
  elapsed?: number;
  timestamp: string;
  prompt: string;
}

// --------------- Component ---------------

export default function ModelTestPage() {
  // --- Tab / category state ---
  const [activeCategory, setActiveCategory] = useState<CategoryType>("text");

  // --- Model selection state (per-category, reset on tab switch) ---
  const [selectedModelCode, setSelectedModelCode] = useState("");
  const [caps, setCaps] = useState<ModelCapabilities>({});
  const [capParams, setCapParams] = useState<Record<string, any>>({});

  // --- Prompt state ---
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");

  // --- Session history ---
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionDataMap, setSessionDataMap] = useState<Record<string, SessionData>>({});

  // --- Text panel state (lifted for session persistence) ---
  const [textMessages, setTextMessages] = useState<TextMessage[]>([]);

  // --- Image panel state (placeholder for task 6.2) ---
  const [imageRuns, setImageRuns] = useState<ImageRun[]>([]);

  // --- Video panel state (placeholder for task 7) ---
  const [videoRuns, setVideoRuns] = useState<VideoRun[]>([]);

  // --- Helpers: save / restore session data ---

  /** Snapshot current panel state into the session data map */
  const saveCurrentSession = useCallback(() => {
    if (!activeSessionId) return;
    setSessionDataMap((prev) => ({
      ...prev,
      [activeSessionId]: {
        selectedModelCode,
        caps,
        capParams,
        prompt,
        negativePrompt,
        textMessages,
        imageRuns,
        videoRuns,
      },
    }));
  }, [activeSessionId, selectedModelCode, caps, capParams, prompt, negativePrompt, textMessages, imageRuns, videoRuns]);

  /** Restore panel state from a saved session snapshot */
  const restoreSession = useCallback((sessionId: string) => {
    const data = sessionDataMap[sessionId];
    if (data) {
      setSelectedModelCode(data.selectedModelCode);
      setCaps(data.caps);
      setCapParams(data.capParams);
      setPrompt(data.prompt);
      setNegativePrompt(data.negativePrompt);
      setTextMessages(data.textMessages);
      setImageRuns(data.imageRuns);
      setVideoRuns(data.videoRuns);
    } else {
      // New session with no saved data — clear everything
      setSelectedModelCode("");
      setCaps({});
      setCapParams({});
      setPrompt("");
      setNegativePrompt("");
      setTextMessages([]);
      setImageRuns([]);
      setVideoRuns([]);
    }
  }, [sessionDataMap]);

  /** Increment the runCount of the active session */
  const incrementRunCount = useCallback(() => {
    if (!activeSessionId) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId ? { ...s, runCount: s.runCount + 1 } : s
      )
    );
  }, [activeSessionId]);

  // --- Handlers ---

  const handleCategoryChange = useCallback((value: string) => {
    const cat = value as CategoryType;
    // Save current session before switching category
    if (activeSessionId) {
      saveCurrentSession();
    }
    setActiveCategory(cat);
    // Reset model selection when switching categories
    setSelectedModelCode("");
    setCaps({});
    setCapParams({});
    setPrompt("");
    setNegativePrompt("");
    setTextMessages([]);
    setImageRuns([]);
    setVideoRuns([]);
    setActiveSessionId(null);
  }, [activeSessionId, saveCurrentSession]);

  const handleModelSelect = useCallback(
    (code: string, c: ModelCapabilities) => {
      setSelectedModelCode(code);
      setCaps(c);
    },
    [],
  );

  const handleNewSession = useCallback(() => {
    // Save current session content before creating new one
    if (activeSessionId) {
      saveCurrentSession();
    }
    const session: TestSession = {
      id: crypto.randomUUID(),
      category: activeCategory,
      modelConfigId: selectedModelCode,
      createdAt: new Date().toISOString(),
      runCount: 0,
    };
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    // Clear content for the new session
    setSelectedModelCode("");
    setCaps({});
    setCapParams({});
    setPrompt("");
    setNegativePrompt("");
    setTextMessages([]);
    setImageRuns([]);
    setVideoRuns([]);
  }, [activeCategory, selectedModelCode, activeSessionId, saveCurrentSession]);

  const handleSelectSession = useCallback((sessionId: string) => {
    if (sessionId === activeSessionId) return;
    // Save current session content
    if (activeSessionId) {
      saveCurrentSession();
    }
    setActiveSessionId(sessionId);
    // Restore the selected session's content
    restoreSession(sessionId);
  }, [activeSessionId, saveCurrentSession, restoreSession]);

  // Filter sessions for current category
  const categorySessions = sessions.filter(
    (s) => s.category === activeCategory,
  );

  return (
    <div className="flex h-[calc(100vh-60px)]">
      {/* ===== Sidebar: Test History ===== */}
      <aside className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-3 flex items-center justify-between border-b">
          <h3 className="text-sm font-semibold">测试历史</h3>
          <Button variant="outline" size="sm" onClick={handleNewSession}>
            + 新建
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {categorySessions.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground text-center">
              暂无历史记录
            </p>
          ) : (
            <div className="p-2 space-y-1">
              {categorySessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
                    activeSessionId === session.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <div className="font-medium truncate">
                    {session.modelConfigId || "未选择模型"}
                  </div>
                  <div className="text-xs mt-0.5">
                    {new Date(session.createdAt).toLocaleString()} ·{" "}
                    {session.runCount} 次运行
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* ===== Main Content ===== */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Category Tabs */}
        <div className="p-4 pb-0">
          <Tabs
            value={activeCategory}
            onValueChange={handleCategoryChange}
          >
            <TabsList>
              <TabsTrigger value="text">文本</TabsTrigger>
              <TabsTrigger value="image">图片</TabsTrigger>
              <TabsTrigger value="video">视频</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Separator className="mt-3" />

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          {activeCategory === "text" && (
            <TextPanel
              messages={textMessages}
              onMessagesChange={setTextMessages}
              onRunComplete={incrementRunCount}
            />
          )}
          {activeCategory === "image" && (
            <ImagePanel
              selectedModelCode={selectedModelCode}
              caps={caps}
              capParams={capParams}
              prompt={prompt}
              negativePrompt={negativePrompt}
              imageRuns={imageRuns}
              onModelSelect={handleModelSelect}
              onParamsChange={setCapParams}
              onPromptChange={setPrompt}
              onNegativePromptChange={setNegativePrompt}
              onImageRunsChange={setImageRuns}
              onRunComplete={incrementRunCount}
            />
          )}
          {activeCategory === "video" && (
            <VideoPanel
              selectedModelCode={selectedModelCode}
              caps={caps}
              capParams={capParams}
              prompt={prompt}
              negativePrompt={negativePrompt}
              videoRuns={videoRuns}
              onModelSelect={handleModelSelect}
              onParamsChange={setCapParams}
              onPromptChange={setPrompt}
              onNegativePromptChange={setNegativePrompt}
              onVideoRunsChange={setVideoRuns}
              onRunComplete={incrementRunCount}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// --------------- Text Panel (task 8.1) ---------------

function TextPanel({
  messages,
  onMessagesChange,
  onRunComplete,
}: {
  messages: TextMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<TextMessage[]>>;
  onRunComplete: () => void;
}) {
  // --- Model selection ---
  const [modelConfigs, setModelConfigs] = useState<AIModelConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [supportsImage, setSupportsImage] = useState(false);

  // --- Chat state ---
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ file: File; url: string } | null>(null);

  // --- Refs ---
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load text model configs
  useEffect(() => {
    aiAdminListModelConfigs("text")
      .then((res) => {
        const configs = (res.data || []).filter((c) => c.enabled);
        setModelConfigs(configs);
        if (configs.length > 0) setSelectedConfigId(configs[0].id);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check if selected model supports image (heuristic: check manufacturer/model name)
  useEffect(() => {
    const cfg = modelConfigs.find((c) => c.id === selectedConfigId);
    if (!cfg) { setSupportsImage(false); return; }
    // Models that typically support image input
    const imageCapableModels = ["gpt-4o", "gpt-4-vision", "gemini", "claude-3", "qwen-vl", "glm-4v"];
    const hasImage = imageCapableModels.some(
      (m) => cfg.model.toLowerCase().includes(m) || cfg.manufacturer.toLowerCase().includes("gemini")
    );
    setSupportsImage(hasImage);
  }, [selectedConfigId, modelConfigs]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedConfigId || isStreaming) return;

    const userMsg: TextMessage = {
      role: "user",
      content: trimmed,
      imageUrl: attachedImage?.url,
    };

    const newMessages = [...messages, userMsg];
    onMessagesChange([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setAttachedImage(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Build messages payload for the API
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.imageUrl
          ? [
              { type: "text", text: m.content },
              { type: "image_url", image_url: { url: m.imageUrl } },
            ]
          : m.content,
      }));

      const resp = await fetch(
        `/api/ai/admin/model-configs/${selectedConfigId}/test-chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }, ...apiMessages] }),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || resp.statusText);
      }
      if (!resp.body) throw new Error("流式响应不可用");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let acc = "";

      const flushEvent = (payload: any) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.type === "delta") {
          const d = typeof payload.delta === "string" ? payload.delta : "";
          if (!d) return;
          acc += d;
          onMessagesChange((prev) => {
            const out = [...prev];
            const last = out[out.length - 1];
            if (last?.role === "assistant") out[out.length - 1] = { role: "assistant", content: acc };
            return out;
          });
        } else if (payload.type === "done") {
          const finalText = (acc || payload.output_text || "").trim();
          onMessagesChange((prev) => {
            const out = [...prev];
            const last = out[out.length - 1];
            if (last?.role === "assistant") out[out.length - 1] = { role: "assistant", content: finalText || "（空响应）" };
            return out;
          });
          onRunComplete();
        } else if (payload.type === "error") {
          const msg = typeof payload.message === "string" ? payload.message : "请求失败";
          onMessagesChange((prev) => {
            const out = [...prev];
            const last = out[out.length - 1];
            if (last?.role === "assistant") out[out.length - 1] = { role: "assistant", content: `⚠️ 错误: ${msg}` };
            return out;
          });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try { flushEvent(JSON.parse(raw)); } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User stopped generation — keep partial content
        onMessagesChange((prev) => {
          const out = [...prev];
          const last = out[out.length - 1];
          if (last?.role === "assistant" && !last.content) {
            out[out.length - 1] = { role: "assistant", content: "（已停止生成）" };
          }
          return out;
        });
      } else {
        const msg = err.message || "请求失败";
        onMessagesChange((prev) => {
          const out = [...prev];
          const last = out[out.length - 1];
          if (last?.role === "assistant") out[out.length - 1] = { role: "assistant", content: `⚠️ 错误: ${msg}` };
          return out;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleClear = () => {
    if (isStreaming) handleStop();
    onMessagesChange([]);
  };

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAttachedImage({ file, url });
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top bar: model selector + actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <select
          className="flex-1 max-w-xs h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedConfigId}
          onChange={(e) => setSelectedConfigId(e.target.value)}
        >
          {modelConfigs.length === 0 && <option value="">暂无可用文本模型</option>}
          {modelConfigs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.manufacturer} / {c.model}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={messages.length === 0 && !isStreaming}
          data-testid="text-clear-btn"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          清空对话
        </Button>
      </div>

      {/* Messages area */}
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 min-h-0 overflow-y-auto p-4" data-testid="text-messages">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
              <Bot className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-lg font-medium">文本对话测试</p>
              <p className="text-sm">选择模型后发送消息开始对话</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}>
                    {msg.imageUrl && (
                      <img
                        src={msg.imageUrl}
                        alt="attached"
                        className="max-w-[200px] max-h-[150px] rounded mb-2 object-cover"
                      />
                    )}
                    <div className="whitespace-pre-wrap break-words">
                      {msg.content || (
                        isStreaming && i === messages.length - 1 ? (
                          <span className="inline-flex items-center gap-1" data-testid="text-streaming-indicator">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            思考中...
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="border-t p-3 flex-shrink-0">
          {/* Attached image preview */}
          {attachedImage && (
            <div className="mb-2 flex items-center gap-2">
              <img src={attachedImage.url} alt="attached" className="h-12 w-12 rounded object-cover border" />
              <button
                onClick={() => { URL.revokeObjectURL(attachedImage.url); setAttachedImage(null); }}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            {supportsImage && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageAttach}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="text-image-attach"
                  title="附加图片"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </>
            )}
            <textarea
              data-testid="text-input"
              className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="输入消息... (Shift+Enter 换行)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            {isStreaming ? (
              <Button
                variant="destructive"
                size="icon"
                onClick={handleStop}
                data-testid="text-stop-btn"
                title="停止生成"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || !selectedConfigId}
                data-testid="text-send-btn"
                title="发送"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// --------------- Image Panel (task 6.2) ---------------

function ImagePanel({
  selectedModelCode,
  caps,
  capParams,
  prompt,
  negativePrompt,
  imageRuns,
  onModelSelect,
  onParamsChange,
  onPromptChange,
  onNegativePromptChange,
  onImageRunsChange,
  onRunComplete,
}: {
  selectedModelCode: string;
  caps: ModelCapabilities;
  capParams: Record<string, any>;
  prompt: string;
  negativePrompt: string;
  imageRuns: ImageRun[];
  onModelSelect: (code: string, caps: ModelCapabilities) => void;
  onParamsChange: (params: Record<string, any>) => void;
  onPromptChange: (v: string) => void;
  onNegativePromptChange: (v: string) => void;
  onImageRunsChange: React.Dispatch<React.SetStateAction<ImageRun[]>>;
  onRunComplete: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!selectedModelCode || !prompt) return;
    setLoading(true);
    const startTime = Date.now();
    try {
      const res = await generateMedia({
        model_key: selectedModelCode,
        prompt,
        negative_prompt: negativePrompt || undefined,
        param_json: capParams,
        category: "image",
      });
      const elapsed = (Date.now() - startTime) / 1000;
      const run: ImageRun = {
        id: crypto.randomUUID(),
        url: res.url,
        usageId: res.usage_id,
        cost: res.cost,
        elapsed,
        timestamp: new Date().toISOString(),
        prompt,
      };
      onImageRunsChange((prev) => [run, ...prev]);
      onRunComplete();
    } catch (e: any) {
      const errorMsg = e.message || "生成失败";
      // Try to parse error code from message like "请求失败 502: ..."
      const codeMatch = errorMsg.match(/(\d{3})/);
      const run: ImageRun = {
        id: crypto.randomUUID(),
        error: {
          code: codeMatch ? codeMatch[1] : "UNKNOWN",
          message: errorMsg,
        },
        timestamp: new Date().toISOString(),
        prompt,
      };
      onImageRunsChange((prev) => [run, ...prev]);
      onRunComplete();
    } finally {
      setLoading(false);
    }
  };

  const latestRun = imageRuns.length > 0 ? imageRuns[0] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      {/* Config sidebar */}
      <div className="col-span-1 space-y-4 overflow-y-auto pr-2">
        <Card className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">图片生成配置</h2>
          <ModelSelector
            category="image"
            onModelSelect={onModelSelect}
            onParamsChange={onParamsChange}
            prompt={prompt}
            onPromptChange={onPromptChange}
            negativePrompt={negativePrompt}
            onNegativePromptChange={onNegativePromptChange}
          />
          <Button
            onClick={handleGenerate}
            disabled={loading || !selectedModelCode || !prompt}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              "生成图片"
            )}
          </Button>
        </Card>
      </div>

      {/* Preview area */}
      <div className="col-span-2 flex flex-col gap-4 h-full overflow-hidden">
        {/* Current result / loading / empty */}
        <Card className="p-4 flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" data-testid="image-loading">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">生成中...</p>
            </div>
          ) : latestRun?.error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" data-testid="image-error">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="text-center space-y-1">
                <Badge variant="destructive">错误码: {latestRun.error.code}</Badge>
                <p className="text-sm text-destructive">{latestRun.error.message}</p>
              </div>
            </div>
          ) : latestRun?.url ? (
            <div className="flex-1 flex flex-col items-center gap-3 min-h-0" data-testid="image-result">
              <div
                className="relative flex-1 min-h-0 w-full flex items-center justify-center cursor-pointer group"
                onClick={() => setZoomedUrl(latestRun.url!)}
              >
                <img
                  src={latestRun.url}
                  alt="Generated"
                  className="object-contain max-w-full max-h-full rounded-lg shadow-lg"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center">
                  <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                </div>
              </div>
              {/* Metadata */}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground" data-testid="image-meta">
                {latestRun.usageId && (
                  <Badge variant="outline">usage_id: {latestRun.usageId}</Badge>
                )}
                {latestRun.cost !== undefined && (
                  <Badge variant="outline">积分消耗: {latestRun.cost}</Badge>
                )}
                {latestRun.elapsed !== undefined && (
                  <Badge variant="outline">耗时: {latestRun.elapsed.toFixed(1)}s</Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center" data-testid="image-empty">
              <div className="text-muted-foreground text-center">
                <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-lg font-medium">图片预览区域</p>
                <p className="text-sm">配置参数并点击生成，结果将显示在这里</p>
              </div>
            </div>
          )}
        </Card>

        {/* History list */}
        {imageRuns.length > 1 && (
          <Card className="p-3 max-h-48 overflow-hidden" data-testid="image-history">
            <h3 className="text-sm font-semibold mb-2">历史生成记录 ({imageRuns.length})</h3>
            <ScrollArea className="h-32">
              <div className="flex gap-2 flex-wrap">
                {imageRuns.map((run) => (
                  <div
                    key={run.id}
                    className="relative w-20 h-20 rounded-md overflow-hidden border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => run.url && setZoomedUrl(run.url)}
                  >
                    {run.url ? (
                      <img
                        src={run.url}
                        alt={run.prompt}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-destructive/10">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 truncate">
                      {new Date(run.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}
      </div>

      {/* Zoom overlay */}
      {zoomedUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setZoomedUrl(null)}
          data-testid="image-zoom-overlay"
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setZoomedUrl(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={zoomedUrl}
            alt="Zoomed"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// --------------- Video Panel (task 7.1) ---------------

function VideoPanel({
  selectedModelCode,
  caps,
  capParams,
  prompt,
  negativePrompt,
  videoRuns,
  onModelSelect,
  onParamsChange,
  onPromptChange,
  onNegativePromptChange,
  onVideoRunsChange,
  onRunComplete,
}: {
  selectedModelCode: string;
  caps: ModelCapabilities;
  capParams: Record<string, any>;
  prompt: string;
  negativePrompt: string;
  videoRuns: VideoRun[];
  onModelSelect: (code: string, caps: ModelCapabilities) => void;
  onParamsChange: (params: Record<string, any>) => void;
  onPromptChange: (v: string) => void;
  onNegativePromptChange: (v: string) => void;
  onVideoRunsChange: React.Dispatch<React.SetStateAction<VideoRun[]>>;
  onRunComplete: () => void;
}) {
  const [taskStatus, setTaskStatus] = useState<VideoTaskStatus>("idle");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed time counter for "generating" state
  useEffect(() => {
    if (taskStatus === "generating") {
      const startTime = Date.now() - elapsedTime * 1000;
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [taskStatus]);

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleGenerate = async () => {
    if (!selectedModelCode || !prompt) return;

    setTaskStatus("submitting");
    setElapsedTime(0);
    const startTime = Date.now();

    try {
      // Transition to queued
      setTaskStatus("queued");

      // Transition to generating (simulates the async nature)
      await new Promise((r) => setTimeout(r, 500));
      setTaskStatus("generating");

      const INPUT_MODE_TO_VIDEO_MODE: Record<string, string> = {
        text_to_video: "text2video",
        first_frame: "image2video",
        first_last_frame: "start_end",
        reference_to_video: "reference",
        multi_frame: "multi_frame",
      };
      const videoMode = INPUT_MODE_TO_VIDEO_MODE[capParams.input_mode] || "text2video";
      const res = await generateMedia({
        model_key: selectedModelCode,
        prompt,
        negative_prompt: negativePrompt || undefined,
        param_json: { ...capParams, mode: videoMode },
        category: "video",
      });

      const totalElapsed = Math.floor((Date.now() - startTime) / 1000);
      setTaskStatus("completed");

      const run: VideoRun = {
        id: crypto.randomUUID(),
        status: "completed",
        url: res.url,
        usageId: res.usage_id,
        cost: res.cost,
        duration: res.duration,
        resolution: res.meta?.resolution,
        elapsed: totalElapsed,
        timestamp: new Date().toISOString(),
        prompt,
      };
      onVideoRunsChange((prev) => [run, ...prev]);
      onRunComplete();
    } catch (e: any) {
      const totalElapsed = Math.floor((Date.now() - startTime) / 1000);
      setTaskStatus("failed");

      const errorMsg = e.message || "生成失败";
      const codeMatch = errorMsg.match(/(\d{3})/);
      const run: VideoRun = {
        id: crypto.randomUUID(),
        status: "failed",
        error: {
          code: codeMatch ? codeMatch[1] : "UNKNOWN",
          message: errorMsg,
        },
        elapsed: totalElapsed,
        timestamp: new Date().toISOString(),
        prompt,
      };
      onVideoRunsChange((prev) => [run, ...prev]);
      onRunComplete();
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleLoop = () => {
    setIsLooping((prev) => !prev);
    if (videoRef.current) {
      videoRef.current.loop = !isLooping;
    }
  };

  const latestRun = videoRuns.length > 0 ? videoRuns[0] : null;
  const isProcessing = taskStatus === "submitting" || taskStatus === "queued" || taskStatus === "generating";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      {/* Config sidebar */}
      <div className="col-span-1 space-y-4 overflow-y-auto pr-2">
        <Card className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">视频生成配置</h2>
          <ModelSelector
            category="video"
            onModelSelect={onModelSelect}
            onParamsChange={onParamsChange}
            prompt={prompt}
            onPromptChange={onPromptChange}
            negativePrompt={negativePrompt}
            onNegativePromptChange={onNegativePromptChange}
          />
          <Button
            onClick={handleGenerate}
            disabled={isProcessing || !selectedModelCode || !prompt}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {taskStatus === "submitting" && "提交中..."}
                {taskStatus === "queued" && "排队中..."}
                {taskStatus === "generating" && "生成中..."}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                生成视频
              </>
            )}
          </Button>
        </Card>
      </div>

      {/* Preview area */}
      <div className="col-span-2 flex flex-col gap-4 h-full overflow-hidden">
        <Card className="p-4 flex-1 min-h-0 flex flex-col">
          {/* Submitting state */}
          {taskStatus === "submitting" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" data-testid="video-submitting">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在提交请求...</p>
            </div>
          )}

          {/* Queued state */}
          {taskStatus === "queued" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" data-testid="video-queued">
              <Clock className="h-10 w-10 text-amber-500 animate-pulse" />
              <p className="text-sm text-muted-foreground">任务排队中，请稍候...</p>
            </div>
          )}

          {/* Generating state with timer */}
          {taskStatus === "generating" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" data-testid="video-generating">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">视频生成中...</p>
              <div className="flex items-center gap-2 text-lg font-mono" data-testid="video-elapsed-timer">
                <Clock className="h-4 w-4" />
                <span>{formatElapsed(elapsedTime)}</span>
              </div>
              <p className="text-xs text-muted-foreground">视频生成通常需要几分钟，请耐心等待</p>
            </div>
          )}

          {/* Failed state */}
          {taskStatus === "failed" && latestRun?.error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" data-testid="video-failed">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="text-center space-y-2">
                <Badge variant="destructive">错误码: {latestRun.error.code}</Badge>
                <p className="text-sm text-destructive">{latestRun.error.message}</p>
                {latestRun.elapsed !== undefined && (
                  <p className="text-xs text-muted-foreground">耗时: {formatElapsed(latestRun.elapsed)}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setTaskStatus("idle")}>
                返回
              </Button>
            </div>
          )}

          {/* Completed state with video player */}
          {taskStatus === "completed" && latestRun?.url && (
            <div className="flex-1 flex flex-col items-center gap-3 min-h-0" data-testid="video-completed">
              <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={latestRun.url}
                  loop={isLooping}
                  autoPlay
                  className="object-contain max-w-full max-h-full rounded-lg shadow-lg"
                  data-testid="video-player"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>
              {/* Player controls */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handlePlayPause} title={isPlaying ? "暂停" : "播放"}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant={isLooping ? "default" : "outline"}
                  size="icon"
                  onClick={handleToggleLoop}
                  title={isLooping ? "循环播放中" : "单次播放"}
                >
                  <Repeat className="h-4 w-4" />
                </Button>
                <a
                  href={latestRun.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline ml-2"
                >
                  下载视频
                </a>
              </div>
              {/* Metadata */}
              <div className="flex flex-wrap gap-2 text-xs" data-testid="video-meta">
                {latestRun.duration !== undefined && (
                  <Badge variant="outline">时长: {latestRun.duration}s</Badge>
                )}
                {latestRun.resolution && (
                  <Badge variant="outline">分辨率: {latestRun.resolution}</Badge>
                )}
                {latestRun.usageId && (
                  <Badge variant="outline">usage_id: {latestRun.usageId}</Badge>
                )}
                {latestRun.cost !== undefined && (
                  <Badge variant="outline">积分消耗: {latestRun.cost}</Badge>
                )}
                {latestRun.elapsed !== undefined && (
                  <Badge variant="outline">生成耗时: {formatElapsed(latestRun.elapsed)}</Badge>
                )}
              </div>
            </div>
          )}

          {/* Idle state (no task running, no result yet or after reset) */}
          {taskStatus === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-muted-foreground text-center">
                <Video className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-lg font-medium">视频预览区域</p>
                <p className="text-sm">配置参数并点击生成，结果将显示在这里</p>
              </div>
            </div>
          )}
        </Card>

        {/* History list */}
        {videoRuns.length > 0 && (
          <Card className="p-3 max-h-48 overflow-hidden" data-testid="video-history">
            <h3 className="text-sm font-semibold mb-2">历史视频记录 ({videoRuns.length})</h3>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {videoRuns.map((run) => (
                  <div
                    key={run.id}
                    className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-accent transition-colors ${
                      latestRun?.id === run.id && taskStatus !== "idle" ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => {
                      if (run.status === "completed" && run.url) {
                        // Load this run as the current view
                        onVideoRunsChange((prev) => {
                          const idx = prev.findIndex((r) => r.id === run.id);
                          if (idx <= 0) return prev;
                          const reordered = [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)];
                          return reordered;
                        });
                        setTaskStatus("completed");
                      } else if (run.status === "failed") {
                        onVideoRunsChange((prev) => {
                          const idx = prev.findIndex((r) => r.id === run.id);
                          if (idx <= 0) return prev;
                          const reordered = [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)];
                          return reordered;
                        });
                        setTaskStatus("failed");
                      }
                    }}
                  >
                    {/* Thumbnail / status icon */}
                    <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 flex items-center justify-center bg-muted">
                      {run.status === "completed" && run.url ? (
                        <video src={run.url} className="w-full h-full object-cover" muted />
                      ) : run.status === "failed" ? (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{run.prompt}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                        {run.status === "completed" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">完成</Badge>
                        )}
                        {run.status === "failed" && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">失败</Badge>
                        )}
                        {run.duration !== undefined && <span>{run.duration}s</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}
      </div>
    </div>
  );
}
