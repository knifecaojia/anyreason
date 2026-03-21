/**
 * 变换辅助函数
 */

import type { Transform } from '../types/grid-editor';

// 默认变换
export const defaultTransform: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
};

// 合并变换
export function mergeTransform(
  base: Transform,
  override: Partial<Transform>
): Transform {
  return {
    x: override.x ?? base.x,
    y: override.y ?? base.y,
    scale: override.scale ?? base.scale,
    rotation: override.rotation ?? base.rotation,
  };
}

// 应用变换到CSS
export function transformToCSS(transform: Transform): string {
  const { x, y, scale, rotation = 0 } = transform;
  
  if (rotation !== 0) {
    return `translate(${x}%, ${y}%) scale(${scale}) rotate(${rotation}deg)`;
  }
  
  return `translate(${x}%, ${y}%) scale(${scale})`;
}

// 解析CSS变换
export function parseCSSTransform(css: string): Transform {
  const transform: Transform = { ...defaultTransform };
  
  // 解析 translate
  const translateMatch = css.match(/translate\(([^)]+)\)/);
  if (translateMatch) {
    const parts = translateMatch[1].split(',').map(p => p.trim());
    if (parts.length >= 1) {
      transform.x = parseFloat(parts[0]);
    }
    if (parts.length >= 2) {
      transform.y = parseFloat(parts[1]);
    }
  }
  
  // 解析 scale
  const scaleMatch = css.match(/scale\(([^)]+)\)/);
  if (scaleMatch) {
    transform.scale = parseFloat(scaleMatch[1]);
  }
  
  // 解析 rotate
  const rotateMatch = css.match(/rotate\(([^)]+)\)/);
  if (rotateMatch) {
    const value = rotateMatch[1];
    if (value.includes('deg')) {
      transform.rotation = parseFloat(value);
    } else {
      // 弧度转角度
      transform.rotation = (parseFloat(value) * 180) / Math.PI;
    }
  }
  
  return transform;
}

// 计算变换的边界框
export function getTransformBounds(
  width: number,
  height: number,
  transform: Transform
): { x: number; y: number; width: number; height: number } {
  const { x, y, scale } = transform;
  
  // 计算缩放后的尺寸
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  
  // 计算偏移量 (x, y 是百分比)
  const offsetX = (x / 100) * width;
  const offsetY = (y / 100) * height;
  
  return {
    x: offsetX - (scaledWidth - width) / 2,
    y: offsetY - (scaledHeight - height) / 2,
    width: scaledWidth,
    height: scaledHeight,
  };
}

// 插值变换 (用于动画)
export function interpolateTransform(
  start: Transform,
  end: Transform,
  progress: number
): Transform {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
    scale: start.scale + (end.scale - start.scale) * progress,
    rotation: (start.rotation || 0) + ((end.rotation || 0) - (start.rotation || 0)) * progress,
  };
}

// 判断两个变换是否相等
export function areTransformsEqual(a: Transform, b: Transform, epsilon: number = 0.001): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.scale - b.scale) < epsilon &&
    Math.abs((a.rotation || 0) - (b.rotation || 0)) < epsilon
  );
}
