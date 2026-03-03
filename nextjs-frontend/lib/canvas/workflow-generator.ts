// lib/canvas/workflow-generator.ts
// Pure utility functions for auto-creating storyboard nodes from slicer output
// and generating full workflows (script → slicer → storyboards → generators).
// M1.2: Removed previewNode row. TextGenNode insertion deferred to M1.4.

import type { Node, Edge } from '@xyflow/react';
import type { StoryboardItem, StoryboardNodeData } from './types';
import { getNodeType } from './node-registry';
import { TYPED_EDGE_TYPE } from '@/components/canvas/TypedEdge';

// ===== Layout Constants =====

/** Horizontal spacing between nodes in the same row */
const H_SPACING = 300;

/** Horizontal spacing between storyboard/generator nodes in a group */
const GROUP_H_SPACING = 250;

/** Vertical spacing between rows */
const V_SPACING = 200;

// ===== ID Generation =====

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ===== Storyboard Nodes from Slicer Output =====

export interface StoryboardCreationResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Creates storyboard nodes from a slicer node's output list.
 * Nodes are laid out horizontally starting from `startPosition`.
 *
 * @param slicerNodeId - The ID of the slicer node that produced the storyboard items
 * @param storyboardItems - The list of storyboard items from the slicer output
 * @param startPosition - The top-left position for the first storyboard node
 * @returns New nodes and edges to add to the canvas
 */
