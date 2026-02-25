/**
 * Property-Based Tests for port-system.ts
 *
 * Uses fast-check to verify universal properties of the port type system.
 * Each property maps to a correctness property from the design document.
 */
import * as fc from 'fast-check';
import type { Node, Edge } from '@xyflow/react';
import type { PortDataType, PortDefinition } from '../../lib/canvas/types';
import {
  PORT_COLORS,
  arePortsCompatible,
  validateConnection,
} from '../../lib/canvas/port-system';
import { getAllNodeTypes } from '../../lib/canvas/node-registry';

// ===== Generators =====

const arbPortDataType = fc.constantFrom<PortDataType>(
  'text',
  'image',
  'video',
  'asset-ref',
  'storyboard-list',
);

// ===== Helpers =====

function makeNode(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as Node;
}

/**
 * Build a lookup of node types that have at least one output port of a given dataType,
 * paired with node types that have at least one input port of the same dataType.
 * This lets us construct valid/invalid connection scenarios from the real registry.
 */
function findNodePairForDataType(
  registry: Map<string, import('../../lib/canvas/node-registry').NodeTypeRegistration>,
  dataType: PortDataType,
): {
  sourceType: string;
  sourceHandle: string;
  targetType: string;
  targetHandle: string;
} | null {
  let sourceType: string | null = null;
  let sourceHandle: string | null = null;
  let targetType: string | null = null;
  let targetHandle: string | null = null;

  for (const [type, reg] of registry) {
    for (const port of reg.ports) {
      if (port.direction === 'output' && port.dataType === dataType && !sourceType) {
        sourceType = type;
        sourceHandle = port.id;
      }
      if (port.direction === 'input' && port.dataType === dataType && !targetType) {
        targetType = type;
        targetHandle = port.id;
      }
    }
    if (sourceType && targetType) break;
  }

  if (sourceType && sourceHandle && targetType && targetHandle) {
    return { sourceType, sourceHandle, targetType, targetHandle };
  }
  return null;
}

