/**
 * 图片拖拽 hook
 * 支持鼠标拖拽移动图片位置
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GridItem, DragState } from '../types/grid';

interface UseDraggableImageOptions {
  onDragStart?: (item: GridItem) => void;
  onDragMove?: (item: GridItem, deltaX: number, deltaY: number) => void;
  onDragEnd?: (item: GridItem, finalX: number, finalY: number) => void;
  constrainPosition?: (x: number, y: number) => { x: number; y: number };
}

export function useDraggableImage(options: UseDraggableImageOptions = {}) {
  const { onDragStart, onDragMove, onDragEnd, constrainPosition } = options;
  
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    itemId: null,
    startPos: { x: 0, y: 0 },
    currentPos: { x: 0, y: 0 },
    cellRect: null,
    currentTransform: null,
  });

  // 用于存储当前拖拽项的引用
  const draggingItemRef = useRef<GridItem | null>(null);
  const startPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cellRectRef = useRef<DOMRect | null>(null);

  // 开始拖拽
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    item: GridItem,
    cellRect: DOMRect
  ) => {
    // 只响应左键
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { clientX, clientY } = e;
    
    draggingItemRef.current = item;
    startPositionRef.current = { x: item.x, y: item.y };
    cellRectRef.current = cellRect;
    
    setDragState({
      isDragging: true,
      itemId: item.id,
      startPos: { x: clientX, y: clientY },
      currentPos: { x: clientX, y: clientY },
      cellRect,
      currentTransform: { x: item.x, y: item.y },
    });
    
    onDragStart?.(item);
  }, [onDragStart]);

  // 拖拽中
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !draggingItemRef.current || !cellRectRef.current) return;
    
    const { clientX, clientY } = e;
    const cellRect = cellRectRef.current;
    const startPos = dragState.startPos;
    
    // 计算偏移量（像素）
    const deltaXPixels = clientX - startPos.x;
    const deltaYPixels = clientY - startPos.y;
    
    // 转换为百分比
    const deltaXPercent = (deltaXPixels / cellRect.width) * 100;
    const deltaYPercent = (deltaYPixels / cellRect.height) * 100;
    
    // 计算新位置
    let newX = startPositionRef.current.x + deltaXPercent;
    let newY = startPositionRef.current.y + deltaYPercent;
    
    // 应用边界约束
    if (constrainPosition) {
      const constrained = constrainPosition(newX, newY);
      newX = constrained.x;
      newY = constrained.y;
    }
    
    setDragState(prev => ({
      ...prev,
      currentPos: { x: clientX, y: clientY },
      currentTransform: { x: newX, y: newY },
    }));
    
    onDragMove?.(draggingItemRef.current, newX, newY);
  }, [dragState.isDragging, dragState.startPos, constrainPosition, onDragMove]);

  // 拖拽结束
  const handleDragEnd = useCallback(() => {
    if (!dragState.isDragging || !draggingItemRef.current) return;
    
    const item = draggingItemRef.current;
    
    const finalTransform = dragState.currentTransform ?? { x: item.x, y: item.y };

    onDragEnd?.(item, finalTransform.x, finalTransform.y);
    
    draggingItemRef.current = null;
    cellRectRef.current = null;
    
    setDragState({
      isDragging: false,
      itemId: null,
      startPos: { x: 0, y: 0 },
      currentPos: { x: 0, y: 0 },
      cellRect: null,
      currentTransform: null,
    });
  }, [dragState.currentTransform, dragState.isDragging, onDragEnd]);

  // 添加全局事件监听
  useEffect(() => {
    if (dragState.isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [dragState.isDragging, handleDragMove, handleDragEnd]);

  return {
    dragState,
    handleDragStart,
    isDragging: dragState.isDragging,
    draggingItemId: dragState.itemId,
  };
}

export default useDraggableImage;
