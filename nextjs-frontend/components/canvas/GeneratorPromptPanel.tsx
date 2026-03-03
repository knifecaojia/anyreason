'use client';

/**
 * GeneratorPromptPanel — floating prompt editor for GeneratorNode.
 * M1.3: Migrated from LlmPromptPanel, expanded to full editing UI.
 *
 * Shown when a GeneratorNode is selected and zoom ≥ 0.6.
 * Positioned in screen-space below the selected node.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { GeneratorNodeData } from '@/lib/canvas/types';
import { Wand2, X, Upload, ChevronDown } from 'lucide-react';

// ===== Constants =====

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;

const VIDEO_DURATIONS = [
  { label: '2秒', value: 2 },
  { label: '4秒', value: 4 },
  { label: '6秒', value: 6 },
] as const;

// ===== Types =====

interface ReferenceSource {
  id: string;
  label: string;
  thumbnail?: string;
  type: 'asset' | 'storyboard' | 'generator' | 'text';
}

export interface GeneratorPromptPanelProps {
  nodeId: string;
  nodeData: GeneratorNodeData;
  /** Current viewport for position calculation */
  viewport: { x: number; y: number; zoom: number };
  /** All nodes (for collecting reference sources from connections) */
  nodes: Node[];
  /** All edges (for finding incoming connections) */
  edges: Edge[];
  /** Update node data callback */
  onUpdateNodeData: (nodeId: string, data: Partial<GeneratorNodeData>) => void;
  /** Trigger generation */
  onGenerate: (nodeId: string) => void;
  /** Close the panel */
  onClose: () => void;
}

// ===== Reference Source Collection =====

function collectReferenceSources(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): ReferenceSource[] {
  const sources: ReferenceSource[] = [];
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  for (const edge of incomingEdges) {
    const srcNode = nodes.find((n) => n.id === edge.source);
    if (!srcNode) continue;
    const srcData = srcNode.data as Record<string, unknown> | undefined;
    if (!srcData) continue;

    const kind = srcData.kind as string | undefined;

    if (kind === 'asset') {
      sources.push({
        id: srcNode.id,
        label: (srcData.name as string) || '资产',
        thumbnail: srcData.thumbnail as string | undefined,
        type: 'asset',
      });
    } else if (kind === 'storyboard') {
      sources.push({
        id: srcNode.id,
        label: `镜头 ${srcData.shotNumber ?? '?'}`,
        thumbnail: srcData.referenceImageUrl as string | undefined,
        type: 'storyboard',
      });
    } else if (kind === 'generator') {
      sources.push({
        id: srcNode.id,
        label: '生成结果',
        thumbnail: srcData.lastImage as string | undefined,
        type: 'generator',
      });
    } else if (kind === 'text-gen' || kind === 'script' || kind === 'text-note') {
      sources.push({
        id: srcNode.id,
        label: (srcData.label as string) || (srcData.title as string) || '文本',
        type: 'text',
      });
    }
  }

  return sources;
}

// ===== Component =====

