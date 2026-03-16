import type { Node, Edge } from '@xyflow/react';

// ===== 端口类型 =====

export type PortDataType = 'text' | 'image' | 'video' | 'asset-ref' | 'storyboard-list';

export type PortDirection = 'input' | 'output';

export interface PortDefinition {
  id: string;
  direction: PortDirection;
  dataType: PortDataType;
  label: string;
  multiple?: boolean;
}

// ===== 节点基础类型 =====

/** 所有节点共享的基础字段 */
export interface BaseNodeData {
  label?: string;
  collapsed?: boolean;
}

/** 文本笔记节点 - 来自 Studio TextNoteNodeData */
export interface TextNoteNodeData extends BaseNodeData {
  kind: 'text-note';
  title: string;
  content: string;
}

/** @deprecated MediaNodeData — merged into GeneratorNode (upload mode). Kept for lazy migration. */
export interface MediaNodeData extends BaseNodeData {
  kind: 'media';
  title: string;
  mediaType: 'image' | 'video';
  resultUrl?: string;
}

/** 资产节点 - 合并 Studio AssetNodeData + Storyboard AssetNode */
export interface AssetNodeData extends BaseNodeData {
  kind: 'asset';
  assetId: string;
  name: string;
  assetType: string;
  thumbnail?: string;
  category?: string;
  resources?: { thumbnail: string; download: string }[];
  activeResourceIndex?: number;
}

/** @deprecated ReferenceNodeData — merged into StoryboardNode. Kept for lazy migration. */
export interface ReferenceNodeData extends BaseNodeData {
  kind: 'reference';
  title: string;
  description?: string;
  dialogue?: string;
  sourceInfo?: {
    scriptId?: string;
    episodeId?: string;
    shotCode?: string;
  };
}

/** 剧本节点 - 来自 Storyboard ScriptNode */
export interface ScriptNodeData extends BaseNodeData {
  kind: 'script';
  text: string; // 剧本文本，最大 10000 字符
}

/** @deprecated GeneratorNodeData — migrated to ImageOutputNode / VideoOutputNode. Kept for lazy migration. */
export interface GeneratorNodeData extends BaseNodeData {
  kind: 'generator';
  model: string; // AI 模型标识
  prompt: string;
  negPrompt?: string;
  aspectRatio?: string;
  isExtraction?: boolean; // 是否为提取模式
  isProcessing?: boolean;
  progress?: number; // 0-100
  taskId?: string; // 后端任务 ID
  lastImage?: string; // 生成结果 URL
  lastVideo?: string; // 视频生成结果 URL
  error?: string;
  generationMode?: 'image' | 'video'; // 生成模式，默认 'image'
  uploadMode?: boolean; // 手动上传模式 (merged from MediaNode)
  promptSource?: 'manual' | 'upstream' | null; // 提示词来源: 手动编辑 vs TextGenNode 自动填入
}

/** @deprecated PreviewNodeData — merged into GeneratorNode. Kept for lazy migration. */
export interface PreviewNodeData extends BaseNodeData {
  kind: 'preview';
  mediaType?: 'image' | 'video';
  url?: string; // 预览内容 URL
}

/** 提示词节点 — 无 AI，直接传递文本给下游 */
export interface PromptNodeData extends BaseNodeData {
  kind: 'prompt';
  content: string;
}

/** 文本生成节点 (TextGenNode) — LLM 驱动的文本/提示词生成 */
export interface TextGenNodeData extends BaseNodeData {
  kind: 'text-gen';
  systemPrompt: string;
  userPromptTemplate: string;
  bindingKey: string; // AI 文本模型配置 key
  modelConfigId?: string; // 直接指定模型配置 ID（用户从下拉选择时设置）
  presetId?: string; // 关联提示词预设 ID
  temperature: number; // 默认 0.7
  maxTokens: number; // 默认 2048
  lastOutput?: string; // 最近一次生成的输出文本
  status: 'idle' | 'streaming' | 'succeeded' | 'failed';
  error?: string;
}

/** 分镜条目（拆分节点输出） */
export interface StoryboardItem {
  shotNumber: number;
  sceneDescription: string;
  dialogue?: string;
}

/** 资产候选（提取节点输出） */
export interface AssetCandidate {
  name: string;
  description?: string;
  tags?: string[];
}

/** 拆分节点 - 来自 Storyboard SlicerNode */
export interface SlicerNodeData extends BaseNodeData {
  kind: 'slicer';
  inputText?: string;
  isProcessing?: boolean;
  storyboardItems?: StoryboardItem[];
  error?: string;
}

