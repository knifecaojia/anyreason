/**
 * 图片缩放 hook
 * 支持直接滚轮缩放图片
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GridItem, ZoomState } from '../types/grid';

interface UseZoomableImageOptions {
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
  onZoomStart?: (item: GridItem) => void;
  onZoomChange?: (item: GridItem, newScale: number) => void;
  onZoomEnd?: (item: GridItem, finalScale: number) => void;
}

export function useZoomableImage(options: UseZoomableImageOptions = {}) {
  const {
    minScale = 0.1,
    maxScale = 5,
    zoomStep = 0.1,
    onZoomStart,
    onZoomChange,
    onZoomEnd,
  } = options;

  const [zoomState, setZoomState] = useState<ZoomState>({
    isZooming: false,
    itemId: null,
    zoomCenter: { x: 0, y: 0 },
  });

  // 用于存储当前缩放项的引用
  const zoomingItemRef = useRef<GridItem | null>(null);
  const lastScaleRef = useRef<number>(1);

  // 缩放提示回调
  const [zoomToast, setZoomToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showZoomToast = useCallback((scale: number) => {
    const percentage = Math.round(scale * 100);
    setZoomToast(`${percentage}%`);
    
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    
    toastTimeoutRef.current = setTimeout(() => {
      setZoomToast(null);
    }, 800);
  }, []);

  // 旧版开始缩放（保留兼容）
  const handleZoomStart = useCallback((
    e: React.MouseEvent,
    item: GridItem
  ) => {
    if (e.button !== 1) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { clientX, clientY } = e;
    
    zoomingItemRef.current = item;
    lastScaleRef.current = item.scale;
    
    setZoomState({
      isZooming: true,
      itemId: item.id,
      zoomCenter: { x: clientX, y: clientY },
    });
    
    onZoomStart?.(item);
  }, [onZoomStart]);

  // 直接滚轮缩放（推荐交互）
  const handleWheelZoom = useCallback((e: React.WheelEvent | WheelEvent, item: GridItem) => {
    e.preventDefault();
    if ('stopPropagation' in e) {
      e.stopPropagation();
    }

    const direction = e.deltaY > 0 ? -1 : 1;
    const delta = direction * zoomStep;
    const newScale = Math.max(minScale, Math.min(maxScale, item.scale + delta));

    if (newScale !== item.scale) {
      lastScaleRef.current = newScale;
      onZoomChange?.(item, newScale);
      showZoomToast(newScale);
    }
  }, [zoomStep, minScale, maxScale, onZoomChange, showZoomToast]);

  // 缩放中（滚轮滚动）
  const handleZoomChange = useCallback((e: WheelEvent) => {
    if (!zoomState.isZooming || !zoomingItemRef.current) return;
    
    e.preventDefault();
    
    const item = zoomingItemRef.current;
    const direction = e.deltaY > 0 ? -1 : 1; // 向下滚动缩小，向上滚动放大
    const delta = direction * zoomStep;
    
    // 计算新缩放值
    const newScale = Math.max(minScale, Math.min(maxScale, item.scale + delta));
    
    // 只有当缩放值真正改变时才更新
    if (newScale !== item.scale) {
      lastScaleRef.current = newScale;
      onZoomChange?.(item, newScale);
      showZoomToast(newScale);
    }
  }, [zoomState.isZooming, zoomStep, minScale, maxScale, onZoomChange, showZoomToast]);

  // 缩放结束（中键释放）
  const handleZoomEnd = useCallback(() => {
    if (!zoomState.isZooming || !zoomingItemRef.current) return;
    
    const item = zoomingItemRef.current;
    const finalScale = lastScaleRef.current;
    
    onZoomEnd?.(item, finalScale);
    
    zoomingItemRef.current = null;
    lastScaleRef.current = 1;
    
    setZoomState({
      isZooming: false,
      itemId: null,
      zoomCenter: { x: 0, y: 0 },
    });
  }, [zoomState.isZooming, onZoomEnd]);

  // 添加全局事件监听
  useEffect(() => {
    if (zoomState.isZooming) {
      window.addEventListener('wheel', handleZoomChange, { passive: false });
      window.addEventListener('mouseup', handleZoomEnd);
    }
    
    return () => {
      window.removeEventListener('wheel', handleZoomChange);
      window.removeEventListener('mouseup', handleZoomEnd);
    };
  }, [zoomState.isZooming, handleZoomChange, handleZoomEnd]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  return {
    zoomState,
    zoomToast,
    handleZoomStart,
    handleWheelZoom,
    isZooming: zoomState.isZooming,
    zoomingItemId: zoomState.itemId,
  };
}

export default useZoomableImage;
