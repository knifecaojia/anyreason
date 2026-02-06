"use client";

import { useState } from "react";
import { ArrowLeft, Save, Play, Settings2, Layers, Loader2 } from "lucide-react";
import { GoogleGenAI } from "@google/genai";

import { InfiniteCanvas } from "@/components/aistudio/InfiniteCanvas";
import { INITIAL_EDGES, INITIAL_NODES } from "@/lib/aistudio/constants";

export default function Page() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [edges] = useState(INITIAL_EDGES);
  const [isRunning, setIsRunning] = useState(false);

  const handleNodeMove = (id: string, dx: number, dy: number) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === id) {
          return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
        }
        return n;
      }),
    );
  };

  const runWorkflow = async () => {
    setIsRunning(true);

    const llmNodes = nodes.filter((n) => n.type === "LLM_SCRIPT");
    setNodes((prev) =>
      prev.map((n) =>
        n.type === "LLM_SCRIPT" ? { ...n, data: { ...n.data, status: "running" } } : n,
      ),
    );

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      for (const node of llmNodes) {
        if (!node.data.prompt) continue;

        try {
          const response = await ai.models.generateContent({
            model: node.data.model || "gemini-3-flash-preview",
            contents: node.data.prompt,
          });

          setNodes((current) =>
            current.map((n) => {
              if (n.id === node.id) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    output: response.text,
                    status: "success",
                  },
                };
              }
              return n;
            }),
          );
        } catch {
          setNodes((current) =>
            current.map((n) => {
              if (n.id === node.id) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    output: "Error: Failed to generate content. Please check API Key.",
                    status: "error",
                  },
                };
              }
              return n;
            }),
          );
        }
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] rounded-2xl border border-border bg-background overflow-hidden shadow-2xl">
      <div className="h-14 border-b border-border bg-surfaceHighlight px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-surface rounded-lg text-textMuted hover:text-textMain transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="h-6 w-px bg-border"></div>
          <div>
            <h3 className="font-medium text-sm text-textMain">斩仙台真人AI版 - 第3集</h3>
            <p className="text-xs text-textMuted">自动保存于 10:42 AM</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-textMuted hover:text-textMain hover:bg-surface rounded-lg transition-colors">
            <Layers size={16} />
            图层
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-textMuted hover:text-textMain hover:bg-surface rounded-lg transition-colors">
            <Settings2 size={16} />
            参数
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-textMuted hover:text-textMain hover:bg-surface rounded-lg transition-colors">
            <Save size={16} />
            保存
          </button>
          <div className="h-6 w-px bg-border mx-1"></div>
          <button
            onClick={runWorkflow}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
            <span className="ml-1">{isRunning ? "运行中..." : "运行工作流"}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <InfiniteCanvas nodes={nodes} edges={edges} onNodeMove={handleNodeMove} />

        <div className="absolute top-4 right-4 w-64 bg-surface/90 backdrop-blur border border-border rounded-xl p-4 shadow-xl space-y-4">
          <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-2">
            组件库 / Providers
          </h4>

          <div className="space-y-2">
            <div className="p-3 bg-surfaceHighlight border border-border rounded-lg flex items-center gap-3 cursor-grab hover:border-primary/50 transition-colors">
              <div className="w-8 h-8 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Settings2 size={16} />
              </div>
              <div className="text-sm font-medium text-textMain">Gemini Script</div>
            </div>
            <div className="p-3 bg-surfaceHighlight border border-border rounded-lg flex items-center gap-3 cursor-grab hover:border-primary/50 transition-colors">
              <div className="w-8 h-8 rounded bg-pink-500/20 text-pink-400 flex items-center justify-center">
                <Settings2 size={16} />
              </div>
              <div className="text-sm font-medium text-textMain">Stable Diffusion</div>
            </div>
            <div className="p-3 bg-surfaceHighlight border border-border rounded-lg flex items-center gap-3 cursor-grab hover:border-primary/50 transition-colors">
              <div className="w-8 h-8 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Settings2 size={16} />
              </div>
              <div className="text-sm font-medium text-textMain">Azure TTS</div>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-[10px] text-textMuted text-center">拖拽组件至画布以添加</p>
          </div>
        </div>
      </div>
    </div>
  );
}

