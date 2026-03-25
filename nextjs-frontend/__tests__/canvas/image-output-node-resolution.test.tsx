import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import ImageOutputNode from '@/components/canvas/nodes/ImageOutputNode';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import type { ImageOutputNodeData } from '@/lib/canvas/types';

jest.mock('@/hooks/useNodeIconMode', () => ({
  useNodeIconMode: () => ({
    expand: jest.fn(),
    resolveLevel: () => 'full',
  }),
}));

jest.mock('@/hooks/useAIModelList', () => ({
  useAIModelList: () => ({
    models: [],
    selectedConfigId: undefined,
    selectModel: jest.fn(),
  }),
}));

jest.mock('@/lib/canvas/image-utils', () => ({
  collectUpstreamData: () => ({
    hasTextSource: false,
    promptText: '',
    refImages: [],
  }),
  fetchRefImagesAsBase64: jest.fn(),
}));

jest.mock('@/components/canvas/nodes/ImageCropOverlay', () => () => null);
jest.mock('@/components/canvas/nodes/ImageGridEditorModal', () => () => null);
jest.mock('@/components/canvas/nodes/ImageGridSplitPicker', () => () => null);

jest.mock('@/lib/canvas/xyflow-compat', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  NodeResizer: () => null,
  useReactFlow: () => ({
    updateNodeData: jest.fn(),
    getNodes: () => [],
    getEdges: () => [],
    addNodes: jest.fn(),
  }),
}));

jest.mock('lucide-react', () => {
  const Icon = ({ size }: { size?: number }) => <svg data-testid="icon" width={size} />;
  return {
    ChevronDown: Icon,
    Loader2: Icon,
    Square: Icon,
    Pencil: Icon,
    Download: Icon,
    ImageIcon: Icon,
    Upload: Icon,
    Crop: Icon,
    Layers: Icon,
    Grid2x2: Icon,
    Sparkles: Icon,
    Expand: Icon,
    SunMedium: Icon,
    Wand2: Icon,
    Eraser: Icon,
    Scissors: Icon,
  };
});

function buildProps(overrides: Partial<ImageOutputNodeData> = {}): NodeProps {
  const data: ImageOutputNodeData = {
    kind: 'image-output',
    model: '测试模型',
    prompt: 'test prompt',
    aspectRatio: '16:9',
    resolution: 'standard',
    lastImage: '/thumb.png',
    lastImageFull: '/full.png',
    isProcessing: false,
    progress: 100,
    ...overrides,
  };

  return {
    id: 'node-1',
    type: 'imageOutputNode',
    data,
    selected: false,
    dragging: false,
    zIndex: 1,
    width: 400,
    height: 260,
  };
}

describe('ImageOutputNode real resolution display', () => {
  test('does not show configured fallback resolution before real image dimensions load', () => {
    render(<ImageOutputNode {...buildProps()} />);

    expect(screen.queryByText('1280x720')).not.toBeInTheDocument();
    expect(screen.getAllByText('获取中…').length).toBeGreaterThan(0);
  });

  test('shows actual image natural dimensions after image load', () => {
    render(<ImageOutputNode {...buildProps()} />);

    const image = screen.getByAltText('Generated');
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1536 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 1024 });

    fireEvent.load(image);

    expect(screen.getAllByText('1536x1024').length).toBeGreaterThan(0);
    expect(screen.queryByText('获取中…')).not.toBeInTheDocument();
  });
});
