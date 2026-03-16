'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Save, Trash2, Layers, Upload, Plus, Minus, 
  Maximize, Minimize, ChevronUp, ChevronDown, 
  Crop as CropIcon, Image as ImageIcon, Loader2, Download
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import ImageCropOverlay from './ImageCropOverlay';

interface GridItem {
  id: string;
  url: string;
  x: number;
  y: number;
  scale: number;
  zIndex: number;
}

interface CellContent {
  items: GridItem[];
}

interface ImageGridEditorModalProps {
  initialImage?: string;
  onSave: (url: string, fileNodeId: string) => void;
  onClose: () => void;
}

const ASPECT_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
];

export default function ImageGridEditorModal({ initialImage, onSave, onClose }: ImageGridEditorModalProps) {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [cells, setCells] = useState<Record<string, CellContent>>({});
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Ref for the cell currently being uploaded to, to avoid state race conditions
  const targetUploadCellRef = useRef<string | null>(null);
  
  // Crop related state
  const [cropTarget, setCropTarget] = useState<{ url: string; cellKey: string } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Initialize cells if not present
  useEffect(() => {
    setCells(prev => {
      const newCells = { ...prev };
      let changed = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r}-${c}`;
          if (!newCells[key]) {
            newCells[key] = { items: [] };
            changed = true;
          }
        }
      }
      return changed ? newCells : prev;
    });
  }, [rows, cols]);

  // Auto-select first cell when grid is ready and no cell is selected
  useEffect(() => {
    const cellKeys = Object.keys(cells);
    if (cellKeys.length > 0 && !selectedCell) {
      setSelectedCell(cellKeys[0]);
      setSelectedItemIdx(null);
    }
  }, [cells, selectedCell]);

  const handleAddImage = useCallback((url: string, cellKey: string) => {
    console.log('========== [ImageGridEditor] handleAddImage START ==========');
    console.log('[ImageGridEditor] handleAddImage called with:', { url, cellKey });
    console.log('[ImageGridEditor] current cells state:', JSON.stringify(cells, (k, v) => k === 'url' ? '[URL]' : v, 2));
    const id = Math.random().toString(36).substr(2, 9);
    
    setCells(prev => {
      console.log('[ImageGridEditor] setCells callback - prev keys:', Object.keys(prev));
      console.log('[ImageGridEditor] target cellKey:', cellKey);
      console.log('[ImageGridEditor] prev[cellKey]:', prev[cellKey]);
      
      const cell = prev[cellKey] || { items: [] };
      const newItem: GridItem = {
        id,
        url,
        x: 0,
        y: 0,
        scale: 1,
        zIndex: cell.items.length,
      };
      const updatedItems = [...cell.items, newItem];
      console.log('[ImageGridEditor] Updating cell', cellKey, 'with', updatedItems.length, 'items, newItem.id:', id);
      
      const newState = {
        ...prev,
        [cellKey]: { items: updatedItems }
      };
      console.log('[ImageGridEditor] new cells state keys:', Object.keys(newState));
      console.log('[ImageGridEditor] newState[cellKey]:', newState[cellKey]);
      return newState;
    });

    // Update selection AFTER state update triggers re-render
    setSelectedCell(cellKey);
    // Use a small delay to ensure the cells state has been updated before we try to select based on its length
    // Actually, we can just set it to the new length - 1 if we know what it will be.
    // But since we don't have the current state here easily, we'll let the next render handle it via an effect or similar.
    // For now, let's just use a simple state update.
    setSelectedItemIdx(null); // Reset first to avoid stale index issues
  }, []);

  // Effect to auto-select the latest item when a cell's items change
  useEffect(() => {
    if (selectedCell) {
        const count = cells[selectedCell]?.items.length || 0;
        if (count > 0 && selectedItemIdx === null) {
            setSelectedItemIdx(count - 1);
        }
    }
  }, [cells, selectedCell, selectedItemIdx]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const cellKey = targetUploadCellRef.current;
    console.log('========== [ImageGridEditor] handleUpload START ==========');
    console.log('[ImageGridEditor] targetUploadCellRef.current:', cellKey);
    console.log('[ImageGridEditor] selectedCell (state):', selectedCell);
    console.log('[ImageGridEditor] fileName:', file?.name);
    console.log('[ImageGridEditor] cells state keys:', Object.keys(cells));
    
    if (!file) {
      console.warn('[ImageGridEditor] No file selected');
      return;
    }
    if (!cellKey) {
      console.error('[ImageGridEditor] ERROR: cellKey is null! selectedCell is:', selectedCell);
      alert('请先点击选择一个宫格单元格');
      return;
    }
    
    // 直接上传并添加到单元格，不需要裁剪
    console.log('[ImageGridEditor] Directly uploading file to cell:', cellKey);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      console.log('[ImageGridEditor] Directly uploading to /api/vfs/files/upload');
      const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
      console.log('[ImageGridEditor] Direct upload response status:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Upload failed: ${res.status} - ${errorText}`);
      }
      const json = await res.json();
      console.log('[ImageGridEditor] Direct upload response JSON:', json);
      const nodeId = json.data?.id;
      if (nodeId) {
        const url = `/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`;
        console.log('[ImageGridEditor] Direct upload SUCCESS, calling handleAddImage with:', { url, cellKey });
        handleAddImage(url, cellKey);
        console.log('[ImageGridEditor] Direct upload complete, END ==========');
      } else {
        console.error('[ImageGridEditor] Direct upload - No nodeId in response:', json);
        alert('上传失败：服务器返回的数据无效');
      }
    } catch (err) {
      console.error('[ImageGridEditor] Direct upload failed:', err);
      alert('上传图片失败，请重试');
    } finally {
      setIsSaving(false);
    }
    e.target.value = '';
  }, []);

  // Pre-fill initial image
  useEffect(() => {
    if (initialImage && !initializedRef.current && Object.keys(cells).length > 0) {
      initializedRef.current = true;
      console.log('[ImageGridEditor] Initializing with initialImage');
      handleAddImage(initialImage, '0-0');
    }
  }, [initialImage, cells, handleAddImage]);

  const onCropConfirm = useCallback(async (blob: Blob) => {
    if (!cropTarget) {
      console.error('[ImageGridEditor] onCropConfirm: cropTarget is null!');
      return;
    }
    const { url: cropUrl, cellKey } = cropTarget;
    console.log('========== [ImageGridEditor] onCropConfirm START ==========');
    console.log('[ImageGridEditor] cropTarget:', cropTarget);
    console.log('[ImageGridEditor] cellKey:', cellKey);
    console.log('[ImageGridEditor] cropUrl:', cropUrl);
    
    try {
      const formData = new FormData();
      formData.append('file', blob, `crop_${Date.now()}.png`);
      console.log('[ImageGridEditor] Uploading to /api/vfs/files/upload');
      const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
      console.log('[ImageGridEditor] Upload response status:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Upload failed: ${res.status} - ${errorText}`);
      }
      const json = await res.json();
      console.log('[ImageGridEditor] Upload response JSON:', json);
      const nodeId = json.data?.id;
      if (nodeId) {
        const url = `/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`;
        console.log('[ImageGridEditor] SUCCESS - Calling handleAddImage with:', { url, cellKey });
        handleAddImage(url, cellKey);
        console.log('[ImageGridEditor] handleAddImage called, onCropConfirm END ==========');
      } else {
        console.error('[ImageGridEditor] ERROR: No nodeId in response:', json);
        alert('上传失败：服务器返回的数据无效');
      }
    } catch (err) {
      console.error('[ImageGridEditor] Upload failed:', err);
      alert('上传图片失败，请重试');
    } finally {
      setCropTarget(null);
    }
  }, [cropTarget, handleAddImage]);

  const handleUpdateItem = useCallback((cellKey: string, idx: number, updates: Partial<GridItem>) => {
    setCells(prev => {
      const cell = prev[cellKey];
      if (!cell || !cell.items[idx]) return prev;
      const newItems = [...cell.items];
      newItems[idx] = { ...newItems[idx], ...updates };
      return { ...prev, [cellKey]: { items: newItems } };
    });
  }, []);

  const handleMoveLayer = useCallback((cellKey: string, idx: number, direction: 'up' | 'down') => {
    setCells(prev => {
      const cell = prev[cellKey];
      if (!cell) return prev;
      const items = [...cell.items];
      let newIdx = idx;
      if (direction === 'up' && idx < items.length - 1) {
        [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
        newIdx = idx + 1;
      } else if (direction === 'down' && idx > 0) {
        [items[idx], items[idx - 1]] = [items[idx - 1], items[idx]];
        newIdx = idx - 1;
      } else {
          return prev;
      }
      setSelectedItemIdx(newIdx); // This is fine here as it's not inside a nested state setter anymore if we are careful
      return { ...prev, [cellKey]: { items } };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!gridRef.current) return;
    setIsSaving(true);
    try {
      // Hide controls/outlines before capture
      const dataUrl = await htmlToImage.toPng(gridRef.current, {
        pixelRatio: 2,
        quality: 1,
      });
      
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
    } catch (err) {
      console.error('Export failed:', err);
      alert('保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  }, [onSave, onClose]);

  const selectedItem = selectedCell && selectedItemIdx !== null ? cells[selectedCell]?.items[selectedItemIdx] : null;

  // Debug: log cells state changes
  useEffect(() => {
    console.log('[ImageGridEditor] cells state updated:', Object.keys(cells).map(k => `${k}:${cells[k]?.items?.length || 0}个`));
  }, [cells]);

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black/90 flex flex-col backdrop-blur-md text-textMain">
      {/* Header */}
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
                <button onClick={() => setRows(Math.max(1, rows - 1))} className="p-1 hover:text-textMain"><Minus size={14}/></button>
                <span className="w-8 text-center text-textMain font-medium">{rows}行</span>
                <button onClick={() => setRows(Math.min(5, rows + 1))} className="p-1 hover:text-textMain"><Plus size={14}/></button>
              </div>
              <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1 border border-border/20">
                <button onClick={() => setCols(Math.max(1, cols - 1))} className="p-1 hover:text-textMain"><Minus size={14}/></button>
                <span className="w-8 text-center text-textMain font-medium">{cols}列</span>
                <button onClick={() => setCols(Math.min(5, cols + 1))} className="p-1 hover:text-textMain"><Plus size={14}/></button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span>比例:</span>
              <div className="flex gap-1">
                {ASPECT_RATIOS.map(ar => (
                  <button 
                    key={ar.label}
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
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl hover:bg-white/10 text-textMuted transition-colors flex items-center gap-2"
          >
            <X size={18} /> 取消
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white font-medium transition-colors flex items-center gap-2 shadow-lg shadow-accent/20"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            完成并入库
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Assets & Tools */}
        <div className="w-80 border-r border-border/40 bg-surface/30 p-4 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-4">当前单元格</h3>
            {selectedCell ? (
              <div className="space-y-4">
                <div className="bg-background/40 rounded-xl p-4 border border-border/20">
                  <div className="text-sm font-medium mb-3 flex items-center justify-between">
                    <span>图层 ({cells[selectedCell]?.items.length || 0})</span>
                    <button 
                      onClick={() => {
                        const targetCell = selectedCell || Object.keys(cells)[0];
                        if (targetCell) {
                          setSelectedCell(targetCell);
                          targetUploadCellRef.current = targetCell;
                          setTimeout(() => uploadInputRef.current?.click(), 50);
                        }
                      }}
                      className="p-1 hover:text-accent transition-colors"
                      title="添加图片"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[...(cells[selectedCell]?.items || [])].reverse().map((item, reverseIdx, arr) => {
                      const idx = arr.length - 1 - reverseIdx;
                      return (
                        <div 
                          key={item.id}
                          onClick={() => setSelectedItemIdx(idx)}
                          className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${
                            selectedItemIdx === idx ? 'bg-accent/10 border-accent/40' : 'bg-black/20 border-transparent hover:border-border/40'
                          }`}
                        >
                          <img src={item.url} className="w-10 h-10 rounded object-cover border border-white/10" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs truncate text-textMain font-medium">Layer {idx + 1}</div>
                          </div>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleMoveLayer(selectedCell, idx, 'up'); }}
                              className="p-1 hover:text-textMain"
                              title="上移 (置前)"
                            ><ChevronUp size={14}/></button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleMoveLayer(selectedCell, idx, 'down'); }}
                              className="p-1 hover:text-textMain"
                              title="下移 (置后)"
                            ><ChevronDown size={14}/></button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setCells(prev => ({
                                  ...prev,
                                  [selectedCell]: { items: prev[selectedCell].items.filter((_, i) => i !== idx) }
                                }));
                                if (selectedItemIdx === idx) setSelectedItemIdx(null);
                              }}
                              className="p-1 hover:text-red-400"
                              title="删除图层"
                            ><Trash2 size={14}/></button>
                          </div>
                        </div>
                      );
                    })}
                    {(!cells[selectedCell]?.items.length) && (
                      <div className="text-center py-8 border border-dashed border-border/20 rounded-lg">
                        <button 
                          onClick={() => uploadInputRef.current?.click()}
                          className="text-xs text-textMuted hover:text-accent transition-colors flex flex-col items-center gap-2"
                        >
                          <Upload size={20} />
                          点击上传图片
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {selectedItem && (
                  <div className="bg-background/40 rounded-xl p-4 border border-border/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">变换</div>
                      <button 
                        onClick={() => handleUpdateItem(selectedCell, selectedItemIdx!, { scale: 1, x: 0, y: 0 })}
                        className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded hover:bg-accent/30 transition-colors"
                      >
                        铺满
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-textMuted">缩放</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleUpdateItem(selectedCell, selectedItemIdx!, { scale: Math.max(0.1, selectedItem.scale - 0.1) })} className="p-1 hover:text-textMain"><Minimize size={14}/></button>
                          <span className="w-10 text-center font-mono">{(selectedItem.scale * 100).toFixed(0)}%</span>
                          <button onClick={() => handleUpdateItem(selectedCell, selectedItemIdx!, { scale: Math.min(5, selectedItem.scale + 0.1) })} className="p-1 hover:text-textMain"><Maximize size={14}/></button>
                        </div>
                      </div>
                      <input 
                          type="range" min="10" max="500" value={selectedItem.scale * 100}
                          onChange={(e) => handleUpdateItem(selectedCell, selectedItemIdx!, { scale: parseInt(e.target.value) / 100 })}
                          className="w-full accent-accent h-1.5 rounded-lg appearance-none bg-border/40 cursor-pointer"
                        />
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-textMuted">位置 X</span>
                        <span className="font-mono">{selectedItem.x}%</span>
                      </div>
                      <input 
                        type="range" min="-100" max="100" value={selectedItem.x}
                        onChange={(e) => handleUpdateItem(selectedCell, selectedItemIdx!, { x: parseInt(e.target.value) })}
                        className="w-full accent-accent h-1.5 rounded-lg appearance-none bg-border/40 cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-textMuted">位置 Y</span>
                        <span className="font-mono">{selectedItem.y}%</span>
                      </div>
                      <input 
                        type="range" min="-100" max="100" value={selectedItem.y}
                        onChange={(e) => handleUpdateItem(selectedCell, selectedItemIdx!, { y: parseInt(e.target.value) })}
                        className="w-full accent-accent h-1.5 rounded-lg appearance-none bg-border/40 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-textMuted">
                <ImageIcon size={40} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="text-xs text-center">点击右侧网格单元<br/>开始编辑</p>
              </div>
            )}
          </div>
        </div>

        {/* Center: Canvas Area */}
        <div className="flex-1 bg-black/40 p-12 flex items-center justify-center overflow-hidden">
          <div 
            className="shadow-2xl shadow-black/80 relative transition-all duration-300"
            style={{
              width: `min(calc(100vw - 400px), calc((100vh - 200px) * ${aspectRatio}))`,
              aspectRatio: aspectRatio,
            }}
          >
            <div 
              ref={gridRef}
              className="w-full h-full grid bg-surface border border-white/5 overflow-hidden"
              style={{
                gridTemplateRows: `repeat(${rows}, 1fr)`,
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: '1px',
                background: 'rgba(255,255,255,0.05)',
              }}
            >
              {rows > 0 && Array.from({ length: rows * cols }).map((_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const key = `${r}-${c}`;
                const isActive = selectedCell === key;
                const cellItems = cells[key]?.items || [];
                
                if (i === 0) {
                  console.log('[ImageGridEditor] ===== GRID RENDER START =====');
                  console.log('[ImageGridEditor] rows:', rows, 'cols:', cols);
                  console.log('[ImageGridEditor] cells state:', JSON.stringify(
                    Object.keys(cells).reduce((acc, k) => {
                      acc[k] = cells[k]?.items?.length || 0;
                      return acc;
                    }, {} as Record<string, number>)
                  ));
                  console.log('[ImageGridEditor] selectedCell:', selectedCell);
                  console.log('[ImageGridEditor] RENDER cell:', key, 'isActive:', isActive, 'cellItems count:', cellItems.length);
                }
                
                return (
                  <div 
                    key={key}
                    onClick={(e) => {
                      const isPlusClick = (e.target as HTMLElement).closest('.plus-trigger');
                      setSelectedCell(key);
                      setSelectedItemIdx(cellItems.length > 0 ? 0 : null);
                      
                      // Always update target cell for upload - this ensures we can always upload
                      targetUploadCellRef.current = key;
                      
                      // Trigger upload when clicking on an empty cell or explicitly on plus button
                      if (!cellItems.length || isPlusClick) {
                        setTimeout(() => uploadInputRef.current?.click(), 50);
                      }
                    }}
                    className={`relative group bg-surfaceHighlight overflow-hidden cursor-pointer transition-all duration-200 ${
                      isActive ? 'ring-2 ring-inset ring-accent z-10 shadow-lg shadow-accent/20' : 'hover:bg-white/5 border border-white/5'
                    }`}
                  >
                    {cellItems.map((item, idx) => (
                      <div 
                        key={item.id}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{
                          zIndex: idx,
                          transform: `translate(${item.x}%, ${item.y}%) scale(${item.scale})`,
                        }}
                      >
                        <img 
                          src={item.url} 
                          className="w-full h-full object-cover" 
                          alt={`Layer ${idx + 1}`}
                          onLoad={(e) => {
                            console.log(`[ImageGridEditor] RENDER Image loaded in cell ${key}:`, { idx, url: item.url, naturalWidth: e.currentTarget.naturalWidth });
                          }}
                          onError={() => console.error(`[ImageGridEditor] RENDER Image failed to load in cell ${key}:`, item.url)}
                        />
                      </div>
                    ))}
                    
                    {!cellItems.length && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity plus-trigger">
                         <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent flex items-center justify-center text-accent shadow-lg shadow-accent/20">
                           <Plus size={20} />
                         </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Upload */}
      <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {/* Crop Overlay */}
      {cropTarget && (
        <ImageCropOverlay 
          thumbUrl={cropTarget.url}
          fullUrl={cropTarget.url}
          onConfirm={onCropConfirm}
          onCancel={() => setCropTarget(null)}
          onUseOriginal={async (blob: Blob) => {
            console.log('[ImageGridEditor] onUseOriginal called with blob, uploading directly...');
            try {
              const formData = new FormData();
              formData.append('file', blob, `original_${Date.now()}.png`);
              console.log('[ImageGridEditor] onUseOriginal - uploading to /api/vfs/files/upload');
              const res = await fetch('/api/vfs/files/upload', { method: 'POST', body: formData });
              console.log('[ImageGridEditor] onUseOriginal - upload response status:', res.status);
              if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Upload failed: ${res.status} - ${errorText}`);
              }
              const json = await res.json();
              console.log('[ImageGridEditor] onUseOriginal - upload response JSON:', json);
              const nodeId = json.data?.id;
              if (nodeId) {
                const url = `/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`;
                console.log('[ImageGridEditor] onUseOriginal - SUCCESS, calling handleAddImage with:', { url, cellKey: cropTarget.cellKey });
                handleAddImage(url, cropTarget.cellKey);
                console.log('[ImageGridEditor] onUseOriginal - handleAddImage called, END');
              } else {
                console.error('[ImageGridEditor] onUseOriginal - No nodeId in response:', json);
                alert('上传失败：服务器返回的数据无效');
              }
            } catch (err) {
              console.error('[ImageGridEditor] onUseOriginal - Upload failed:', err);
              alert('上传图片失败，请重试');
            } finally {
              setCropTarget(null);
            }
          }}
        />
      )}
    </div>,
    document.body
  );
}
