'use client';

/**
 * AssetNode — displays a project asset (image/video/etc.) on the canvas.
 * UI unified with ImageOutputNode: title bar, thumbnail, bottom pill bar.
 * Double-click thumbnail to preview full-size image.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { AssetNodeData } from '@/lib/canvas/types';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import { Package } from 'lucide-react';

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
  const hasThumbnail = !!data.thumbnail;
  const [previewOpen, setPreviewOpen] = useState(false);

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

          {hasThumbnail ? (
            <div className="flex flex-col">
              {/* Title bar */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Package size={12} className="text-textMuted" />
                  <span className="text-[11px] text-textMuted truncate max-w-[200px]">{data.name || '资产'}</span>
                </div>
                <span className="text-[10px] text-textMuted/60">{data.assetType}</span>
              </div>
              {/* Thumbnail — object-contain to show full image */}
              <div className="px-2 pb-1.5 flex items-center justify-center">
                <img src={data.thumbnail} alt={data.name}
                  className="w-full rounded-lg object-contain cursor-zoom-in"
                  style={{ maxHeight: 400 }}
                  onDoubleClick={() => setPreviewOpen(true)}
                />
              </div>
              {/* Bottom pill bar */}
              <div className="flex items-center justify-center px-3 pb-2 shrink-0">
                <div className="flex items-center gap-3 bg-surface/80 backdrop-blur rounded-full px-4 py-1.5 border border-border/30 text-xs">
                  <span className="text-textMuted">{data.assetType}</span>
                  {data.category && (
                    <>
                      <span className="text-textMuted/30">|</span>
                      <span className="text-textMuted">{data.category}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* No thumbnail — compact card */
            <div className="flex flex-col" style={{ height: 120 }}>
              {/* Title bar */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Package size={12} className="text-textMuted" />
                  <span className="text-[11px] text-textMuted">{data.name || '资产'}</span>
                </div>
                <span className="text-[10px] text-textMuted/60">{data.assetType}</span>
              </div>
              {/* Placeholder */}
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-textMuted/40">
                  <Package size={32} />
                  <span className="text-xs">{data.assetType || '无预览'}</span>
                </div>
              </div>
              {/* Bottom pill bar */}
              {data.category && (
                <div className="flex items-center justify-center px-3 pb-2 shrink-0">
                  <div className="flex items-center gap-3 bg-surface/80 backdrop-blur rounded-full px-4 py-1.5 border border-border/30 text-xs">
                    <span className="text-textMuted">{data.category}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-size preview lightbox */}
      {previewOpen && hasThumbnail && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center cursor-zoom-out backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}>
          <img src={data.thumbnail} alt={data.name} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>,
        document.body
      )}
    </>
  );
}
