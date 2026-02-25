// lib/canvas/node-registry.ts
// Node type registry — registers all 10 unified node types with metadata,
// placeholder components, default-data factories, and port definitions.

import type { ComponentType } from 'react';
import type { NodeProps } from './xyflow-compat';
import type { PortDefinition } from './types';

// ===== Node Group =====

export type NodeGroup = 'creation' | 'ai-generation' | 'display' | 'reference';

// ===== Registration Interface =====

export interface NodeTypeRegistration {
  type: string;
  label: string;
  group: NodeGroup;
  icon: ComponentType<{ size?: number }>;
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

function makePlaceholderIcon(label: string): ComponentType<{ size?: number }> {
  const PlaceholderIcon = ({ size = 16 }: { size?: number }) => {
    return null as unknown as React.ReactElement;
  };
  PlaceholderIcon.displayName = `${label}Icon`;
  return PlaceholderIcon;
}

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
  label: 'Text Note',
  group: 'creation',
  icon: makePlaceholderIcon('TextNote'),
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
  label: 'Script',
  group: 'creation',
  icon: makePlaceholderIcon('Script'),
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
  label: 'Storyboard',
  group: 'creation',
  icon: makePlaceholderIcon('Storyboard'),
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
  label: 'Generator',
  group: 'ai-generation',
  icon: makePlaceholderIcon('Generator'),
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
  label: 'Slicer',
  group: 'ai-generation',
  icon: makePlaceholderIcon('Slicer'),
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
  label: 'Candidate',
  group: 'ai-generation',
  icon: makePlaceholderIcon('Candidate'),
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
  label: 'Preview',
  group: 'display',
  icon: makePlaceholderIcon('Preview'),
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
  label: 'Media',
  group: 'display',
  icon: makePlaceholderIcon('Media'),
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
  label: 'Asset',
  group: 'reference',
  icon: makePlaceholderIcon('Asset'),
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
  label: 'Reference',
  group: 'reference',
  icon: makePlaceholderIcon('Reference'),
  component: ReferenceNode,
  defaultData: () => ({
    kind: 'reference',
    title: '',
    description: '',
    dialogue: '',
  }),
  ports: [],
});
