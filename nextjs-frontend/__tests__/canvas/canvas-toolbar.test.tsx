/**
 * Unit tests for CanvasToolbar component.
 * Validates: Requirements 3.1, 3.3, 3.7, 3.8, 3.10, 4.8, 5.1, 6.5, 6.6, 6.7
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CanvasToolbar, {
  type CanvasToolbarProps,
} from '../../components/canvas/CanvasToolbar';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Play: ({ size }: any) => <svg data-testid="icon-play" width={size} />,
  CheckSquare: ({ size }: any) => <svg data-testid="icon-check-square" width={size} />,
  Square: ({ size }: any) => <svg data-testid="icon-square" width={size} />,
  Download: ({ size }: any) => <svg data-testid="icon-download" width={size} />,
  Upload: ({ size }: any) => <svg data-testid="icon-upload" width={size} />,
  LayoutGrid: ({ size }: any) => <svg data-testid="icon-layout-grid" width={size} />,
  Clock: ({ size }: any) => <svg data-testid="icon-clock" width={size} />,
  Zap: ({ size }: any) => <svg data-testid="icon-zap" width={size} />,
  Sparkles: ({ size }: any) => <svg data-testid="icon-sparkles" width={size} />,
  Gauge: ({ size }: any) => <svg data-testid="icon-gauge" width={size} />,
  ChevronDown: ({ size }: any) => <svg data-testid="icon-chevron-down" width={size} />,
}));

const defaultProps: CanvasToolbarProps = {
  onRunAll: jest.fn(),
  onRunSelected: jest.fn(),
  onStopAll: jest.fn(),
  queueState: null,
  onExportWorkflow: jest.fn(),
  onImportWorkflow: jest.fn(),
  onExportSelected: jest.fn(),
  hasSelection: false,
  performanceMode: 'high-quality',
  onPerformanceModeChange: jest.fn(),
  layoutMode: 'card',
  onLayoutModeChange: jest.fn(),
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

  test('renders all execution control buttons', () => {
    renderToolbar();
    expect(screen.getByTitle('全部执行')).toBeInTheDocument();
    expect(screen.getByTitle('执行选中')).toBeInTheDocument();
    expect(screen.getByTitle('停止全部')).toBeInTheDocument();
  });

  test('renders import/export buttons', () => {
    renderToolbar();
    expect(screen.getByTitle('导出工作流')).toBeInTheDocument();
    expect(screen.getByTitle('导入工作流')).toBeInTheDocument();
    expect(screen.getByTitle('导出选中')).toBeInTheDocument();
  });

  test('renders layout mode toggle', () => {
    renderToolbar();
    expect(screen.getByTitle('卡片视图')).toBeInTheDocument();
    expect(screen.getByTitle('时间线视图')).toBeInTheDocument();
  });

  test('renders performance mode dropdown', () => {
    renderToolbar();
    expect(screen.getByTitle('性能模式')).toBeInTheDocument();
  });

  // ── Disabled states ──

  test('"执行选中" is disabled when hasSelection is false', () => {
    renderToolbar({ hasSelection: false });
    expect(screen.getByTitle('执行选中')).toBeDisabled();
  });

  test('"执行选中" is enabled when hasSelection is true and not running', () => {
    renderToolbar({ hasSelection: true });
    expect(screen.getByTitle('执行选中')).not.toBeDisabled();
  });

  test('"导出选中" is disabled when hasSelection is false', () => {
    renderToolbar({ hasSelection: false });
    expect(screen.getByTitle('导出选中')).toBeDisabled();
  });

  test('"导出选中" is enabled when hasSelection is true', () => {
    renderToolbar({ hasSelection: true });
    expect(screen.getByTitle('导出选中')).not.toBeDisabled();
  });

  test('"停止全部" is disabled when queue is not running', () => {
    renderToolbar({ queueState: null });
    expect(screen.getByTitle('停止全部')).toBeDisabled();
  });

  test('"停止全部" is enabled when queue is running', () => {
    renderToolbar({
      queueState: { completedCount: 1, totalCount: 3, isRunning: true },
    });
    expect(screen.getByTitle('停止全部')).not.toBeDisabled();
  });

  test('"全部执行" is disabled when queue is running', () => {
    renderToolbar({
      queueState: { completedCount: 0, totalCount: 2, isRunning: true },
    });
    expect(screen.getByTitle('全部执行')).toBeDisabled();
  });

  // ── Queue progress ──

  test('shows queue progress when running', () => {
    renderToolbar({
      queueState: { completedCount: 2, totalCount: 5, isRunning: true },
    });
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  test('hides queue progress when not running', () => {
    renderToolbar({ queueState: null });
    expect(screen.queryByText(/\/\d+/)).not.toBeInTheDocument();
  });

  // ── Click handlers ──

  test('calls onRunAll when "全部执行" is clicked', () => {
    const onRunAll = jest.fn();
    renderToolbar({ onRunAll });
    fireEvent.click(screen.getByTitle('全部执行'));
    expect(onRunAll).toHaveBeenCalledTimes(1);
  });

  test('calls onRunSelected when "执行选中" is clicked', () => {
    const onRunSelected = jest.fn();
    renderToolbar({ onRunSelected, hasSelection: true });
    fireEvent.click(screen.getByTitle('执行选中'));
    expect(onRunSelected).toHaveBeenCalledTimes(1);
  });

  test('calls onStopAll when "停止全部" is clicked', () => {
    const onStopAll = jest.fn();
    renderToolbar({
      onStopAll,
      queueState: { completedCount: 0, totalCount: 1, isRunning: true },
    });
    fireEvent.click(screen.getByTitle('停止全部'));
    expect(onStopAll).toHaveBeenCalledTimes(1);
  });

  test('calls onExportWorkflow when "导出" is clicked', () => {
    const onExportWorkflow = jest.fn();
    renderToolbar({ onExportWorkflow });
    fireEvent.click(screen.getByTitle('导出工作流'));
    expect(onExportWorkflow).toHaveBeenCalledTimes(1);
  });

  test('calls onImportWorkflow when "导入" is clicked', () => {
    const onImportWorkflow = jest.fn();
    renderToolbar({ onImportWorkflow });
    fireEvent.click(screen.getByTitle('导入工作流'));
    expect(onImportWorkflow).toHaveBeenCalledTimes(1);
  });

  test('calls onExportSelected when "导出选中" is clicked', () => {
    const onExportSelected = jest.fn();
    renderToolbar({ onExportSelected, hasSelection: true });
    fireEvent.click(screen.getByTitle('导出选中'));
    expect(onExportSelected).toHaveBeenCalledTimes(1);
  });

  // ── Layout mode toggle ──

  test('calls onLayoutModeChange with "timeline" when timeline button is clicked', () => {
    const onLayoutModeChange = jest.fn();
    renderToolbar({ onLayoutModeChange, layoutMode: 'card' });
    fireEvent.click(screen.getByTitle('时间线视图'));
    expect(onLayoutModeChange).toHaveBeenCalledWith('timeline');
  });

  test('calls onLayoutModeChange with "card" when card button is clicked', () => {
    const onLayoutModeChange = jest.fn();
    renderToolbar({ onLayoutModeChange, layoutMode: 'timeline' });
    fireEvent.click(screen.getByTitle('卡片视图'));
    expect(onLayoutModeChange).toHaveBeenCalledWith('card');
  });

  // ── Performance mode dropdown ──

  test('opens performance dropdown and selects a mode', () => {
    const onPerformanceModeChange = jest.fn();
    renderToolbar({ onPerformanceModeChange, performanceMode: 'high-quality' });

    // Open dropdown
    fireEvent.click(screen.getByTitle('性能模式'));

    // Select "极速"
    fireEvent.click(screen.getByText('极速'));
    expect(onPerformanceModeChange).toHaveBeenCalledWith('fast');
  });

  test('displays current performance mode label', () => {
    renderToolbar({ performanceMode: 'normal' });
    expect(screen.getByText('普通')).toBeInTheDocument();
  });
});
