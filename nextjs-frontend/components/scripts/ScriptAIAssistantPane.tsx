"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function normalizeNameKey(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，,。．·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIntroPrompt(scene: SceneCatalogItem | null): string {
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
    "",
    "我的需求：",
  ].join("\n");
}

export function ScriptAIAssistantPane(props: {
  projectId: string;
  scriptText: string;
  episodeHint?: { episode_id?: string | null; episode_code?: string | null } | null;
}) {
  const { projectId, scriptText, episodeHint } = props;

  const [scenes, setScenes] = useState<SceneCatalogItem[]>([]);
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [assistantText, setAssistantText] = useState<string>("");
  const [trace, setTrace] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [applyResult, setApplyResult] = useState<any | null>(null);
  const [assetSelections, setAssetSelections] = useState<Record<string, Record<string, boolean>>>({});
  const abortRef = useRef<AbortController | null>(null);

  const selected = useMemo(() => scenes.find((s) => s.scene_code === selectedScene) || null, [scenes, selectedScene]);

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

  useEffect(() => {
    if (!selectedScene) return;
    setInput((prev) => prev.trim().length ? prev : buildIntroPrompt(selected));
  }, [selected, selectedScene]);

  const run = useCallback(async () => {
    if (!selectedScene || running) return;
    const userText = input.trim();
    if (!userText) return;

    setRunning(true);
    setAssistantText("");
    setTrace([]);
    setPlans([]);
    setApplyResult(null);
    setAssetSelections({});

    const episodeLine = episodeHint?.episode_code ? `episode=${episodeHint.episode_code}` : episodeHint?.episode_id ? `episode_id=${episodeHint.episode_id}` : "";
    const message = [episodeLine, userText].filter(Boolean).join("\n");
    const payload = {
      project_id: projectId || null,
      script_text: scriptText || "",
      messages: [{ role: "user", content: message }],
      context_exclude_types: [],
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`/api/ai/scenes/${selectedScene}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!resp.ok) {
        setTrace((t) => [...t, { type: "error", message: `http_${resp.status}` }]);
        setRunning(false);
        return;
      }
      const json = await resp.json();
      const data = json?.data || {};
      if (typeof data?.output_text === "string") setAssistantText(data.output_text);
      setPlans(Array.isArray(data?.plans) ? data.plans : []);
      setTrace(Array.isArray(data?.trace_events) ? data.trace_events : []);
    } catch (e: any) {
      if (e?.name !== "AbortError") setTrace((t) => [...t, { type: "error", message: String(e) }]);
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [episodeHint?.episode_code, episodeHint?.episode_id, input, projectId, running, scriptText, selectedScene]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const applyPlan = useCallback(async (plan: any) => {
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
  }, [projectId]);

  const applySelectedAssets = useCallback(
    async (plan: any, selectedKeys: string[]) => {
      const assets: any[] = Array.isArray(plan?.inputs?.assets) ? plan.inputs.assets : [];
      const selectedSet = new Set(selectedKeys);
      const filtered = assets.filter((a: any, idx: number) => selectedSet.has(String(a?._client_key || idx)));
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-surfaceHighlight/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-sm text-textMain">AI 助手</div>
            <div className="mt-1 text-[11px] text-textMuted truncate">
              对话式引导 · 工具调用 Trace · ApplyPlan 预览 · 选择落库
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <select
              value={selectedScene}
              onChange={(e) => setSelectedScene(e.target.value)}
              disabled={!scenes.length}
              className="bg-background border border-border rounded-lg px-3 py-2 text-xs"
            >
              {scenes.map((s) => (
                <option key={s.scene_code} value={s.scene_code}>
                  {s.name} ({s.scene_code})
                </option>
              ))}
            </select>
            <button
              onClick={() => void run()}
              disabled={running || !selectedScene || !input.trim() || !projectId}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              type="button"
              title={!projectId ? "请先选择剧本（project_id）" : ""}
            >
              {running ? "运行中..." : "发送"}
            </button>
            <button
              onClick={stop}
              disabled={!running}
              className="px-4 py-2 rounded-xl border border-border bg-surface/60 hover:bg-surfaceHighlight text-xs font-bold text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
              type="button"
            >
              停止
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            {selected?.description ? (
              <div className="rounded-xl border border-border bg-background/20 p-3 text-xs text-textMuted whitespace-pre-wrap">
                {selected.description}
              </div>
            ) : null}

            {Array.isArray(selected?.required_tools) && selected!.required_tools!.length ? (
              <div className="rounded-xl border border-border bg-background/20 p-3">
                <div className="text-[11px] text-textMuted">可用工具</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected!.required_tools!.map((t) => (
                    <div key={t} className="px-2 py-1 rounded-full border border-border bg-surfaceHighlight/20 text-[11px] text-textMuted">
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full min-h-[220px] bg-transparent border border-border rounded-xl p-3 text-xs text-textMain outline-none resize-y"
              placeholder="输入你的需求..."
              spellCheck={false}
            />

            <div className="rounded-xl border border-border bg-background/20 p-3">
              <div className="text-[11px] text-textMuted">Assistant 输出</div>
              <div className="mt-2 text-xs text-textMain whitespace-pre-wrap min-h-[140px]">{assistantText || (running ? "…" : "")}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-background/20 p-3">
              <div className="text-[11px] text-textMuted">Trace（工具/事件）</div>
              <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">
                {trace.length ? JSON.stringify(trace, null, 2) : ""}
              </pre>
            </div>

            <div className="rounded-xl border border-border bg-background/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-textMuted">ApplyPlans（预览与落库）</div>
                <div className="text-[11px] text-textMuted">{plans.length ? `${plans.length} 条` : ""}</div>
              </div>
              <div className="mt-3 space-y-2">
                {plans.length === 0 ? (
                  <div className="text-xs text-textMuted">暂无 plans（当工具产出结构化预览时会显示在这里）</div>
                ) : (
                  plans.map((p, idx) => {
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

                    const mappingHint =
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
                      <div key={planId} className="rounded-xl border border-border bg-surface/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-textMain truncate">
                              {kind} / {toolId}
                            </div>
                            <div className="mt-1 text-[11px] text-textMuted truncate">
                              {mappingHint || (p.preview?.count != null ? `count=${p.preview.count}` : "")}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
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

                        {hasAssets ? (
                          <div className="mt-3 space-y-2">
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

                            <div className="space-y-2">
                              {assets.map((a) => {
                                const key = String(a._client_key);
                                const checked = selectedMap[key] !== false;
                                const name = String(a?.name || "");
                                const keywords = Array.isArray(a?.keywords) ? a.keywords.map(String).filter(Boolean) : [];
                                const detailsMd = String(a?.details_md || "");
                                return (
                                  <div key={key} className="rounded-lg border border-border bg-background/30 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <label className="flex items-start gap-3 min-w-0 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => toggleAsset(key, e.target.checked)}
                                          className="mt-0.5"
                                        />
                                        <div className="min-w-0">
                                          <div className="text-sm font-bold text-textMain truncate">{name || "(未命名)"}</div>
                                          {keywords.length ? <div className="mt-1 text-[11px] text-textMuted truncate">关键词：{keywords.join(" · ")}</div> : null}
                                        </div>
                                      </label>
                                      <div className="text-[11px] text-textMuted">{String(a?.type || assetType || "")}</div>
                                    </div>
                                    {detailsMd ? (
                                      <details className="mt-2">
                                        <summary className="text-[11px] text-textMuted cursor-pointer">查看详情</summary>
                                        <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words">{detailsMd}</pre>
                                      </details>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[180px] overflow-y-auto">
                            {JSON.stringify({ preview: p.preview || {}, inputs: p.inputs || {} }, null, 2)}
                          </pre>
                        )}

                        {rawOutputText ? (
                          <details className="mt-3">
                            <summary className="text-[11px] text-textMuted cursor-pointer">原始输出（raw_output_text）</summary>
                            <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">
                              {rawOutputText}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {applyResult ? (
              <div className="rounded-xl border border-border bg-background/20 p-3">
                <div className="text-[11px] text-textMuted">落库结果</div>
                <pre className="mt-2 text-[11px] text-textMain whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">
                  {JSON.stringify(applyResult, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
