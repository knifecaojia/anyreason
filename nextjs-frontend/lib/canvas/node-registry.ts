// lib/canvas/node-registry.ts
// Node type registry — registers all 8 unified node types with metadata,
// components, default-data factories, and port definitions.
// M1.2: Simplified from 10 types (removed mediaNode, previewNode, referenceNode).

import React, { type ComponentType } from 'react';
import type { NodeProps } from './xyflow-compat';
import type { PortDefinition } from './types';
import {
  StickyNote, FileText, Clapperboard,
  Scissors, Users,
  Package, MessageSquareText, MessageCircle,
  Image as ImageIcon, Film, Group,
} from 'lucide-react';

// ===== Node Group =====

export type NodeGroup = 'creation' | 'ai-generation' | 'reference';

// ===== Group Colors =====

export const GROUP_COLORS: Record<NodeGroup, string> = {
  'creation':      'bg-blue-500/20 text-blue-400',
  'ai-generation': 'bg-purple-500/20 text-purple-400',
  'reference':     'bg-orange-500/20 text-orange-400',
};

// ===== Registration Interface =====

export interface NodeTypeRegistration {
  type: string;
  label: string;
  group: NodeGroup;
  icon: ComponentType<{ size?: number }>;
  colorClass: string;
  component: ComponentType<NodeProps<any>>;
  defaultData: () => Record<string, unknown>;
  ports: PortDefinition[];
}

// ===== Internal Registry =====

const registry = new Map<string, NodeTypeRegistration>();

// ===== Registry API =====

export function registerNodeType(reg: NodeTypeRegistration): void {
  registry.set(reg.type, reg);
}

export function getNodeType(type: string): NodeTypeRegistration | undefined {
  return registry.get(type);
}

export function getNodeTypesByGroup(group: NodeGroup): NodeTypeRegistration[] {
  return Array.from(registry.values()).filter((r) => r.group === group);
}

export function getAllNodeTypes(): Map<string, NodeTypeRegistration> {
  return new Map(registry);
}

// DEV: Error boundary wrapper to catch silent component crashes
class NodeErrorBoundary extends React.Component<
  { nodeType: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error(`[NodeErrorBoundary] Component "${this.props.nodeType}" crashed:`, error);
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: { padding: 16, background: '#2a1515', border: '2px solid #ef4444', borderRadius: 8, color: '#fca5a5', width: 300, fontSize: 12 },
      }, `❌ ${this.props.nodeType} render error: ${this.state.error.message}`);
    }
    return this.props.children;
  }
}

function wrapWithErrorBoundary(type: string, Comp: ComponentType<any>): ComponentType<any> {
  const Wrapped = (props: any) =>
    React.createElement(NodeErrorBoundary, { nodeType: type, children: React.createElement(Comp, props) });
  Wrapped.displayName = `EB(${type})`;
  return Wrapped;
}

export function buildReactFlowNodeTypes(): Record<string, ComponentType<NodeProps<any>>> {
  const result: Record<string, ComponentType<NodeProps<any>>> = {};
  for (const [type, reg] of registry) {
    result[type] = wrapWithErrorBoundary(type, reg.component);
  }
  return result;
}

// ===== Real Node Components (task 7.x) =====
// Lazy imports to avoid circular dependencies — components are loaded at registration time.

import TextNoteNode from '@/components/canvas/nodes/TextNoteNode';
import AssetNode from '@/components/canvas/nodes/AssetNode';
import ScriptNode from '@/components/canvas/nodes/ScriptNode';
import ImageOutputNode from '@/components/canvas/nodes/ImageOutputNode';
import VideoOutputNode from '@/components/canvas/nodes/VideoOutputNode';
import GroupNode from '@/components/canvas/nodes/GroupNode';
import SlicerNode from '@/components/canvas/nodes/SlicerNode';
import CandidateNode from '@/components/canvas/nodes/CandidateNode';
import StoryboardNode from '@/components/canvas/nodes/StoryboardNode';
import PromptNode from '@/components/canvas/nodes/PromptNode';
import TextGenNode from '@/components/canvas/nodes/TextGenNode';

// ===== Register All 8 Node Types =====
// M1.2: Simplified from 10. Removed mediaNode, previewNode, referenceNode.
// Port naming unified to in-{type} / out-{type}.

// --- Creation Group ---

