"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreditCostPreview } from "@/components/credits/CreditCostPreview";
import { useCredits } from "@/components/credits/CreditsContext";

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

type SseEvent = {
  type?: string;
  [k: string]: any;
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

export default function AIScenesRunnerPage() {
  const [scenes, setScenes] = useState<SceneCatalogItem[]>([]);
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [storyboardId, setStoryboardId] = useState<string>("");
  const [scriptText, setScriptText] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [assistantText, setAssistantText] = useState<string>("");
  const [trace, setTrace] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [applyResult, setApplyResult] = useState<any | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  
  // Credits integration
  const { balance, refresh } = useCredits();

  const selected = useMemo(
    () => scenes.find((s) => s.scene_code === selectedScene) || null,
    [scenes, selectedScene],
  );

  const loadScenes = useCallback(async () => {
    const res = await fetch("/api/ai/scenes", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    const data: SceneCatalogItem[] = json?.data || [];
    setScenes(data);
    if (!selectedScene && data.length) setSelectedScene(data[0].scene_code);
  }, [selectedScene]);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  const run = useCallback(async () => {
    if (!selectedScene || running) return;
    setRunning(true);
    setAssistantText("");
    setTrace([]);
    setPlans([]);
    setApplyResult(null);

    const message = [input, storyboardId ? `storyboard_id=${storyboardId}` : ""].filter(Boolean).join("\n");
    const payload = {
      project_id: projectId || null,
      script_text: scriptText || "",
      messages: [{ role: "user", content: message }],
      context_exclude_types: [],
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`/api/ai/scenes/${selectedScene}/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        setTrace((t) => [...t, { type: "error", message: `http_${resp.status}` }]);
        setRunning(false);
        return;
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
            setAssistantText((t) => t + evt.delta);
          } else if (evt.type === "plans") {
            setPlans(Array.isArray(evt.plans) ? evt.plans : []);
          } else if (evt.type === "done") {
            if (typeof evt.output_text === "string") setAssistantText(evt.output_text);
          } else if (evt.type !== "start" && evt.type !== "archive") {
            setTrace((t) => [...t, evt]);
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setTrace((t) => [...t, { type: "error", message: String(e) }]);
    } finally {
      abortRef.current = null;
      setRunning(false);
      // Refresh credits balance after operation completes
      refresh().catch(console.error);
    }
  }, [input, projectId, running, scriptText, selectedScene, storyboardId, refresh]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const applyPlan = useCallback(
    async (plan: any) => {
      setApplyResult(null);
      const resp = await fetch("/api/apply-plans/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, confirm: true }),
      });
      const bodyText = await resp.text();
      try {
        setApplyResult(JSON.parse(bodyText));
      } catch {
        setApplyResult({ status: resp.status, body: bodyText });
      }
    },
    [],
  );

  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>内置 AI 场景</div>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>场景</span>
            <select value={selectedScene} onChange={(e) => setSelectedScene(e.target.value)} disabled={!scenes.length}>
              {scenes.map((s) => (
                <option key={s.scene_code} value={s.scene_code}>
                  {s.name} ({s.scene_code})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>project_id（用于落库/上下文）</span>
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="UUID" />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>storyboard_id（可选，用于分镜/提示词）</span>
            <input value={storyboardId} onChange={(e) => setStoryboardId(e.target.value)} placeholder="UUID" />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>剧本文本（可选）</span>
            <textarea value={scriptText} onChange={(e) => setScriptText(e.target.value)} rows={8} />
          </label>

          {selected?.description ? <div style={{ color: "#666" }}>{selected.description}</div> : null}
        </div>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 600 }}>对话运行</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} disabled={running || !selectedScene || !input.trim()}>
              发送
            </button>
            <button onClick={stop} disabled={!running}>
              停止
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {/* Cost preview - visible before send */}
          <div>
            <CreditCostPreview
              category="text"
              userBalance={balance}
              size="sm"
            />
          </div>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="输入需求…" />
          <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 12, minHeight: 160, whiteSpace: "pre-wrap" }}>
            {assistantText || (running ? "…" : "")}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Meta / Trace</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {trace.length ? JSON.stringify(trace, null, 2) : ""}
            </pre>
          </div>

          <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Plans</div>
            <div style={{ display: "grid", gap: 8 }}>
              {plans.map((p, idx) => (
                <div key={idx} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>
                      {p.kind} / {p.tool_id}
                    </div>
                    <button onClick={() => applyPlan(p)}>执行落库</button>
                  </div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(p.preview || {}, null, 2)}</pre>
                </div>
              ))}
              {applyResult ? (
                <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>落库结果</div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {JSON.stringify(applyResult, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