/** 提取节点 - 来自 Storyboard CandidateNode */
export interface CandidateNodeData extends BaseNodeData {
  kind: 'candidate';
  inputText?: string;
  isProcessing?: boolean;
  candidates?: AssetCandidate[];
  error?: string;
}

/** 图像输出节点 — 从 GeneratorNode 拆分 */
export interface ImageOutputNodeData extends BaseNodeData {
  kind: 'image-output';
  model: string;
  bindingKey?: string; // AI 图像模型绑定 key
  modelConfigId?: string; // 直接指定模型配置 ID
  prompt: string;
  negPrompt?: string;
  aspectRatio?: string;
  resolution?: string; // 清晰度: 'standard' | 'hd' | '2k' | '4k'
  referenceImages?: string[]; // 多图参考 URL 列表
  isProcessing?: boolean;
  progress?: number;
  taskId?: string;
  lastImage?: string;
  lastImageFull?: string; // full-resolution download URL (lastImage may be thumbnail)
  error?: string;
  uploadMode?: boolean;
  promptSource?: 'manual' | 'upstream' | null;
}

/** 视频输出节点 — 从 GeneratorNode 拆分 */
export interface VideoOutputNodeData extends BaseNodeData {
  kind: 'video-output';
  model: string;
  bindingKey?: string; // AI 视频模型绑定 key
  modelConfigId?: string; // 直接指定模型配置 ID
  prompt: string;
  negPrompt?: string;
  aspectRatio?: string;
  resolution?: string; // 清晰度: 'standard' | 'hd' | '2k' | '4k'
  duration?: number; // 视频时长（秒）
  inputMode?: string; // 生成模式: text_to_video, first_frame, etc.
  offPeak?: boolean; // Vidu 错峰模式
  referenceImages?: string[]; // 多图参考 URL 列表
  isProcessing?: boolean;
  progress?: number;
  taskId?: string;
  lastVideo?: string;
  referenceImage?: string; // 参考图 URL（图生视频）— 兼容旧数据
  error?: string;
  promptSource?: 'manual' | 'upstream' | null;
}

/** 分组节点 */
export interface GroupNodeData extends BaseNodeData {
  kind: 'group';
  label?: string;
  color?: string;
  childNodeIds?: string[];
}

/** 分镜节点 - 新建 */
export interface StoryboardNodeData extends BaseNodeData {
  kind: 'storyboard';
  shotNumber: number; // 镜头编号
  sceneDescription: string; // 场景描述
  dialogue?: string; // 对白文本
  referenceImageUrl?: string; // 画面参考缩略图
  sourceStoryboardId?: string; // 关联后端 Storyboard 记录 ID
  episodeId?: string; // 关联分集 ID
  sourceInfo?: {
    shotCode?: string;
    sceneCode?: string;
  };
}

// ===== 联合类型 =====

/** 所有节点数据的联合类型 */
export type UnifiedNodeData =
  | TextNoteNodeData
  | AssetNodeData
  | ScriptNodeData
  | PromptNodeData
  | TextGenNodeData
  | SlicerNodeData
  | CandidateNodeData
  | StoryboardNodeData
  | ImageOutputNodeData
  | VideoOutputNodeData
  | GroupNodeData
  // @deprecated — kept for lazy migration
  | MediaNodeData
  | PreviewNodeData
  | ReferenceNodeData;

/** 节点类型标识 */
export type UnifiedNodeType =
  | 'textNoteNode'
  | 'assetNode'
  | 'scriptNode'
  | 'promptNode'
  | 'textGenNode'
  | 'slicerNode'
  | 'candidateNode'
  | 'storyboardNode'
  | 'imageOutputNode'
  | 'videoOutputNode'
  | 'groupNode';

// ===== 序列化类型 =====

export interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  collapsed?: boolean;
  width?: number;
  height?: number;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: {
    portType?: PortDataType;
  };
}

export interface WorkflowSnapshot {
  version: number;
  canvasId: string;
  reactflow: {
    nodes: SerializedNode[];
    edges: SerializedEdge[];
    viewport: { x: number; y: number; zoom: number };
  };
  updatedAt: string;
}

// ===== 队列类型 =====

export type QueueItemStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'timeout';

export interface QueueItem {
  nodeId: string;
  taskId?: string;
  status: QueueItemStatus;
  progress: number;
  error?: string;
  startedAt?: number;
}

export interface BatchQueueState {
  items: QueueItem[];
  maxConcurrency: number;
  isRunning: boolean;
  completedCount: number;
  totalCount: number;
}

// ===== 撤销/重做 =====

export interface CanvasState {
  nodes: Node[];
  edges: Edge[];
}

// ===== 性能模式 =====

export type PerformanceMode = 'high-quality' | 'normal' | 'fast';
