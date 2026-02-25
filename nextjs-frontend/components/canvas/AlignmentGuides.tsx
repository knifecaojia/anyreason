'use client';

/** Bounds of a node on the canvas */
export interface NodeBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounds of the currently dragging node (no id needed) */
export interface DraggingNodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignmentGuidesProps {
  /** Currently dragging node bounds */
  draggingNode: DraggingNodeBounds | null;
  /** All other nodes' bounds */
  otherNodes: NodeBounds[];
  /** Alignment threshold in pixels (default 5) */
  threshold?: number;
}

export interface AlignmentLine {
  /** 'horizontal' = constant y, 'vertical' = constant x */
  orientation: 'horizontal' | 'vertical';
  /** The coordinate value of the guide line */
  position: number;
}

/**
 * Compute alignment guide lines between a dragging node and a set of other nodes.
 * Returns deduplicated lines within the given threshold.
 */
export function computeAlignmentLines(
  dragging: DraggingNodeBounds,
  others: NodeBounds[],
  threshold: number,
): AlignmentLine[] {
  const lines: AlignmentLine[] = [];
  const seen = new Set<string>();

  const dragCenterX = dragging.x + dragging.width / 2;
  const dragCenterY = dragging.y + dragging.height / 2;
  const dragRight = dragging.x + dragging.width;
  const dragBottom = dragging.y + dragging.height;

  // Reference y-values from the dragging node: top, center, bottom
  const dragYs = [dragging.y, dragCenterY, dragBottom];
  // Reference x-values from the dragging node: left, center, right
  const dragXs = [dragging.x, dragCenterX, dragRight];

  for (const other of others) {
    const otherCenterX = other.x + other.width / 2;
    const otherCenterY = other.y + other.height / 2;
    const otherRight = other.x + other.width;
    const otherBottom = other.y + other.height;

    const otherYs = [other.y, otherCenterY, otherBottom];
    const otherXs = [other.x, otherCenterX, otherRight];

    // Horizontal guides (shared y-value)
    for (const dy of dragYs) {
      for (const oy of otherYs) {
        if (Math.abs(dy - oy) <= threshold) {
          const key = `h:${oy}`;
          if (!seen.has(key)) {
            seen.add(key);
            lines.push({ orientation: 'horizontal', position: oy });
          }
        }
      }
    }

    // Vertical guides (shared x-value)
    for (const dx of dragXs) {
      for (const ox of otherXs) {
        if (Math.abs(dx - ox) <= threshold) {
          const key = `v:${ox}`;
          if (!seen.has(key)) {
            seen.add(key);
            lines.push({ orientation: 'vertical', position: ox });
          }
        }
      }
    }
  }

  return lines;
}

const GUIDE_COLOR = '#06b6d4'; // cyan-500

/**
 * AlignmentGuides renders SVG alignment reference lines when a node is being
 * dragged near other nodes on the canvas. Designed to be placed as an SVG
 * overlay inside the ReactFlow canvas (e.g. via a custom panel or SVG layer).
 *
 * Works alongside ReactFlow's snapToGrid for precise node placement.
 */
export default function AlignmentGuides({
  draggingNode,
  otherNodes,
  threshold = 5,
}: AlignmentGuidesProps) {
  if (!draggingNode) return null;

  const lines = computeAlignmentLines(draggingNode, otherNodes, threshold);

  if (lines.length === 0) return null;

  // Use a large extent so lines span the visible canvas area
  const EXTENT = 100_000;

  return (
    <svg
      data-testid="alignment-guides"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {lines.map((line, i) =>
        line.orientation === 'horizontal' ? (
          <line
            key={`h-${line.position}-${i}`}
            x1={-EXTENT}
            y1={line.position}
            x2={EXTENT}
            y2={line.position}
            stroke={GUIDE_COLOR}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        ) : (
          <line
            key={`v-${line.position}-${i}`}
            x1={line.position}
            y1={-EXTENT}
            x2={line.position}
            y2={EXTENT}
            stroke={GUIDE_COLOR}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        ),
      )}
    </svg>
  );
}
