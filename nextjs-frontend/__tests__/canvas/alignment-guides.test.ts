import {
  computeAlignmentLines,
  type DraggingNodeBounds,
  type NodeBounds,
  type AlignmentLine,
} from '../../components/canvas/AlignmentGuides';

// ===== computeAlignmentLines =====

describe('computeAlignmentLines', () => {
  const defaultThreshold = 5;

  describe('returns empty when no alignments exist', () => {
    test('no other nodes', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 100, width: 50, height: 50 };
      const result = computeAlignmentLines(dragging, [], defaultThreshold);
      expect(result).toEqual([]);
    });

    test('other nodes are far away', () => {
      const dragging: DraggingNodeBounds = { x: 0, y: 0, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 500, y: 500, width: 50, height: 50 },
      ];
      const result = computeAlignmentLines(dragging, others, defaultThreshold);
      expect(result).toEqual([]);
    });
  });

  describe('horizontal alignment (shared y)', () => {
    test('top-to-top alignment', () => {
      const dragging: DraggingNodeBounds = { x: 0, y: 100, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 200, y: 102, width: 50, height: 50 },
      ];
      const result = computeAlignmentLines(dragging, others, defaultThreshold);
      const horizontal = result.filter(l => l.orientation === 'horizontal');
      expect(horizontal.length).toBeGreaterThanOrEqual(1);
      // The guide should be at the other node's top y (102)
      expect(horizontal.some(l => l.position === 102)).toBe(true);
    });

    test('center-y to center-y alignment', () => {
      const dragging: DraggingNodeBounds = { x: 0, y: 100, width: 50, height: 100 };
      // dragging center-y = 150
      const others: NodeBounds[] = [
        { id: 'a', x: 200, y: 100, width: 50, height: 100 },
        // other center-y = 150 → exact match
      ];
      const result = computeAlignmentLines(dragging, others, defaultThreshold);
      const horizontal = result.filter(l => l.orientation === 'horizontal');
      expect(horizontal.some(l => l.position === 150)).toBe(true);
    });

    test('bottom-to-bottom alignment', () => {
      const dragging: DraggingNodeBounds = { x: 0, y: 100, width: 50, height: 50 };
      // dragging bottom = 150
      const others: NodeBounds[] = [
        { id: 'a', x: 200, y: 100, width: 50, height: 50 },
        // other bottom = 150 → exact match
      ];
      const result = computeAlignmentLines(dragging, others, defaultThreshold);
      const horizontal = result.filter(l => l.orientation === 'horizontal');
      expect(horizontal.some(l => l.position === 150)).toBe(true);
    });
  });

  describe('vertical alignment (shared x)', () => {
    test('left-to-left alignment', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 0, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 103, y: 200, width: 50, height: 50 },
      ];
      const result = computeAlignmentLines(dragging, others, defaultThreshold);
      const vertical = result.filter(l => l.orientation === 'vertical');
      expect(vertical.length).toBeGreaterThanOrEqual(1);
      expect(vertical.some(l => l.position === 103)).toBe(true);
    });

    test('center-x to center-x alignment', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 0, width: 100, height: 50 };
      // dragging center-x = 150
      const others: NodeBounds[] = [
        { id: 'a', x: 100, y: 200, width: 100, height: 50 },
        // other center-x = 150 → exact match
      ];
      const result = computeAlignmentLines(dragging, others, defaultThreshold);
      const vertical = result.filter(l => l.orientation === 'vertical');
      expect(vertical.some(l => l.position === 150)).toBe(true);
    });

    test('right-to-right alignment', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 0, width: 50, height: 50 };
      // dragging right = 150
      const others: NodeBounds[] = [
        { id: 'a', x: 100, y: 200, width: 50, height: 50 },
        // other right = 150 → exact match
      ];
      const result = computeAlignmentLines(dragging, others, defaultThreshold);
      const vertical = result.filter(l => l.orientation === 'vertical');
      expect(vertical.some(l => l.position === 150)).toBe(true);
    });
  });

  describe('threshold behavior', () => {
    test('exact match (distance = 0) is detected', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 100, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 100, y: 200, width: 50, height: 50 },
      ];
      const result = computeAlignmentLines(dragging, others, 0);
      expect(result.length).toBeGreaterThan(0);
    });

    test('distance exactly at threshold is included', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 100, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 105, y: 200, width: 50, height: 50 },
      ];
      // left-to-left: |100 - 105| = 5, threshold = 5 → included
      const result = computeAlignmentLines(dragging, others, 5);
      const vertical = result.filter(l => l.orientation === 'vertical');
      expect(vertical.some(l => l.position === 105)).toBe(true);
    });

    test('distance just beyond threshold is excluded', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 100, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 200, y: 200, width: 50, height: 50 },
      ];
      // All reference points are far apart
      const result = computeAlignmentLines(dragging, others, 5);
      expect(result).toEqual([]);
    });
  });

  describe('deduplication', () => {
    test('same alignment from multiple nodes produces one line', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 100, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 100, y: 300, width: 50, height: 50 },
        { id: 'b', x: 100, y: 500, width: 50, height: 50 },
      ];
      const result = computeAlignmentLines(dragging, others, 5);
      // Both nodes have left x=100, same as dragging → only one vertical line at x=100
      const verticalAt100 = result.filter(
        l => l.orientation === 'vertical' && l.position === 100,
      );
      expect(verticalAt100).toHaveLength(1);
    });
  });

  describe('multiple nodes', () => {
    test('detects alignments with multiple nodes', () => {
      const dragging: DraggingNodeBounds = { x: 100, y: 100, width: 50, height: 50 };
      const others: NodeBounds[] = [
        { id: 'a', x: 100, y: 300, width: 80, height: 80 },  // left x matches
        { id: 'b', x: 300, y: 100, width: 60, height: 60 },  // top y matches
      ];
      const result = computeAlignmentLines(dragging, others, 5);
      const vertical = result.filter(l => l.orientation === 'vertical');
      const horizontal = result.filter(l => l.orientation === 'horizontal');
      expect(vertical.some(l => l.position === 100)).toBe(true);
      expect(horizontal.some(l => l.position === 100)).toBe(true);
    });
  });
});
