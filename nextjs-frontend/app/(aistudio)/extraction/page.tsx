"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Box,
  Database,
  Image as ImageIcon,
  Loader2,
  Play,
  Sparkles,
  SplitSquareHorizontal,
  User,
} from "lucide-react";

import { useTasks } from "@/components/tasks/TaskProvider";
import { TASK_TYPES } from "@/lib/tasks/constants";
import type { Task, TaskStatus } from "@/lib/tasks/types";

type VariantResult = {
  final_prompt: string;
  raw_text: string;
  world_unity: Record<string, unknown> | null;
  assets: Array<Record<string, unknown>>;
};

type CompareResult = {
  variant_a: VariantResult;
  variant_b: VariantResult;
};

const DEFAULT_PROMPT = `Analyze the script provided and extract a list of assets required for production.
Return strictly a JSON array with objects containing:
- name: string
- type: 'CHARACTER' | 'SCENE' | 'PROP' | 'EFFECT'
- description: string (visual details)
- tags: string[]
Do not include markdown formatting.`;

export default function Page() {
  const [scriptContent, setScriptContent] = useState("");
  const { tasks } = useTasks();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("aistudio.scriptContent");
      if (saved) setScriptContent(saved);
    } catch {
      return;
    }
  }, []);

  const [configA, setConfigA] = useState({
    model: "gemini-3-flash-preview",
    prompt: DEFAULT_PROMPT,
  });
  const [configB, setConfigB] = useState({
    model: "gemini-2.5-flash-latest",
    prompt: DEFAULT_PROMPT,
  });

  const isProcessing = useMemo(() => {
    return isSubmitting || taskStatus === "queued" || taskStatus === "running";
  }, [isSubmitting, taskStatus]);

  useEffect(() => {
    if (!taskId) return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    setTaskStatus(t.status);
    setTaskProgress(Number(t.progress || 0));
    setTaskError(t.error || null);
    if (t.status !== "succeeded") return;
    void (async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as { data?: Task };
        const r = (json.data?.result_json || null) as CompareResult | null;
        if (r && r.variant_a && r.variant_b) setResult(r);
      } catch (e) {
        setTaskError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [taskId, tasks]);

  const runExtraction = async () => {
    if (!scriptContent.trim()) return;
    try {
      setIsSubmitting(true);
      setTaskError(null);
      setResult(null);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          type: TASK_TYPES.freeformAssetExtractionComparePreview,
          input_json: {
            script_text: scriptContent,
            config_a: { model: configA.model, prompt_template: configA.prompt },
            config_b: { model: configB.model, prompt_template: configB.prompt },
            temperature: null,
            max_tokens: null,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: { id?: string } };
      const id = json.data?.id || null;
      if (!id) throw new Error("task id missing");
      setTaskId(id);
      setTaskStatus("queued");
      setTaskProgress(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const AssetCard = ({ asset }: { asset: Record<string, unknown> }) => {
    const name = typeof asset.name === "string" ? asset.name : "未命名";
    const type = typeof asset.type === "string" ? asset.type : "";
    const concept = typeof asset.concept === "string" ? asset.concept : "";
    const tags = Array.isArray(asset.tags) ? asset.tags.filter((t) => typeof t === "string") : [];
    const getIcon = () => {
      switch (type?.toLowerCase()) {
        case "character":
          return <User size={14} className="text-blue-400" />;
        case "scene":
          return <ImageIcon size={14} className="text-purple-400" />;
        case "prop":
          return <Box size={14} className="text-orange-400" />;
        case "vfx":
          return <Sparkles size={14} className="text-cyan-400" />;
        default:
          return <Database size={14} className="text-gray-400" />;
      }
    };

    return (
      <div className="bg-surface border border-border/50 rounded-lg p-3 hover:border-primary/30 transition-colors">
        <div className="flex items-center gap-2 mb-2">
          {getIcon()}
          <span className="font-semibold text-sm text-textMain">{name}</span>
          <span className="ml-auto text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-textMuted uppercase">
            {type}
          </span>
        </div>
        <p className="text-xs text-textMuted line-clamp-2 leading-relaxed">{concept}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map((t: string, i: number) => (
            <span key={`${t}-${i}`} className="text-[10px] text-accent/80 bg-accent/10 px-1 rounded">
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const ResultColumn = ({
    variant,
    label,
    model,
  }: {
    variant: VariantResult | null;
    label: string;
    model: string;
  }) => {
    if (taskError) {
      return (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-3">
          <AlertCircle size={20} />
          <span>Error: {taskError}</span>
        </div>
      );
    }

    if (!variant && isProcessing) {
      return (
        <div className="h-full flex items-center justify-center flex-col gap-3 text-textMuted animate-pulse">
          <Loader2 size={32} className="animate-spin text-primary" />
          <span className="text-sm">任务执行中... {taskProgress}%</span>
        </div>
      );
    }

    if (!variant) {
      return (
        <div className="h-full flex items-center justify-center text-textMuted/30 text-sm">
          等待运行...
        </div>
      );
    }

    const assets = Array.isArray(variant.assets) ? variant.assets : [];

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-textMain">{label}</span>
            <span className="text-xs text-textMuted bg-surface px-2 py-0.5 rounded border border-border">
              {model}
            </span>
          </div>
          <span className="text-xs text-textMuted tabular-nums">{assets.length} assets</span>
        </div>

        <div className="bg-surfaceHighlight/30 rounded-xl p-4 h-[500px] overflow-y-auto border border-border/50 scrollbar-thin space-y-3">
          {assets.length > 0 ? (
            assets.map((asset, idx) => <AssetCard key={idx} asset={asset} />)
          ) : (
            <div className="text-center text-textMuted text-sm py-10">未提取到有效资产</div>
          )}
        </div>

        <div className="flex justify-between items-center px-2">
          <span className="text-xs text-textMuted">共 {assets.length} 个资产</span>
          <button className="text-xs text-primary hover:text-blue-400 font-medium" type="button">
            存入资产库
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
            <SplitSquareHorizontal size={24} className="text-primary" />
            资产提取实验室
          </h2>
          <p className="text-sm text-textMuted mt-1">
            对比不同模型或提示词的提取效果，精准拆解剧本资产。
          </p>
        </div>
        <button
          onClick={runExtraction}
          disabled={isProcessing || !scriptContent}
          className="bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
        >
          {isProcessing ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
          {isProcessing ? `处理中... ${taskProgress}%` : "开始提取对比"}
        </button>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        <div className="col-span-4 flex flex-col gap-4 overflow-y-auto pr-2">
          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-2 flex-shrink-0">
            <label className="text-xs font-bold text-textMuted uppercase tracking-wider">原始剧本</label>
            <textarea
              value={scriptContent}
              onChange={(e) => {
                setScriptContent(e.target.value);
                try {
                  sessionStorage.setItem("aistudio.scriptContent", e.target.value);
                } catch {
                  return;
                }
              }}
              className="w-full h-48 bg-surfaceHighlight/50 border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:ring-1 focus:ring-primary/50 resize-none placeholder-textMuted/50"
              placeholder="粘贴剧本内容到此处..."
            />
          </div>

          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                  A
                </div>
                <span className="font-medium text-sm text-textMain">实验组 A</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted">模型</label>
              <select
                value={configA.model}
                onChange={(e) => setConfigA({ ...configA, model: e.target.value })}
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-xs text-textMain outline-none"
              >
                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                <option value="gemini-2.5-flash-latest">Gemini 2.5 Flash</option>
              </select>
              <label className="text-[10px] text-textMuted">提示词 (System Prompt)</label>
              <textarea
                value={configA.prompt}
                onChange={(e) => setConfigA({ ...configA, prompt: e.target.value })}
                className="w-full h-24 bg-surfaceHighlight/50 border border-border rounded-lg p-2 text-xs text-textMuted font-mono outline-none resize-none"
              />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                  B
                </div>
                <span className="font-medium text-sm text-textMain">实验组 B</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted">模型</label>
              <select
                value={configB.model}
                onChange={(e) => setConfigB({ ...configB, model: e.target.value })}
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-xs text-textMain outline-none"
              >
                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                <option value="gemini-2.5-flash-latest">Gemini 2.5 Flash</option>
              </select>
              <label className="text-[10px] text-textMuted">提示词 (System Prompt)</label>
              <textarea
                value={configB.prompt}
                onChange={(e) => setConfigB({ ...configB, prompt: e.target.value })}
                className="w-full h-24 bg-surfaceHighlight/50 border border-border rounded-lg p-2 text-xs text-textMuted font-mono outline-none resize-none"
              />
            </div>
          </div>
        </div>

        <div className="col-span-8 bg-background border border-border rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
          <div className="relative z-10 grid grid-cols-2 gap-8 h-full">
            <ResultColumn variant={result?.variant_a || null} label="结果 A" model={configA.model} />
            <div className="absolute left-1/2 top-10 bottom-10 w-px bg-border/50 hidden md:block" />
            <ResultColumn variant={result?.variant_b || null} label="结果 B" model={configB.model} />
          </div>
        </div>
      </div>
    </div>
  );
}
