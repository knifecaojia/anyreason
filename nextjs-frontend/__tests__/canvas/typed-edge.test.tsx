/**
 * Unit tests for TypedEdge component.
 * Validates: Requirements 2.9, 2.10
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import TypedEdge, { TYPED_EDGE_TYPE } from '../../components/canvas/TypedEdge';
import { PORT_COLORS } from '../../lib/canvas/port-system';
import type { PortDataType } from '../../lib/canvas/types';

// Mock @xyflow/react
let capturedBaseEdgeCalls: any[] = [];

jest.mock('@xyflow/react', () => ({
  BaseEdge: (props: any) => {
    capturedBaseEdgeCalls.push(props);
    return <path data-testid={`edge-${props.id}`} style={props.style} />;
  },
  getBezierPath: () => ['M0,0 C50,0 50,100 100,100'],
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

const baseProps = {
  id: 'e1',
  source: 'n1',
  target: 'n2',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: 'right' as any,
  targetPosition: 'left' as any,
  selected: false,
  data: {},
} as any;

beforeEach(() => {
  capturedBaseEdgeCalls = [];
});

describe('TypedEdge', () => {
  test('exports TYPED_EDGE_TYPE constant', () => {
    expect(TYPED_EDGE_TYPE).toBe('typedEdge');
  });

  test('renders with default gray color when no portType', () => {
    render(<TypedEdge {...baseProps} data={{}} />);
    const mainEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1');
    expect(mainEdge).toBeDefined();
    expect(mainEdge.style.stroke).toBe('#94a3b8');
  });

  test.each([
    ['text', '#3b82f6'],
    ['image', '#a855f7'],
    ['video', '#22c55e'],
    ['asset-ref', '#f97316'],
    ['storyboard-list', '#06b6d4'],
  ] as [PortDataType, string][])(
    'uses PORT_COLORS for portType=%s → %s',
    (portType, expectedColor) => {
      capturedBaseEdgeCalls = [];
      render(<TypedEdge {...baseProps} data={{ portType }} />);
      const mainEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1');
      expect(mainEdge.style.stroke).toBe(expectedColor);
      expect(mainEdge.style.stroke).toBe(PORT_COLORS[portType]);
    },
  );

  test('applies flow animation when isTransmitting is true', () => {
    render(<TypedEdge {...baseProps} data={{ isTransmitting: true }} />);
    const mainEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1');
    expect(mainEdge.style.strokeDasharray).toBe('6 4');
    expect(mainEdge.style.animation).toContain('typedEdgeFlow');
  });

  test('no animation when isTransmitting is false', () => {
    render(<TypedEdge {...baseProps} data={{ isTransmitting: false }} />);
    const mainEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1');
    expect(mainEdge.style.strokeDasharray).toBeUndefined();
    expect(mainEdge.style.animation).toBeUndefined();
  });

  test('increases stroke width and adds glow when selected', () => {
    capturedBaseEdgeCalls = [];
    render(<TypedEdge {...baseProps} selected={true} data={{ portType: 'image' }} />);

    // Should have glow layer + main edge = 2 BaseEdge calls
    expect(capturedBaseEdgeCalls.length).toBe(2);

    const glowEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1-glow');
    expect(glowEdge).toBeDefined();
    expect(glowEdge.style.strokeWidth).toBe(8);
    expect(glowEdge.style.opacity).toBe(0.25);

    const mainEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1');
    expect(mainEdge.style.strokeWidth).toBe(3);
  });

  test('no glow layer when not selected', () => {
    capturedBaseEdgeCalls = [];
    render(<TypedEdge {...baseProps} selected={false} />);
    expect(capturedBaseEdgeCalls.length).toBe(1);
    expect(capturedBaseEdgeCalls[0].id).toBe('e1');
    expect(capturedBaseEdgeCalls[0].style.strokeWidth).toBe(2);
  });

  test('combines portType color with selected glow', () => {
    capturedBaseEdgeCalls = [];
    render(
      <TypedEdge {...baseProps} selected={true} data={{ portType: 'video' }} />,
    );
    const glowEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1-glow');
    expect(glowEdge.style.stroke).toBe('#22c55e');
    const mainEdge = capturedBaseEdgeCalls.find((c) => c.id === 'e1');
    expect(mainEdge.style.stroke).toBe('#22c55e');
  });
});