// ===== Property Tests =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 5: Port type compatibility validation', () => {
  /**
   * Property 5: 端口类型兼容性验证
   * arePortsCompatible returns true iff dataTypes match (with correct directions).
   * validateConnection returns valid:true when types match and valid:false when they don't,
   * using real nodes from the registry.
   *
   * **Validates: Requirements 2.2, 2.3, 2.5, 4.6**
   */

  it('arePortsCompatible returns true iff output→input with same dataType', () => {
    fc.assert(
      fc.property(arbPortDataType, arbPortDataType, (srcType, tgtType) => {
        const source: PortDefinition = {
          id: 'out',
          direction: 'output',
          dataType: srcType,
          label: srcType,
        };
        const target: PortDefinition = {
          id: 'in',
          direction: 'input',
          dataType: tgtType,
          label: tgtType,
        };

        const result = arePortsCompatible(source, target);

        if (srcType === tgtType) {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('arePortsCompatible rejects wrong directions regardless of dataType match', () => {
    fc.assert(
      fc.property(arbPortDataType, (dataType) => {
        // input → input
        expect(
          arePortsCompatible(
            { id: 'a', direction: 'input', dataType, label: '' },
            { id: 'b', direction: 'input', dataType, label: '' },
          ),
        ).toBe(false);

        // output → output
        expect(
          arePortsCompatible(
            { id: 'a', direction: 'output', dataType, label: '' },
            { id: 'b', direction: 'output', dataType, label: '' },
          ),
        ).toBe(false);

        // input → output
        expect(
          arePortsCompatible(
            { id: 'a', direction: 'input', dataType, label: '' },
            { id: 'b', direction: 'output', dataType, label: '' },
          ),
        ).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('validateConnection returns valid:true when port dataTypes match using real registry nodes', () => {
    const registry = getAllNodeTypes();

    // Collect all data types that have both a source (output) and target (input) in the registry
    const allDataTypes: PortDataType[] = ['text', 'image', 'video', 'asset-ref', 'storyboard-list'];
    const testableTypes = allDataTypes.filter((dt) => findNodePairForDataType(registry, dt) !== null);

    // We need at least some testable types
    expect(testableTypes.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...testableTypes), (dataType) => {
        const pair = findNodePairForDataType(registry, dataType)!;
        const nodes = [
          makeNode('src', pair.sourceType),
          makeNode('tgt', pair.targetType),
        ];
        const edges: Edge[] = [];

        const result = validateConnection(
          {
            source: 'src',
            sourceHandle: pair.sourceHandle,
            target: 'tgt',
            targetHandle: pair.targetHandle,
          },
          nodes,
          edges,
          registry,
        );

        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('validateConnection returns valid:false when port dataTypes differ using real registry nodes', () => {
    const registry = getAllNodeTypes();

    // Build pairs of (sourceDataType, targetDataType) where they differ
    // and both have real nodes in the registry
    type MismatchPair = {
      srcDataType: PortDataType;
      tgtDataType: PortDataType;
      sourceType: string;
      sourceHandle: string;
      targetType: string;
      targetHandle: string;
    };

    const mismatchPairs: MismatchPair[] = [];
    const allDataTypes: PortDataType[] = ['text', 'image', 'video', 'asset-ref', 'storyboard-list'];

    for (const srcDT of allDataTypes) {
      for (const tgtDT of allDataTypes) {
        if (srcDT === tgtDT) continue;
        // Find a node with an output of srcDT
        let sourceType: string | null = null;
        let sourceHandle: string | null = null;
        let targetType: string | null = null;
        let targetHandle: string | null = null;

        for (const [type, reg] of registry) {
          for (const port of reg.ports) {
            if (port.direction === 'output' && port.dataType === srcDT && !sourceType) {
              sourceType = type;
              sourceHandle = port.id;
            }
            if (port.direction === 'input' && port.dataType === tgtDT && !targetType) {
              targetType = type;
              targetHandle = port.id;
            }
          }
        }

        if (sourceType && sourceHandle && targetType && targetHandle) {
          mismatchPairs.push({
            srcDataType: srcDT,
            tgtDataType: tgtDT,
            sourceType,
            sourceHandle,
            targetType,
            targetHandle,
          });
        }
      }
    }

    expect(mismatchPairs.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...mismatchPairs), (pair) => {
        const nodes = [
          makeNode('src', pair.sourceType),
          makeNode('tgt', pair.targetType),
        ];
        const edges: Edge[] = [];

        const result = validateConnection(
          {
            source: 'src',
            sourceHandle: pair.sourceHandle,
            target: 'tgt',
            targetHandle: pair.targetHandle,
          },
          nodes,
          edges,
          registry,
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('validateConnection allows fan-out: same output to multiple inputs with matching types', () => {
    const registry = getAllNodeTypes();

    // Use scriptNode.text → multiple generatorNode.in-script (text→text)
    // or any matching pair that exists
    const allDataTypes: PortDataType[] = ['text', 'image', 'video', 'asset-ref', 'storyboard-list'];
    const testableTypes = allDataTypes.filter((dt) => findNodePairForDataType(registry, dt) !== null);

    fc.assert(
      fc.property(
        fc.constantFrom(...testableTypes),
        fc.integer({ min: 2, max: 5 }),
        (dataType, fanOutCount) => {
          const pair = findNodePairForDataType(registry, dataType)!;
          const sourceNode = makeNode('src', pair.sourceType);
          const targetNodes = Array.from({ length: fanOutCount }, (_, i) =>
            makeNode(`tgt-${i}`, pair.targetType),
          );
          const nodes = [sourceNode, ...targetNodes];

          // Existing edges from src to all targets except the last
          const existingEdges: Edge[] = targetNodes.slice(0, -1).map((tgt, i) => ({
            id: `e-${i}`,
            source: 'src',
            sourceHandle: pair.sourceHandle,
            target: tgt.id,
            targetHandle: pair.targetHandle,
          })) as Edge[];

          // Validate connecting to the last target
          const lastTarget = targetNodes[targetNodes.length - 1];
          const result = validateConnection(
            {
              source: 'src',
              sourceHandle: pair.sourceHandle,
              target: lastTarget.id,
              targetHandle: pair.targetHandle,
            },
            nodes,
            existingEdges,
            registry,
          );

          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: infinite-canvas-storyboard-fusion, Property 8: Port color mapping uniqueness', () => {
  /**
   * Property 8: 端口颜色映射唯一性
   * For any two distinct port data types, PORT_COLORS maps them to different color values.
   *
   * **Validates: Requirements 2.9**
   */

  it('any two distinct port data types map to different colors', () => {
    fc.assert(
      fc.property(arbPortDataType, arbPortDataType, (typeA, typeB) => {
        fc.pre(typeA !== typeB);

        const colorA = PORT_COLORS[typeA];
        const colorB = PORT_COLORS[typeB];

        expect(colorA).toBeDefined();
        expect(colorB).toBeDefined();
        expect(colorA).not.toBe(colorB);
      }),
      { numRuns: 100 },
    );
  });

  it('all port data types have a defined color value', () => {
    fc.assert(
      fc.property(arbPortDataType, (dataType) => {
        const color = PORT_COLORS[dataType];
        expect(color).toBeDefined();
        expect(typeof color).toBe('string');
        expect(color.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
