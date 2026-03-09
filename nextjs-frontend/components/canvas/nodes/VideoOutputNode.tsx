'use client';

/**
 * VideoOutputNode — Pure AI video generation node.
 * No local prompt editing — text comes exclusively from upstream text nodes.
 * Reference images come from upstream AssetNodes, ordered by Y position with @N indices.
 * Single `in` handle accepts both text and image connections (auto-detected by source type).
 * If no text node connected → generate button disabled.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow, Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { VideoOutputNodeData } from '@/lib/canvas/types';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import { useAIModelList } from '@/hooks/useAIModelList';
import { ChevronDown, Loader2, Square, Download, ImageIcon } from 'lucide-react';
import { collectUpstreamData, fetchRefImagesAsBase64 } from '@/lib/canvas/image-utils';

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
const DURATIONS = [
  { label: '2秒', value: 2 },
  { label: '4秒', value: 4 },
  { label: '6秒', value: 6 },
] as const;

async function createTaskApi(payload: { type: string; input_json: Record<string, unknown> }) {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: { id: string; status: string } };
  if (!json.data?.id) throw new Error('任务创建失败');
  return json.data;
}

async function fetchTaskApi(taskId: string) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as {
    data?: { status: string; progress?: number; error?: string | null; result_json?: Record<string, unknown> };
  };
  return {
    status: json.data?.status || 'unknown',
    progress: typeof json.data?.progress === 'number' ? json.data.progress : 0,
    error: json.data?.error,
    result_json: json.data?.result_json,
  };
}

// ===== Handle style constants =====
const HANDLE_STYLE: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 9999,
  background: '#374151', border: '3px solid #1f2937',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 700, color: '#9ca3af',
  top: '50%', zIndex: 30,
};

export default function VideoOutputNode(props: NodeProps) {
  const data = props.data as unknown as VideoOutputNodeData;
  const selected = Boolean(props.selected);
  const { expand, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, d: any) => void;
  const getNodes = rf.getNodes as () => any[];
  const getEdges = rf.getEdges as () => any[];
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorCount = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;
  const nodeIdRef = useRef(props.id);
  nodeIdRef.current = props.id;

  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const { models: videoModels, selectedConfigId, selectModel } = useAIModelList('video', data.bindingKey ?? 'video-default', data.modelConfigId);
  const selectedModel = videoModels.find((m) => m.configId === selectedConfigId);
  const caps = selectedModel?.capabilities;
  const supportsRatio = !caps || !!caps.aspect_ratios?.length;
  const modelDisplayName = selectedModel?.displayName ?? data.model ?? '模型';
  const ratio = data.aspectRatio ?? '16:9';
  const duration = data.duration ?? 4;
  const isProcessing = !!data.isProcessing;
  const hasVideo = !!data.lastVideo;

  // Collect upstream data: text from text nodes, images from asset nodes (single `in` handle)
  const upstream = useMemo(
    () => collectUpstreamData(props.id, getNodes(), getEdges()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.id, getNodes, getEdges, data],
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Resume polling if node was processing
  useEffect(() => {
    if (data.taskId && isProcessing && !pollRef.current) {
      startPolling(data.taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = useCallback((taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollErrorCount.current = 0;
    pollRef.current = setInterval(async () => {
      try {
        const t = await fetchTaskApi(taskId);
        pollErrorCount.current = 0;
        const d = dataRef.current;
        if (t.status === 'succeeded') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          const fileNodeId = t.result_json?.file_node_id as string | undefined;
          const url = fileNodeId
            ? `/api/vfs/nodes/${encodeURIComponent(fileNodeId)}/download`
            : (t.result_json?.url as string) || '';
          updateNodeData(nodeIdRef.current, {
            ...d,
            isProcessing: false,
            progress: 100,
            lastVideo: url,
            error: undefined,
            taskId: undefined,
          });
        } else if (t.status === 'failed' || t.status === 'canceled') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          updateNodeData(nodeIdRef.current, {
            ...d,
            isProcessing: false,
            progress: 0,
            error: t.error || '生成失败',
            taskId: undefined,
          });
        } else {
          updateNodeData(nodeIdRef.current, { ...d, progress: t.progress });
        }
      } catch (err) {
        pollErrorCount.current += 1;
        console.error('[VideoOutputNode] poll error:', err);
        if (pollErrorCount.current >= 15) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          updateNodeData(nodeIdRef.current, {
            ...dataRef.current,
            isProcessing: false,
            progress: 0,
            error: `轮询失败: ${String(err)}`,
            taskId: undefined,
          });
        }
      }
    }, 2000);
  }, [updateNodeData]);

  const handleGenerate = useCallback(async () => {
    if (isProcessing) return;
    // Require upstream text — no local prompt editing
    const currentUpstream = collectUpstreamData(props.id, getNodes(), getEdges());
    if (!currentUpstream.hasTextSource) {
      updateNodeData(props.id, { ...data, error: '请连接文本节点提供提示词' });
      return;
    }
    const promptText = currentUpstream.promptText.trim();
    if (!promptText) {
      updateNodeData(props.id, { ...data, error: '上游文本节点内容为空' });
      return;
    }
    const finalPrompt = `${promptText}, aspect ratio ${ratio}`;
    updateNodeData(props.id, { ...data, isProcessing: true, progress: 0, error: undefined, lastVideo: undefined });
    try {
      const inputJson: Record<string, unknown> = {
        prompt: finalPrompt,
        model_config_id: selectedConfigId || undefined,
        binding_key: data.bindingKey || 'video-default',
        aspect_ratio: ratio,
        duration,
      };

      // Collect upstream reference images → base64 data URIs (preserves @N order)
      if (currentUpstream.refImages.length > 0) {
        const base64Images = await fetchRefImagesAsBase64(currentUpstream.refImages);
        if (base64Images.length > 0) {
          inputJson.images = base64Images;
        }
      }

      const task = await createTaskApi({
        type: 'asset_video_generate',
        input_json: inputJson,
      });
      updateNodeData(props.id, { ...dataRef.current, isProcessing: true, progress: 0, taskId: task.id, error: undefined, lastVideo: undefined });
      startPolling(task.id);
    } catch (err: any) {
      updateNodeData(props.id, { ...dataRef.current, isProcessing: false, error: String(err?.message || err) });
    }
  }, [data, isProcessing, props.id, ratio, duration, selectedConfigId, startPolling, updateNodeData, getNodes, getEdges]);

  const handleStop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    updateNodeData(props.id, { ...dataRef.current, isProcessing: false, progress: 0, taskId: undefined });
  }, [props.id, updateNodeData]);

  // Icon mode
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border ${
          selected ? 'border-primary/50' : 'border-border/70'
        } bg-canvasNode`}
        title="视频节点"
      >
        <span className="text-base leading-none">🎬</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); expand(); }}
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-border text-textMuted text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">+</button>
      </div>
    );
  }

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={320} minHeight={180}
        lineClassName="!border-primary/30"
        handleClassName="!w-2 !h-2 !bg-textMuted !border-background !border-2 !rounded-sm" />

      {/* Single input handle — accepts text + image connections */}
      <Handle id="in" type="target" position={Position.Left}
        className="node-handle-in"
        style={HANDLE_STYLE}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>
      {/* Output handle */}
      <Handle id="out" type="source" position={Position.Right}
        className="node-handle-out"
        style={HANDLE_STYLE}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>

      {/* Invisible outer wrapper — allows toolbar to float outside visible card */}
      <div className="group relative" style={{ width: props.width || 400 }}>

        {/* Floating toolbar — above card when video generated */}
        {hasVideo && !isProcessing && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-surface/90 backdrop-blur rounded-full px-3 py-1.5 border border-border/30 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
            <a href={data.lastVideo} download className="nodrag text-textMuted hover:text-textMain transition-colors">
              <Download size={13} />
            </a>
            <span className="text-textMuted/30">|</span>
            <button type="button" onClick={handleGenerate}
              disabled={!upstream.hasTextSource}
              className="nodrag text-textMuted hover:text-textMain transition-colors text-[11px] disabled:opacity-30 disabled:cursor-not-allowed">
              ▶ 重新生成
            </button>
          </div>
        )}

        {/* Visible card */}
        <div className={`rounded-xl border overflow-hidden relative ${
          isProcessing ? 'node-scanning-border border-transparent bg-surface/80' : selected ? 'border-primary/50 bg-canvasNode' : 'border-border bg-canvasNode'
        }`} style={{ height: props.height || 225 }}>

          {/* ===== PROCESSING STATE ===== */}
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={28} className="animate-spin text-accent" />
              <span className="text-[13px] text-textMuted tabular-nums">{data.progress ?? 0}%</span>
              <button type="button" onClick={handleStop}
                className="nodrag text-[10px] text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 mt-1">
                <Square size={8} /> 停止
              </button>
            </div>

          /* ===== POST-GEN: video fills entire card ===== */
          ) : hasVideo ? (
            <>
              <video src={data.lastVideo} className="w-full h-full object-cover" controls muted />
              {/* Bottom pill bar — hover overlay */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center px-2 pb-2 pt-6 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2 bg-surface/80 backdrop-blur rounded-full px-3 py-1 border border-border/30 text-[11px]">
                  <span className="text-textMuted truncate max-w-[120px]">{modelDisplayName}</span>
                  <span className="text-textMuted/20">·</span>
                  <span className="text-textMuted">{ratio} {duration}s</span>
                  {upstream.refImages.length > 0 && (
                    <>
                      <span className="text-textMuted/20">·</span>
                      <span className="text-purple-400 flex items-center gap-0.5">
                        <ImageIcon size={10} />{upstream.refImages.length}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </>

          /* ===== PRE-GEN VIEW: upstream status + ref images + controls ===== */
          ) : (
            <div className="flex flex-col h-full">
              {/* Top bar */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <span className="text-[11px] text-textMuted">视频</span>
                <span className="text-[10px] text-textMuted/60 tabular-nums">{duration}s · {ratio}</span>
              </div>

              {/* Body — upstream text preview + ref image list */}
              <div className="px-3 pb-2 gap-1.5 flex-1 min-h-0 overflow-hidden flex flex-col">
                {/* Upstream text status */}
                {upstream.hasTextSource ? (
                  <div className="rounded-lg border border-border/40 bg-background p-2 text-[11px] leading-relaxed text-textMuted/70 max-h-[4rem] overflow-hidden">
                    <span className="text-accent/60 text-[9px] block mb-0.5">提示词 (来自上游)</span>
                    {upstream.promptText.slice(0, 120)}{upstream.promptText.length > 120 ? '...' : ''}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/40 bg-background/50 p-3 flex items-center justify-center text-[11px] text-textMuted/40 flex-1">
                    请连接文本节点提供提示词
                  </div>
                )}

                {/* Reference image list with @N indices */}
                {upstream.refImages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {upstream.refImages.map((ref) => (
                      <div key={ref.index} className="flex items-center gap-1 bg-purple-500/10 rounded-md px-1.5 py-0.5 border border-purple-500/20">
                        <img src={ref.thumbUrl} alt={ref.name} className="w-5 h-5 rounded object-cover" />
                        <span className="text-[10px] text-purple-300 font-medium">@{ref.index}</span>
                        <span className="text-[9px] text-textMuted/60 truncate max-w-[60px]">{ref.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {data.error && (
                  <div className="text-[10px] text-red-400/80 truncate shrink-0" title={data.error}>{data.error}</div>
                )}
              </div>

              {/* Bottom toolbar — compact: [model ∨] [ratio·duration ∨] [▶] */}
              <div className="flex items-center justify-center px-3 pb-2 shrink-0">
                <div className="flex items-center gap-1.5 bg-surface/80 backdrop-blur rounded-full px-3 py-1 border border-border/30 w-full justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Model selector */}
                    <div className="relative">
                      <button type="button" onClick={() => setShowModelMenu(!showModelMenu)}
                        className="nodrag text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors">
                        <span className="truncate max-w-[100px]">{modelDisplayName}</span>
                        <ChevronDown size={10} />
                      </button>
                      {showModelMenu && (
                        <div className="absolute bottom-full left-0 mb-1 bg-background border border-border/40 rounded-lg py-1 z-20 min-w-[160px] max-h-[200px] overflow-y-auto shadow-lg">
                          {videoModels.length === 0 ? (
                            <div className="px-3 py-1.5 text-[11px] text-textMuted">无可用模型</div>
                          ) : videoModels.map((m) => (
                            <button key={m.configId} type="button"
                              onClick={() => {
                                updateNodeData(props.id, { ...data, model: m.displayName, modelConfigId: m.configId });
                                selectModel(m.configId);
                                setShowModelMenu(false);
                              }}
                              className={`nodrag block w-full px-3 py-1.5 text-[11px] text-left hover:bg-canvasNode transition-colors ${
                                selectedConfigId === m.configId ? 'text-textMain font-medium' : 'text-textMuted'
                              }`}>{m.displayName}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Combined size picker: ratio · duration */}
                    <span className="text-textMuted/20">·</span>
                    <div className="relative">
                      <button type="button" onClick={() => setShowSizePicker(!showSizePicker)}
                        className="nodrag text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors">
                        <span>{ratio} · {duration}s</span>
                        <ChevronDown size={10} />
                      </button>
                      {showSizePicker && (
                        <div className="nodrag absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-background border border-border/40 rounded-xl p-3 z-20 min-w-[220px] shadow-lg">
                          {supportsRatio && (
                            <div className="mb-2">
                              <div className="text-[10px] text-textMuted/60 mb-1.5">宽高比</div>
                              <div className="flex flex-wrap gap-1">
                                {(caps?.aspect_ratios ?? ASPECT_RATIOS).map((r: string) => (
                                  <button key={r} type="button"
                                    onClick={() => updateNodeData(props.id, { ...data, aspectRatio: r })}
                                    className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                                      ratio === r ? 'bg-accent/20 text-accent font-medium' : 'bg-canvasNode/50 text-textMuted hover:text-textMain'
                                    }`}>{r}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="text-[10px] text-textMuted/60 mb-1.5">时长</div>
                            <div className="flex flex-wrap gap-1">
                              {(caps?.duration_options ?? [2, 4, 6, 8]).map((d: number) => (
                                <button key={d} type="button"
                                  onClick={() => updateNodeData(props.id, { ...data, duration: d })}
                                  className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                                    duration === d ? 'bg-accent/20 text-accent font-medium' : 'bg-canvasNode/50 text-textMuted hover:text-textMain'
                                  }`}>{d}s</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {upstream.refImages.length > 0 && (
                      <span className="text-[10px] text-purple-400 flex items-center gap-0.5" title={`${upstream.refImages.length} 张参考图`}>
                        <ImageIcon size={10} />{upstream.refImages.length}
                      </span>
                    )}
                    <button type="button" onClick={handleGenerate}
                      disabled={!upstream.hasTextSource}
                      className="nodrag text-accent hover:text-accent/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={upstream.hasTextSource ? '生成' : '请先连接文本节点'}>
                      ▶
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