export function createStoryboardNodesFromSlicerOutput(
  slicerNodeId: string,
  storyboardItems: StoryboardItem[],
  startPosition: { x: number; y: number },
): StoryboardCreationResult {
  if (!storyboardItems || storyboardItems.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const storyboardReg = getNodeType('storyboardNode');
  const defaultData = storyboardReg?.defaultData() ?? {};

  for (let i = 0; i < storyboardItems.length; i++) {
    const item = storyboardItems[i];
    const nodeId = generateId();

    const data: StoryboardNodeData = {
      ...((defaultData as unknown) as StoryboardNodeData),
      kind: 'storyboard',
      shotNumber: item.shotNumber,
      sceneDescription: item.sceneDescription,
      dialogue: item.dialogue,
    };

    nodes.push({
      id: nodeId,
      type: 'storyboardNode',
      position: {
        x: startPosition.x + i * GROUP_H_SPACING,
        y: startPosition.y,
      },
      data: data as any,
    });

    // Connect slicer's storyboard-list output to each storyboard node
    // (storyboard nodes don't have a storyboard-list input, so we skip edges
    //  from slicer to storyboard — the slicer output is consumed to create them)
  }

  return { nodes, edges };
}

// ===== Full Workflow Generation =====

export interface EpisodeData {
  episodeId: string;
  scriptText?: string;
  storyboards?: Array<{
    id?: string;
    shot_code?: string;
    scene_code?: string;
    description?: string;
    dialogue?: string;
  }>;
}

export interface FullWorkflowResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Generates a complete workflow for an episode:
 *   Row 1: scriptNode → slicerNode
 *   Row 2: storyboardNode group (horizontal, GROUP_H_SPACING apart)
 *   Row 3: generatorNode group (aligned under storyboard nodes)
 *   Row 4: previewNode group (aligned under generator nodes)
 *
 * All nodes are automatically connected:
 *   - scriptNode.text → slicerNode.in-text
 *   - storyboardNode[i].out-desc → generatorNode[i].in-script
 *   - generatorNode[i].image → previewNode[i].in-image
 *
 * @param episodeData - Episode data including storyboards
 * @param startPosition - The top-left position for the workflow
 * @returns All nodes and edges for the complete workflow
 */
export function generateFullWorkflow(
  episodeData: EpisodeData,
  startPosition: { x: number; y: number },
): FullWorkflowResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const storyboards = episodeData.storyboards ?? [];

  // --- Row 1: Script Node → Slicer Node ---
  const scriptNodeId = generateId();
  const slicerNodeId = generateId();

  const scriptReg = getNodeType('scriptNode');
  const slicerReg = getNodeType('slicerNode');

  nodes.push({
    id: scriptNodeId,
    type: 'scriptNode',
    position: {
      x: startPosition.x,
      y: startPosition.y,
    },
    data: {
      ...(scriptReg?.defaultData() ?? {}),
      kind: 'script',
      text: episodeData.scriptText ?? '',
    } as any,
  });

  nodes.push({
    id: slicerNodeId,
    type: 'slicerNode',
    position: {
      x: startPosition.x + H_SPACING,
      y: startPosition.y,
    },
    data: {
      ...(slicerReg?.defaultData() ?? {}),
      kind: 'slicer',
    } as any,
  });

  // Edge: scriptNode.out → slicerNode.in
  edges.push({
    id: generateId(),
    source: scriptNodeId,
    target: slicerNodeId,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: TYPED_EDGE_TYPE,
    data: { portType: 'text' },
  } as Edge);

  // --- Row 2: Storyboard Nodes ---
  const row2Y = startPosition.y + V_SPACING;
  const storyboardNodeIds: string[] = [];

  const storyboardReg = getNodeType('storyboardNode');

  for (let i = 0; i < storyboards.length; i++) {
    const sb = storyboards[i];
    const nodeId = generateId();
    storyboardNodeIds.push(nodeId);

    // Extract shot number from shot_code (e.g. "SC01-SH03" → 3)
    const shotNumMatch = (sb.shot_code ?? '').match(/(\d+)\s*$/);
    const shotNumber = shotNumMatch ? parseInt(shotNumMatch[1], 10) : i + 1;

    nodes.push({
      id: nodeId,
      type: 'storyboardNode',
      position: {
        x: startPosition.x + i * GROUP_H_SPACING,
        y: row2Y,
      },
      data: {
        ...(storyboardReg?.defaultData() ?? {}),
        kind: 'storyboard',
        shotNumber,
        sceneDescription: sb.description ?? '',
        dialogue: sb.dialogue ?? undefined,
        sourceStoryboardId: sb.id ?? undefined,
        episodeId: episodeData.episodeId,
      } as any,
    });
  }

  // --- Row 3: TextGenNode (prompt generation between storyboard and generator) ---
  const row3Y = row2Y + V_SPACING;
  const textGenNodeIds: string[] = [];

  const textGenReg = getNodeType('textGenNode');

  for (let i = 0; i < storyboards.length; i++) {
    const nodeId = generateId();
    textGenNodeIds.push(nodeId);

    nodes.push({
      id: nodeId,
      type: 'textGenNode',
      position: {
        x: startPosition.x + i * GROUP_H_SPACING,
        y: row3Y,
      },
      data: {
        ...(textGenReg?.defaultData() ?? {}),
        kind: 'text-gen',
      } as any,
    });

    // Edge: storyboardNode[i].out → textGenNode[i].in
    edges.push({
      id: generateId(),
      source: storyboardNodeIds[i],
      target: nodeId,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: TYPED_EDGE_TYPE,
      data: { portType: 'text' },
    } as Edge);
  }

  // --- Row 4: Generator Nodes (aligned under textGenNodes) ---
  const row4Y = row3Y + V_SPACING;
  const generatorNodeIds: string[] = [];

  const generatorReg = getNodeType('generatorNode');

  for (let i = 0; i < storyboards.length; i++) {
    const nodeId = generateId();
    generatorNodeIds.push(nodeId);

    nodes.push({
      id: nodeId,
      type: 'generatorNode',
      position: {
        x: startPosition.x + i * GROUP_H_SPACING,
        y: row4Y,
      },
      data: {
        ...(generatorReg?.defaultData() ?? {}),
        kind: 'generator',
      } as any,
    });

    // Edge: textGenNode[i].out → generatorNode[i].in
    edges.push({
      id: generateId(),
      source: textGenNodeIds[i],
      target: nodeId,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: TYPED_EDGE_TYPE,
      data: { portType: 'text' },
    } as Edge);
  }

  return { nodes, edges };
}
