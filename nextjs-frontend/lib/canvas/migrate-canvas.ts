// lib/canvas/migrate-canvas.ts
// Lazy migration for canvas data: converts deprecated node types to their new equivalents.
// M1.2: PreviewNode → GeneratorNode, MediaNode → GeneratorNode (upload mode), ReferenceNode → StoryboardNode.

import type { SerializedNode, SerializedEdge } from './types';

/** Port ID mapping for edges referencing old port names → new unified 'in'/'out' */
const PORT_REMAP: Record<string, string> = {
  // Old output port names → 'out'
  'text': 'out',
  'out-text': 'out',
  'out-desc': 'out',
  'out-image': 'out',
  'out-video': 'out',
  'out-ref': 'out',
  'out-refs': 'out',
  'image': 'out',
  'asset-ref': 'out',
  'storyboard-list': 'out',
  // Old input port names → 'in'
  'in-text': 'in',
  'in-script': 'in',
  'in-image': 'in',
  'in-ref': 'in',
  'in-asset': 'in',
  'in-data': 'in',
};

/**
 * Migrates a single node from a deprecated type to its replacement.
 * Returns the migrated node, or the original if no migration is needed.
 */
function migrateNode(node: SerializedNode): SerializedNode {
  switch (node.type) {
    case 'previewNode': {
      // PreviewNode → GeneratorNode (result already generated, use as uploaded media)
      return {
        ...node,
        type: 'generatorNode',
        data: {
          kind: 'generator',
          model: '',
          prompt: '',
          negPrompt: '',
          aspectRatio: '1:1',
          isProcessing: false,
          progress: 100,
          lastImage: node.data.url ?? undefined,
          generationMode: (node.data.mediaType as string) === 'video' ? 'video' : 'image',
          uploadMode: true,
          promptSource: null,
        },
      };
    }

    case 'mediaNode': {
      // MediaNode → GeneratorNode (upload mode)
      return {
        ...node,
        type: 'generatorNode',
        data: {
          kind: 'generator',
          model: '',
          prompt: '',
          negPrompt: '',
          aspectRatio: '1:1',
          isProcessing: false,
          progress: node.data.resultUrl ? 100 : 0,
          lastImage: node.data.resultUrl ?? undefined,
          generationMode: (node.data.mediaType as string) === 'video' ? 'video' : 'image',
          uploadMode: true,
          promptSource: null,
        },
      };
    }

    case 'referenceNode': {
      // ReferenceNode → StoryboardNode (merge description/dialogue into scene)
      return {
        ...node,
        type: 'storyboardNode',
        data: {
          kind: 'storyboard',
          shotNumber: 0,
          sceneDescription: node.data.description ?? node.data.title ?? '',
          dialogue: node.data.dialogue ?? '',
          referenceImageUrl: undefined,
          sourceStoryboardId: (node.data.sourceInfo as Record<string, unknown> | undefined)?.shotCode
            ? undefined
            : undefined,
        },
      };
    }

    case 'generatorNode': {
      // GeneratorNode → ImageOutputNode or VideoOutputNode based on generationMode
      const genMode = (node.data.generationMode as string) ?? 'image';
      if (genMode === 'video') {
        return {
          ...node,
          type: 'videoOutputNode',
          data: {
            kind: 'video-output',
            model: node.data.model ?? '',
            prompt: node.data.prompt ?? '',
            negPrompt: node.data.negPrompt ?? '',
            aspectRatio: node.data.aspectRatio ?? '16:9',
            duration: 4,
            isProcessing: node.data.isProcessing ?? false,
            progress: node.data.progress ?? 0,
            taskId: node.data.taskId,
            lastVideo: node.data.lastVideo ?? node.data.lastImage,
            error: node.data.error,
            promptSource: node.data.promptSource ?? null,
          },
        };
      }
      return {
        ...node,
        type: 'imageOutputNode',
        data: {
          kind: 'image-output',
          model: node.data.model ?? '',
          prompt: node.data.prompt ?? '',
          negPrompt: node.data.negPrompt ?? '',
          aspectRatio: node.data.aspectRatio ?? '1:1',
          isProcessing: node.data.isProcessing ?? false,
          progress: node.data.progress ?? 0,
          taskId: node.data.taskId,
          lastImage: node.data.lastImage,
          error: node.data.error,
          uploadMode: node.data.uploadMode ?? false,
          promptSource: node.data.promptSource ?? null,
        },
      };
    }

    default:
      return node;
  }
}

/**
 * Remaps edge handles from old port IDs to the new unified naming convention.
 */
function migrateEdge(edge: SerializedEdge, migratedNodeTypes: Map<string, string>): SerializedEdge {
  let { sourceHandle, targetHandle } = edge;

  // Remap known old port names
  if (sourceHandle && PORT_REMAP[sourceHandle]) {
    sourceHandle = PORT_REMAP[sourceHandle];
  }
  if (targetHandle && PORT_REMAP[targetHandle]) {
    targetHandle = PORT_REMAP[targetHandle];
  }

  // If source was a previewNode or mediaNode, remap to 'out'
  const sourceType = migratedNodeTypes.get(edge.source);
  if (sourceType === 'previewNode' || sourceType === 'mediaNode') {
    sourceHandle = 'out';
  }

  return {
    ...edge,
    sourceHandle: sourceHandle ?? edge.sourceHandle,
    targetHandle: targetHandle ?? edge.targetHandle,
  };
}

/**
 * Checks if a canvas snapshot contains any deprecated node types or old port names.
 */
export function needsMigration(snapshot: {
  reactflow?: { nodes?: SerializedNode[]; edges?: SerializedEdge[] };
}): boolean {
  const nodes = snapshot.reactflow?.nodes ?? [];
  const edges = snapshot.reactflow?.edges ?? [];

  const hasDeprecatedNodes = nodes.some(
    (n) => n.type === 'previewNode' || n.type === 'mediaNode' || n.type === 'referenceNode' || n.type === 'generatorNode',
  );

  const hasOldPorts = edges.some(
    (e) =>
      (e.sourceHandle && PORT_REMAP[e.sourceHandle] !== undefined) ||
      (e.targetHandle && PORT_REMAP[e.targetHandle] !== undefined),
  );

  return hasDeprecatedNodes || hasOldPorts;
}

/**
 * Migrates an entire canvas snapshot in-place:
 * 1. Converts deprecated node types to their replacements
 * 2. Remaps edge handles to unified port naming
 *
 * Returns the migrated snapshot (new object, original is not mutated).
 */
export function migrateCanvasSnapshot<
  T extends {
    reactflow?: {
      nodes?: SerializedNode[];
      edges?: SerializedEdge[];
      viewport?: { x: number; y: number; zoom: number };
    };
  },
>(snapshot: T): T {
  if (!snapshot.reactflow) return snapshot;

  const originalNodes = snapshot.reactflow.nodes ?? [];
  const originalEdges = snapshot.reactflow.edges ?? [];

  // Track original types for edge migration
  const originalTypeMap = new Map<string, string>();
  for (const n of originalNodes) {
    originalTypeMap.set(n.id, n.type);
  }

  // Migrate nodes
  const migratedNodes = originalNodes.map(migrateNode);

  // Migrate edges
  const migratedEdges = originalEdges.map((e) => migrateEdge(e, originalTypeMap));

  return {
    ...snapshot,
    reactflow: {
      ...snapshot.reactflow,
      nodes: migratedNodes,
      edges: migratedEdges,
    },
  };
}
