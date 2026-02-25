/**
 * Unit tests for NodeShell component.
 * Validates: Requirements 1.12, 1.13, 5.1
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NodeShell from '../../components/canvas/nodes/NodeShell';
import type { PortDefinition } from '../../lib/canvas/types';

// Mock @xyflow/react Handle component
jest.mock('@xyflow/react', () => ({
  Handle: ({ id, type, position, style }: any) => (
    <div data-testid={`handle-${id ?? type}`} data-type={type} data-position={position} style={style} />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

const basePorts: PortDefinition[] = [
  { id: 'in-text', direction: 'input', dataType: 'text', label: 'Text In' },
  { id: 'out-image', direction: 'output', dataType: 'image', label: 'Image Out' },
];

describe('NodeShell', () => {
  test('renders title and children in full mode', () => {
    render(
      <NodeShell nodeId="n1" title="Test Node">
        <span data-testid="child">Hello</span>
      </NodeShell>,
    );
    expect(screen.getByText('Test Node')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  test('renders default handles when no ports provided', () => {
    const { container } = render(
      <NodeShell nodeId="n1" title="No Ports">
        <span>Content</span>
      </NodeShell>,
    );
    expect(screen.getByTestId('handle-target')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source')).toBeInTheDocument();
  });

  test('renders typed port handles when ports provided', () => {
    render(
      <NodeShell nodeId="n1" title="With Ports" ports={basePorts}>
        <span>Content</span>
      </NodeShell>,
    );
    expect(screen.getByTestId('handle-in-text')).toBeInTheDocument();
    expect(screen.getByTestId('handle-out-image')).toBeInTheDocument();
  });

  test('hides children when collapsed', () => {
    render(
      <NodeShell nodeId="n1" title="Collapsed" collapsed={true} onToggleCollapse={() => {}}>
        <span data-testid="child">Hidden</span>
      </NodeShell>,
    );
    expect(screen.getByText('Collapsed')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  test('shows children when not collapsed', () => {
    render(
      <NodeShell nodeId="n1" title="Expanded" collapsed={false} onToggleCollapse={() => {}}>
        <span data-testid="child">Visible</span>
      </NodeShell>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  test('calls onToggleCollapse when collapse button clicked', () => {
    const onToggle = jest.fn();
    render(
      <NodeShell nodeId="n1" title="Toggle" collapsed={false} onToggleCollapse={onToggle}>
        <span>Content</span>
      </NodeShell>,
    );
    const btn = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('double-click title enters edit mode and commits on Enter', () => {
    const onTitleChange = jest.fn();
    render(
      <NodeShell nodeId="n1" title="Old Title" onTitleChange={onTitleChange}>
        <span>Content</span>
      </NodeShell>,
    );
    const titleEl = screen.getByText('Old Title');
    fireEvent.doubleClick(titleEl);

    const input = screen.getByDisplayValue('Old Title');
    fireEvent.change(input, { target: { value: 'New Title' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onTitleChange).toHaveBeenCalledWith('New Title');
  });

  test('double-click title does nothing when onTitleChange not provided', () => {
    render(
      <NodeShell nodeId="n1" title="Static Title">
        <span>Content</span>
      </NodeShell>,
    );
    const titleEl = screen.getByText('Static Title');
    fireEvent.doubleClick(titleEl);
    // Should still show text, not an input
    expect(screen.getByText('Static Title')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('Escape cancels title edit', () => {
    const onTitleChange = jest.fn();
    render(
      <NodeShell nodeId="n1" title="Original" onTitleChange={onTitleChange}>
        <span>Content</span>
      </NodeShell>,
    );
    fireEvent.doubleClick(screen.getByText('Original'));
    const input = screen.getByDisplayValue('Original');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onTitleChange).not.toHaveBeenCalled();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  test('selected state adds ring class', () => {
    const { container } = render(
      <NodeShell nodeId="n1" title="Selected" selected={true}>
        <span>Content</span>
      </NodeShell>,
    );
    const shell = container.firstChild as HTMLElement;
    expect(shell.className).toContain('ring-2');
    expect(shell.className).toContain('ring-primary');
  });

  test('renderLevel=placeholder shows minimal UI', () => {
    render(
      <NodeShell nodeId="n1" title="Placeholder" renderLevel="placeholder">
        <span data-testid="child">Should not appear</span>
      </NodeShell>,
    );
    expect(screen.getByText('Placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  test('renderLevel=simplified shows title but no children', () => {
    render(
      <NodeShell nodeId="n1" title="Simplified" renderLevel="simplified">
        <span data-testid="child">Should not appear</span>
      </NodeShell>,
    );
    expect(screen.getByText('Simplified')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  test('renders icon when provided', () => {
    const MockIcon = ({ size }: { size?: number }) => (
      <svg data-testid="mock-icon" width={size} height={size} />
    );
    render(
      <NodeShell nodeId="n1" title="With Icon" icon={MockIcon}>
        <span>Content</span>
      </NodeShell>,
    );
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  test('applies colorClass to title bar', () => {
    const { container } = render(
      <NodeShell nodeId="n1" title="Colored" colorClass="bg-red-500 text-white">
        <span>Content</span>
      </NodeShell>,
    );
    const titleBar = container.querySelector('.bg-red-500');
    expect(titleBar).toBeInTheDocument();
  });
});
