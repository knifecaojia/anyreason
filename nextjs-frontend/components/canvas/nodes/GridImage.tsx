/**
 * 宫格图片组件
 * 支持拖拽移动和中键滚轮缩放
 */

import React, { memo, useRef, useCallback } from 'react';
import type { GridImageProps, GridItem } from '../types/grid';
import { percentToTransform } from '../utils/gridMath';

interface ExtendedGridImageProps extends GridImageProps {
  onDragStart?: (e: React.MouseEvent, item: GridItem) => void;
  onZoomStart?: (e: React.MouseEvent, item: GridItem) => void;
  onWheelZoom?: (e: React.WheelEvent, item: GridItem) => void;
  isDragging?: boolean;
  isZooming?: boolean;
}

const GridImage: React.FC<ExtendedGridImageProps> = ({
  item,
  idx,
  isSelected,
  onSelect,
  onDragStart,
  onZoomStart,
  onWheelZoom,
  onDoubleClick,
  isDragging = false,
  isZooming = false,
}) => {
  const imgRef = useRef<HTMLDivElement>(null);

  // 处理鼠标按下事件
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 左键 - 拖拽
    if (e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      onDragStart?.(e, item);
    }
  }, [item, onSelect, onDragStart]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    onWheelZoom?.(e, item);
  }, [item, onWheelZoom]);

  // 处理双击事件
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // TODO: 触发编辑模式
    onDoubleClick?.(item);
  }, [item, onDoubleClick]);

  // 计算transform样式
  const transformStyle = percentToTransform(item.x, item.y, item.scale, item.rotation ?? 0);

  // 构建className
  const className = `
    absolute inset-0 overflow-hidden
    cursor-move select-none
    transition-shadow duration-200
    ${isDragging ? 'opacity-80 z-50' : 'opacity-100'}
    ${isZooming ? 'ring-2 ring-accent ring-offset-2' : ''}
    ${isSelected ? 'ring-2 ring-accent/50' : ''}
  `.trim().replace(/\s+/g, ' ');

  return (
    <div
      ref={imgRef}
      className={className}
      style={{
        transform: transformStyle,
        zIndex: idx,
        willChange: isDragging ? 'transform' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      data-item-id={item.id}
      role="button"
      tabIndex={0}
      aria-label={`图片 ${idx + 1}，位置 ${item.x.toFixed(0)}%, ${item.y.toFixed(0)}%，缩放 ${Math.round(item.scale * 100)}%`}
    >
      <img
        src={item.url}
        alt={`Layer ${idx + 1}`}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
    </div>
  );
};

export default memo(GridImage);