registerNodeType({
  type: 'textNoteNode',
  label: '文本笔记',
  group: 'creation',
  icon: StickyNote,
  colorClass: GROUP_COLORS['creation'],
  component: TextNoteNode,
  defaultData: () => ({
    kind: 'text-note',
    title: 'New Note',
    content: '',
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

registerNodeType({
  type: 'scriptNode',
  label: '剧本节点',
  group: 'creation',
  icon: FileText,
  colorClass: GROUP_COLORS['creation'],
  component: ScriptNode,
  defaultData: () => ({
    kind: 'script',
    text: '',
  }),
  ports: [
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

registerNodeType({
  type: 'storyboardNode',
  label: '分镜节点',
  group: 'creation',
  icon: Clapperboard,
  colorClass: GROUP_COLORS['creation'],
  component: StoryboardNode,
  defaultData: () => ({
    kind: 'storyboard',
    shotNumber: 1,
    sceneDescription: '',
    dialogue: '',
    referenceImageUrl: undefined,
    sourceStoryboardId: undefined,
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

registerNodeType({
  type: 'promptNode',
  label: '提示词',
  group: 'creation',
  icon: MessageCircle,
  colorClass: GROUP_COLORS['creation'],
  component: PromptNode,
  defaultData: () => ({
    kind: 'prompt',
    content: '',
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

// --- AI Generation Group ---

registerNodeType({
  type: 'textGenNode',
  label: '文本生成',
  group: 'ai-generation',
  icon: MessageSquareText,
  colorClass: GROUP_COLORS['ai-generation'],
  component: TextGenNode,
  defaultData: () => ({
    kind: 'text-gen',
    systemPrompt: '',
    userPromptTemplate: '',
    bindingKey: 'text-default',
    temperature: 0.7,
    maxTokens: 2048,
    lastOutput: undefined,
    status: 'idle',
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

registerNodeType({
  type: 'imageOutputNode',
  label: '图像输出',
  group: 'ai-generation',
  icon: ImageIcon,
  colorClass: GROUP_COLORS['ai-generation'],
  component: ImageOutputNode,
  defaultData: () => ({
    kind: 'image-output',
    model: '',
    prompt: '',
    negPrompt: '',
    aspectRatio: '1:1',
    resolution: 'standard',
    referenceImages: [],
    isProcessing: false,
    progress: 0,
    promptSource: null,
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

registerNodeType({
  type: 'videoOutputNode',
  label: '视频输出',
  group: 'ai-generation',
  icon: Film,
  colorClass: 'bg-green-500/20 text-green-400',
  component: VideoOutputNode,
  defaultData: () => ({
    kind: 'video-output',
    model: '',
    prompt: '',
    negPrompt: '',
    aspectRatio: '16:9',
    resolution: 'standard',
    duration: 4,
    referenceImages: [],
    isProcessing: false,
    progress: 0,
    promptSource: null,
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

registerNodeType({
  type: 'slicerNode',
  label: '拆分节点',
  group: 'ai-generation',
  icon: Scissors,
  colorClass: GROUP_COLORS['ai-generation'],
  component: SlicerNode,
  defaultData: () => ({
    kind: 'slicer',
    isProcessing: false,
    storyboardItems: [],
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

registerNodeType({
  type: 'candidateNode',
  label: '提取节点',
  group: 'ai-generation',
  icon: Users,
  colorClass: GROUP_COLORS['ai-generation'],
  component: CandidateNode,
  defaultData: () => ({
    kind: 'candidate',
    isProcessing: false,
    candidates: [],
  }),
  ports: [
    { id: 'in', direction: 'input', dataType: 'text', label: 'Input' },
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

// --- Reference Group ---

registerNodeType({
  type: 'assetNode',
  label: '资产节点',
  group: 'reference',
  icon: Package,
  colorClass: GROUP_COLORS['reference'],
  component: AssetNode,
  defaultData: () => ({
    kind: 'asset',
    assetId: '',
    name: '',
    assetType: '',
    thumbnail: undefined,
    category: undefined,
  }),
  ports: [
    { id: 'out', direction: 'output', dataType: 'text', label: 'Output' },
  ],
});

// --- Group ---

registerNodeType({
  type: 'groupNode',
  label: '分组节点',
  group: 'creation',
  icon: Group,
  colorClass: 'bg-blue-500/10 text-blue-400',
  component: GroupNode,
  defaultData: () => ({
    kind: 'group',
    label: '分组',
    color: '蓝',
    childNodeIds: [],
  }),
  ports: [],
});
