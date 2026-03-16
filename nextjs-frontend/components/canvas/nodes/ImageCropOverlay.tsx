'use client';

/**
 * ImageCropOverlay — Drag-select a rectangular region on a thumbnail image,
 * then crop the **original full-resolution** image and return the result.
 *
 * Used by ImageOutputNode to extract sub-images from grid outputs (2x2, 3x3, NxN).
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  /** Thumbnail URL displayed in the node (may be lower resolution) */
  thumbUrl: string;
  /** Full-resolution image URL for actual cropping */
  fullUrl: string;
  /** Called with the cropped image blob + crop dimensions in original pixels */
  onConfirm: (blob: Blob, cropInfo: { x: number; y: number; w: number; h: number }) => void;
  /** Called when user cancels crop */
  onCancel: () => void;
  /** Optional: callback for using original image without cropping */
  onUseOriginal?: (blob: Blob) => void;
}

export default function ImageCropOverlay({ thumbUrl, fullUrl, onConfirm, onCancel, onUseOriginal }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef(false);
  const startPtRef = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<CropRect | null>(null);
  const [cropping, setCropping] = useState(false);

  // Get position relative to the image element, clamped to image bounds
  const getRelativePos = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const r = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(clientX - r.left, r.width)),
      y: Math.max(0, Math.min(clientY - r.top, r.height)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getRelativePos(e.clientX, e.clientY);
    startPtRef.current = pos;
    draggingRef.current = true;
    setRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }, [getRelativePos]);

  // Use window-level listeners so drag continues even if mouse leaves the image
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current || !startPtRef.current) return;
      const pos = getRelativePos(e.clientX, e.clientY);
      const sp = startPtRef.current;
      setRect({
        x: Math.min(sp.x, pos.x),
        y: Math.min(sp.y, pos.y),
        w: Math.abs(pos.x - sp.x),
        h: Math.abs(pos.y - sp.y),
      });
    };
    const handleUp = () => { draggingRef.current = false; };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('keydown', handleKey);
    };
  }, [getRelativePos, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (!rect || rect.w < 5 || rect.h < 5) return;
    const img = imgRef.current;
    if (!img) return;

    setCropping(true);
    try {
      const displayW = img.clientWidth;
      const displayH = img.clientHeight;

      const fullImg = new Image();
      if (fullUrl.startsWith('http')) fullImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        fullImg.onload = () => resolve();
        fullImg.onerror = () => reject(new Error('Failed to load full image'));
        fullImg.src = fullUrl;
      });

      const origW = fullImg.naturalWidth;
      const origH = fullImg.naturalHeight;
      const scaleX = origW / displayW;
      const scaleY = origH / displayH;

      const cropX = Math.round(rect.x * scaleX);
      const cropY = Math.round(rect.y * scaleY);
      const cropW = Math.round(rect.w * scaleX);
      const cropH = Math.round(rect.h * scaleY);

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.drawImage(fullImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');
      });

      onConfirm(blob, { x: cropX, y: cropY, w: cropW, h: cropH });
    } catch (err) {
      console.error('[ImageCropOverlay] crop failed:', err);
      setCropping(false);
    }
  }, [rect, fullUrl, onConfirm]);

  const handleUseOriginal = useCallback(async () => {
    setCropping(true);
    try {
      const fullImg = new Image();
      if (fullUrl.startsWith('http')) fullImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        fullImg.onload = () => resolve();
        fullImg.onerror = () => reject(new Error('Failed to load full image'));
        fullImg.src = fullUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = fullImg.naturalWidth;
      canvas.height = fullImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.drawImage(fullImg, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');
      });

      if (onUseOriginal) {
        onUseOriginal(blob);
      } else {
        onConfirm(blob, { x: 0, y: 0, w: fullImg.naturalWidth, h: fullImg.naturalHeight });
      }
    } catch (err) {
      console.error('[ImageCropOverlay] use original failed:', err);
      setCropping(false);
    }
  }, [fullUrl, onConfirm, onUseOriginal]);

  const hasSelection = rect && rect.w >= 5 && rect.h >= 5;

  // Render as a portal overlay to avoid ReactFlow zoom/pan interference
  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center backdrop-blur-sm"
      onClick={(e) => { if (e.target === containerRef.current) onCancel(); }}
    >
      <div className="relative max-w-[85vw] max-h-[85vh] flex flex-col items-center gap-3">
        {/* Instruction */}
        <div className="text-[13px] text-white/80 bg-black/50 rounded-full px-4 py-1.5 select-none">
          {hasSelection ? '调整选区或确认裁切' : '在图片上拖拽框选要截取的区域'}
        </div>

        {/* Image + selection overlay */}
        <div className="relative select-none" style={{ cursor: 'crosshair' }}>
          <img
            ref={imgRef}
            src={thumbUrl}
            alt="Crop source"
            className="max-w-[80vw] max-h-[75vh] object-contain rounded-lg"
            draggable={false}
            onMouseDown={handleMouseDown}
          />

          {/* Selection rectangle with box-shadow to darken outside */}
          {rect && rect.w > 0 && rect.h > 0 && (
            <div
              className="absolute border-2 border-white/90 rounded-sm pointer-events-none"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              }}
            >
              {/* Size label */}
              {imgRef.current && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-white/70 bg-black/60 rounded px-1.5 py-0.5 whitespace-nowrap tabular-nums">
                  {Math.round(rect.w * (imgRef.current.naturalWidth / imgRef.current.clientWidth))}
                  x
                  {Math.round(rect.h * (imgRef.current.naturalHeight / imgRef.current.clientHeight))}
                  px
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm / Cancel buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={cropping}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-[12px] transition-colors disabled:opacity-50"
          >
            <X size={14} /> 取消
          </button>
          <button
            type="button"
            onClick={handleUseOriginal}
            disabled={cropping}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            直接使用原图
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasSelection || cropping}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-accent hover:bg-accent/80 text-white text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} /> {cropping ? '裁切中...' : '确认截取'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