export default function GeneratorPromptPanel({
  nodeId,
  nodeData,
  viewport,
  nodes,
  edges,
  onUpdateNodeData,
  onGenerate,
  onClose,
}: GeneratorPromptPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // --- Position tracking ---
  const updatePosition = useCallback(() => {
    const el =
      (document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null) ||
      (document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement | null);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelWidth = 380;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    setPos({ top: rect.bottom + 8, left });
  }, [nodeId]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(id);
  }, [updatePosition, viewport.x, viewport.y, viewport.zoom]);

  useEffect(() => {
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updatePosition]);

  // --- Reference sources ---
  const referenceSources = collectReferenceSources(nodeId, nodes, edges);

  // --- Local editing state ---
  const mode = nodeData.generationMode ?? 'image';
  const promptSource = nodeData.promptSource ?? null;

  const handlePromptChange = useCallback(
    (prompt: string) => {
      onUpdateNodeData(nodeId, { prompt, promptSource: 'manual' });
    },
    [nodeId, onUpdateNodeData],
  );

  const handleNegPromptChange = useCallback(
    (negPrompt: string) => {
      onUpdateNodeData(nodeId, { negPrompt });
    },
    [nodeId, onUpdateNodeData],
  );

  const handleModeChange = useCallback(
    (generationMode: 'image' | 'video') => {
      onUpdateNodeData(nodeId, { generationMode });
    },
    [nodeId, onUpdateNodeData],
  );

  const handleAspectChange = useCallback(
    (aspectRatio: string) => {
      onUpdateNodeData(nodeId, { aspectRatio });
    },
    [nodeId, onUpdateNodeData],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      onUpdateNodeData(nodeId, { model });
    },
    [nodeId, onUpdateNodeData],
  );

  const handleGenerate = useCallback(() => {
    onGenerate(nodeId);
  }, [nodeId, onGenerate]);

  if (!pos) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[60] w-[380px] rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center">
            <Wand2 size={13} className="text-purple-400" />
          </div>
          <span className="text-xs font-semibold text-textMain">提示词编辑</span>
          {promptSource === 'upstream' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/20 text-blue-400 font-medium">
              自动填入
            </span>
          )}
          {promptSource === 'manual' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-orange-500/20 text-orange-400 font-medium">
              手动编辑
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-md hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {/* Reference sources */}
        {referenceSources.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-textMuted font-medium">参考来源（连线收集）</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {referenceSources.map((src) => (
                <div
                  key={src.id}
                  className="shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-lg border border-border bg-surface/50"
                >
                  {src.thumbnail ? (
                    <img
                      src={src.thumbnail}
                      alt={src.label}
                      className="w-12 h-12 rounded object-cover border border-border/50"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-surfaceHighlight border border-border/50 flex items-center justify-center text-textMuted text-[9px]">
                      {src.type === 'text' ? '文' : src.type === 'asset' ? '资' : '参'}
                    </div>
                  )}
                  <span className="text-[9px] text-textMuted truncate max-w-[56px]">
                    {src.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generation mode toggle */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-textMuted font-medium">生成模式</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`flex-1 h-7 rounded-lg text-[11px] font-medium transition-colors ${
                mode === 'image'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-textMuted hover:text-textMain border border-transparent hover:border-border'
              }`}
              onClick={() => handleModeChange('image')}
            >
              图像
            </button>
            <button
              type="button"
              className={`flex-1 h-7 rounded-lg text-[11px] font-medium transition-colors ${
                mode === 'video'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'text-textMuted hover:text-textMain border border-transparent hover:border-border'
              }`}
              onClick={() => handleModeChange('video')}
            >
              视频
            </button>
          </div>
        </div>

        {/* Positive prompt */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-textMuted font-medium">提示词</div>
          <textarea
            value={nodeData.prompt || ''}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="描述你想生成的画面..."
            className="w-full h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {/* Negative prompt */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-textMuted font-medium">负面提示词</div>
          <textarea
            value={nodeData.negPrompt || ''}
            onChange={(e) => handleNegPromptChange(e.target.value)}
            placeholder="不想出现的元素..."
            className="w-full h-14 rounded-xl border border-border bg-background px-3 py-2 text-xs text-textMain placeholder:text-textMuted/50 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {/* Model + Aspect Ratio row */}
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1.5">
            <div className="text-[11px] text-textMuted font-medium">模型</div>
            <div className="relative">
              <select
                value={nodeData.model || ''}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 pr-7 text-xs text-textMain outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
              >
                <option value="">选择模型</option>
                <option value="kling-v1">Kling v1</option>
                <option value="kling-v2">Kling v2</option>
                <option value="jimeng">即梦</option>
                <option value="sd-xl">SDXL</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
            </div>
          </div>

          <div className="w-24 space-y-1.5">
            <div className="text-[11px] text-textMuted font-medium">画幅</div>
            <div className="relative">
              <select
                value={nodeData.aspectRatio || '1:1'}
                onChange={(e) => handleAspectChange(e.target.value)}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 pr-7 text-xs text-textMain outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Video duration (video mode only) */}
        {mode === 'video' && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-textMuted font-medium">视频时长</div>
            <div className="flex items-center gap-1">
              {VIDEO_DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className="flex-1 h-7 rounded-lg text-[11px] font-medium border border-border text-textMuted hover:text-textMain hover:border-primary/30 transition-colors"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={nodeData.isProcessing}
          className="w-full h-9 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all shadow-lg shadow-purple-500/20"
        >
          {nodeData.isProcessing ? '生成中...' : mode === 'video' ? '生成视频' : '生成图像'}
        </button>
      </div>
    </div>
  );
}
