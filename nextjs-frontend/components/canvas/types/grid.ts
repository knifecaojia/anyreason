/**
 * 多宫格图片编辑器类型定义
 */

/** 单个图片项 */
export interface GridItem {
  id: string;
  url: string;
  x: number;      // 百分比位置 (-100 到 100)
  y: number;      // 百分比位置 (-100 到 100)
  scale: number;   // 缩放比例 (0.1 到 5)
  zIndex: number;  // 层级
  rotation?: number; // 旋转角度（可选）
}

/** 单元格内容 */
export interface CellContent {
  items: GridItem[];
}

/** 拖拽状态 */
export interface DragState {
  isDragging: boolean;
  itemId: string | null;
  startPos: { x: number; y: number };
  currentPos: { x: number; y: number };
  cellRect: DOMRect | null;
  currentTransform: { x: number; y: number } | null;
}

/** 缩放状态 */
export interface ZoomState {
  isZooming: boolean;
  itemId: string | null;
  zoomCenter: { x: number; y: number };
  cellKey?: string | null;
}

/** 编辑模式状态 */
export interface EditModeState {
  isActive: boolean;
  cellKey: string;
  itemId: string;
}

/** 图片网格编辑器属性 */
export interface ImageGridEditorModalProps {
  initialImage?: string;
  onSave: (url: string, fileNodeId: string) => void;
  onClose: () => void;
}

/** 宫格单元格属性 */
export interface GridCellProps {
  cellKey: string;
  row: number;
  col: number;
  items: GridItem[];
  isActive: boolean;
  onSelect: (key: string) => void;
  onItemUpdate: (itemId: string, updates: Partial<GridItem>) => void;
  onItemSelect: (idx: number) => void;
  selectedItemIdx: number | null;
}

/** 宫格图片属性 */
export interface GridImageProps {
  item: GridItem;
  idx: number;
  isSelected: boolean;
  cellWidth: number;
  cellHeight: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<GridItem>) => void;
  onDoubleClick?: (item: GridItem) => void;
}

/** 比例选项 */
export interface AspectRatioOption {
  label: string;
  value: number;
}

/** 图片变换 */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
}

/** 宫格配置 */
export interface GridConfig {
  rows: number;
  cols: number;
  aspectRatio: number;
}
