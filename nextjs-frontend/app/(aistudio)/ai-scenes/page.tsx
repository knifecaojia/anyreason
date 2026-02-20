"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, MessageSquare, RefreshCw, Settings2, Wrench } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { aiAdminListModelConfigs, type AIModelConfig } from "@/components/actions/ai-model-actions";
import {
  aiAdminCreateScene,
  aiAdminDeleteScene,
  aiAdminListScenes,
  aiAdminUpdateScene,
  type AdminAIScene,
} from "@/components/actions/ai-scene-actions";
import { aiAdminSceneTestOptions, type AISceneTestAgentOption, type AISceneTestChatMessage, type ApplyPlan } from "@/components/actions/ai-scene-test-actions";
import {
  builtinAgentAdminCreateVersion,
  builtinAgentAdminListVersions,
  builtinAgentAdminUpdateVersion,
  type BuiltinAgentPromptVersion,
} from "@/components/actions/builtin-agent-actions";
import { getScriptHierarchy, listScripts, type EpisodeRead, type ScriptRead } from "@/components/actions/script-actions";
import { BuiltinPromptVersionDialog } from "@/components/agents/BuiltinPromptVersionDialog";
import { useTasks } from "@/components/tasks/TaskProvider";

function prettyJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: text.trim() ? JSON.parse(text) : {} };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "JSON 无效" };
  }
}

function pickDefaultVersion(agent: AISceneTestAgentOption | null): number {
  if (!agent) return 1;
  const d = (agent.versions || []).find((v) => v.is_default);
  return d ? d.version : (agent.versions?.[0]?.version || 1);
}

function pickVersionDescription(agent: AISceneTestAgentOption | null, version: number): string {
  if (!agent) return "";
  const v = (agent.versions || []).find((x) => x.version === version) || null;
  return String(v?.description || "").trim();
}

function formatVersionLabel(agent: AISceneTestAgentOption | null, version: number): string {
  const d = pickVersionDescription(agent, version);
  return d ? `v${version} · ${d}` : `v${version}`;
}

function TabButton(props: { active: boolean; label: string; onClick: () => void }) {
  const { active, label, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
        active ? "bg-surfaceHighlight border border-border text-textMain" : "text-textMuted hover:text-textMain"
      }`}
    >
      {label}
    </button>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nowTag() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function slugifyAscii(input: string) {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  return s
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .replace(/_+/g, "_")
    .slice(0, 64);
}

function uniqueSceneCode(base: string, existing: Set<string>) {
  const normalized = base.trim().toLowerCase();
  if (!existing.has(normalized)) return normalized;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${normalized}_${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${normalized}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateSceneCode(params: { name?: string; existing: Set<string> }) {
  const hinted = slugifyAscii(params.name || "");
  const base = hinted || `scene_${nowTag()}_${Math.random().toString(36).slice(2, 6)}`;
  return uniqueSceneCode(base, params.existing);
}

type SceneDraft = {
  scene_code: string;
  name: string;
  type: string;
  description: string;
  builtin_agent_code: string;
  required_tools_text: string;
  ui_config_text: string;
};

function emptySceneDraft(): SceneDraft {
  return {
    scene_code: "",
    name: "",
    type: "chat",
    description: "",
    builtin_agent_code: "script_expert",
    required_tools_text: "[]",
    ui_config_text: "{}",
  };
}

function planSummary(plan: ApplyPlan) {
  const preview = plan.preview as any;
  const n =
    typeof preview?.episode_count === "number"
      ? preview.episode_count
      : typeof preview?.count === "number"
        ? preview.count
      : typeof preview?.binding_count === "number"
        ? preview.binding_count
        : typeof preview?.counts === "object" && preview?.counts
          ? Object.values(preview.counts as Record<string, number>).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0)
          : undefined;
  return `${plan.tool_id}${typeof n === "number" ? ` · ${n}` : ""}`;
}

function PlanCard(props: { plan: ApplyPlan }) {
  const { plan } = props;
  const preview = (plan.preview || {}) as any;
  const inputs = (plan.inputs || {}) as any;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("复制失败，请手动复制：", text);
    }
  };

  const renderEpisodeSave = () => {
    const episodes = Array.isArray(inputs?.episodes) ? (inputs.episodes as any[]) : [];
    const files = Array.isArray(preview?.files) ? (preview.files as any[]) : [];
    const byEpisodeNo = new Map<number, { filename?: string; size_chars?: number }>();
    for (const f of files) {
      const n = Number(f?.episode_number);
      if (!Number.isFinite(n)) continue;
      byEpisodeNo.set(n, { filename: String(f?.filename || ""), size_chars: Number(f?.size_chars || 0) });
    }
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-textMuted">将写入 VFS：/分集/*.md（预览，不落库）</div>
        {episodes.length === 0 && <div className="text-sm text-textMuted">没有 episodes 输入。</div>}
        {episodes.length > 0 && (
          <div className="space-y-2">
            {episodes
              .slice()
              .sort((a, b) => Number(a?.episode_number || 0) - Number(b?.episode_number || 0))
              .map((e, idx) => {
                const epNo = Number(e?.episode_number || 0);
                const meta = byEpisodeNo.get(epNo);
                const title = String(e?.title || "");
                const md = String(e?.content_md || "");
                const filename = meta?.filename || "";
                const sizeChars = Number.isFinite(meta?.size_chars as any) ? Number(meta?.size_chars) : md.length;
                return (
                  <details key={`${epNo}-${idx}`} className="px-3 py-2 rounded-md bg-background border border-border">
                    <summary className="cursor-pointer text-sm font-bold text-textMain">
                      EP{String(epNo).padStart(3, "0")} {title} {filename ? `· ${filename}` : ""} · {sizeChars} chars
                    </summary>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyText(md)}
                          className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
                        >
                          复制 Markdown
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText(prettyJson(e))}
                          className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
                        >
                          复制输入 JSON
                        </button>
                      </div>
                      <pre className="w-full max-h-[260px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                        {md || "（空）"}
                      </pre>
                    </div>
                  </details>
                );
              })}
          </div>
        )}
      </div>
    );
  };

  const renderAssetCreate = () => {
    const assets = Array.isArray(inputs?.assets) ? (inputs.assets as any[]) : [];
    const counts = preview?.counts && typeof preview.counts === "object" ? (preview.counts as Record<string, number>) : null;
    const files = Array.isArray(preview?.files) ? (preview.files as any[]) : [];
    const rawOutputText = String(preview?.raw_output_text || "");
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-textMuted">将写入 VFS：/资产/（角色|道具|地点|特效）/*.md（并保留 .json 过渡）（预览，不落库）</div>
        {rawOutputText && (
          <details className="px-3 py-2 rounded-md bg-background border border-border">
            <summary className="cursor-pointer text-sm font-bold text-textMain">Raw 输出（Markdown 原文）</summary>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={() => copyText(rawOutputText)}
                className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
              >
                复制原文
              </button>
              <pre className="w-full max-h-[260px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                {rawOutputText}
              </pre>
            </div>
          </details>
        )}
        {counts && (
          <div className="text-xs text-textMuted">
            统计：character {counts.character || 0} · prop {counts.prop || 0} · location {counts.location || 0} · vfx {counts.vfx || 0}
          </div>
        )}
        {assets.length === 0 && <div className="text-sm text-textMuted">没有 assets 输入。</div>}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.slice(0, 20).map((f, idx) => {
              const filename = String(f?.filename || "");
              const name = String(f?.name || "");
              const type = String(f?.type || "");
              const md = String(f?.content_md || "");
              return (
                <details key={`${filename}-${idx}`} className="px-3 py-2 rounded-md bg-background border border-border">
                  <summary className="cursor-pointer text-sm font-bold text-textMain">
                    {type} · {name} {filename ? `· ${filename}` : ""}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(md)}
                        className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
                      >
                        复制 Markdown
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(prettyJson(f))}
                        className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
                      >
                        复制预览对象
                      </button>
                    </div>
                    <pre className="w-full max-h-[260px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                      {md || "（空）"}
                    </pre>
                  </div>
                </details>
              );
            })}
          </div>
        )}
        {files.length === 0 && assets.length > 0 && (
          <details className="px-3 py-2 rounded-md bg-background border border-border">
            <summary className="cursor-pointer text-sm font-bold text-textMain">查看资产 JSON（{assets.length}）</summary>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={() => copyText(prettyJson(assets))}
                className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
              >
                复制全部 JSON
              </button>
              <pre className="w-full max-h-[320px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs">
                {prettyJson(assets)}
              </pre>
            </div>
          </details>
        )}
      </div>
    );
  };

  const renderAssetDocUpsert = () => {
    const assetType = String(inputs?.asset_type || "");
    const assetName = String(inputs?.asset_name || "");
    const filename = String(inputs?.filename || "");
    const matchType = String(inputs?.match_type || "");
    const confidence = Number(inputs?.confidence || 0);
    const contentMd = String(inputs?.content_md || "");
    const reasonMd = String(inputs?.reason_md || "");
    const diffMd = String(inputs?.diff_md || "");
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-textMuted">将写入 VFS：/资产/{assetType}/{filename || "*.md"}（预览，不落库）</div>
        <div className="text-xs text-textMuted">
          {assetType} · {assetName} · {matchType || "-"} · confidence {Number.isFinite(confidence) ? confidence : 0}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copyText(contentMd)}
            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
          >
            复制 Markdown
          </button>
          <button
            type="button"
            onClick={() => copyText(prettyJson(inputs))}
            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
          >
            复制输入对象
          </button>
        </div>
        <details className="px-3 py-2 rounded-md bg-background border border-border">
          <summary className="cursor-pointer text-sm font-bold text-textMain">内容（Markdown）</summary>
          <pre className="mt-2 w-full max-h-[260px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
            {contentMd || "（空）"}
          </pre>
        </details>
        {(reasonMd || diffMd) && (
          <details className="px-3 py-2 rounded-md bg-background border border-border">
            <summary className="cursor-pointer text-sm font-bold text-textMain">判定理由 / Diff</summary>
            {reasonMd && (
              <pre className="mt-2 w-full max-h-[200px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                {reasonMd}
              </pre>
            )}
            {diffMd && (
              <pre className="mt-2 w-full max-h-[200px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                {diffMd}
              </pre>
            )}
          </details>
        )}
      </div>
    );
  };

  const renderAssetBind = () => {
    const filename = String(inputs?.filename || "");
    const contentJson = String(inputs?.content_json || "");
    const episodeNumber = Number(preview?.episode_number || inputs?.episode_number || 0);
    const bindingCount = Number(preview?.binding_count || 0);
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-textMuted">将写入 VFS：/绑定/{filename || "EPxxx_bindings.json"}（预览，不落库）</div>
        <div className="text-xs text-textMuted">
          EP{String(episodeNumber || 0).padStart(3, "0")} · 绑定 {bindingCount}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copyText(contentJson)}
            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
          >
            复制 JSON
          </button>
          <button
            type="button"
            onClick={() => copyText(prettyJson(inputs))}
            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
          >
            复制输入对象
          </button>
        </div>
        <pre className="w-full max-h-[320px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs">
          {contentJson || "（空）"}
        </pre>
      </div>
    );
  };

  const renderStoryboardApply = () => {
    const shots = Array.isArray(inputs?.shots) ? (inputs.shots as any[]) : [];
    const count = typeof preview?.count === "number" ? Number(preview.count) : shots.length;
    const warning = preview?.warning ? String(preview.warning) : "";
    const virtual = Boolean(preview?.virtual);
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-textMuted">分镜预览（不落库）</div>
        <div className="text-xs text-textMuted">
          镜头 {count} {virtual ? "· virtual" : ""} {warning ? `· ${warning}` : ""}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copyText(prettyJson(shots))}
            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
          >
            复制 shots JSON
          </button>
          <button
            type="button"
            onClick={() => copyText(prettyJson(inputs))}
            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface"
          >
            复制输入对象
          </button>
        </div>
        {shots.length === 0 && <div className="text-sm text-textMuted">没有 shots 输入。</div>}
        {shots.length > 0 && (
          <div className="space-y-2">
            {shots.slice(0, 20).map((s, idx) => {
              const shotType = String(s?.shot_type || "");
              const angle = String(s?.camera_angle || "");
              const move = String(s?.camera_move || "");
              const filterStyle = String(s?.filter_style || "");
              const narrativeFunction = String(s?.narrative_function || "");
              const povCharacter = String(s?.pov_character || "");
              const dialogueSpeaker = String(s?.dialogue_speaker || "");
              const soundEffect = String(s?.sound_effect || "");
              const duration = typeof s?.duration_estimate === "number" ? Number(s.duration_estimate) : null;
              const activeAssets = Array.isArray(s?.active_assets)
                ? (s.active_assets as any[]).filter((x) => typeof x === "string" && x.trim()).map((x) => String(x))
                : [];
              const desc = String(s?.description || "");
              const dialogue = String(s?.dialogue || "");
              const md = [
                `#${idx + 1} ${shotType || "shot"}`,
                "",
                "- 机位",
                `  - 镜头类型：${shotType || "（空）"}`,
                angle ? `  - 镜头角度：${angle}` : "",
                move ? `  - 镜头运动：${move}` : "",
                filterStyle ? `  - 滤镜/风格：${filterStyle}` : "",
                narrativeFunction ? `  - 叙事功能：${narrativeFunction}` : "",
                povCharacter ? `  - POV：${povCharacter}` : "",
                soundEffect ? `  - 音效：${soundEffect}` : "",
                duration !== null ? `  - 时长(秒)：${duration}` : "",
                activeAssets.length ? `  - 资产：${activeAssets.join("、")}` : "",
                "",
                "## 画面描述",
                desc || "（无画面描述）",
                dialogue
                  ? [
                      "",
                      "## 台词",
                      dialogueSpeaker ? `**${dialogueSpeaker}**` : "",
                      dialogue,
                    ].filter(Boolean).join("\n")
                  : "",
              ]
                .filter((x) => typeof x === "string" && x.length > 0)
                .join("\n");
              return (
                <details key={idx} className="px-3 py-2 rounded-md bg-background border border-border">
                  <summary className="cursor-pointer text-sm font-bold text-textMain">
                    #{idx + 1} {shotType || "shot"} {angle ? `· ${angle}` : ""} {move ? `· ${move}` : ""}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <pre className="w-full max-h-[220px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap">
                      {md}
                    </pre>
                  </div>
                </details>
              );
            })}
            {shots.length > 20 && <div className="text-xs text-textMuted">仅展示前 20 条，完整内容请复制 JSON。</div>}
          </div>
        )}
      </div>
    );
  };

  const detail =
    plan.kind === "episode_save"
      ? renderEpisodeSave()
      : plan.kind === "asset_create"
        ? renderAssetCreate()
        : plan.kind === "asset_doc_upsert"
          ? renderAssetDocUpsert()
          : renderAssetBind();

  return (
    <details className="px-3 py-2 rounded-md bg-surfaceHighlight/40 border border-border">
      <summary className="cursor-pointer">
        <div className="text-sm font-bold">{planSummary(plan)}</div>
        <div className="text-[11px] text-textMuted">kind: {plan.kind} · dry_run: {String(Boolean(preview?.dry_run))}</div>
      </summary>
      <div className="mt-3 space-y-3">{detail}</div>
    </details>
  );
}

