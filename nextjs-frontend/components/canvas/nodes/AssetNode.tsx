'use client';

/**
 * AssetNode — displays a project asset (image/video/etc.) on the canvas.
 * UI unified with ImageOutputNode: title bar, thumbnail, bottom pill bar.
 * Supports multi-image navigation for assets with multiple resources.
 * Auto-fetches resources from backend if assetId present but no images loaded.
 * Double-click thumbnail to preview full-size image.
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { AssetNodeData } from '@/lib/canvas/types';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import { Package, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const HANDLE_STYLE: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 9999,
  background: '#374151', border: '3px solid #1f2937',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 700, color: '#9ca3af',
  top: '50%', zIndex: 30,
};

export default function AssetNode(props: NodeProps) {
  const data = props.data as unknown as AssetNodeData;
  const selected = Boolean(props.selected);
  const { expand, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const fetchedRef = useRef(false);

  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, d: any) => void;

  // Auto-fetch resources if assetId exists but no thumbnail/resources loaded
  useEffect(() => {
    if (fetchedRef.current) return;
    if (!data.assetId || data.thumbnail || (data.resources && data.resources.length > 0)) return;
    fetchedRef.current = true;
    setFetching(true);
    (async () => {
      try {
        const res = await fetch(`/api/assets/${encodeURIComponent(data.assetId)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const asset = json.data;
        if (!asset) return;
        const resources = (asset.resources || [])
          .filter((r: any) => r.meta_data?.file_node_id)
          .map((r: any) => ({
            thumbnail: `/api/vfs/nodes/${r.meta_data.file_node_id}/thumbnail`,
            download: `/api/vfs/nodes/${r.meta_data.file_node_id}/download`,
          }));
        if (resources.length > 0) {
          updateNodeData(props.id, {
            ...data,
            thumbnail: resources[0].thumbnail,
            resources,
            activeResourceIndex: 0,
          });
        }
      } catch (e) {
        console.error('[AssetNode] Failed to fetch resources:', e);
      } finally {
        setFetching(false);
      }
    })();
  }, [data.assetId, data.thumbnail, data.resources, props.id, updateNodeData, data]);

  // Compute active image
  const resources = data.resources || [];
  const activeIdx = Math.min(data.activeResourceIndex ?? 0, Math.max(0, resources.length - 1));
  const activeImg = resources.length > 0 ? resources[activeIdx] : null;
  const displayThumbnail = activeImg?.thumbnail || data.thumbnail;
  const displayDownload = activeImg?.download || data.thumbnail;
  const hasImage = !!displayThumbnail;
  const hasMultiple = resources.length > 1;

  const goNext = () => {
    if (!hasMultiple) return;
    const next = (activeIdx + 1) % resources.length;
    updateNodeData(props.id, { ...data, activeResourceIndex: next, thumbnail: resources[next].thumbnail });
  };
  const goPrev = () => {
    if (!hasMultiple) return;
    const prev = (activeIdx - 1 + resources.length) % resources.length;
    updateNodeData(props.id, { ...data, activeResourceIndex: prev, thumbnail: resources[prev].thumbnail });
  };

  // Icon mode
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border ${
          selected ? 'border-primary/50' : 'border-border/70'
        } bg-background/95`}
        title={data.name || '资产'}
      >
        <span className="text-base leading-none">📦</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); expand(); }}
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-border text-textMuted text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">+</button>
      </div>
    );
  }

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={280} minHeight={120}
        lineClassName="!border-primary/30"
        handleClassName="!w-2 !h-2 !bg-textMuted !border-background !border-2 !rounded-sm" />

      <Handle id="out" type="source" position={Position.Right}
        className="node-handle-out"
        style={HANDLE_STYLE}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>

      {/* Invisible outer wrapper */}
      <div className="group relative" style={{ width: props.width || 400 }}>
        {/* Visible card */}
        <div className={`rounded-xl border overflow-hidden relative ${
          selected ? 'border-primary/50 bg-background/95' : 'border-border/70 bg-background/95'
        }`}>

          {/* Title bar */}
          <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <Package size={12} className="text-textMuted" />
              <span className="text-[11px] text-textMuted truncate max-w-[200px]">{data.name || '资产'}</span>
            </div>
            <span className="text-[10px] text-textMuted/60">{data.assetType}</span>
          </div>

          {fetching ? (
            /* Loading state */
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-textMuted/40" />
            </div>
          ) : hasImage ? (
            /* Image display with navigation */
            <div className="relative px-2 pb-1.5">
              <img src={displayThumbnail} alt={data.name}
                className="w-full rounded-lg object-contain cursor-zoom-in"
                style={{ maxHeight: 400 }}
                onDoubleClick={() => setPreviewOpen(true)}
              />
              {/* Multi-image navigation overlay */}
              {hasMultiple && (
                <>
                  <button type="button" onClick={goPrev}
                    className="nodrag absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100">
                    <ChevronLeft size={14} />
                  </button>
                  <button type="button" onClick={goNext}
                    className="nodrag absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100">
                    <ChevronRight size={14} />
                  </button>
                  {/* Page indicator */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
                    {resources.map((_, i) => (
                      <button key={i} type="button"
                        onClick={() => updateNodeData(props.id, { ...data, activeResourceIndex: i, thumbnail: resources[i].thumbnail })}
                        className={`nodrag w-1.5 h-1.5 rounded-full transition-all ${
                          i === activeIdx ? 'bg-white w-3' : 'bg-white/40 hover:bg-white/60'
                        }`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* No image placeholder */
            <div className="flex items-center justify-center py-6">
              <div className="flex flex-col items-center gap-2 text-textMuted/40">
                <Package size={32} />
                <span className="text-xs">{data.assetType || '无预览'}</span>
              </div>
            </div>
          )}

          {/* Bottom pill bar */}
          <div className="flex items-center justify-center px-3 pb-2 shrink-0">
            <div className="flex items-center gap-2 bg-surface/80 backdrop-blur rounded-full px-3 py-1 border border-border/30 text-[11px]">
              <span className="text-textMuted">{data.assetType}</span>
              {data.category && (
                <>
                  <span className="text-textMuted/20">·</span>
                  <span className="text-textMuted">{data.category}</span>
                </>
              )}
              {hasMultiple && (
                <>
                  <span className="text-textMuted/20">·</span>
                  <span className="text-textMuted/60">{activeIdx + 1}/{resources.length}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-size preview lightbox */}
      {previewOpen && hasImage && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center cursor-zoom-out backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}>
          <img src={displayDownload || displayThumbnail} alt={data.name} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>,
        document.body
      )}
    </>
  );
}
