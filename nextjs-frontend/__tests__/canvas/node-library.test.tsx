/**
 * Unit tests for NodeLibrary component.
 * Validates: Requirements 1.2, 1.3
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NodeLibrary from '../../components/canvas/NodeLibrary';

// Mock @xyflow/react (needed by node-registry component imports)
jest.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

// Mock lucide-react icons used by NodeLibrary
jest.mock('lucide-react', () => ({
  ChevronDown: ({ size }: any) => <svg data-testid="chevron-down" width={size} />,
  ChevronRight: ({ size }: any) => <svg data-testid="chevron-right" width={size} />,
  ChevronUp: ({ size }: any) => <svg data-testid="chevron-up" width={size} />,
}));

describe('NodeLibrary', () => {
  test('renders the panel with title', () => {
    render(<NodeLibrary />);
    expect(screen.getByText('节点库')).toBeInTheDocument();
  });

  test('renders all four group labels', () => {
    render(<NodeLibrary />);
    expect(screen.getByText('创作组')).toBeInTheDocument();
    expect(screen.getByText('AI 生成组')).toBeInTheDocument();
    expect(screen.getByText('展示组')).toBeInTheDocument();
    expect(screen.getByText('引用组')).toBeInTheDocument();
  });

  test('renders node type labels from registry', () => {
    render(<NodeLibrary />);
    // Creation group
    expect(screen.getByText('Text Note')).toBeInTheDocument();
    expect(screen.getByText('Script')).toBeInTheDocument();
    expect(screen.getByText('Storyboard')).toBeInTheDocument();
    // AI generation group
    expect(screen.getByText('Generator')).toBeInTheDocument();
    expect(screen.getByText('Slicer')).toBeInTheDocument();
    expect(screen.getByText('Candidate')).toBeInTheDocument();
    // Display group
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    // Reference group
    expect(screen.getByText('Asset')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
  });

  test('collapsing a group hides its node types', () => {
    render(<NodeLibrary />);
    // All groups start expanded — "Text Note" should be visible
    expect(screen.getByText('Text Note')).toBeInTheDocument();

    // Click the 创作组 button to collapse it
    fireEvent.click(screen.getByText('创作组'));
    expect(screen.queryByText('Text Note')).not.toBeInTheDocument();
    expect(screen.queryByText('Script')).not.toBeInTheDocument();

    // Other groups remain visible
    expect(screen.getByText('Generator')).toBeInTheDocument();
  });

  test('expanding a collapsed group shows its node types again', () => {
    render(<NodeLibrary />);
    const groupBtn = screen.getByText('创作组');

    // Collapse
    fireEvent.click(groupBtn);
    expect(screen.queryByText('Text Note')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(groupBtn);
    expect(screen.getByText('Text Note')).toBeInTheDocument();
  });

  test('node items are draggable and set correct dataTransfer', () => {
    render(<NodeLibrary />);
    const textNoteItem = screen.getByText('Text Note').closest('[draggable]');
    expect(textNoteItem).toBeTruthy();
    expect(textNoteItem!.getAttribute('draggable')).toBe('true');

    // Simulate dragStart
    const setData = jest.fn();
    const dataTransfer = { setData, effectAllowed: '' };
    fireEvent.dragStart(textNoteItem!, { dataTransfer } as any);

    expect(setData).toHaveBeenCalledWith(
      'application/reactflow-node-type',
      'textNoteNode',
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  test('renders drag hint text', () => {
    render(<NodeLibrary />);
    expect(screen.getByText('拖拽节点至画布以添加')).toBeInTheDocument();
  });
});
