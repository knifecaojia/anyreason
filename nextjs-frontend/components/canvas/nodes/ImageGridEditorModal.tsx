/**
 * 多宫格图片编辑器
 * 首批增强：拖拽/中键缩放/双击编辑模式外壳
 */

'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  Trash2,
  Layers,
  Plus,
  Minus,
  ChevronUp,
  ChevronDown,
  Loader2,
  Move,
  MousePointer2,
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';

import type {
  GridItem,
  CellContent,
  EditModeState,
  ImageGridEditorModalProps,
} from '../types/grid';
import { useDraggableImage } from '../hooks/useDraggableImage';
import { useZoomableImage } from '../hooks/useZoomableImage';
import { constrainPosition, getCellKey } from '../utils/gridMath';
import { transformToCSS } from '../utils/transformHelpers';
import GridCell from './GridCell';
import ImageCropOverlay from './ImageCropOverlay';
import ZoomToast from './ZoomToast';

const ASPECT_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
];

function createGridItem(url: string, zIndex: number): GridItem {
  return {
    id: Math.random().toString(36).slice(2, 11),
    url,
    x: 0,
    y: 0,
    scale: 1,
    zIndex,
    rotation: 0,
  };
}

export default function ImageGridEditorModal({ initialImage, onSave, onClose }: ImageGridEditorModalProps) {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [cells, setCells] = useState<Record<string, CellContent>>({});
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editMode, setEditMode] = useState<EditModeState | null>(null);
  const [cropMode, setCropMode] = useState(false);

  const targetUploadCellRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const updateItemById = useCallback((cellKey: string, itemId: string, updates: Partial<GridItem>) => {
    setCells((prev) => {
      const cell = prev[cellKey];
      if (!cell) return prev;

      const index = cell.items.findIndex((item) => item.id === itemId);
      if (index === -1) return prev;

      const nextItems = [...cell.items];
      nextItems[index] = { ...nextItems[index], ...updates };

      return {
        ...prev,
        [cellKey]: { items: nextItems },
      };
    });
  }, []);

  const findItemLocation = useCallback((itemId: string) => {
    for (const [cellKey, cell] of Object.entries(cells)) {
      const itemIdx = cell.items.findIndex((item) => item.id === itemId);
      if (itemIdx !== -1) {
        return { cellKey, itemIdx, item: cell.items[itemIdx] };
      }
    }
    return null;
  }, [cells]);

  const {
    handleDragStart: handleDragStartHook,
    draggingItemId,
  } = useDraggableImage({
    constrainPosition,
    onDragMove: (item, newX, newY) => {
      const location = findItemLocation(item.id);
      if (!location) return;
      updateItemById(location.cellKey, item.id, { x: newX, y: newY });
    },
    onDragEnd: (item, finalX, finalY) => {
      const location = findItemLocation(item.id);
      if (!location) return;
      updateItemById(location.cellKey, item.id, { x: finalX, y: finalY });
    },
  });

  const {
    zoomToast,
    handleZoomStart: handleZoomStartHook,
    handleWheelZoom,
    zoomingItemId,
  } = useZoomableImage({
    minScale: 0.1,
    maxScale: 5,
    zoomStep: 0.1,
    onZoomChange: (item, newScale) => {
      const location = findItemLocation(item.id);
      if (!location) return;
      updateItemById(location.cellKey, item.id, { scale: newScale });
    },
  });

  const handleDragStart = useCallback((e: React.MouseEvent, item: GridItem, cellKey: string) => {
    const cellEl = cellRefs.current.get(cellKey);
    if (!cellEl) return;
    handleDragStartHook(e, item, cellEl.getBoundingClientRect());
  }, [handleDragStartHook]);

  const handleZoomStart = useCallback((e: React.MouseEvent, item: GridItem) => {
    handleZoomStartHook(e, item);
  }, [handleZoomStartHook]);

  useEffect(() => {
    setCells((prev) => {
      const next = { ...prev };
      let changed = false;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const key = getCellKey(r, c);
          if (!next[key]) {
            next[key] = { items: [] };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [rows, cols]);

  useEffect(() => {
    const cellKeys = Object.keys(cells);
    if (cellKeys.length > 0 && !selectedCell) {
      setSelectedCell(cellKeys[0]);
      setSelectedItemIdx(null);
    }
  }, [cells, selectedCell]);

  const handleAddImage = useCallback((url: string, cellKey: string) => {
    setCells((prev) => {
      const cell = prev[cellKey] || { items: [] };
      const nextItems = [...cell.items, createGridItem(url, cell.items.length)];
      return { ...prev, [cellKey]: { items: nextItems } };
    });
    setSelectedCell(cellKey);
    setSelectedItemIdx(null);
  }, []);

  useEffect(() => {
    if (initialImage && !initializedRef.current && Object.keys(cells).length > 0) {
      initializedRef.current = true;
      handleAddImage(initialImage, '0-0');
    }
  }, [cells, handleAddImage, initialImage]);

  useEffect(() => {
    if (!editMode?.isActive) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditMode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editMode]);

  useEffect(() => {
    if (!editMode?.isActive) {
      setCropMode(false);
    }
  }, [editMode]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const cellKey = targetUploadCellRef.current;
    if (!file) return;
    if (!cellKey) {
      alert('请先点击选择一个宫格单元格');
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const json = await res.json();
      const nodeId = json.data?.id;
      if (nodeId) {
        handleAddImage(`/api/vfs/nodes/${encodeURIComponent(nodeId)}/thumbnail`, cellKey);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('上传图片失败，请重试');
    } finally {
      setIsSaving(false);
      e.target.value = '';
    }
  }, [handleAddImage]);

  const handleUpdateItem = useCallback((cellKey: string, idx: number, updates: Partial<GridItem>) => {
    setCells((prev) => {
      const cell = prev[cellKey];
      if (!cell || !cell.items[idx]) return prev;
      const nextItems = [...cell.items];
      nextItems[idx] = { ...nextItems[idx], ...updates };
      return { ...prev, [cellKey]: { items: nextItems } };
    });
  }, []);

  const handleMoveLayer = useCallback((cellKey: string, idx: number, direction: 'up' | 'down') => {
    setCells((prev) => {
      const cell = prev[cellKey];
      if (!cell) return prev;

      const items = [...cell.items];
      let nextIndex = idx;
      if (direction === 'up' && idx < items.length - 1) {
        [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
        nextIndex = idx + 1;
      } else if (direction === 'down' && idx > 0) {
        [items[idx], items[idx - 1]] = [items[idx - 1], items[idx]];
        nextIndex = idx - 1;
      } else {
        return prev;
      }

      setSelectedItemIdx(nextIndex);
      return { ...prev, [cellKey]: { items } };
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedCell || selectedItemIdx === null) return;

    setCells((prev) => {
      const cell = prev[selectedCell];
      if (!cell) return prev;
      return {
        ...prev,
        [selectedCell]: {
          items: cell.items.filter((_, index) => index !== selectedItemIdx),
        },
      };
    });
    setSelectedItemIdx(null);
  }, [selectedCell, selectedItemIdx]);

  const handleCropConfirm = useCallback(async (blob: Blob) => {
    if (!editMode) return;

    setCropMode(false);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, `grid_crop_${Date.now()}.png`);
      const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());

      const json = await res.json();
      const fileNodeId = json?.data?.id as string | undefined;
      if (!fileNodeId) throw new Error('上传裁切图片失败');

      updateItemById(editMode.cellKey, editMode.itemId, {
        url: `/api/vfs/nodes/${encodeURIComponent(fileNodeId)}/download`,
      });
    } catch (error) {
      console.error('[ImageGridEditorModal] crop upload failed:', error);
      alert('裁切图片失败，请重试');
    } finally {
      setIsSaving(false);
    }
  }, [editMode, updateItemById]);

  const handleSave = useCallback(async () => {
    if (!gridRef.current) return;
    setIsSaving(true);
    try {
      const dataUrl = await htmlToImage.toPng(gridRef.current, { pixelRatio: 2, quality: 1 });
      const blob = await (await fetch(dataUrl)).blob();
      const formData = new FormData();
      formData.append('file', blob, `grid_${Date.now()}.png`);
      const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to save to VFS');
      const json = await res.json();
      const nodeId = json.data?.id;
      if (nodeId) {
        onSave(`/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`, nodeId);
        onClose();
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  }, [onClose, onSave]);

  const cellKeys = useMemo(() => {
    const keys: string[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        keys.push(getCellKey(r, c));
      }
    }
    return keys;
  }, [rows, cols]);

  const selectedItems = selectedCell ? (cells[selectedCell]?.items || []) : [];
  const selectedItem = selectedItemIdx !== null ? selectedItems[selectedItemIdx] ?? null : null;
  const editItem = editMode?.isActive
    ? cells[editMode.cellKey]?.items.find((item) => item.id === editMode.itemId) ?? null
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black/90 flex flex-col backdrop-blur-md text-textMain">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-surface/50">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers size={20} className="text-accent" />
            多宫格图片编辑器
          </h2>
          <div className="h-6 w-[1px] bg-border/40 mx-2" />
          <div className="flex items-center gap-4 text-sm text-textMuted">
            <div className="flex items-center gap-2">
              <span>布局:</span>
              <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1 border border-border/20">
                <button type="button" onClick={() => setRows(Math.max(1, rows - 1))} className="p-1 hover:text-textMain"><Minus size={14} /></button>
                <span className="w-8 text-center text-textMain font-medium">{rows}行</span>
                <button type="button" onClick={() => setRows(Math.min(5, rows + 1))} className="p-1 hover:text-textMain"><Plus size={14} /></button>
              </div>
              <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1 border border-border/20">
                <button type="button" onClick={() => setCols(Math.max(1, cols - 1))} className="p-1 hover:text-textMain"><Minus size={14} /></button>
                <span className="w-8 text-center text-textMain font-medium">{cols}列</span>
                <button type="button" onClick={() => setCols(Math.min(5, cols + 1))} className="p-1 hover:text-textMain"><Plus size={14} /></button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span>比例:</span>
              <div className="flex gap-1">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar.label}
                    type="button"
                    onClick={() => setAspectRatio(ar.value)}
                    className={`px-2 py-1 rounded-md text-xs transition-colors ${aspectRatio === ar.value ? 'bg-accent/20 text-accent font-medium' : 'hover:bg-white/5'}`}
                  >
                    {ar.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl hover:bg-white/10 text-textMuted transition-colors flex items-center gap-2">
            <X size={18} /> 取消
          </button>
          <button type="button" onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white font-medium transition-colors flex items-center gap-2 shadow-lg shadow-accent/20">
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            完成并入库
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-border/40 bg-surface/30 p-4 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-4">当前单元格</h3>
            {selectedCell ? (
              <div className="space-y-4">
                <div className="bg-background/40 rounded-xl p-4 border border-border/20">
                  <div className="text-sm font-medium mb-3 flex items-center justify-between">
                    <span>图层 ({selectedItems.length})</span>
                    <button
                      type="button"
                      onClick={() => {
                        const targetCell = selectedCell || Object.keys(cells)[0];
                        if (!targetCell) return;
                        setSelectedCell(targetCell);
                        targetUploadCellRef.current = targetCell;
                        setTimeout(() => uploadInputRef.current?.click(), 50);
                      }}
                      className="p-1 hover:text-accent transition-colors"
                      title="添加图片"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {[...selectedItems].reverse().map((item, reverseIdx, arr) => {
                      const idx = arr.length - 1 - reverseIdx;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemIdx(idx)}
                          className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${selectedItemIdx === idx ? 'bg-accent/10 border-accent/40' : 'bg-black/20 border-transparent hover:border-border/40'}`}
                        >
                          <img src={item.url} alt={`图层 ${idx + 1}`} className="w-10 h-10 rounded object-cover border border-white/10" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-textMain">图层 {idx + 1}</div>
                            <div className="text-xs text-textMuted">{Math.round(item.scale * 100)}% · X {Math.round(item.x)} · Y {Math.round(item.y)}</div>
                          </div>
                          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                            <button type="button" onClick={(event) => { event.stopPropagation(); handleMoveLayer(selectedCell, idx, 'up'); }} className="p-1 hover:text-accent" title="上移图层"><ChevronUp size={16} /></button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); handleMoveLayer(selectedCell, idx, 'down'); }} className="p-1 hover:text-accent" title="下移图层"><ChevronDown size={16} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-textMuted">请选择一个宫格单元格</div>
            )}
          </div>

          {selectedItem && selectedCell && selectedItemIdx !== null && (
            <div className="bg-background/40 rounded-xl p-4 border border-border/20 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider">图片变换</h3>
                <button type="button" onClick={handleDeleteSelected} className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-300" title="删除当前图片"><Trash2 size={16} /></button>
              </div>

              <div className="grid gap-3 text-sm">
                <label className="grid gap-2">
                  <span className="text-textMuted">横向位置</span>
                  <input type="range" min={-50} max={50} step={1} value={selectedItem.x} onChange={(event) => handleUpdateItem(selectedCell, selectedItemIdx, { x: Number(event.target.value) })} />
                </label>
                <label className="grid gap-2">
                  <span className="text-textMuted">纵向位置</span>
                  <input type="range" min={-50} max={50} step={1} value={selectedItem.y} onChange={(event) => handleUpdateItem(selectedCell, selectedItemIdx, { y: Number(event.target.value) })} />
                </label>
                <label className="grid gap-2">
                  <span className="text-textMuted">缩放比例</span>
                  <input type="range" min={0.1} max={5} step={0.1} value={selectedItem.scale} onChange={(event) => handleUpdateItem(selectedCell, selectedItemIdx, { scale: Number(event.target.value) })} />
                </label>
                <label className="grid gap-2">
                  <span className="text-textMuted">旋转角度</span>
                  <input type="range" min={-180} max={180} step={1} value={selectedItem.rotation ?? 0} onChange={(event) => handleUpdateItem(selectedCell, selectedItemIdx, { rotation: Number(event.target.value) })} />
                </label>
              </div>

              <div className="rounded-xl bg-black/20 border border-white/5 p-3 text-xs text-textMuted space-y-2">
                <div className="flex items-center gap-2"><Move size={14} /> 左键拖拽移动图片</div>
                <div className="flex items-center gap-2"><MousePointer2 size={14} /> 中键按住后滚轮缩放</div>
                <div>双击图片进入编辑模式，ESC 可退出</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 p-6 overflow-auto">
          <div className="mx-auto w-full max-w-[calc(100vw-420px)] flex items-center justify-center min-h-full">
            <div
              ref={gridRef}
              className="grid gap-0 border border-border/30 bg-black/20 p-0 shadow-2xl overflow-hidden"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                aspectRatio: `${aspectRatio}`,
                maxWidth: 'min(100%, calc(100vw - 420px))',
                maxHeight: 'calc(100vh - 160px)',
                width: `min(calc((100vh - 160px) * ${aspectRatio}), calc(100vw - 420px))`,
                height: 'auto',
              }}
            >
              {cellKeys.map((cellKey) => {
                const [row, col] = cellKey.split('-').map(Number);
                return (
                  <div
                    key={cellKey}
                    ref={(element) => {
                      if (element) cellRefs.current.set(cellKey, element);
                      else cellRefs.current.delete(cellKey);
                    }}
                    className="relative min-h-[160px] h-full"
                  >
                    <GridCell
                      cellKey={cellKey}
                      row={row}
                      col={col}
                      items={cells[cellKey]?.items || []}
                      isActive={selectedCell === cellKey}
                      onSelect={(key) => {
                        setSelectedCell(key);
                        setSelectedItemIdx(null);
                      }}
                      onItemUpdate={(itemId, updates) => updateItemById(cellKey, itemId, updates)}
                      onItemSelect={setSelectedItemIdx}
                      selectedItemIdx={selectedCell === cellKey ? selectedItemIdx : null}
                      draggingItemId={draggingItemId}
                      zoomingItemId={zoomingItemId}
                      onImageDragStart={(event, item) => handleDragStart(event, item, cellKey)}
                      onImageZoomStart={handleZoomStart}
                      onImageWheelZoom={handleWheelZoom}
                      onUploadClick={() => {
                        setSelectedCell(cellKey);
                        targetUploadCellRef.current = cellKey;
                        setTimeout(() => uploadInputRef.current?.click(), 50);
                      }}
                      onImageDoubleClick={(item) => {
                        const idx = (cells[cellKey]?.items || []).findIndex((candidate) => candidate.id === item.id);
                        setSelectedCell(cellKey);
                        if (idx !== -1) setSelectedItemIdx(idx);
                        setEditMode({ isActive: true, cellKey, itemId: item.id });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {zoomToast && <ZoomToast message={zoomToast} />}

      {editMode?.isActive && editItem && (
        <div className="fixed inset-0 z-[10001] bg-black/95 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div>
              <div className="text-lg font-semibold">编辑模式</div>
              <div className="text-sm text-textMuted">当前提供大图预览、裁切入口、旋转与重置能力。</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCropMode(true)}
                className="px-4 py-2 rounded-xl hover:bg-white/10"
              >
                裁切
              </button>
              <button
                type="button"
                onClick={() => updateItemById(editMode.cellKey, editMode.itemId, { x: 0, y: 0, scale: 1, rotation: 0 })}
                className="px-4 py-2 rounded-xl hover:bg-white/10"
              >
                重置
              </button>
              <button type="button" onClick={() => setEditMode(null)} className="px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent/80">完成</button>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center overflow-hidden p-8">
            <img
              src={editItem.url}
              alt="编辑中的图片"
              className="max-w-full max-h-full object-contain"
              style={{ transform: transformToCSS({ x: editItem.x, y: editItem.y, scale: editItem.scale, rotation: editItem.rotation ?? 0 }) }}
            />
            <div
              className="absolute inset-8 pointer-events-none grid border border-white/20 opacity-20"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {cellKeys.map((key) => (
                <div key={key} className="border border-white/20" />
              ))}
            </div>
          </div>
        </div>
      )}

      {cropMode && editMode?.isActive && editItem && (
        <ImageCropOverlay
          thumbUrl={editItem.url}
          fullUrl={editItem.url}
          onConfirm={(blob) => void handleCropConfirm(blob)}
          onCancel={() => setCropMode(false)}
        />
      )}
    </div>,
    document.body,
  );
}
