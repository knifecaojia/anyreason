// lib/canvas/node-registry.ts
// Node type registry — registers all 10 unified node types with metadata,
// placeholder components, default-data factories, and port definitions.

import type { ComponentType } from 'react';
import type { NodeProps } from './xyflow-compat';
import type { PortDefinition } from './types';
import {
  StickyNote, FileText, Clapperboard,
  Wand2, Scissors, Users,
  Eye, ImagePlay,
  Package, Link,
} from 'lucide-react';

// ===== Node Group =====

export type NodeGroup = 'creation' | 'ai-generation' | 'display' | 'reference';

// ===== Group Colors =====

export const GROUP_COLORS: Record<NodeGroup, string> = {
  'creation':      'bg-blue-500/20 text-blue-400',
  'ai-generation': 'bg-purple-500/20 text-purple-400',
  'display':       'bg-green-500/20 text-green-400',
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

export function buildReactFlowNodeTypes(): Record<string, ComponentType<NodeProps<any>>> {
  const result: Record<string, ComponentType<NodeProps<any>>> = {};
  for (const [type, reg] of registry) {
    result[type] = reg.component;
  }
  return result;
}

// ===== Real Node Components (task 7.x) =====
// Lazy imports to avoid circular dependencies — components are loaded at registration time.

import TextNoteNode from '@/components/canvas/nodes/TextNoteNode';
import MediaNode from '@/components/canvas/nodes/MediaNode';
import AssetNode from '@/components/canvas/nodes/AssetNode';
import ReferenceNode from '@/components/canvas/nodes/ReferenceNode';
import ScriptNode from '@/components/canvas/nodes/ScriptNode';
import GeneratorNode from '@/components/canvas/nodes/GeneratorNode';
import PreviewNode from '@/components/canvas/nodes/PreviewNode';
import SlicerNode from '@/components/canvas/nodes/SlicerNode';
import CandidateNode from '@/components/canvas/nodes/CandidateNode';
import StoryboardNode from '@/components/canvas/nodes/StoryboardNode';

// ===== Placeholder Helpers =====
// Used for node types whose real components are not yet implemented (task 7.3+)

function makePlaceholderComponent(nodeType: string): ComponentType<NodeProps<any>> {
  const PlaceholderNode = (_props: NodeProps<any>) => {
    return null as unknown as React.ReactElement;
  };
  PlaceholderNode.displayName = `${nodeType}Placeholder`;
  return PlaceholderNode;
}

// ===== Register All 10 Node Types =====

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
  ports: [],
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
    { id: 'text', direction: 'output', dataType: 'text', label: 'Text' },
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
    { id: 'in-image', direction: 'input', dataType: 'image', label: 'Image' },
    { id: 'in-asset', direction: 'input', dataType: 'asset-ref', label: 'Asset Ref' },
    { id: 'out-desc', direction: 'output', dataType: 'text', label: 'Description' },
  ],
});

// --- AI Generation Group ---

registerNodeType({
  type: 'generatorNode',
  label: '生成节点',
  group: 'ai-generation',
  icon: Wand2,
  colorClass: GROUP_COLORS['ai-generation'],
  component: GeneratorNode,
  defaultData: () => ({
    kind: 'generator',
    model: '',
    prompt: '',
    negPrompt: '',
    aspectRatio: '1:1',
    isProcessing: false,
    progress: 0,
  }),
  ports: [
    { id: 'in-script', direction: 'input', dataType: 'text', label: 'Script' },
    { id: 'in-ref', direction: 'input', dataType: 'asset-ref', label: 'Reference' },
    { id: 'image', direction: 'output', dataType: 'image', label: 'Image' },
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
    { id: 'in-text', direction: 'input', dataType: 'text', label: 'Text' },
    { id: 'storyboard-list', direction: 'output', dataType: 'storyboard-list', label: 'Storyboard List' },
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
    { id: 'in-data', direction: 'input', dataType: 'text', label: 'Data' },
  ],
});

// --- Display Group ---

registerNodeType({
  type: 'previewNode',
  label: '预览节点',
  group: 'display',
  icon: Eye,
  colorClass: GROUP_COLORS['display'],
  component: PreviewNode,
  defaultData: () => ({
    kind: 'preview',
    mediaType: 'image',
    url: undefined,
  }),
  ports: [
    { id: 'in-image', direction: 'input', dataType: 'image', label: 'Image' },
    { id: 'out-image', direction: 'output', dataType: 'image', label: 'Image' },
  ],
});

registerNodeType({
  type: 'mediaNode',
  label: '媒体节点',
  group: 'display',
  icon: ImagePlay,
  colorClass: GROUP_COLORS['display'],
  component: MediaNode,
  defaultData: () => ({
    kind: 'media',
    title: 'New Media',
    mediaType: 'image',
    resultUrl: undefined,
  }),
  ports: [
    { id: 'image', direction: 'output', dataType: 'image', label: 'Image' },
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
    { id: 'asset-ref', direction: 'output', dataType: 'asset-ref', label: 'Asset Ref' },
  ],
});

registerNodeType({
  type: 'referenceNode',
  label: '引用节点',
  group: 'reference',
  icon: Link,
  colorClass: GROUP_COLORS['reference'],
  component: ReferenceNode,
  defaultData: () => ({
    kind: 'reference',
    title: '',
    description: '',
    dialogue: '',
  }),
  ports: [],
});