function ChatDialog(props: {
  open: boolean;
  onClose: () => void;
  onReset: () => void;
  sceneCode: string;
  sceneName: string;
  scriptText: string;
  setScriptText: (v: string) => void;
  scripts: ScriptRead[];
  episodes: EpisodeRead[];
  selectedScriptId: string;
  selectedEpisodeIds: string[];
  onSelectScript: (scriptId: string) => void;
  onSelectEpisodes: (episodeIds: string[]) => void;
  onInsertEpisodeText: () => void;
  contextPreview: { counts: Record<string, number> } | null;
  contextPreviewLoading: boolean;
  contextPreviewError: string | null;
  contextExcludeTypes: string[];
  setContextExcludeTypes: (v: string[]) => void;
  messages: AISceneTestChatMessage[];
  onSend: (text: string) => Promise<void>;
  sending: boolean;
  error: string | null;
  plans: ApplyPlan[];
  traceEvents: Array<Record<string, unknown>>;
  archive: any | null;
  taskId: string | null;
  taskStatus: string | null;
  taskProgress: number;
  onCancelTask: () => void;
  onRetryTask: () => void;
}) {
  const {
    open,
    onClose,
    onReset,
    sceneCode,
    sceneName,
    scriptText,
    setScriptText,
    scripts,
    episodes,
    selectedScriptId,
    selectedEpisodeIds,
    onSelectScript,
    onSelectEpisodes,
    onInsertEpisodeText,
    contextPreview,
    contextPreviewLoading,
    contextPreviewError,
    contextExcludeTypes,
    setContextExcludeTypes,
    messages,
    onSend,
    sending,
    error,
    plans,
    traceEvents,
    archive,
    taskId,
    taskStatus,
    taskProgress,
    onCancelTask,
    onRetryTask,
  } = props;
  const [input, setInput] = useState("");
  const [rightTab, setRightTab] = useState<"trace" | "plans" | "archive">("trace");

  useEffect(() => {
    if (!open) return;
    setInput("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[calc(100dvh-2rem)] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-lg font-bold">AI 场景测试</div>
            <div className="text-[11px] text-textMuted truncate">
              {sceneCode ? `场景：${sceneName ? `${sceneName} · ` : ""}${sceneCode}` : "场景：未选择"}
            </div>
            <div className="text-[11px] text-textMuted truncate">
              {taskId
                ? `任务：${taskId} · ${taskStatus || "-"} · ${taskProgress}%${taskStatus === "queued" ? "（排队中）" : ""}`
                : "未提交任务"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={sending || taskStatus === "running" || taskStatus === "queued"}
              onClick={() => {
                setInput("");
                setRightTab("trace");
                onReset();
              }}
              className="px-3 py-2 rounded-lg border border-border bg-surfaceHighlight hover:bg-surface disabled:opacity-60"
              title={taskStatus === "running" || taskStatus === "queued" ? "任务执行中，请先取消或等待结束" : ""}
            >
              新建
            </button>
            <button
              type="button"
              disabled={!taskId || taskStatus !== "running"}
              onClick={onCancelTask}
              className="px-3 py-2 rounded-lg border border-border bg-surfaceHighlight hover:bg-surface disabled:opacity-60"
            >
              取消任务
            </button>
            <button
              type="button"
              disabled={!taskId || (taskStatus !== "failed" && taskStatus !== "canceled")}
              onClick={onRetryTask}
              className="px-3 py-2 rounded-lg border border-border bg-surfaceHighlight hover:bg-surface disabled:opacity-60"
            >
              重试
            </button>
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-border bg-surfaceHighlight hover:bg-surface">
              关闭
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-0 flex-1 min-h-0 overflow-hidden">
          <div className="p-6 border-b lg:border-b-0 lg:border-r border-border space-y-3 overflow-y-auto min-h-0">
            {error && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle size={16} />
                  <div className="truncate">{error}</div>
                </div>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void onSend("继续（不要重复前面已输出内容）。")}
                  className="shrink-0 px-3 py-1.5 rounded-md bg-surfaceHighlight border border-border text-sm text-textMain hover:bg-surface disabled:opacity-60"
                >
                  继续生成
                </button>
              </div>
            )}

            <details className="border border-border rounded-xl overflow-hidden bg-background">
              <summary className="px-4 py-2 cursor-pointer text-sm font-bold flex items-center gap-2 border-b border-border">
                <Settings2 size={16} />
                剧本文本（粘贴）
              </summary>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surfaceHighlight/40 border border-border">
                  <div className="text-[11px] text-textMuted">
                    上下文（资产库）：
                    {contextPreviewLoading
                      ? "加载中..."
                      : `角色 ${contextPreview?.counts?.character ?? 0} · 道具 ${contextPreview?.counts?.prop ?? 0} · 地点 ${contextPreview?.counts?.location ?? 0} · 特效 ${contextPreview?.counts?.vfx ?? 0}`}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-textMuted">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!contextExcludeTypes.includes("character")}
                        onChange={(e) => {
                          const next = new Set(contextExcludeTypes);
                          if (e.target.checked) next.delete("character");
                          else next.add("character");
                          setContextExcludeTypes(Array.from(next));
                        }}
                      />
                      角色
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!contextExcludeTypes.includes("prop")}
                        onChange={(e) => {
                          const next = new Set(contextExcludeTypes);
                          if (e.target.checked) next.delete("prop");
                          else next.add("prop");
                          setContextExcludeTypes(Array.from(next));
                        }}
                      />
                      道具
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!contextExcludeTypes.includes("location")}
                        onChange={(e) => {
                          const next = new Set(contextExcludeTypes);
                          if (e.target.checked) next.delete("location");
                          else next.add("location");
                          setContextExcludeTypes(Array.from(next));
                        }}
                      />
                      地点
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!contextExcludeTypes.includes("vfx")}
                        onChange={(e) => {
                          const next = new Set(contextExcludeTypes);
                          if (e.target.checked) next.delete("vfx");
                          else next.add("vfx");
                          setContextExcludeTypes(Array.from(next));
                        }}
                      />
                      特效
                    </label>
                  </div>
                </div>
                {contextPreviewError && <div className="text-[11px] text-red-400">{contextPreviewError}</div>}
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] gap-2">
                  <label className="space-y-1">
                    <div className="text-[11px] text-textMuted">选择剧本</div>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                      value={selectedScriptId}
                      onChange={(e) => onSelectScript(e.target.value)}
                    >
                      <option value="">（不选择）</option>
                      {scripts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-textMuted">选择剧集（可多选）</div>
                      <div className="text-[11px] text-textMuted">
                        已选 {selectedEpisodeIds.length}/{episodes.length || 0}
                      </div>
                    </div>
                    <details className="rounded-md bg-background border border-border">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm">
                        {selectedEpisodeIds.length === 0
                          ? "（不选择）"
                          : selectedEpisodeIds.length === episodes.length
                            ? "已全选"
                            : `已选择 ${selectedEpisodeIds.length} 项`}
                      </summary>
                      <div className="p-3 space-y-2 border-t border-border">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!selectedScriptId || episodes.length === 0}
                            onClick={() => onSelectEpisodes(episodes.map((e) => e.id))}
                            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface disabled:opacity-60"
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            disabled={!selectedScriptId || selectedEpisodeIds.length === 0}
                            onClick={() => onSelectEpisodes([])}
                            className="px-2 py-1 rounded-md bg-surfaceHighlight border border-border text-xs hover:bg-surface disabled:opacity-60"
                          >
                            清空
                          </button>
                        </div>
                        <div className="max-h-[220px] overflow-auto space-y-1">
                          {episodes.length === 0 && <div className="text-xs text-textMuted">暂无剧集</div>}
                          {episodes.map((ep) => {
                            const checked = selectedEpisodeIds.includes(ep.id);
                            return (
                              <label key={ep.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!selectedScriptId}
                                  onChange={(e) => {
                                    const next = new Set(selectedEpisodeIds);
                                    if (e.target.checked) next.add(ep.id);
                                    else next.delete(ep.id);
                                    onSelectEpisodes(Array.from(next));
                                  }}
                                />
                                <span className="truncate">
                                  EP{String(ep.episode_number).padStart(3, "0")} {ep.title || ""}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-textMuted">插入</div>
                    <button
                      type="button"
                      onClick={onInsertEpisodeText}
                      disabled={selectedEpisodeIds.length === 0}
                      className="w-full px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface disabled:opacity-60"
                    >
                      插入到文本
                    </button>
                  </div>
                </div>
                <textarea
                  className="w-full min-h-[220px] px-3 py-2 rounded-md bg-background border border-border text-sm"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="在这里粘贴剧本文本..."
                />
                <div className="text-[11px] text-textMuted">仅用于评估效果，结果以预览形式返回，不实际写库。</div>
              </div>
            </details>

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border text-sm font-bold">Chatbox（流式输出）</div>
              <div className="h-[min(420px,calc(100dvh-28rem))] overflow-y-auto p-4 space-y-3 bg-background">
                {messages.length === 0 && <div className="text-sm text-textMuted">暂无对话。输入一句话并发送开始测试。</div>}
                {messages.map((m, idx) => (
                  <div key={idx} className={`text-sm ${m.role === "user" ? "text-textMain" : "text-textMuted"}`}>
                    <div className="text-[10px] uppercase tracking-wide opacity-70">{m.role}</div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-border flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="例如：请调用角色提取工具并返回预览落库结果"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const t = input.trim();
                      if (!t) return;
                      setInput("");
                      void onSend(t);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = input.trim();
                    if (!t) return;
                    setInput("");
                    void onSend(t);
                  }}
                  disabled={sending}
                  className="px-4 py-2 rounded-md bg-primary text-background text-sm font-bold disabled:opacity-60"
                >
                  {sending ? "发送中..." : "发送"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-3 overflow-y-auto min-h-0">
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border text-sm font-bold flex items-center gap-2">
                <Wrench size={16} />
                Agent 工作结果（预览落库）
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRightTab("trace")}
                    className={`px-3 py-1.5 rounded-md text-sm border ${rightTab === "trace" ? "bg-surfaceHighlight border-border" : "border-transparent text-textMuted hover:text-textMain"}`}
                  >
                    追踪 {traceEvents.length ? `(${traceEvents.length})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab("plans")}
                    className={`px-3 py-1.5 rounded-md text-sm border ${rightTab === "plans" ? "bg-surfaceHighlight border-border" : "border-transparent text-textMuted hover:text-textMain"}`}
                  >
                    结果 {plans.length ? `(${plans.length})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab("archive")}
                    className={`px-3 py-1.5 rounded-md text-sm border ${rightTab === "archive" ? "bg-surfaceHighlight border-border" : "border-transparent text-textMuted hover:text-textMain"}`}
                  >
                    归档 {archive ? "(1)" : ""}
                  </button>
                </div>

                {rightTab === "trace" && (
                  <div className="space-y-2 max-h-[calc(100dvh-22rem)] overflow-auto pr-1">
                    {traceEvents.length === 0 && <div className="text-sm text-textMuted">暂无追踪事件。</div>}
                    {traceEvents.length > 0 && (
                      <div className="space-y-2">
                        {traceEvents.slice(-40).map((e, idx) => {
                          const type = String((e as any).type || "event");
                          const toolId = (e as any).tool_id ? String((e as any).tool_id) : "";
                          const label = (e as any).label ? String((e as any).label) : "";
                          const agentCode = (e as any).agent_code ? String((e as any).agent_code) : "";
                          const version = (e as any).version !== undefined ? String((e as any).version) : "";
                          const title = toolId
                            ? `${type} · ${label ? `${label} (${toolId})` : toolId}`
                            : agentCode
                              ? `${type} · ${agentCode}${version ? ` v${version}` : ""}`
                              : type;
                          const preview = (e as any).preview ? prettyJson((e as any).preview) : null;
                          return (
                            <div key={`${idx}-${title}`} className="px-3 py-2 rounded-md bg-background border border-border">
                              <div className="text-xs font-bold text-textMain">{title}</div>
                              {preview && <div className="text-[11px] text-textMuted whitespace-pre-wrap mt-1">{preview}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {rightTab === "plans" && (
                  <div className="space-y-2 max-h-[calc(100dvh-22rem)] overflow-auto pr-1">
                    {plans.length === 0 && <div className="text-sm text-textMuted">暂无预览结果。</div>}
                    {plans.map((p) => (
                      <PlanCard key={p.id} plan={p} />
                    ))}
                    {plans.length > 0 && (
                      <details className="pt-2">
                        <summary className="text-sm cursor-pointer text-textMain">查看完整 JSON</summary>
                        <pre className="mt-2 w-full max-h-[420px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs">
                          {prettyJson(plans)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {rightTab === "archive" && (
                  <div className="space-y-2 max-h-[calc(100dvh-22rem)] overflow-auto pr-1">
                    {!archive && <div className="text-sm text-textMuted">暂无归档信息（选择剧本并运行后会生成 AI/ 归档）。</div>}
                    {archive && (
                      <details open className="pt-2">
                        <summary className="text-sm cursor-pointer text-textMain">AI 运行归档</summary>
                        <pre className="mt-2 w-full max-h-[420px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs">
                          {prettyJson(archive)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AIScenesPage() {
  const { subscribeTask } = useTasks();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subAgentFilter, setSubAgentFilter] = useState("");
  const [toolFilter, setToolFilter] = useState("");

  const [agents, setAgents] = useState<AISceneTestAgentOption[]>([]);
  const [tools, setTools] = useState<Array<{ tool_id: string; label: string; uses_agent_codes: string[] }>>([]);

  const [mainAgentCode, setMainAgentCode] = useState<string>("script_expert");
  const [mainAgentVersion, setMainAgentVersion] = useState<number>(1);

  const [subAgentCodes, setSubAgentCodes] = useState<string[]>([]);
  const [subAgentVersions, setSubAgentVersions] = useState<Record<string, number>>({});

  const [toolIds, setToolIds] = useState<string[]>(["preview_script_split", "preview_extract_characters"]);
  const [sideTab, setSideTab] = useState<"tools" | "run">("tools");

  const [scriptText, setScriptText] = useState<string>("");
  const [scripts, setScripts] = useState<ScriptRead[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [episodes, setEpisodes] = useState<EpisodeRead[]>([]);
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);

  const chatSeenEventSignaturesRef = useRef<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<AISceneTestChatMessage[]>([]);
  const [chatPlans, setChatPlans] = useState<ApplyPlan[]>([]);
  const [chatTraceEvents, setChatTraceEvents] = useState<Array<Record<string, unknown>>>([]);
  const [chatArchive, setChatArchive] = useState<any | null>(null);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatTaskId, setChatTaskId] = useState<string | null>(null);
  const [chatTaskStatus, setChatTaskStatus] = useState<string | null>(null);
  const [chatTaskProgress, setChatTaskProgress] = useState<number>(0);

  const [contextPreview, setContextPreview] = useState<{ counts: Record<string, number> } | null>(null);
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState<string | null>(null);
  const [contextExcludeTypes, setContextExcludeTypes] = useState<string[]>([]);

  const [modelConfigs, setModelConfigs] = useState<AIModelConfig[]>([]);

  const [adminScenes, setAdminScenes] = useState<AdminAIScene[]>([]);
  const [sceneMode, setSceneMode] = useState<"edit" | "create">("edit");
  const [sceneFilter, setSceneFilter] = useState("");
  const [sceneDraft, setSceneDraft] = useState<SceneDraft>(() => emptySceneDraft());
  const [sceneSubmitting, setSceneSubmitting] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);

  const [builtinVersionsByCode, setBuiltinVersionsByCode] = useState<Record<string, BuiltinAgentPromptVersion[]>>({});
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorAgentCode, setPromptEditorAgentCode] = useState("");
  const [promptEditorEditingVersion, setPromptEditorEditingVersion] = useState<{ version: number } | null>(null);
  const [promptEditorInitialSystemPrompt, setPromptEditorInitialSystemPrompt] = useState("");
  const [promptEditorInitialModelConfigId, setPromptEditorInitialModelConfigId] = useState<string | null>(null);
  const [promptEditorInitialDescription, setPromptEditorInitialDescription] = useState("");
  const [promptEditorInitialMetaText, setPromptEditorInitialMetaText] = useState("");
  const [promptEditorSubmitting, setPromptEditorSubmitting] = useState(false);
  const [promptEditorError, setPromptEditorError] = useState<string | null>(null);

  const mainAgent = useMemo(() => agents.find((a) => a.agent_code === mainAgentCode) || null, [agents, mainAgentCode]);
  const mainAgentVersions = useMemo(() => (mainAgent?.versions || []).map((v) => v.version).sort((a, b) => b - a), [mainAgent]);
  const existingSceneCodes = useMemo(() => new Set(adminScenes.map((s) => String(s.scene_code || "").trim().toLowerCase()).filter(Boolean)), [adminScenes]);

  useEffect(() => {
    const tid = String(searchParams.get("chatTaskId") || "").trim();
    if (tid) {
      setChatTaskId(tid);
      const open = String(searchParams.get("openChat") || "").trim();
      if (open === "1") setChatOpen(true);
      return;
    }
    try {
      const stored = String(window.localStorage.getItem("aiScenes.chatTaskId") || "").trim();
      if (stored) setChatTaskId((prev) => prev || stored);
    } catch {
      return;
    }
  }, [searchParams]);

  useEffect(() => {
    if (!chatTaskId) return;
    try {
      window.localStorage.setItem("aiScenes.chatTaskId", chatTaskId);
    } catch {
      return;
    }
  }, [chatTaskId]);

  const persistChatTaskInUrl = useCallback(
    (taskId: string) => {
      const tid = String(taskId || "").trim();
      if (!tid) return;
      const url = new URL(window.location.href);
      url.searchParams.set("chatTaskId", tid);
      router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    },
    [router]
  );

  const clearChatTask = useCallback(() => {
    setChatTaskId(null);
    setChatTaskStatus(null);
    setChatTaskProgress(0);
    setChatPlans([]);
    setChatTraceEvents([]);
    setChatArchive(null);
    setChatMessages([]);
    setChatError(null);
    chatSeenEventSignaturesRef.current = new Set();
    try {
      window.localStorage.removeItem("aiScenes.chatTaskId");
    } catch {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("chatTaskId");
    url.searchParams.delete("openChat");
    router.replace(`${url.pathname}?${url.searchParams.toString()}`.replace(/\?$/, ""));
  }, [router]);

  async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, cache: "no-store" });
    const text = await res.text();
    if (res.status === 401) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      throw new Error("未登录或登录已过期");
    }
    if (!res.ok) throw new Error(text || res.statusText);
    return (text ? (JSON.parse(text) as T) : (undefined as T));
  }

  const extractSceneTestUiConfig = useCallback((uiConfig: Record<string, unknown> | null | undefined) => {
    const root = uiConfig && typeof uiConfig === "object" && !Array.isArray(uiConfig) ? (uiConfig as Record<string, unknown>) : {};
    const st = root.scene_test && typeof root.scene_test === "object" && !Array.isArray(root.scene_test) ? (root.scene_test as Record<string, unknown>) : {};
    const main = st.main_agent && typeof st.main_agent === "object" && !Array.isArray(st.main_agent) ? (st.main_agent as Record<string, unknown>) : {};
    const mainAgentCode = typeof main.agent_code === "string" ? main.agent_code.trim() : "";
    const mainAgentVersion = typeof main.version === "number" ? main.version : Number(main.version || 0);
    const subAgentsRaw = Array.isArray(st.sub_agents) ? (st.sub_agents as Array<Record<string, unknown>>) : [];

    const subAgentCodes: string[] = [];
    const subAgentVersions: Record<string, number> = {};
    for (const rec of subAgentsRaw) {
      if (!rec || typeof rec !== "object") continue;
      const code = typeof rec.agent_code === "string" ? rec.agent_code.trim() : "";
      if (!code) continue;
      if (!subAgentCodes.includes(code)) subAgentCodes.push(code);
      const vv = typeof rec.version === "number" ? rec.version : Number(rec.version || 0);
      if (vv > 0) subAgentVersions[code] = vv;
    }

    return {
      mainAgentCode,
      mainAgentVersion: mainAgentVersion > 0 ? mainAgentVersion : null,
      subAgentCodes,
      subAgentVersions,
    };
  }, []);

  const injectSceneTestUiConfig = useCallback(
    (uiConfig: Record<string, unknown>) => {
      const prev = uiConfig && typeof uiConfig === "object" && !Array.isArray(uiConfig) ? uiConfig : {};
      const existing = prev.scene_test && typeof prev.scene_test === "object" && !Array.isArray(prev.scene_test) ? (prev.scene_test as Record<string, unknown>) : {};

      const effectiveMain = mainAgentCode || "script_expert";
      const subAgents = subAgentCodes
        .filter((code) => code && code !== effectiveMain)
        .map((code) => ({
          agent_code: code,
          version: subAgentVersions[code] || pickDefaultVersion(agents.find((a) => a.agent_code === code) || null),
        }));

      return {
        ...prev,
        scene_test: {
          ...existing,
          main_agent: {
            agent_code: mainAgentCode || "script_expert",
            version: mainAgentVersion || pickDefaultVersion(agents.find((a) => a.agent_code === (mainAgentCode || "script_expert")) || null),
          },
          sub_agents: subAgents,
        },
      } as Record<string, unknown>;
    },
    [agents, mainAgentCode, mainAgentVersion, subAgentCodes, subAgentVersions]
  );

  const loadSceneIntoDraft = useCallback((row: AdminAIScene) => {
    const uiCfg = row.ui_config && typeof row.ui_config === "object" && !Array.isArray(row.ui_config) ? (row.ui_config as Record<string, unknown>) : {};
    const st = extractSceneTestUiConfig(uiCfg);
    const nextAgentCode = st.mainAgentCode || row.builtin_agent_code || "script_expert";
    const nextAgentVersion = st.mainAgentVersion || 1;
    const nextSubAgentCodes = st.subAgentCodes.filter((c) => c && c !== nextAgentCode);
    const nextSubAgentVersions: Record<string, number> = {};
    for (const c of nextSubAgentCodes) {
      if (st.subAgentVersions[c]) nextSubAgentVersions[c] = st.subAgentVersions[c];
    }
    const nextToolIds = Array.isArray(row.required_tools) ? row.required_tools : [];
    setSceneDraft({
      scene_code: row.scene_code,
      name: row.name || "",
      type: row.type || "chat",
      description: row.description || "",
      builtin_agent_code: nextAgentCode,
      required_tools_text: JSON.stringify(nextToolIds, null, 2),
      ui_config_text: JSON.stringify(uiCfg || {}, null, 2),
    });

    setMainAgentCode(nextAgentCode);
    setMainAgentVersion(nextAgentVersion);
    setSubAgentCodes(nextSubAgentCodes);
    setSubAgentVersions(nextSubAgentVersions);
    setToolIds(nextToolIds);
  }, [extractSceneTestUiConfig]);

  const refreshAdminScenesOnly = useCallback(async () => {
    setSceneError(null);
    try {
      const res = await aiAdminListScenes();
      const rows = (res.data || []).slice().sort((a, b) => a.scene_code.localeCompare(b.scene_code));
      setAdminScenes(rows);
      if (sceneMode === "edit") {
        const current = sceneDraft.scene_code ? rows.find((x) => x.scene_code === sceneDraft.scene_code) : null;
        if (current) loadSceneIntoDraft(current);
        if (!current && rows.length > 0) loadSceneIntoDraft(rows[0]);
      }
    } catch (e: unknown) {
      setSceneError(e instanceof Error ? e.message : "加载场景失败");
    }
  }, [loadSceneIntoDraft, sceneDraft.scene_code, sceneMode]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiAdminSceneTestOptions();
      const data = res.data;
      setAgents(data?.agents || []);
      setTools(data?.tools || []);

      const mc = await aiAdminListModelConfigs("text");
      setModelConfigs(mc.data || []);

      const list = data?.agents || [];
      const scriptExpert = list.find((a) => a.agent_code === "script_expert") || list.find((a) => String(a.name || "").includes("剧本专家")) || null;
      if (scriptExpert && mainAgentCode === "script_expert") {
        setMainAgentVersion(pickDefaultVersion(scriptExpert));
      }

      const scriptsRes = await listScripts(1, 50);
      setScripts(scriptsRes.data?.items || []);

      const scenesRes = await aiAdminListScenes();
      const rows = (scenesRes.data || []).slice().sort((a, b) => a.scene_code.localeCompare(b.scene_code));
      setAdminScenes(rows);
      if (sceneMode === "edit") {
        const current = sceneDraft.scene_code ? rows.find((x) => x.scene_code === sceneDraft.scene_code) : null;
        if (current) loadSceneIntoDraft(current);
        if (!current && rows.length > 0) loadSceneIntoDraft(rows[0]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedScriptId) {
      setContextPreview(null);
      setContextPreviewLoading(false);
      setContextPreviewError(null);
      return;
    }
    let cancelled = false;
    setContextPreviewLoading(true);
    setContextPreviewError(null);
    const excludeTypes = contextExcludeTypes.join(",");
    void (async () => {
      try {
        const qs = excludeTypes ? `?exclude_types=${encodeURIComponent(excludeTypes)}` : "";
        const res = await fetch(`/api/projects/${encodeURIComponent(selectedScriptId)}/context/preview${qs}`, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) {
          if (!cancelled) setContextPreviewError(text || res.statusText);
          if (!cancelled) setContextPreviewLoading(false);
          return;
        }
        const json = (text ? (JSON.parse(text) as { data?: { counts?: Record<string, number> } }) : {}) as { data?: { counts?: Record<string, number> } };
        const counts = json.data?.counts && typeof json.data.counts === "object" ? json.data.counts : {};
        if (!cancelled) setContextPreview({ counts });
        if (!cancelled) setContextPreviewLoading(false);
      } catch (e) {
        if (!cancelled) setContextPreviewError(e instanceof Error ? e.message : String(e));
        if (!cancelled) setContextPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextExcludeTypes, selectedScriptId]);

  useEffect(() => {
    if (!mainAgent) return;
    const v = pickDefaultVersion(mainAgent);
    setMainAgentVersion((prev) => (mainAgentVersions.includes(prev) ? prev : v));
  }, [mainAgent, mainAgentCode, mainAgentVersions.join(",")]);

  useEffect(() => {
    if (agents.length === 0) return;
    setSubAgentVersions((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const code of subAgentCodes) {
        const a = agents.find((x) => x.agent_code === code) || null;
        const allowed = (a?.versions || []).map((v) => v.version);
        const current = prev[code] || 0;
        const desired = allowed.includes(current) ? current : pickDefaultVersion(a);
        next[code] = desired;
        if (current !== desired) changed = true;
      }
      for (const k of Object.keys(prev)) {
        if (!subAgentCodes.includes(k)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [agents, subAgentCodes.join(",")]);

  const filteredAdminScenes = useMemo(() => {
    const q = sceneFilter.trim().toLowerCase();
    if (!q) return adminScenes;
    return adminScenes.filter((s) => `${s.scene_code} ${s.name} ${s.type}`.toLowerCase().includes(q));
  }, [adminScenes, sceneFilter]);

  useEffect(() => {
    setSceneDraft((prev) => {
      const next = (mainAgentCode || "script_expert").trim();
      if ((prev.builtin_agent_code || "") === next) return prev;
      return { ...prev, builtin_agent_code: next };
    });
  }, [mainAgentCode]);

  useEffect(() => {
    const json = JSON.stringify(toolIds || [], null, 2);
    setSceneDraft((prev) => {
      if ((prev.required_tools_text || "") === json) return prev;
      return { ...prev, required_tools_text: json };
    });
  }, [toolIds]);

  const submitScene = useCallback(async () => {
    setSceneSubmitting(true);
    setSceneError(null);
    try {
      const code = sceneDraft.scene_code.trim();
      const name = sceneDraft.name.trim();
      const type = "chat";
      if (!code) throw new Error("scene_code 不能为空");
      if (!name) throw new Error("名称不能为空");

      const cfgParsed = safeParseJson(sceneDraft.ui_config_text);
      const uiConfig =
        cfgParsed.ok && cfgParsed.value && typeof cfgParsed.value === "object" && !Array.isArray(cfgParsed.value)
          ? (cfgParsed.value as Record<string, unknown>)
          : {};
      const uiConfigWithSceneTest = injectSceneTestUiConfig(uiConfig);
      const builtinAgentCode = (sceneDraft.builtin_agent_code || "script_expert").trim() || "script_expert";

      if (sceneMode === "create") {
        await aiAdminCreateScene({
          scene_code: code,
          name,
          type,
          description: sceneDraft.description.trim() || null,
          builtin_agent_code: builtinAgentCode,
          required_tools: toolIds,
          ui_config: uiConfigWithSceneTest,
        });
        setSceneMode("edit");
      } else {
        await aiAdminUpdateScene(code, {
          name,
          type,
          description: sceneDraft.description.trim() || null,
          builtin_agent_code: builtinAgentCode,
          required_tools: toolIds,
          ui_config: uiConfigWithSceneTest,
        });
      }

      await refreshAdminScenesOnly();
    } catch (e: unknown) {
      setSceneError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSceneSubmitting(false);
    }
  }, [injectSceneTestUiConfig, refreshAdminScenesOnly, sceneDraft, sceneMode, toolIds]);

  const deleteScene = useCallback(async () => {
    const code = sceneDraft.scene_code.trim();
    if (!code) return;
    if (!window.confirm(`确认删除场景 ${code} ?`)) return;
    setSceneSubmitting(true);
    setSceneError(null);
    try {
      await aiAdminDeleteScene(code);
      setSceneDraft(emptySceneDraft());
      setMainAgentCode("");
      setToolIds([]);
      await refreshAdminScenesOnly();
    } catch (e: unknown) {
      setSceneError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setSceneSubmitting(false);
    }
  }, [refreshAdminScenesOnly, sceneDraft.scene_code]);

  useEffect(() => {
    if (!chatTaskId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!active) return;
      let terminal = false;
      try {
        const res = await fetchJson<{ data?: any }>(`/api/tasks/${encodeURIComponent(chatTaskId)}`);
        const t = res?.data || null;
        if (t) {
          setChatTaskStatus(String(t.status || ""));
          setChatTaskProgress(Number(t.progress || 0));
          if (t.status === "succeeded") {
            const r = (t.result_json || {}) as any;
            const out = String(r.output_text || "");
            const plans = Array.isArray(r.plans) ? (r.plans as ApplyPlan[]) : [];
            const traces = Array.isArray(r.trace_events) ? (r.trace_events as Array<Record<string, unknown>>) : [];
            const archive = r.archive ?? null;
            setChatPlans(plans);
            setChatTraceEvents(traces);
            setChatArchive(archive);
            if (out) {
              setChatMessages((prev) => {
                const arr = [...prev];
                for (let i = arr.length - 1; i >= 0; i--) {
                  if (arr[i]?.role === "assistant") {
                    arr[i] = { ...arr[i], content: out };
                    return arr;
                  }
                }
                return [...arr, { role: "assistant", content: out }];
              });
            }
            setChatSubmitting(false);
            terminal = true;
          }
          if (t.status === "failed" || t.status === "canceled") {
            setChatError(String(t.error || (t.status === "canceled" ? "任务已取消" : "任务失败")));
            setChatSubmitting(false);
            terminal = true;
          }
        }
      } catch (e: unknown) {
        setChatError(e instanceof Error ? e.message : "任务状态获取失败");
      } finally {
        if (!active) return;
        if (terminal) {
          active = false;
          return;
        }
        timer = setTimeout(tick, 4000);
      }
    };

    void tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [chatTaskId]);

  const applyTaskEventToUi = useCallback(
    async (ev: { task_id?: string; event_type?: string; status?: string; progress?: number; payload?: any }) => {
      const taskId = String(ev?.task_id || "");
      if (!taskId || taskId !== chatTaskId) return;

      const sig = `${ev.event_type || ""}|${ev.status || ""}|${String(ev.progress ?? "")}|${JSON.stringify(ev.payload || {})}`;
      const seen = chatSeenEventSignaturesRef.current;
      if (seen.has(sig)) return;
      seen.add(sig);
      if (seen.size > 600) {
        const next = new Set(Array.from(seen).slice(-400));
        chatSeenEventSignaturesRef.current = next;
      }

      if (typeof ev.status === "string" && ev.status) setChatTaskStatus(ev.status);
      if (typeof ev.progress === "number" && Number.isFinite(ev.progress)) setChatTaskProgress(ev.progress);

      const type = String(ev.event_type || "");
      if (type === "log") {
        const p = (ev.payload || {}) as any;
        if (p?.message === "trace" && p?.payload) {
          const inner = { ...(p.payload as any) };
          if (!inner.type) inner.type = "trace";
          setChatTraceEvents((prev) => {
            const next = [...prev, inner];
            return next.length > 500 ? next.slice(-400) : next;
          });
          return;
        }
        setChatTraceEvents((prev) => {
          const next = [...prev, { type: "log", message: String(p?.message || ""), preview: p?.payload || p }];
          return next.length > 500 ? next.slice(-400) : next;
        });
        return;
      }

      if (type === "succeeded" || type === "failed" || type === "canceled") {
        try {
          const res = await fetchJson<{ data?: any }>(`/api/tasks/${encodeURIComponent(taskId)}`);
          const t = res?.data || null;
          if (!t) return;
          setChatTaskStatus(String(t.status || ""));
          setChatTaskProgress(Number(t.progress || 0));
          if (t.status === "succeeded") {
            const r = (t.result_json || {}) as any;
            const out = String(r.output_text || "");
            const plans = Array.isArray(r.plans) ? (r.plans as ApplyPlan[]) : [];
            const traces = Array.isArray(r.trace_events) ? (r.trace_events as Array<Record<string, unknown>>) : [];
            const archive = r.archive ?? null;
            setChatPlans(plans);
            if (traces.length) setChatTraceEvents(traces);
            setChatArchive(archive);
            if (out) {
              setChatMessages((prev) => {
                const arr = [...prev];
                for (let i = arr.length - 1; i >= 0; i--) {
                  if (arr[i]?.role === "assistant") {
                    arr[i] = { ...arr[i], content: out };
                    return arr;
                  }
                }
                return [...arr, { role: "assistant", content: out }];
              });
            }
            setChatSubmitting(false);
          } else if (t.status === "failed" || t.status === "canceled") {
            setChatError(String(t.error || (t.status === "canceled" ? "任务已取消" : "任务失败")));
            setChatSubmitting(false);
          }
        } catch {
          return;
        }
      }
    },
    [chatTaskId]
  );

  useEffect(() => {
    if (!chatTaskId) return;
    chatSeenEventSignaturesRef.current = new Set();
    const unsubscribe = subscribeTask(chatTaskId, (ev) => {
      void applyTaskEventToUi(ev as any);
    });

    void (async () => {
      try {
        const res = await fetchJson<{ data?: Array<{ id: string; task_id: string; event_type: string; payload: any; created_at: string }> }>(
          `/api/tasks/${encodeURIComponent(chatTaskId)}/events?order=asc&limit=200`
        );
        const events = Array.isArray(res?.data) ? res.data : [];
        for (const e of events) {
          const p = (e?.payload || {}) as any;
          await applyTaskEventToUi({
            task_id: chatTaskId,
            event_type: String(e?.event_type || ""),
            status: typeof p?.status === "string" ? p.status : undefined,
            progress: typeof p?.progress === "number" ? p.progress : undefined,
            payload: p,
          });
        }
      } catch {
        return;
      }
    })();

    return () => {
      unsubscribe();
    };
  }, [applyTaskEventToUi, chatTaskId, subscribeTask]);

  const loadEpisodesForScript = async (scriptId: string) => {
    if (!scriptId) {
      setEpisodes([]);
      setSelectedEpisodeIds([]);
      return;
    }
    const res = await getScriptHierarchy(scriptId);
    const eps = (res.data?.episodes || []).map((e) => ({
      id: e.id,
      episode_number: e.episode_number,
      title: e.title || "",
      script_full_text: e.script_full_text || "",
    }));
    eps.sort((a, b) => a.episode_number - b.episode_number);
    setEpisodes(eps);
    setSelectedEpisodeIds([]);
  };

  const insertSelectedEpisodeText = () => {
    const selected = new Set(selectedEpisodeIds);
    const eps = episodes
      .filter((e) => selected.has(e.id))
      .slice()
      .sort((a, b) => a.episode_number - b.episode_number);
    if (eps.length === 0) return;
    const blocks = eps
      .map((ep) => {
        const text = (ep?.script_full_text || "").trim();
        if (!text) return "";
        const header = `【剧本剧集：EP${String(ep?.episode_number || 0).padStart(3, "0")} ${ep?.title || ""}】`.trim();
        return `${header}\n${text}\n`;
      })
      .filter(Boolean)
      .join("\n");
    if (!blocks.trim()) return;
    setScriptText((prev) => {
      const base = (prev || "").trim();
      if (!base) return blocks.trim() + "\n";
      return `${base}\n\n${blocks.trim()}\n`;
    });
  };

  const ensureBuiltinVersionsLoaded = async (agentCode: string) => {
    if (builtinVersionsByCode[agentCode]) return;
    const res = await builtinAgentAdminListVersions(agentCode);
    setBuiltinVersionsByCode((prev) => ({ ...prev, [agentCode]: res.data || [] }));
  };

  const openPromptEditor = async (agentCode: string, version: number | null) => {
    if (!agentCode) return;
    setPromptEditorError(null);
    setPromptEditorAgentCode(agentCode);
    await ensureBuiltinVersionsLoaded(agentCode);
    const res = await builtinAgentAdminListVersions(agentCode);
    const list = res.data || [];
    setBuiltinVersionsByCode((prev) => ({ ...prev, [agentCode]: list }));

    if (version) {
      const pv = list.find((x) => x.version === version) || null;
      setPromptEditorEditingVersion({ version });
      setPromptEditorInitialSystemPrompt(pv?.system_prompt || "");
      setPromptEditorInitialModelConfigId(pv?.ai_model_config_id || null);
      setPromptEditorInitialDescription(pv?.description || "");
      setPromptEditorInitialMetaText(prettyJson(pv?.meta || {}));
    } else {
      setPromptEditorEditingVersion(null);
      setPromptEditorInitialSystemPrompt("");
      setPromptEditorInitialModelConfigId(null);
      setPromptEditorInitialDescription("");
      setPromptEditorInitialMetaText("{}");
    }

    setPromptEditorOpen(true);
  };

  const submitPromptEditor = async (payload: { system_prompt: string; ai_model_config_id: string | null; description: string; metaText: string }) => {
    setPromptEditorSubmitting(true);
    setPromptEditorError(null);
    const metaParsed = safeParseJson(payload.metaText || "{}");
    if (!metaParsed.ok) {
      setPromptEditorError(metaParsed.error);
      setPromptEditorSubmitting(false);
      return;
    }
    try {
      if (promptEditorEditingVersion) {
        await builtinAgentAdminUpdateVersion(promptEditorAgentCode, promptEditorEditingVersion.version, {
          system_prompt: payload.system_prompt,
          ai_model_config_id: payload.ai_model_config_id,
          description: payload.description,
          meta: metaParsed.value,
        });
      } else {
        await builtinAgentAdminCreateVersion(promptEditorAgentCode, {
          system_prompt: payload.system_prompt,
          ai_model_config_id: payload.ai_model_config_id,
          description: payload.description,
          meta: metaParsed.value,
        });
      }
      setPromptEditorOpen(false);
      await refresh();
    } catch (e: unknown) {
      setPromptEditorError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setPromptEditorSubmitting(false);
    }
  };

  const toggleSubAgent = (code: string) => {
    setSubAgentCodes((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
    setSubAgentVersions((prev) => {
      if (prev[code]) return prev;
      const a = agents.find((x) => x.agent_code === code) || null;
      return { ...prev, [code]: pickDefaultVersion(a) };
    });
  };

  const toggleTool = (id: string) => {
    setToolIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const sendChat = async (text: string) => {
    if (!sceneReady || !mainAgentCode) return;
    setChatSubmitting(true);
    setChatError(null);
    setChatPlans([]);
    setChatTraceEvents([]);
    setChatArchive(null);
    setChatTaskId(null);
    setChatTaskStatus(null);
    setChatTaskProgress(0);
    const sendMessages: AISceneTestChatMessage[] = [...chatMessages, { role: "user", content: text }];
    try {
      setChatMessages([...sendMessages, { role: "assistant", content: "任务提交中..." }]);
      const resp = await fetchJson<{ data?: { id?: string } }>("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "ai_scene_test_chat",
          input_json: {
            scene_code: sceneDraft.scene_code.trim(),
            main_agent: { agent_code: mainAgentCode, version: mainAgentVersion },
            sub_agents: subAgentCodes.map((c) => ({ agent_code: c, version: subAgentVersions[c] || 1 })),
            tool_ids: toolIds,
            script_text: scriptText,
            messages: sendMessages,
            project_id: selectedScriptId || null,
            context_exclude_types: contextExcludeTypes,
          },
        }),
      });
      const id = resp?.data?.id ? String(resp.data.id) : "";
      if (!id) throw new Error("task id missing");
      setChatTaskId(id);
      setChatTaskStatus("queued");
      setChatTaskProgress(0);
      persistChatTaskInUrl(id);
      setChatMessages((prev) => {
        const arr = [...prev];
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i]?.role === "assistant") {
            arr[i] = { ...arr[i], content: `已提交后台任务：${id}\n你可以关闭对话框或离开页面，到任务清单查看进度；稍后可回到此页继续查看输出。` };
            return arr;
          }
        }
        return [...arr, { role: "assistant", content: `已提交后台任务：${id}` }];
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "请求失败";
      setChatError(msg);
    } finally {
      setChatSubmitting(false);
    }
  };

  const chatRunning = chatTaskStatus === "queued" || chatTaskStatus === "running";

  const cancelChatTask = async () => {
    if (!chatTaskId) return;
    setChatSubmitting(true);
    setChatError(null);
    try {
      await fetchJson(`/api/tasks/${encodeURIComponent(chatTaskId)}/cancel`, { method: "POST" });
      setChatTaskStatus("canceled");
    } catch (e: unknown) {
      setChatError(e instanceof Error ? e.message : "取消失败");
    } finally {
      setChatSubmitting(false);
    }
  };

  const retryChatTask = async () => {
    if (!chatTaskId) return;
    setChatSubmitting(true);
    setChatError(null);
    setChatPlans([]);
    setChatTraceEvents([]);
    try {
      await fetchJson(`/api/tasks/${encodeURIComponent(chatTaskId)}/retry`, { method: "POST" });
      setChatTaskStatus("queued");
      setChatTaskProgress(0);
    } catch (e: unknown) {
      setChatError(e instanceof Error ? e.message : "重试失败");
    } finally {
      setChatSubmitting(false);
    }
  };

  const sceneReady = sceneMode === "edit" ? !!sceneDraft.scene_code : !!sceneDraft.scene_code.trim();

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">AI 场景测试</h1>
            <p className="text-sm text-textMuted">配置主/子 Agent 与工具，打开对话，实时查看追踪与预览落库结果。</p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="px-2.5 py-1 rounded-full border border-border bg-surface text-[12px] text-textMuted">① 配置</div>
              <div className="px-2.5 py-1 rounded-full border border-border bg-surface text-[12px] text-textMuted">② 对话</div>
              <div className="px-2.5 py-1 rounded-full border border-border bg-surface text-[12px] text-textMuted">③ 追踪 / 结果</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-background text-sm font-bold hover:opacity-90 disabled:opacity-60"
              disabled={!sceneReady || !mainAgentCode}
            >
              <MessageSquare size={16} />
              打开对话测试
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border text-sm hover:bg-surfaceHighlight disabled:opacity-60"
              disabled={loading}
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </div>

        {chatTaskId && !chatOpen && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-border bg-surface flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-textMain min-w-0">
              <span className="font-bold">最近对话任务</span>{" "}
              <span className="text-textMuted tabular-nums break-all">{chatTaskId}</span>
              <span className="text-textMuted">
                {" "}
                · {chatTaskStatus || "-"} · {chatTaskProgress}%
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="px-3 py-2 rounded-lg bg-primary text-background text-sm font-bold hover:opacity-90"
              >
                继续查看
              </button>
              <button
                type="button"
                onClick={() => router.push("/tasks")}
                className="px-3 py-2 rounded-lg border border-border bg-surfaceHighlight text-sm hover:bg-surface"
              >
                任务清单
              </button>
              <button
                type="button"
                onClick={clearChatTask}
                className="px-3 py-2 rounded-lg border border-border bg-surfaceHighlight text-sm text-textMuted hover:text-textMain hover:bg-surface"
              >
                清除
              </button>
            </div>
          </div>
        )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <div className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-sm font-bold flex items-center gap-2">
                <Settings2 size={16} />
                场景配置
              </div>
              <div className="text-[11px] text-textMuted mt-1">先选 Agent/工具，再打开对话；右侧面板查看追踪与预览结果。</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <div className="text-sm font-bold">① 选择场景</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSceneMode("edit");
                        setSceneError(null);
                        if (adminScenes.length > 0) loadSceneIntoDraft(adminScenes[0]);
                      }}
                      className={`px-3 py-2 rounded-md border text-sm hover:bg-surface ${
                        sceneMode === "edit" ? "bg-surfaceHighlight border-primary/40" : "bg-background border-border"
                      }`}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSceneMode("create");
                        setSceneError(null);
                        const draft = emptySceneDraft();
                        draft.scene_code = generateSceneCode({ name: draft.name, existing: existingSceneCodes });
                        setSceneDraft(draft);
                        setMainAgentCode("script_expert");
                        setMainAgentVersion(1);
                        setSubAgentCodes([]);
                        setSubAgentVersions({});
                        setToolIds([]);
                      }}
                      className={`px-3 py-2 rounded-md border text-sm hover:bg-surface ${
                        sceneMode === "create" ? "bg-surfaceHighlight border-primary/40" : "bg-background border-border"
                      }`}
                    >
                      新建
                    </button>
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {sceneMode === "edit" ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={sceneFilter}
                          onChange={(e) => setSceneFilter(e.target.value)}
                          placeholder="搜索场景…"
                          className="w-56 px-3 py-2 rounded-md bg-background border border-border text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => void refreshAdminScenesOnly()}
                          className="px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface"
                        >
                          刷新列表
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-textMuted">所有场景默认主 Agent：剧本专家（script_expert）</div>
                    )}
                    <div className="text-[11px] text-textMuted">先确定场景，再配置 Agent / 工具</div>
                  </div>

                  {sceneError && (
                    <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{sceneError}</div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <div className="text-xs text-textMuted">scene_code</div>
                      {sceneMode === "edit" ? (
                        <select
                          className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                          value={sceneDraft.scene_code}
                          onChange={(e) => {
                            const code = e.target.value;
                            const row = adminScenes.find((x) => x.scene_code === code);
                            if (row) loadSceneIntoDraft(row);
                          }}
                        >
                          {filteredAdminScenes.map((s) => (
                            <option key={s.scene_code} value={s.scene_code}>
                              {s.scene_code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            value={sceneDraft.scene_code}
                            onChange={(e) => setSceneDraft((p) => ({ ...p, scene_code: e.target.value }))}
                            placeholder="例如：storyboard_gen_v2"
                            className="flex-1 min-w-0 px-3 py-2 rounded-md bg-background border border-border text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setSceneDraft((p) => ({ ...p, scene_code: generateSceneCode({ name: p.name, existing: existingSceneCodes }) }))}
                            className="px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface"
                          >
                            自动生成
                          </button>
                        </div>
                      )}
                    </label>

                    <label className="space-y-1">
                      <div className="text-xs text-textMuted">名称</div>
                      <input
                        value={sceneDraft.name}
                        onChange={(e) => setSceneDraft((p) => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="text-xs text-textMuted">描述</div>
                      <input
                        value={sceneDraft.description}
                        onChange={(e) => setSceneDraft((p) => ({ ...p, description: e.target.value }))}
                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                      />
                    </label>
                  </div>

                  <div className="px-3 py-2 rounded-xl border border-border bg-surfaceHighlight/30 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-textMain">
                      <span className="font-bold">主 Agent</span>{" "}
                      <span className="text-textMuted">{mainAgentCode || "script_expert"}</span>
                    </div>
                    <div className="text-sm text-textMain">
                      <span className="font-bold">工具</span>{" "}
                      <span className="text-textMuted">{toolIds.length} 个</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {sceneMode === "edit" && (
                      <button
                        type="button"
                        onClick={() => void deleteScene()}
                        disabled={!sceneDraft.scene_code || sceneSubmitting}
                        className="px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm text-red-400 hover:bg-surface disabled:opacity-60"
                      >
                        删除
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void submitScene()}
                      disabled={sceneSubmitting}
                      className="px-4 py-2 rounded-md bg-primary text-background text-sm font-bold hover:opacity-90 disabled:opacity-60"
                    >
                      {sceneMode === "create" ? "创建" : "保存"}
                    </button>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl border border-border bg-background overflow-hidden ${sceneReady ? "" : "opacity-60"}`}>
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <div className="text-sm font-bold">② 配置 Agent</div>
                  <div className="text-[11px] text-textMuted">{sceneReady ? `scene: ${sceneDraft.scene_code}` : "请先选择/填写场景"}</div>
                </div>
                <div className="p-3 space-y-3">
                  {!sceneReady && <div className="text-sm text-textMuted">先确定要编辑的场景（scene_code）后，才能编辑主/子 Agent。</div>}
                  {sceneReady && (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <div className="text-xs text-textMuted">主 Agent</div>
                      <select
                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                        value={mainAgentCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          setMainAgentCode(code);
                          const a = agents.find((x) => x.agent_code === code) || null;
                          setMainAgentVersion(pickDefaultVersion(a));
                        }}
                        disabled={!sceneReady}
                      >
                        {agents.map((a) => (
                          <option key={a.agent_code} value={a.agent_code}>
                            {(a.name || a.agent_code) + " · " + a.agent_code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <div className="text-xs text-textMuted">主 Agent 提示词版本</div>
                      <select
                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                        value={String(mainAgentVersion)}
                        onChange={(e) => setMainAgentVersion(parseInt(e.target.value, 10))}
                        disabled={!sceneReady || !mainAgentCode}
                      >
                        {mainAgentVersions.map((v) => (
                          <option key={v} value={String(v)}>
                            {formatVersionLabel(mainAgent, v)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void openPromptEditor(mainAgentCode, mainAgentVersion)}
                      disabled={!sceneReady || !mainAgentCode}
                      className="px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface disabled:opacity-60"
                    >
                      编辑主 Agent 版本
                    </button>
                    <button
                      type="button"
                      onClick={() => void openPromptEditor(mainAgentCode, null)}
                      disabled={!sceneReady || !mainAgentCode}
                      className="px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface disabled:opacity-60"
                    >
                      新增主 Agent 版本
                    </button>
                  </div>

                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold">子 Agent</div>
                      <input
                        value={subAgentFilter}
                        onChange={(e) => setSubAgentFilter(e.target.value)}
                        placeholder="搜索子 Agent…"
                        className="w-44 px-3 py-2 rounded-md bg-background border border-border text-sm"
                        disabled={!sceneReady}
                      />
                    </div>
                    <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                      {agents
                        .filter((a) => a.agent_code !== mainAgentCode)
                        .filter((a) => {
                          const q = subAgentFilter.trim().toLowerCase();
                          if (!q) return true;
                          return `${a.name} ${a.agent_code}`.toLowerCase().includes(q);
                        })
                        .map((a) => {
                          const checked = subAgentCodes.includes(a.agent_code);
                          const vv = subAgentVersions[a.agent_code] || pickDefaultVersion(a);
                          const versions = (a.versions || []).map((x) => x.version).sort((x, y) => y - x);
                          return (
                            <div key={a.agent_code} className={`rounded-lg border ${checked ? "border-primary/40 bg-surfaceHighlight/30" : "border-border bg-background"}`}>
                              <div className="p-3 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_120px_72px_72px] gap-2 items-center">
                                <label className="flex items-center gap-2 min-w-0">
                                  <input type="checkbox" checked={checked} onChange={() => toggleSubAgent(a.agent_code)} disabled={!sceneReady} />
                                  <div className="min-w-0">
                                    <div className="text-sm font-bold truncate">{a.name || a.agent_code}</div>
                                    <div className="text-[11px] text-textMuted truncate">{a.agent_code}</div>
                                  </div>
                                </label>
                                <select
                                  className="w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                                  value={String(vv)}
                                  onChange={(e) => setSubAgentVersions((prev) => ({ ...prev, [a.agent_code]: parseInt(e.target.value, 10) }))}
                                  disabled={!sceneReady || !checked}
                                >
                                  {versions.map((v) => (
                                    <option key={v} value={String(v)}>
                                      {formatVersionLabel(a, v)}
                                    </option>
                                  ))}
                                </select>
                                <button type="button" onClick={() => void openPromptEditor(a.agent_code, vv)} disabled={!sceneReady} className="px-2 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface disabled:opacity-60">
                                  编辑
                                </button>
                                <button type="button" onClick={() => void openPromptEditor(a.agent_code, null)} disabled={!sceneReady} className="px-2 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface disabled:opacity-60">
                                  新增
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        <div className="w-full lg:w-[360px] shrink-0 space-y-4 lg:sticky lg:top-6 self-start">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {sideTab === "tools" ? <Wrench size={16} /> : <MessageSquare size={16} />}
                <div className="text-sm font-bold truncate">配置与运行</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="p-1 rounded-xl border border-border bg-background flex items-center gap-1">
                  <TabButton active={sideTab === "tools"} label="工具" onClick={() => setSideTab("tools")} />
                  <TabButton active={sideTab === "run"} label="运行" onClick={() => setSideTab("run")} />
                </div>
              </div>
            </div>

            {sideTab === "tools" && (
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    value={toolFilter}
                    onChange={(e) => setToolFilter(e.target.value)}
                    placeholder="搜索工具…"
                    className="w-full md:w-56 px-3 py-2 rounded-md bg-background border border-border text-sm"
                    disabled={!sceneReady}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setToolIds(tools.map((t) => t.tool_id))}
                      className="px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface disabled:opacity-60"
                      disabled={!sceneReady || tools.length === 0}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolIds([])}
                      className="px-3 py-2 rounded-md bg-surfaceHighlight border border-border text-sm hover:bg-surface disabled:opacity-60"
                      disabled={!sceneReady || toolIds.length === 0}
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-textMuted">已选 {toolIds.length} / {tools.length || 0}</div>

                <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                  {tools
                    .filter((t) => {
                      const q = toolFilter.trim().toLowerCase();
                      if (!q) return true;
                      return `${t.label} ${t.tool_id}`.toLowerCase().includes(q);
                    })
                    .map((t) => (
                      <label key={t.tool_id} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background">
                        <input type="checkbox" checked={toolIds.includes(t.tool_id)} onChange={() => toggleTool(t.tool_id)} disabled={!sceneReady} />
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">{t.label}</div>
                          <div className="text-[11px] text-textMuted truncate">{t.tool_id}</div>
                        </div>
                      </label>
                    ))}
                  {tools.length === 0 && <div className="text-sm text-textMuted">暂无工具</div>}
                </div>
              </div>
            )}

            {sideTab === "run" && (
              <div className="p-4 space-y-3">
                <div className="text-sm text-textMuted">
                  当前选择：主 Agent {mainAgentCode ? `${mainAgentCode} ${formatVersionLabel(mainAgent, mainAgentVersion)}` : "-"}；子 Agent {subAgentCodes.length} 个；工具 {toolIds.length} 个。
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-bold">最近预览结果</div>
                  {chatPlans.length === 0 ? (
                    <div className="text-sm text-textMuted">暂无预览结果。</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {chatPlans.map((p) => (
                        <div key={p.id} className="px-3 py-2 rounded-md bg-surfaceHighlight/40 border border-border">
                          <div className="text-sm font-bold">{planSummary(p)}</div>
                          <div className="text-[11px] text-textMuted">kind: {p.kind}</div>
                        </div>
                      ))}
                      <details className="md:col-span-2">
                        <summary className="text-sm cursor-pointer text-textMain">查看完整 JSON</summary>
                        <pre className="mt-2 w-full max-h-[360px] overflow-auto px-3 py-2 rounded-md bg-background border border-border text-xs">
                          {prettyJson(chatPlans)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ChatDialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onReset={clearChatTask}
        sceneCode={sceneDraft.scene_code}
        sceneName={sceneDraft.name}
        scriptText={scriptText}
        setScriptText={setScriptText}
        scripts={scripts}
        episodes={episodes}
        selectedScriptId={selectedScriptId}
        selectedEpisodeIds={selectedEpisodeIds}
        onSelectScript={(id) => {
          setSelectedScriptId(id);
          setSelectedEpisodeIds([]);
          void loadEpisodesForScript(id);
        }}
        onSelectEpisodes={(ids) => setSelectedEpisodeIds(ids)}
        onInsertEpisodeText={insertSelectedEpisodeText}
        contextPreview={contextPreview}
        contextPreviewLoading={contextPreviewLoading}
        contextPreviewError={contextPreviewError}
        contextExcludeTypes={contextExcludeTypes}
        setContextExcludeTypes={setContextExcludeTypes}
        messages={chatMessages}
        onSend={sendChat}
        sending={chatSubmitting || chatRunning}
        error={chatError}
        plans={chatPlans}
        traceEvents={chatTraceEvents}
        archive={chatArchive}
        taskId={chatTaskId}
        taskStatus={chatTaskStatus}
        taskProgress={chatTaskProgress}
        onCancelTask={cancelChatTask}
        onRetryTask={retryChatTask}
      />

      <BuiltinPromptVersionDialog
        open={promptEditorOpen}
        agentCode={promptEditorAgentCode}
        editingVersion={promptEditorEditingVersion}
        initialSystemPrompt={promptEditorInitialSystemPrompt}
        initialModelConfigId={promptEditorInitialModelConfigId}
        initialDescription={promptEditorInitialDescription}
        initialMetaText={promptEditorInitialMetaText}
        modelConfigs={modelConfigs.map((c) => ({ id: c.id, category: c.category, manufacturer: c.manufacturer, model: c.model }))}
        submitting={promptEditorSubmitting}
        error={promptEditorError}
        onClose={() => setPromptEditorOpen(false)}
        onSubmit={submitPromptEditor}
      />
      </div>
    </div>
  );
}
