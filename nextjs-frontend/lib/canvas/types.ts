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

/** 媒体节点 - 来自 Studio MediaNodeData */
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
}

/** 引用节点 - 来自 Studio ReferenceNodeData */
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

/** 生成节点 - 来自 Storyboard GeneratorNode */
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
  error?: string;
  generationMode?: 'image' | 'video'; // 生成模式，默认 'image'
}

/** 预览节点 - 来自 Storyboard PreviewNode */
export interface PreviewNodeData extends BaseNodeData {
  kind: 'preview';
  mediaType?: 'image' | 'video';
  url?: string; // 预览内容 URL
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

/** 分镜节点 - 新建 */
export interface StoryboardNodeData extends BaseNodeData {
  kind: 'storyboard';
  shotNumber: number; // 镜头编号
  sceneDescription: string; // 场景描述
  dialogue?: string; // 对白文本
  referenceImageUrl?: string; // 画面参考缩略图
  sourceStoryboardId?: string; // 关联后端 Storyboard 记录 ID
  episodeId?: string; // 关联分集 ID
}

// ===== 联合类型 =====

/** 所有节点数据的联合类型 */
export type UnifiedNodeData =
  | TextNoteNodeData
  | MediaNodeData
  | AssetNodeData
  | ReferenceNodeData
  | ScriptNodeData
  | GeneratorNodeData
  | PreviewNodeData
  | SlicerNodeData
  | CandidateNodeData
  | StoryboardNodeData;

/** 节点类型标识 */
export type UnifiedNodeType =
  | 'textNoteNode'
  | 'mediaNode'
  | 'assetNode'
  | 'referenceNode'
  | 'scriptNode'
  | 'generatorNode'
  | 'previewNode'
  | 'slicerNode'
  | 'candidateNode'
  | 'storyboardNode';

// ===== 序列化类型 =====

export interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  collapsed?: boolean;
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
