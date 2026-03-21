/**
 * 宫格单元格组件
 * 包含多个图片层，支持拖拽和缩放
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { GridCellProps, GridItem } from '../types/grid';
import GridImage from './GridImage';

interface ExtendedGridCellProps extends GridCellProps {
  onUploadClick?: () => void;
  draggingItemId?: string | null;
  zoomingItemId?: string | null;
  onImageDragStart?: (e: React.MouseEvent, item: GridItem) => void;
  onImageZoomStart?: (e: React.MouseEvent, item: GridItem) => void;
  onImageWheelZoom?: (e: React.WheelEvent, item: GridItem) => void;
  onImageDoubleClick?: (item: GridItem) => void;
}

export const GridCell = React.memo(function GridCell({
  cellKey,
  row,
  col,
  items,
  isActive,
  onSelect,
  onItemUpdate,
  onItemSelect,
  selectedItemIdx,
  onUploadClick,
  draggingItemId,
  zoomingItemId,
  onImageDragStart,
  onImageZoomStart,
  onImageWheelZoom,
  onImageDoubleClick,
}: ExtendedGridCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);

  // 更新单元格尺寸
  useEffect(() => {
    if (cellRef.current) {
      const updateRect = () => {
        setCellRect(cellRef.current?.getBoundingClientRect() ?? null);
      };
      updateRect();
      
      // 监听尺寸变化
      const resizeObserver = new ResizeObserver(updateRect);
      resizeObserver.observe(cellRef.current);
      
      return () => resizeObserver.disconnect();
    }
  }, []);

  // 处理单元格点击
  const handleClick = useCallback((e: React.MouseEvent) => {
    // 如果点击的是图片，不触发单元格选择
    if ((e.target as HTMLElement).closest('.grid-image-container')) {
      return;
    }

    if (items.length === 0 && onUploadClick) {
      onSelect(cellKey);
      onUploadClick();
      return;
    }

    onSelect(cellKey);
  }, [cellKey, items.length, onSelect, onUploadClick]);

  // 处理图片更新
  const handleImageUpdate = useCallback((itemId: string, updates: Partial<GridItem>) => {
    onItemUpdate(itemId, updates);
  }, [onItemUpdate]);

  // 渲染空单元格提示
  const renderEmptyPrompt = () => {
    if (items.length > 0) return null;
    
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(cellKey);
          onUploadClick?.();
        }}
        className="absolute inset-0 border border-white/20 bg-accent/8 hover:bg-accent/12 transition-colors flex flex-col items-center justify-center gap-3 text-accent shadow-inner"
        aria-label="点击上传图片"
      >
        <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent flex items-center justify-center text-accent shadow-lg shadow-accent/20">
          <Plus size={22} />
        </div>
        <div className="text-sm font-semibold">点击上传图片</div>
      </button>
    );
  };

  return (
    <div
      ref={cellRef}
      className={`
        relative overflow-hidden cursor-pointer
        w-full h-full min-h-[160px]
        transition-all duration-200 ease-out
        ${isActive 
          ? 'ring-2 ring-inset ring-accent z-10 shadow-lg shadow-accent/20' 
          : 'bg-white/5 border border-white/20'
        }
        ${items.length === 0 ? 'group' : ''}
      `}
      style={{
        backgroundColor: isActive ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
      }}
      onClick={handleClick}
    >
      {/* 图片层 */}
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="grid-image-container absolute inset-0"
          style={{ zIndex: idx }}
        >
          <GridImage
            item={item}
            idx={idx}
            isSelected={selectedItemIdx === idx}
            cellWidth={cellRect?.width ?? 0}
            cellHeight={cellRect?.height ?? 0}
            onSelect={() => onItemSelect(idx)}
            onUpdate={(updates) => handleImageUpdate(item.id, updates)}
            isDragging={draggingItemId === item.id}
            isZooming={zoomingItemId === item.id}
            onDragStart={onImageDragStart}
            onZoomStart={onImageZoomStart}
            onWheelZoom={onImageWheelZoom}
            onDoubleClick={onImageDoubleClick}
          />
        </div>
      ))}

      {/* 空单元格提示 */}
      {renderEmptyPrompt()}

      {/* 基础宫格线 */}
      <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10" />

      {/* 选中时的边框效果 */}
      {isActive && items.length === 0 && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-accent" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-accent" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-accent" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-accent" />
        </div>
      )}
    </div>
  );
});

export default GridCell;
