'use client';

/**
 * ImageOutputNode — AI image generation node.
 * Pre-gen: prompt textarea + controls only (no image placeholder).
 * Post-gen: image fills node, controls hidden, only top bar + bottom pill bar.
 * Single input/output handles centered on left/right.
 * Integrates with backend task system. Animated scanning border while processing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow, Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { ImageOutputNodeData } from '@/lib/canvas/types';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import { useAIModelList } from '@/hooks/useAIModelList';
import PromptTemplateModal, { type PromptPreset } from '@/components/canvas/PromptTemplateModal';
import { ChevronDown, Loader2, Square, Pencil, Download, Upload } from 'lucide-react';

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
const RESOLUTIONS = [
  { label: '标准', value: 'standard' },
  { label: 'HD', value: 'hd' },
  { label: '2K', value: '2k' },
  { label: '4K', value: '4k' },
] as const;

// Map (resolution, aspectRatio) → "width*height" for Aliyun API
const RESOLUTION_SIZE_MAP: Record<string, Record<string, string>> = {
  'standard': { '1:1': '1024*1024', '16:9': '1280*720',  '9:16': '720*1280',  '4:3': '1024*768',  '3:4': '768*1024'  },
  'hd':       { '1:1': '1024*1024', '16:9': '1920*1080', '9:16': '1080*1920', '4:3': '1440*1080', '3:4': '1080*1440' },
  '2k':       { '1:1': '2048*2048', '16:9': '2560*1440', '9:16': '1440*2560', '4:3': '2048*1536', '3:4': '1536*2048' },
  '4k':       { '1:1': '4096*4096', '16:9': '3840*2160', '9:16': '2160*3840', '4:3': '4096*3072', '3:4': '3072*4096' },
};
function resolveSize(res: string, ar: string): string {
  return RESOLUTION_SIZE_MAP[res]?.[ar] ?? RESOLUTION_SIZE_MAP['standard']?.[ar] ?? '1024*1024';
}

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

export default function ImageOutputNode(props: NodeProps) {
  console.log('[ImageOutputNode] RENDER id=', props.id, 'w=', props.width, 'h=', props.height);
  const data = props.data as unknown as ImageOutputNodeData;
  const rawData = props.data as unknown as Record<string, unknown>;
  const selected = Boolean(props.selected);
  const { expand, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, d: any) => void;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const nodeIdRef = useRef(props.id);
  nodeIdRef.current = props.id;

  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { models: imageModels, selectedConfigId, selectModel } = useAIModelList('image', data.bindingKey ?? 'image-default', data.modelConfigId);
  const selectedModel = imageModels.find((m) => m.configId === selectedConfigId);
  const caps = selectedModel?.capabilities;
  const supportsRatio = !caps || !!caps.aspect_ratios?.length;
  const supportsResolution = !caps || !!caps.resolutions?.length || !!caps.resolution_tiers;
  const modelDisplayName = selectedModel?.model ?? data.model ?? '模型';
  const ratio = data.aspectRatio ?? '1:1';
  const resolution = data.resolution ?? 'standard';
  const isProcessing = !!data.isProcessing;
  const hasImage = !!data.lastImage;
  const fullImageUrl = data.lastImageFull || data.lastImage || '';
  const sizeStr = resolveSize(resolution, ratio).replace('*', 'x');
  const displaySizeStr = imgDims ? `${imgDims.w}x${imgDims.h}` : sizeStr;

  // Upstream text replaces prompt when available
  const upstreamText = rawData['in'] ? String(rawData['in']) : '';
  const effectivePrompt = upstreamText || data.prompt || '';

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Resume polling if node was processing (e.g. after page reload)
  useEffect(() => {
    if (data.taskId && isProcessing && !pollRef.current) {
      startPolling(data.taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = useCallback((taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const t = await fetchTaskApi(taskId);
        const d = dataRef.current;
        if (t.status === 'succeeded') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          const fileNodeId = t.result_json?.file_node_id as string | undefined;
          const downloadUrl = fileNodeId
            ? `/api/vfs/nodes/${encodeURIComponent(fileNodeId)}/download`
            : (t.result_json?.url as string) || '';
          const thumbUrl = fileNodeId
            ? `/api/vfs/nodes/${encodeURIComponent(fileNodeId)}/thumbnail`
            : downloadUrl;
          updateNodeData(nodeIdRef.current, {
            ...d,
            isProcessing: false,
            progress: 100,
            lastImage: thumbUrl,
            lastImageFull: downloadUrl,
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
      } catch {
        // Network error, keep polling
      }
    }, 2000);
  }, [updateNodeData]);

  const handleGenerate = useCallback(async () => {
    if (isProcessing) return;
    if (!effectivePrompt.trim()) {
      updateNodeData(props.id, { ...data, error: '请输入提示词' });
      return;
    }
    const finalPrompt = `${effectivePrompt.trim()}, aspect ratio ${ratio}`;
    const size = resolveSize(resolution, ratio);
    updateNodeData(props.id, { ...data, isProcessing: true, progress: 0, error: undefined, lastImage: undefined });
    try {
      const task = await createTaskApi({
        type: 'asset_image_generate',
        input_json: {
          prompt: finalPrompt,
          model_config_id: selectedConfigId || undefined,
          binding_key: data.bindingKey || 'image-default',
          resolution: size,
          aspect_ratio: ratio,
        },
      });
      updateNodeData(props.id, { ...dataRef.current, isProcessing: true, progress: 0, taskId: task.id, error: undefined, lastImage: undefined });
      startPolling(task.id);
    } catch (err: any) {
      updateNodeData(props.id, { ...dataRef.current, isProcessing: false, error: String(err?.message || err) });
    }
  }, [data, effectivePrompt, isProcessing, props.id, ratio, resolution, selectedConfigId, startPolling, updateNodeData]);

  const handleStop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    updateNodeData(props.id, { ...dataRef.current, isProcessing: false, progress: 0, taskId: undefined });
  }, [props.id, updateNodeData]);

  const handleUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json() as { data?: { id: string } };
      const nodeId = json.data?.id;
      if (!nodeId) throw new Error('上传失败');
      const thumbUrl = `/api/vfs/nodes/${encodeURIComponent(nodeId)}/thumbnail`;
      const downloadUrl = `/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`;
      updateNodeData(props.id, { ...dataRef.current, lastImage: thumbUrl, lastImageFull: downloadUrl, error: undefined });
    } catch (err: any) {
      updateNodeData(props.id, { ...dataRef.current, error: String(err?.message || err) });
    }
  }, [props.id, updateNodeData]);

  // Icon mode
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border ${
          selected ? 'border-primary/50' : 'border-border/70'
        } bg-background/95`}
        title="图片生成"
      >
        <span className="text-base leading-none">🖼️</span>
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

      {/* Single input handle — left center, animated */}
      <Handle id="in" type="target" position={Position.Left}
        className="node-handle-in"
        style={HANDLE_STYLE}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>
      {/* Single output handle — right center, animated */}
      <Handle id="out" type="source" position={Position.Right}
        className="node-handle-out"
        style={HANDLE_STYLE}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>

      {/* Invisible outer wrapper — allows toolbar to float outside visible card */}
      <div className="group relative" style={{ width: props.width || 400 }}>

        {/* Floating toolbar — OUTSIDE visible card, above it */}
        {hasImage && !editMode && !isProcessing && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-surface/90 backdrop-blur rounded-full px-3 py-1.5 border border-border/30 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" onClick={() => setEditMode(true)}
              className="nodrag text-[11px] text-textMuted hover:text-textMain flex items-center gap-1 transition-colors">
              <Pencil size={11} /> 编辑
            </button>
            <span className="text-textMuted/30">|</span>
            <a href={fullImageUrl} download className="nodrag text-textMuted hover:text-textMain transition-colors">
              <Download size={13} />
            </a>
            <span className="text-textMuted/30">|</span>
            <button type="button" onClick={handleGenerate}
              className="nodrag text-textMuted hover:text-textMain transition-colors text-[11px]">
              ▶ 重新生成
            </button>
          </div>
        )}

        {/* Visible card */}
        <div className={`rounded-xl border overflow-hidden relative ${
          isProcessing ? 'node-scanning-border border-transparent bg-background/80' : selected ? 'border-primary/50 bg-background/95' : 'border-border/70 bg-background/95'
        }`} style={isProcessing || !hasImage || editMode ? { height: props.height || 225 } : undefined}>

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

          /* ===== POST-GEN: title bar + image (contain) + pill bar ===== */
          ) : hasImage && !editMode ? (
            <div className="flex flex-col">
              {/* Title bar */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <span className="text-[11px] text-textMuted">图片</span>
                <span className="text-[10px] text-textMuted/60 tabular-nums">{displaySizeStr}</span>
              </div>
              {/* Image — object-contain to show full image at correct aspect ratio */}
              <div className="px-2 pb-1.5 flex items-center justify-center">
                <img src={data.lastImage} alt="Generated"
                  className="w-full rounded-lg object-contain cursor-zoom-in"
                  style={{ maxHeight: 400 }}
                  onLoad={(e) => { const t = e.currentTarget; setImgDims({ w: t.naturalWidth, h: t.naturalHeight }); }}
                  onDoubleClick={() => setPreviewOpen(true)}
                />
              </div>
              {/* Bottom pill bar — always visible */}
              <div className="flex items-center justify-center px-3 pb-2 shrink-0">
                <div className="flex items-center gap-2 bg-surface/80 backdrop-blur rounded-full px-3 py-1 border border-border/30 text-[11px]">
                  <div className="relative">
                    <button type="button" onClick={() => setShowModelMenu(!showModelMenu)}
                      className="nodrag text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors">
                      <span className="truncate max-w-[120px]">{modelDisplayName}</span>
                      <ChevronDown size={10} />
                    </button>
                    {showModelMenu && (
                      <div className="absolute bottom-full left-0 mb-1 bg-background border border-border/40 rounded-lg py-1 z-20 min-w-[160px] max-h-[200px] overflow-y-auto shadow-lg">
                        {imageModels.length === 0 ? (
                          <div className="px-3 py-1.5 text-[11px] text-textMuted">无可用模型</div>
                        ) : imageModels.map((m) => (
                          <button key={m.configId} type="button"
                            onClick={() => {
                              updateNodeData(props.id, { ...data, model: m.displayName, modelConfigId: m.configId });
                              selectModel(m.configId);
                              setShowModelMenu(false);
                            }}
                            className={`nodrag block w-full px-3 py-1.5 text-[11px] text-left hover:bg-surfaceHighlight transition-colors ${
                              selectedConfigId === m.configId ? 'text-textMain font-medium' : 'text-textMuted'
                            }`}>{m.model}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-textMuted/20">·</span>
                  <span className="text-textMuted tabular-nums">{ratio} {displaySizeStr}</span>
                </div>
              </div>
            </div>

          /* ===== EDIT / PRE-GEN VIEW ===== */
          ) : (
            <div className="flex flex-col h-full">
              {/* Top bar */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <span className="text-[11px] text-textMuted">图片</span>
                <div className="flex items-center gap-2">
                  {hasImage && (
                    <button type="button" onClick={() => setEditMode(false)}
                      className="nodrag text-[10px] text-accent hover:text-accent/80 transition-colors">返回预览</button>
                  )}
                  <span className="text-[10px] text-textMuted/60 tabular-nums">{sizeStr}</span>
                </div>
              </div>

              {/* Body — prompt + controls */}
              <div className="px-3 pb-2 gap-1.5 flex-1 min-h-0 overflow-hidden flex flex-col">
                <textarea
                  className="nodrag nowheel w-full flex-1 min-h-[2rem] rounded-lg border border-border/40 bg-background p-2 text-[11px] leading-relaxed text-textMain placeholder:text-textMuted/40 outline-none focus:border-border resize-none"
                  placeholder={upstreamText ? '上游文本已接入...' : '输入生图提示词...'}
                  value={upstreamText ? '' : (data.prompt || '')}
                  onChange={(e) => updateNodeData(props.id, { ...data, prompt: e.target.value })}
                  disabled={!!upstreamText}
                />
                {upstreamText && (
                  <div className="text-[9px] text-textMuted/50 truncate shrink-0" title={upstreamText}>
                    上游: {upstreamText.slice(0, 60)}...
                  </div>
                )}
                {data.error && (
                  <div className="text-[10px] text-red-400/80 truncate shrink-0" title={data.error}>{data.error}</div>
                )}
              </div>

              {/* Bottom toolbar — compact: [model ∨] [ratio·res ∨] [↑] [▶] */}
              <div className="flex items-center justify-center px-3 pb-2 shrink-0">
                <div className="flex items-center gap-1.5 bg-surface/80 backdrop-blur rounded-full px-3 py-1 border border-border/30 w-full justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Model selector */}
                    <div className="relative min-w-[120px]">
                      <button type="button" onClick={() => setShowModelMenu(!showModelMenu)}
                        className="nodrag text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors w-full">
                        <span className="truncate max-w-[160px] flex-1 text-left">{modelDisplayName}</span>
                        <ChevronDown size={10} />
                      </button>
                      {showModelMenu && (
                        <div className="absolute bottom-full left-0 mb-1 bg-background border border-border/40 rounded-lg py-1 z-20 min-w-[160px] max-h-[200px] overflow-y-auto shadow-lg">
                          {imageModels.length === 0 ? (
                            <div className="px-3 py-1.5 text-[11px] text-textMuted">无可用模型</div>
                          ) : imageModels.map((m) => (
                            <button key={m.configId} type="button"
                              onClick={() => {
                                updateNodeData(props.id, { ...data, model: m.displayName, modelConfigId: m.configId });
                                selectModel(m.configId);
                                setShowModelMenu(false);
                              }}
                              className={`nodrag block w-full px-3 py-1.5 text-[11px] text-left hover:bg-surfaceHighlight transition-colors ${
                                selectedConfigId === m.configId ? 'text-textMain font-medium' : 'text-textMuted'
                              }`}>{m.model}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Combined size picker: ratio · resolution */}
                    {(supportsRatio || supportsResolution) && (
                      <>
                        <span className="text-textMuted/20">·</span>
                        <div className="relative">
                          <button type="button" onClick={() => setShowSizePicker(!showSizePicker)}
                            className="nodrag text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors">
                            <span className="text-[10px]">{supportsRatio ? ratio : ''}{supportsRatio && supportsResolution ? '·' : ''}{supportsResolution ? (RESOLUTIONS.find(r => r.value === resolution)?.label ?? '标准') : ''}</span>
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
                                          ratio === r ? 'bg-accent/20 text-accent font-medium' : 'bg-surfaceHighlight/50 text-textMuted hover:text-textMain'
                                        }`}>{r}</button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {supportsResolution && (
                                <div className="mb-2">
                                  <div className="text-[10px] text-textMuted/60 mb-1.5">清晰度</div>
                                  <div className="flex flex-wrap gap-1">
                                    {RESOLUTIONS.map((r) => (
                                      <button key={r.value} type="button"
                                        onClick={() => updateNodeData(props.id, { ...data, resolution: r.value })}
                                        className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                                          resolution === r.value ? 'bg-accent/20 text-accent font-medium' : 'bg-surfaceHighlight/50 text-textMuted hover:text-textMain'
                                        }`}>{r.label}</button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="text-[10px] text-textMuted/40 tabular-nums text-center">{sizeStr}</div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="nodrag text-textMuted hover:text-textMain transition-colors" title="上传图片">
                      <Upload size={12} />
                    </button>
                    <button type="button" onClick={handleGenerate}
                      className="nodrag text-accent hover:text-accent/80 transition-colors" title="生成">
                      ▶
                    </button>
                  </div>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
            </div>
          )}
        </div>
      </div>

      {/* Prompt template modal */}
      <PromptTemplateModal
        open={showTemplateModal}
        toolKey="canvas_image_gen"
        onClose={() => setShowTemplateModal(false)}
        onSelect={(preset: PromptPreset) => {
          updateNodeData(props.id, { ...data, prompt: preset.prompt_template });
        }}
      />

      {/* Full-size image preview lightbox */}
      {previewOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center cursor-zoom-out backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}>
          <img src={fullImageUrl} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>,
        document.body
      )}
    </>
  );
}
