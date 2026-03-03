// lib/canvas/image-utils.ts
// Shared helpers for canvas image/video output nodes:
// - Unified upstream data collection (single `in` handle, auto-detect text vs image by node type)
// - Reference image ordering by Y position with @N indices
// - URL → base64 conversion

import type { Node, Edge } from '@xyflow/react';

// Node types that produce text output
const TEXT_SOURCE_TYPES = new Set([
  'textNoteNode', 'scriptNode', 'textGenNode', 'storyboardNode', 'promptNode',
]);

// Node types that produce image references
const IMAGE_SOURCE_TYPES = new Set([
  'assetNode', 'imageOutputNode',
]);

export interface RefImage {
  index: number;   // 1-based (@1, @2, ...)
  name: string;    // display name from source node
  url: string;     // download URL (for fetching)
  thumbUrl: string; // thumbnail URL (for UI preview)
}

export interface UpstreamData {
  promptText: string;       // concatenated text from all text sources
  refImages: RefImage[];    // ordered reference images
  hasTextSource: boolean;   // whether any text node is connected
}

/**
 * Fetch an image URL and return a data-URI string (data:image/xxx;base64,...).
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Collect all upstream data connected to a node's `in` handle.
 * Auto-detects source type: text nodes → promptText, asset/image nodes → refImages.
 * Reference images are sorted by source node Y position (top→bottom) and assigned @N indices.
 */
export function collectUpstreamData(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): UpstreamData {
  const incomingEdges = edges.filter(
    (e) => e.target === nodeId && (e.targetHandle === 'in' || !e.targetHandle),
  );

  const texts: string[] = [];
  const imageSources: { node: Node; url: string; thumbUrl: string; name: string }[] = [];

  for (const edge of incomingEdges) {
    const srcNode = nodes.find((n) => n.id === edge.source);
    if (!srcNode) continue;
    const d = srcNode.data as Record<string, unknown>;
    const srcType = srcNode.type || '';

    if (TEXT_SOURCE_TYPES.has(srcType)) {
      // Text source: extract text content
      const text = (d.lastOutput as string) || (d.content as string) || (d.text as string) || (d.sceneDescription as string) || '';
      if (text.trim()) texts.push(text.trim());
    } else if (IMAGE_SOURCE_TYPES.has(srcType)) {
      // Image source: extract image URL
      const imgData = extractImageFromNode(d, srcType);
      if (imgData) {
        imageSources.push({ node: srcNode, ...imgData });
      }
    }
  }

  // Sort image sources by Y position (top to bottom), then X as tiebreaker
  imageSources.sort((a, b) => {
    const dy = (a.node.position?.y ?? 0) - (b.node.position?.y ?? 0);
    if (Math.abs(dy) > 5) return dy;
    return (a.node.position?.x ?? 0) - (b.node.position?.x ?? 0);
  });

  // Assign 1-based indices
  const refImages: RefImage[] = imageSources.map((src, i) => ({
    index: i + 1,
    name: src.name,
    url: src.url,
    thumbUrl: src.thumbUrl,
  }));

  return {
    promptText: texts.join('\n\n'),
    refImages,
    hasTextSource: texts.length > 0,
  };
}

function extractImageFromNode(
  d: Record<string, unknown>,
  nodeType: string,
): { url: string; thumbUrl: string; name: string } | null {
  if (nodeType === 'assetNode') {
    const resources = d.resources as { thumbnail: string; download: string }[] | undefined;
    const activeIdx = (d.activeResourceIndex as number) ?? 0;
    const name = (d.name as string) || '资产';
    if (resources && resources.length > 0) {
      const idx = Math.min(activeIdx, resources.length - 1);
      return { url: resources[idx].download, thumbUrl: resources[idx].thumbnail, name };
    }
    if (d.thumbnail && typeof d.thumbnail === 'string') {
      return { url: d.thumbnail, thumbUrl: d.thumbnail, name };
    }
  } else if (nodeType === 'imageOutputNode') {
    const full = d.lastImageFull as string | undefined;
    const img = d.lastImage as string | undefined;
    const url = full || img;
    if (url) return { url, thumbUrl: img || url, name: '生成图' };
  }
  return null;
}

/**
 * Fetch all reference images and convert to base64 data URIs.
 * Returns array in the same order as refImages (preserving @N indices).
 */
export async function fetchRefImagesAsBase64(refImages: RefImage[]): Promise<string[]> {
  if (refImages.length === 0) return [];
  const results: string[] = [];
  for (const ref of refImages) {
    try {
      const dataUrl = await fetchImageAsBase64(ref.url);
      results.push(dataUrl);
    } catch (err) {
      console.warn(`[image-utils] Failed to convert ref @${ref.index} to base64:`, ref.url, err);
    }
  }
  return results;
}
