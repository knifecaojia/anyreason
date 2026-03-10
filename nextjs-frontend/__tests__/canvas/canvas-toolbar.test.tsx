/**
 * Unit tests for CanvasToolbar component.
 * Validates: Import, Export, and Save button behavior.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CanvasToolbar, {
  type CanvasToolbarProps,
} from '../../components/canvas/CanvasToolbar';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Download: ({ size }: any) => <svg data-testid="icon-download" width={size} />,
  Upload: ({ size }: any) => <svg data-testid="icon-upload" width={size} />,
  Save: ({ size }: any) => <svg data-testid="icon-save" width={size} />,
  Loader2: ({ size }: any) => <svg data-testid="icon-loader" width={size} />,
  Check: ({ size }: any) => <svg data-testid="icon-check" width={size} />,
  AlertCircle: ({ size }: any) => <svg data-testid="icon-alert" width={size} />,
}));

const defaultProps: CanvasToolbarProps = {
  onExportWorkflow: jest.fn(),
  onImportWorkflow: jest.fn(),
  onSave: jest.fn(),
  saveStatus: 'idle',
};

function renderToolbar(overrides: Partial<CanvasToolbarProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<CanvasToolbar {...props} />);
}

describe('CanvasToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ──

  test('renders import button', () => {
    renderToolbar();
    expect(screen.getByTitle('导入工作流')).toBeInTheDocument();
  });

  test('renders export button', () => {
    renderToolbar();
    expect(screen.getByTitle('导出工作流')).toBeInTheDocument();
  });

  test('renders save button in idle state', () => {
    renderToolbar({ saveStatus: 'idle' });
    expect(screen.getByTitle('保存画布 (Ctrl+S)')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();
  });

  // ── Save button states ──

  test('shows "保存中…" label when saving', () => {
    renderToolbar({ saveStatus: 'saving' });
    expect(screen.getByText('保存中…')).toBeInTheDocument();
  });

  test('shows "已保存" label when saved', () => {
    renderToolbar({ saveStatus: 'saved' });
    expect(screen.getByText('已保存')).toBeInTheDocument();
  });

  test('shows "保存失败" label on error', () => {
    renderToolbar({ saveStatus: 'error' });
    expect(screen.getByText('保存失败')).toBeInTheDocument();
  });

  test('save button is disabled while saving', () => {
    renderToolbar({ saveStatus: 'saving' });
    expect(screen.getByTitle('保存画布 (Ctrl+S)')).toBeDisabled();
  });

  test('save button is enabled when idle', () => {
    renderToolbar({ saveStatus: 'idle' });
    expect(screen.getByTitle('保存画布 (Ctrl+S)')).not.toBeDisabled();
  });

  // ── Click handlers ──

  test('calls onSave when save button is clicked', () => {
    const onSave = jest.fn();
    renderToolbar({ onSave, saveStatus: 'idle' });
    fireEvent.click(screen.getByTitle('保存画布 (Ctrl+S)'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test('calls onExportWorkflow when export button is clicked', () => {
    const onExportWorkflow = jest.fn();
    renderToolbar({ onExportWorkflow });
    fireEvent.click(screen.getByTitle('导出工作流'));
    expect(onExportWorkflow).toHaveBeenCalledTimes(1);
  });

  test('calls onImportWorkflow when import button is clicked', () => {
    const onImportWorkflow = jest.fn();
    renderToolbar({ onImportWorkflow });
    fireEvent.click(screen.getByTitle('导入工作流'));
    expect(onImportWorkflow).toHaveBeenCalledTimes(1);
  });

  test('does not call onSave when save button is clicked while saving', () => {
    const onSave = jest.fn();
    renderToolbar({ onSave, saveStatus: 'saving' });
    fireEvent.click(screen.getByTitle('保存画布 (Ctrl+S)'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
