'use client';

/**
 * ImageOutputNode — Pure AI image generation node.
 * No local prompt editing — text comes exclusively from upstream text nodes.
 * Reference images come from upstream AssetNodes, ordered by Y position with @N indices.
 * Single `in` handle accepts both text and image connections (auto-detected by source type).
 * If no text node connected → generate button disabled.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow, Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { ImageOutputNodeData } from '@/lib/canvas/types';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import { useAIModelList } from '@/hooks/useAIModelList';
import { ChevronDown, Loader2, Square, Pencil, Download, ImageIcon, Upload } from 'lucide-react';
import { collectUpstreamData, fetchRefImagesAsBase64 } from '@/lib/canvas/image-utils';

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
  const data = props.data as unknown as ImageOutputNodeData;
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
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { models: imageModels, selectedConfigId, selectModel } = useAIModelList('image', data.bindingKey ?? 'image-default', data.modelConfigId);
  const selectedModel = imageModels.find((m) => m.configId === selectedConfigId);
  const caps = selectedModel?.capabilities;
  const supportsRatio = !caps || !!caps.aspect_ratios?.length;
  const supportsResolution = !caps || !!caps.resolutions?.length || !!caps.resolution_tiers;
  const modelDisplayName = selectedModel?.displayName ?? data.model ?? '模型';
  const ratio = data.aspectRatio ?? '1:1';
  const resolution = data.resolution ?? 'standard';
  const isProcessing = !!data.isProcessing;
  const hasImage = !!data.lastImage;
  const fullImageUrl = data.lastImageFull || data.lastImage || '';

  // Dynamic resolution mode: 'tier' (Volcengine), 'fixed' (Aliyun pixel sizes), 'default' (standard/hd/2k/4k)
  const resolutionMode: 'tier' | 'fixed' | 'default' = caps?.resolution_tiers
    ? 'tier'
    : (caps?.resolutions?.length ? 'fixed' : 'default');
  const effectiveResOptions: { label: string; value: string }[] =
    resolutionMode === 'tier'
      ? (caps!.resolution_tiers as string[]).map((t: string) => ({ label: t, value: t }))
      : resolutionMode === 'fixed'
        ? (caps!.resolutions as string[]).map((r: string) => ({ label: r.replace('*', 'x'), value: r }))
        : [...RESOLUTIONS];

  // Resolve display size string
  const sizeStr = resolutionMode === 'fixed'
    ? resolution.replace('*', 'x')
    : resolutionMode === 'tier'
      ? resolution
      : resolveSize(resolution, ratio).replace('*', 'x');
  const displaySizeStr = imgDims ? `${imgDims.w}x${imgDims.h}` : sizeStr;

  // Auto-reset resolution when model changes and current value is not in new options
  const prevModelRef = useRef(selectedConfigId);
  useEffect(() => {
    if (prevModelRef.current === selectedConfigId) return;
    prevModelRef.current = selectedConfigId;
    const validValues = effectiveResOptions.map(o => o.value);
    if (!validValues.includes(resolution)) {
      updateNodeData(props.id, { ...data, resolution: validValues[0] || 'standard' });
    }
  }, [selectedConfigId, effectiveResOptions, resolution, updateNodeData, props.id, data]);

  // Collect upstream data: text from text nodes, images from asset nodes (single `in` handle)
  const upstream = useMemo(
    () => collectUpstreamData(props.id, getNodes(), getEdges()),
    // Re-compute on every render since nodes/edges are mutable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.id, getNodes, getEdges, data],
  );

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
      } catch (err) {
        pollErrorCount.current += 1;
        console.error('[ImageOutputNode] poll error:', err);
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

  // Effective prompt: upstream text takes priority, fallback to manual prompt
  const effectivePrompt = upstream.hasTextSource ? upstream.promptText.trim() : (data.prompt ?? '').trim();
  const hasPrompt = effectivePrompt.length > 0;

  const handleGenerate = useCallback(async () => {
    if (isProcessing) return;
    const currentUpstream = collectUpstreamData(props.id, getNodes(), getEdges());
    const promptText = currentUpstream.hasTextSource
      ? currentUpstream.promptText.trim()
      : (dataRef.current.prompt ?? '').trim();
    if (!promptText) {
      updateNodeData(props.id, { ...dataRef.current, error: '请输入提示词或连接文本节点' });
      return;
    }
    const finalPrompt = `${promptText}, aspect ratio ${ratio}`;
    updateNodeData(props.id, { ...data, isProcessing: true, progress: 0, error: undefined, lastImage: undefined });
    try {
      const inputJson: Record<string, unknown> = {
        prompt: finalPrompt,
        model_config_id: selectedConfigId || undefined,
        binding_key: data.bindingKey || 'image-default',
        aspect_ratio: ratio,
      };
      if (resolutionMode === 'tier') {
        inputJson.resolution_tier = resolution;
      } else if (resolutionMode === 'fixed') {
        inputJson.resolution = resolution;
      } else {
        inputJson.resolution = resolveSize(resolution, ratio);
      }

      // Collect upstream reference images → base64 data URIs (preserves @N order)
      if (currentUpstream.refImages.length > 0) {
        const base64Images = await fetchRefImagesAsBase64(currentUpstream.refImages);
        if (base64Images.length > 0) {
          inputJson.images = base64Images;
        }
      }

      const task = await createTaskApi({
        type: 'asset_image_generate',
        input_json: inputJson,
      });
      updateNodeData(props.id, { ...dataRef.current, isProcessing: true, progress: 0, taskId: task.id, error: undefined, lastImage: undefined });
      startPolling(task.id);
    } catch (err: any) {
      updateNodeData(props.id, { ...dataRef.current, isProcessing: false, error: String(err?.message || err) });
    }
  }, [isProcessing, props.id, ratio, resolution, resolutionMode, selectedConfigId, startPolling, updateNodeData, getNodes, getEdges]);

  const handleStop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    updateNodeData(props.id, { ...dataRef.current, isProcessing: false, progress: 0, taskId: undefined });
  }, [props.id, updateNodeData]);

  const handleUploadImage = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const nodeId = json?.data?.id as string | undefined;
      if (!nodeId) throw new Error('上传失败');
      const downloadUrl = `/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`;
      const thumbUrl = `/api/vfs/nodes/${encodeURIComponent(nodeId)}/thumbnail`;
      updateNodeData(props.id, {
        ...dataRef.current,
        lastImage: thumbUrl,
        lastImageFull: downloadUrl,
        isProcessing: false,
        progress: 100,
        error: undefined,
      });
    } catch (err: any) {
      updateNodeData(props.id, { ...dataRef.current, error: `上传失败: ${String(err?.message || err)}` });
    } finally {
      setUploading(false);
    }
  }, [props.id, updateNodeData]);

  // Icon mode
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border ${
          selected ? 'border-primary/50' : 'border-border/70'
        } bg-background/95`}
        title="图片节点"
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

        {/* Floating toolbar — above card when image generated */}
        {hasImage && !isProcessing && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-surface/90 backdrop-blur rounded-full px-3 py-1.5 border border-border/30 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
            <a href={fullImageUrl} download className="nodrag text-textMuted hover:text-textMain transition-colors">
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
        <div className={`rounded-xl border relative ${
          (isProcessing || hasImage) ? 'overflow-hidden' : ''
        } ${
          isProcessing ? 'node-scanning-border border-transparent bg-background/80' : selected ? 'border-primary/50 bg-background/95' : 'border-border/70 bg-background/95'
        }`} style={isProcessing || !hasImage ? { height: props.height || 260 } : undefined}>

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

          /* ===== POST-GEN: title bar + image + pill bar ===== */
          ) : hasImage ? (
            <div className="flex flex-col">
              {/* Title bar */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <span className="text-[11px] text-textMuted">图片</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-textMuted/60 tabular-nums">{displaySizeStr}</span>
                  <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={uploading}
                    className="nodrag text-textMuted/50 hover:text-textMain transition-colors disabled:opacity-30" title="上传图片">
                    {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                  </button>
                </div>
              </div>
              {/* Image */}
              <div className="px-2 pb-1.5 flex items-center justify-center">
                <img src={data.lastImage} alt="Generated"
                  className="w-full rounded-lg object-contain cursor-zoom-in"
                  style={{ maxHeight: 400 }}
                  onLoad={(e) => { const t = e.currentTarget; setImgDims({ w: t.naturalWidth, h: t.naturalHeight }); }}
                  onDoubleClick={() => setPreviewOpen(true)}
                />
              </div>
              {/* Bottom pill bar */}
              <div className="flex items-center justify-center px-3 pb-2 shrink-0">
                <div className="flex items-center gap-2 bg-surface/80 backdrop-blur rounded-full px-3 py-1 border border-border/30 text-[11px]">
                  <span className="text-textMuted truncate max-w-[120px]">{modelDisplayName}</span>
                  <span className="text-textMuted/20">·</span>
                  <span className="text-textMuted tabular-nums">{ratio} {displaySizeStr}</span>
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
            </div>

          /* ===== PRE-GEN VIEW ===== */
          ) : (
            <div className="flex flex-col h-full">
              {/* ── Title bar ── */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <span className="text-[11px] text-textMuted">图片</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-textMuted/60 tabular-nums">{sizeStr}</span>
                  <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={uploading}
                    className="nodrag text-textMuted/50 hover:text-textMain transition-colors disabled:opacity-30" title="上传图片">
                    {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                  </button>
                </div>
              </div>

              {/* ── Body: prompt + ref images ── */}
              <div className="px-3 pb-2 gap-1.5 flex-1 min-h-0 overflow-y-auto flex flex-col">
                {upstream.hasTextSource ? (
                  <div className="rounded-lg border border-border/40 bg-background p-2 text-[11px] leading-relaxed text-textMuted/70 max-h-[4rem] overflow-hidden shrink-0">
                    <span className="text-accent/60 text-[9px] block mb-0.5">提示词 (来自上游)</span>
                    {upstream.promptText.slice(0, 120)}{upstream.promptText.length > 120 ? '...' : ''}
                  </div>
                ) : (
                  <textarea
                    className="nodrag nowheel w-full flex-1 min-h-[48px] rounded-lg border border-border/40 bg-background p-2 text-[11px] leading-relaxed text-textMain placeholder:text-textMuted/40 outline-none resize-none"
                    placeholder="输入提示词..."
                    value={data.prompt ?? ''}
                    onChange={(e) => updateNodeData(props.id, { ...data, prompt: e.target.value })}
                  />
                )}

                {upstream.refImages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 shrink-0">
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

              {/* ── Bottom toolbar: [Model▾] [ratio·res▾] [ref] [▶] ── */}
              <div className="px-3 pb-2 pt-1 shrink-0 border-t border-border/20">
                <div className="flex items-center gap-1.5 w-full text-[11px]">
                  {/* Model selector */}
                  <div className="relative min-w-0 flex-1">
                    <button type="button" onClick={() => { setShowModelMenu(!showModelMenu); setShowSizePicker(false); }}
                      className="nodrag text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors w-full">
                      <span className="truncate flex-1 text-left">{modelDisplayName}</span>
                      <ChevronDown size={10} className="shrink-0" />
                    </button>
                    {showModelMenu && (
                      <div className="absolute top-full left-0 mt-1 bg-background border border-border/40 rounded-lg py-1 z-50 min-w-[260px] max-h-[240px] overflow-y-auto shadow-xl">
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
                            }`}>{m.displayName}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Combined ratio + resolution picker */}
                  <div className="relative shrink-0">
                    <button type="button" onClick={() => { setShowSizePicker(!showSizePicker); setShowModelMenu(false); }}
                      className="nodrag text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors">
                      <span className="text-[10px]">{ratio} · {effectiveResOptions.find(r => r.value === resolution)?.label ?? '标准'}</span>
                      <ChevronDown size={10} />
                    </button>
                    {showSizePicker && (
                      <div className="nodrag absolute top-full right-0 mt-1 bg-background border border-border/40 rounded-xl p-2.5 z-50 min-w-[200px] shadow-xl">
                        <div className="text-[10px] text-textMuted/60 mb-1">宽高比</div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(caps?.aspect_ratios?.length ? caps.aspect_ratios : ASPECT_RATIOS).map((r: string) => (
                            <button key={r} type="button"
                              onClick={() => updateNodeData(props.id, { ...data, aspectRatio: r })}
                              className={`px-2 py-0.5 rounded-md text-[10px] transition-colors ${
                                ratio === r ? 'bg-accent/20 text-accent font-medium' : 'bg-surfaceHighlight/50 text-textMuted hover:text-textMain'
                              }`}>{r}</button>
                          ))}
                        </div>
                        {supportsResolution && (
                          <>
                            <div className="text-[10px] text-textMuted/60 mb-1">清晰度</div>
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {effectiveResOptions.map((r) => (
                                <button key={r.value} type="button"
                                  onClick={() => updateNodeData(props.id, { ...data, resolution: r.value })}
                                  className={`px-2 py-0.5 rounded-md text-[10px] transition-colors ${
                                    resolution === r.value ? 'bg-accent/20 text-accent font-medium' : 'bg-surfaceHighlight/50 text-textMuted hover:text-textMain'
                                  }`}>{r.label}</button>
                              ))}
                            </div>
                          </>
                        )}
                        <div className="text-[9px] text-textMuted/40 tabular-nums text-center">{sizeStr}</div>
                      </div>
                    )}
                  </div>

                  {/* Ref image count + generate button */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    {upstream.refImages.length > 0 && (
                      <span className="text-[10px] text-purple-400 flex items-center gap-0.5" title={`${upstream.refImages.length} 张参考图`}>
                        <ImageIcon size={10} />{upstream.refImages.length}
                      </span>
                    )}
                    <button type="button" onClick={handleGenerate}
                      disabled={!hasPrompt}
                      className="nodrag text-accent hover:text-accent/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[13px]"
                      title={hasPrompt ? '生成' : '请输入提示词或连接文本节点'}>
                      ▶
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input for image upload */}
      <input ref={uploadInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadImage(f); e.target.value = ''; }} />

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
