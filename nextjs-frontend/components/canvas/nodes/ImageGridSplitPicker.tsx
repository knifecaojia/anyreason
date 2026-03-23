'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Grid2x2, X } from 'lucide-react';

type TileBlobResult = {
  blob: Blob;
  row: number;
  col: number;
  totalRows: number;
  totalCols: number;
};

type Props = {
  fullUrl: string;
  gridSize: number;
  onCancel: () => void;
  onConfirm: (tiles: TileBlobResult[]) => void;
};

export default function ImageGridSplitPicker({ fullUrl, gridSize, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const cells = useMemo(() => {
    return Array.from({ length: gridSize * gridSize }, (_, index) => ({
      index,
      row: Math.floor(index / gridSize),
      col: index % gridSize,
      key: `${Math.floor(index / gridSize)}-${index % gridSize}`,
    }));
  }, [gridSize]);

  const toggleCell = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selected.size === 0) return;
    setSubmitting(true);

    try {
      const fullImg = new Image();
      if (fullUrl.startsWith('http')) fullImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        fullImg.onload = () => resolve();
        fullImg.onerror = () => reject(new Error('Failed to load full image'));
        fullImg.src = fullUrl;
      });

      const tileWidth = Math.floor(fullImg.naturalWidth / gridSize);
      const tileHeight = Math.floor(fullImg.naturalHeight / gridSize);
      const lastTileWidth = fullImg.naturalWidth - tileWidth * (gridSize - 1);
      const lastTileHeight = fullImg.naturalHeight - tileHeight * (gridSize - 1);

      const results: TileBlobResult[] = [];

      for (const cell of cells) {
        if (!selected.has(cell.key)) continue;

        const sx = cell.col * tileWidth;
        const sy = cell.row * tileHeight;
        const sw = cell.col === gridSize - 1 ? lastTileWidth : tileWidth;
        const sh = cell.row === gridSize - 1 ? lastTileHeight : tileHeight;

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(fullImg, sx, sy, sw, sh, 0, 0, sw, sh);

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value) resolve(value);
            else reject(new Error('Canvas toBlob failed'));
          }, 'image/png');
        });

        results.push({
          blob,
          row: cell.row,
          col: cell.col,
          totalRows: gridSize,
          totalCols: gridSize,
        });
      }

      onConfirm(results);
    } catch (error) {
      console.error('[ImageGridSplitPicker] split failed:', error);
      setSubmitting(false);
    }
  }, [cells, fullUrl, gridSize, onConfirm, selected]);

  return createPortal(
    <div data-image-grid-split-picker className="fixed inset-0 z-[10003] bg-black/70 backdrop-blur-sm flex items-center justify-center" onClick={onCancel}>
      <div className="w-[min(88vw,980px)] max-h-[88vh] overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-textMain">宫格切分</div>
            <div className="text-xs text-textMuted">选择要生成新图片节点的图块（{gridSize}x{gridSize}）</div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border/40 bg-surfaceHighlight/40 p-4">
            <div className="relative max-h-[70vh] max-w-full overflow-hidden rounded-xl">
              <img ref={imgRef} src={fullUrl} alt="Grid split source" className="block max-h-[68vh] max-w-full object-contain rounded-xl" draggable={false} />
              <div
                className="absolute inset-0 grid"
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
                }}
              >
                {cells.map((cell) => {
                  const active = selected.has(cell.key);
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => toggleCell(cell.key)}
                      className={`relative border border-white/35 transition-all ${active ? 'bg-accent/30 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9)]' : 'bg-black/10 hover:bg-white/10'}`}
                    >
                      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                        {cell.row + 1}-{cell.col + 1}
                      </span>
                      {active && (
                        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-lg">
                          <Check size={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-surface/60 p-4">
            <div className="flex items-center gap-2 text-textMain">
              <Grid2x2 size={16} />
              <span className="text-sm font-medium">已选图块</span>
            </div>
            <div className="rounded-xl border border-border/30 bg-background/50 px-3 py-2 text-xs text-textMuted">
              当前选择 <span className="font-semibold text-textMain">{selected.size}</span> 个图块，确认后将创建对应数量的新图片节点。
            </div>
            <div className="flex flex-wrap gap-2">
              {cells.filter((cell) => selected.has(cell.key)).map((cell) => (
                <span key={cell.key} className="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent">
                  图块 {cell.row + 1}-{cell.col + 1}
                </span>
              ))}
              {selected.size === 0 && (
                <span className="text-xs text-textMuted">点击左侧图块进行勾选</span>
              )}
            </div>
            <div className="mt-auto flex items-center gap-2 pt-2">
              <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border/50 px-3 py-2 text-sm text-textMuted hover:bg-surfaceHighlight transition-colors">
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.size === 0 || submitting}
                className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? '生成中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
