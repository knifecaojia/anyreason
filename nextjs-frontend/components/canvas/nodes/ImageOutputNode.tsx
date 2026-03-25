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
// @ts-ignore — useStore/useEdges/useNodes are exported at runtime but missing from types
import { useStore } from '@xyflow/react';
import type { ImageOutputNodeData } from '@/lib/canvas/types';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import { useAIModelList } from '@/hooks/useAIModelList';
import { ChevronDown, Loader2, Square, Pencil, Download, ImageIcon, Upload, Crop, Layers, Grid2x2, Sparkles, Expand, SunMedium, Wand2, Eraser, Scissors } from 'lucide-react';
import { collectUpstreamData, fetchRefImagesAsBase64 } from '@/lib/canvas/image-utils';
import { deriveImageCapabilityState } from '@/lib/canvas/image-model-capabilities';
import ImageCropOverlay from './ImageCropOverlay';
import ImageGridEditorModal from './ImageGridEditorModal';
import ImageGridSplitPicker from './ImageGridSplitPicker';

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
  top: '50%', zIndex: 30, pointerEvents: 'all',
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
  const rfAddNodes = rf.addNodes as (nodes: any[]) => void;
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [cropMode, setCropMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [gridSplitSize, setGridSplitSize] = useState<number | null>(null);
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const { models: imageModels, selectedConfigId, selectModel } = useAIModelList('image', data.bindingKey ?? 'image-default', data.modelConfigId);
  const selectedModel = imageModels.find((m) => m.configId === selectedConfigId);
  const caps = selectedModel?.capabilities;
  const modelDisplayName = selectedModel?.displayName ?? data.model ?? '模型';
  const ratio = data.aspectRatio ?? '1:1';
  const resolution = data.resolution ?? 'standard';
  const capabilityState = deriveImageCapabilityState(caps, ratio, resolution);
  const effectiveRatio = capabilityState.effectiveRatio;
  const effectiveResolution = capabilityState.effectiveResolution;
  const supportsRatio = capabilityState.effectiveRatios.length > 0;
  const supportsResolution = capabilityState.effectiveResOptions.length > 0;
  const isProcessing = !!data.isProcessing;
  const hasImage = !!data.lastImage;
  const fullImageUrl = data.lastImageFull || data.lastImage || '';

  const placeholderTools = useMemo(() => ([
    { key: 'hd', label: '高清', icon: Sparkles },
    { key: 'expand', label: '扩图', icon: Expand },
    { key: 'multi-angle', label: '多角度', icon: Layers },
    { key: 'lighting', label: '打光', icon: SunMedium },
    { key: 'repaint', label: '局部重绘', icon: Wand2 },
    { key: 'erase', label: '擦除', icon: Eraser },
    { key: 'cutout', label: '抠图', icon: Scissors },
  ]), []);

  const createImageNodeFromBlob = useCallback(async (blob: Blob, options?: { suffix?: string; offsetIndex?: number }) => {
    const formData = new FormData();
    formData.append('file', blob, `${options?.suffix ?? 'image'}_${Date.now()}.png`);
    const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const fileNodeId = json?.data?.id as string | undefined;
    if (!fileNodeId) throw new Error('上传图片失败');

    const downloadUrl = `/api/vfs/nodes/${encodeURIComponent(fileNodeId)}/download`;
    const thumbUrl = `/api/vfs/nodes/${encodeURIComponent(fileNodeId)}/thumbnail`;
    const currentNode = getNodes().find((n: any) => n.id === props.id);
    const baseWidth = currentNode?.measured?.width ?? currentNode?.width ?? 420;
    const offsetIndex = options?.offsetIndex ?? 0;
    const newPos = {
      x: (currentNode?.position?.x ?? 0) + baseWidth + 40 + (offsetIndex % 4) * 24,
      y: (currentNode?.position?.y ?? 0) + Math.floor(offsetIndex / 4) * 140,
    };

    rfAddNodes([{
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: 'imageOutputNode',
      position: newPos,
      width: 400,
      height: 260,
      data: {
        lastImage: thumbUrl,
        lastImageFull: downloadUrl,
        isProcessing: false,
        progress: 100,
        aspectRatio: ratio,
        resolution,
        model: data.model,
        modelConfigId: data.modelConfigId,
        bindingKey: data.bindingKey,
      },
    } as any]);
  }, [data.bindingKey, data.model, data.modelConfigId, getNodes, props.id, ratio, resolution, rfAddNodes]);

  const handleGridSplitConfirm = useCallback(async (tiles: Array<{ blob: Blob; row: number; col: number; totalRows: number; totalCols: number }>) => {
    try {
      for (const [index, tile] of tiles.entries()) {
        await createImageNodeFromBlob(tile.blob, {
          suffix: `grid_${tile.row + 1}_${tile.col + 1}`,
          offsetIndex: index,
        });
      }
      setGridSplitSize(null);
      setToolbarPinned(false);
    } catch (err: any) {
      console.error('[ImageOutputNode] grid split failed:', err);
      updateNodeData(props.id, { ...dataRef.current, error: `宫格切分失败: ${String(err?.message || err)}` });
    }
  }, [createImageNodeFromBlob, props.id, updateNodeData]);

  useEffect(() => {
    if (!gridMenuOpen && !gridSplitSize) return;
    setToolbarPinned(true);
  }, [gridMenuOpen, gridSplitSize]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-image-node-toolbar]')) return;
      if (target.closest('[data-image-grid-split-picker]')) return;
      setGridMenuOpen(false);
      if (!gridSplitSize) setToolbarPinned(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [gridSplitSize]);

  const showPlaceholderToolMessage = useCallback((label: string) => {
    updateNodeData(props.id, {
      ...dataRef.current,
      error: `${label} 功能即将上线`,
    });
  }, [props.id, updateNodeData]);

  const resolutionMode = capabilityState.resolutionMode;
  const effectiveResOptions: { label: string; value: string }[] = capabilityState.effectiveResOptions.length
    ? capabilityState.effectiveResOptions
    : [...RESOLUTIONS];

  // Resolve display size string
  const sizeStr = resolutionMode === 'fixed'
    ? resolution.replace('*', 'x')
    : resolutionMode === 'tier'
      ? resolution
      : resolveSize(resolution, ratio).replace('*', 'x');
  const displaySizeStr = imgDims ? `${imgDims.w}x${imgDims.h}` : '获取中…';

  // Auto-reset resolution when model changes and current value is not in new options
  const prevModelRef = useRef(selectedConfigId);
  useEffect(() => {
    if (prevModelRef.current === selectedConfigId) return;
    prevModelRef.current = selectedConfigId;
    const patch: Record<string, unknown> = {};
    if (effectiveRatio !== ratio) patch.aspectRatio = effectiveRatio;
    if (effectiveResolution !== resolution) patch.resolution = effectiveResolution;
    if (Object.keys(patch).length > 0) {
      updateNodeData(props.id, { ...data, ...patch });
    }
  }, [selectedConfigId, effectiveRatio, effectiveResolution, ratio, resolution, updateNodeData, props.id, data]);

  // Collect upstream data: text from text nodes, images from asset nodes (single `in` handle)
  // Use useStore to subscribe to edges/nodes changes and force re-render when graph changes
  const edges = useStore((state: any) => state.edges);
  const nodes = useStore((state: any) => state.nodes);
  const upstream = useMemo(
    () => collectUpstreamData(props.id, nodes, edges),
    [props.id, nodes, edges],
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
    const finalPrompt = `${promptText}, aspect ratio ${effectiveRatio}`;
    updateNodeData(props.id, { ...data, isProcessing: true, progress: 0, error: undefined, lastImage: undefined });
    try {
      const inputJson: Record<string, unknown> = {
        prompt: finalPrompt,
        model_config_id: selectedConfigId || undefined,
        binding_key: data.bindingKey || 'image-default',
        aspect_ratio: effectiveRatio,
      };
      if (resolutionMode === 'tier') {
        inputJson.resolution_tier = effectiveResolution;
        if (capabilityState.effectivePixelResolution) {
          inputJson.resolution = capabilityState.effectivePixelResolution;
        }
      } else if (resolutionMode === 'fixed') {
        inputJson.resolution = effectiveResolution;
      } else {
        inputJson.resolution = resolveSize(effectiveResolution, effectiveRatio);
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
  }, [isProcessing, props.id, effectiveRatio, effectiveResolution, resolutionMode, capabilityState.effectivePixelResolution, selectedConfigId, startPolling, updateNodeData, getNodes, getEdges]);

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

  // --- Crop: right-click context menu handler ---
  const handleImageContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on any click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  // --- Crop confirm: upload cropped image to VFS + create new node ---
  const handleCropConfirm = useCallback(async (blob: Blob, cropInfo: { x: number; y: number; w: number; h: number }) => {
    setCropMode(false);
    try {
      // Upload cropped image to VFS
      await createImageNodeFromBlob(blob, { suffix: 'crop', offsetIndex: 0 });
    } catch (err: any) {
      console.error('[ImageOutputNode] crop upload failed:', err);
      updateNodeData(props.id, { ...dataRef.current, error: `截图失败: ${String(err?.message || err)}` });
    }
  }, [createImageNodeFromBlob, props.id, updateNodeData]);

  // Icon mode
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border ${
          selected ? 'border-primary/50' : 'border-border/70'
        } bg-canvasNode`}
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
          <div data-image-node-toolbar className={`absolute -top-[5.2rem] left-1/2 z-20 w-[min(92vw,32rem)] -translate-x-1/2 rounded-2xl border border-border/30 bg-surface/92 px-2.5 py-2 shadow-lg backdrop-blur transition-opacity ${toolbarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setCropMode(true)}
                  className="nodrag rounded-lg p-1.5 text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors" title="截图 (框选裁切)">
                  <Crop size={13} />
                </button>
                <div className="relative">
                  <button type="button" onClick={() => setGridMenuOpen((v) => !v)}
                    className="nodrag rounded-lg p-1.5 text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors" title="宫格切分">
                    <Grid2x2 size={13} />
                  </button>
                  {gridMenuOpen && (
                    <div className="absolute left-1/2 top-full z-30 mt-2 w-36 -translate-x-1/2 rounded-xl border border-border/50 bg-background/95 p-1.5 shadow-xl backdrop-blur">
                      {[
                        { label: '4宫格 (2x2)', value: 2 },
                        { label: '9宫格 (3x3)', value: 3 },
                        { label: '16宫格 (4x4)', value: 4 },
                        { label: '25宫格 (5x5)', value: 5 },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setGridMenuOpen(false);
                            setGridSplitSize(option.value);
                            setToolbarPinned(true);
                          }}
                          className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-textMain hover:bg-surfaceHighlight transition-colors"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setEditorOpen(true)}
                  className="nodrag rounded-lg p-1.5 text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors" title="裁切 / 多宫格编辑">
                  <Layers size={13} />
                </button>
                <a href={fullImageUrl} download className="nodrag rounded-lg p-1.5 text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors" title="下载">
                  <Download size={13} />
                </a>
              </div>
              <button type="button" onClick={handleGenerate}
                disabled={!upstream.hasTextSource}
                className="nodrag shrink-0 rounded-lg px-2 py-1 text-[11px] text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                ▶ 重新生成
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2">
              {placeholderTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.key}
                    type="button"
                    onClick={() => showPlaceholderToolMessage(tool.label)}
                    className="nodrag inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
                    title={`${tool.label}（占位）`}
                  >
                    <Icon size={12} />
                    <span>{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Visible card */}
        <div className={`rounded-xl border relative ${
          (isProcessing || hasImage) ? 'overflow-hidden' : ''
        } ${
          isProcessing ? 'node-scanning-border border-transparent bg-surface/80' : selected ? 'border-primary/50 bg-canvasNode' : 'border-border bg-canvasNode'
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
              <div className="px-2 pb-1.5 flex items-center justify-center relative">
                <img src={data.lastImage} alt="Generated"
                  className="w-full rounded-lg object-contain cursor-zoom-in"
                  style={{ maxHeight: 400 }}
                  onLoad={(e) => { const t = e.currentTarget; setImgDims({ w: t.naturalWidth, h: t.naturalHeight }); }}
                  onDoubleClick={() => setPreviewOpen(true)}
                  onContextMenu={handleImageContextMenu}
                />
                {/* Right-click context menu */}
                {ctxMenu && typeof document !== 'undefined' && createPortal(
                  <div
                    className="fixed z-[9999] bg-background border border-border/60 rounded-lg py-1 shadow-xl min-w-[140px]"
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button type="button"
                      onClick={() => { setCtxMenu(null); setCropMode(true); }}
                      className="w-full px-3 py-1.5 text-[12px] text-left text-textMain hover:bg-surfaceHighlight transition-colors flex items-center gap-2">
                      <Crop size={13} /> 截图 (框选裁切)
                    </button>
                    <button type="button"
                      onClick={() => { setCtxMenu(null); setGridMenuOpen(false); setGridSplitSize(2); }}
                      className="w-full px-3 py-1.5 text-[12px] text-left text-textMain hover:bg-surfaceHighlight transition-colors flex items-center gap-2">
                      <Grid2x2 size={13} /> 宫格切分
                    </button>
                    <button type="button"
                      onClick={() => { setCtxMenu(null); setPreviewOpen(true); }}
                      className="w-full px-3 py-1.5 text-[12px] text-left text-textMain hover:bg-surfaceHighlight transition-colors flex items-center gap-2">
                      <ImageIcon size={13} /> 查看大图
                    </button>
                    <a href={fullImageUrl} download
                      onClick={() => setCtxMenu(null)}
                      className="block w-full px-3 py-1.5 text-[12px] text-left text-textMain hover:bg-surfaceHighlight transition-colors flex items-center gap-2">
                      <Download size={13} /> 下载原图
                    </a>
                  </div>,
                  document.body
                )}
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
                  <button type="button" onClick={() => setEditorOpen(true)}
                    className="nodrag text-textMuted/50 hover:text-textMain transition-colors" title="多宫格编辑">
                    <Layers size={11} />
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
                            className={`nodrag block w-full px-3 py-1.5 text-[11px] text-left hover:bg-canvasNode transition-colors ${
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
                      <span className="text-[10px]">{effectiveRatio} · {effectiveResOptions.find(r => r.value === effectiveResolution)?.label ?? '标准'}</span>
                      <ChevronDown size={10} />
                    </button>
                    {showSizePicker && (
                      <div className="nodrag absolute top-full right-0 mt-1 bg-background border border-border/40 rounded-xl p-2.5 z-50 min-w-[200px] shadow-xl">
                        <div className="text-[10px] text-textMuted/60 mb-1">宽高比</div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {capabilityState.effectiveRatios.map((r: string) => (
                            <button key={r} type="button"
                              onClick={() => updateNodeData(props.id, { ...data, aspectRatio: r })}
                              className={`px-2 py-0.5 rounded-md text-[10px] transition-colors ${
                                effectiveRatio === r ? 'bg-accent/20 text-accent font-medium' : 'bg-canvasNode/50 text-textMuted hover:text-textMain'
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
                                    effectiveResolution === r.value ? 'bg-accent/20 text-accent font-medium' : 'bg-canvasNode/50 text-textMuted hover:text-textMain'
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

      {/* Crop overlay — full-screen portal for drag selection */}
      {cropMode && hasImage && (
        <ImageCropOverlay
          thumbUrl={fullImageUrl || data.lastImage!}
          fullUrl={fullImageUrl || data.lastImage!}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropMode(false)}
        />
      )}

      {gridSplitSize && hasImage && (
        <ImageGridSplitPicker
          fullUrl={fullImageUrl || data.lastImage!}
          gridSize={gridSplitSize}
          onCancel={() => {
            setGridSplitSize(null);
            setToolbarPinned(false);
          }}
          onConfirm={handleGridSplitConfirm}
        />
      )}

      {/* Grid Editor Modal */}
      {editorOpen && (
        <ImageGridEditorModal
          initialImage={fullImageUrl || data.lastImage}
          onClose={() => setEditorOpen(false)}
          onSave={(url, nodeId) => {
            updateNodeData(props.id, {
              ...dataRef.current,
              lastImage: url,
              lastImageFull: url,
              isProcessing: false,
              progress: 100,
              error: undefined,
            });
          }}
        />
      )}
    </>
  );
}
