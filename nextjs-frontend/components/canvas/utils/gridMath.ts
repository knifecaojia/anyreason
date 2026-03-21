import { transformToCSS } from './transformHelpers';

/**
 * 宫格计算工具函数
 */

/**
 * 屏幕坐标转百分比坐标
 * @param screenX - 屏幕X坐标
 * @param screenY - 屏幕Y坐标
 * @param cellRect - 单元格DOMRect
 * @returns 百分比坐标 {x, y}
 */
export function screenToPercent(
  screenX: number,
  screenY: number,
  cellRect: DOMRect
): { x: number; y: number } {
  const x = ((screenX - cellRect.left) / cellRect.width - 0.5) * 200;
  const y = ((screenY - cellRect.top) / cellRect.height - 0.5) * 200;
  return { x, y };
}

/**
 * 百分比坐标转屏幕坐标
 * @param x - 百分比X坐标
 * @param y - 百分比Y坐标
 * @param cellRect - 单元格DOMRect
 * @returns 屏幕坐标 {x, y}
 */
export function percentToScreen(
  x: number,
  y: number,
  cellRect: DOMRect
): { x: number; y: number } {
  const screenX = cellRect.left + ((x / 200) + 0.5) * cellRect.width;
  const screenY = cellRect.top + ((y / 200) + 0.5) * cellRect.height;
  return { x: screenX, y: screenY };
}

/**
 * 百分比坐标转CSS transform
 * @param x - 百分比X坐标
 * @param y - 百分比Y坐标
 * @param scale - 缩放比例
 * @returns CSS transform字符串
 */
export function percentToTransform(x: number, y: number, scale: number, rotation: number = 0): string {
  return transformToCSS({ x, y, scale, rotation });
}

/**
 * 约束位置在边界内
 * @param x - 百分比X坐标
 * @param y - 百分比Y坐标
 * @param maxOffset - 最大偏移量（默认50%）
 * @returns 约束后的坐标 {x, y}
 */
export function constrainPosition(
  x: number,
  y: number,
  maxOffset: number = 50
): { x: number; y: number } {
  return {
    x: Math.max(-maxOffset, Math.min(maxOffset, x)),
    y: Math.max(-maxOffset, Math.min(maxOffset, y)),
  };
}

/**
 * 计算缩放后的原点变换
 * @param scale - 缩放比例
 * @param containerWidth - 容器宽度
 * @param containerHeight - 容器高度
 * @returns CSS transform字符串
 */
export function getCenterScaleTransform(
  scale: number,
  containerWidth: number,
  containerHeight: number
): string {
  const originX = containerWidth / 2;
  const originY = containerHeight / 2;
  return `translate(-${originX}px, -${originY}px) scale(${scale}) translate(${originX}px, ${originY}px)`;
}

/**
 * 生成单元格键值
 * @param row - 行索引
 * @param col - 列索引
 * @returns 单元格键值字符串
 */
export function getCellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

/**
 * 从键值解析行列索引
 * @param key - 单元格键值字符串
 * @returns 行列索引对象 {row, col}
 */
export function parseCellKey(key: string): { row: number; col: number } {
  const [row, col] = key.split('-').map(Number);
  return { row, col };
}
