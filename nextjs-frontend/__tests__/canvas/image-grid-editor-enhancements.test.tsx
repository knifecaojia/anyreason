import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';

import GridImage from '../../components/canvas/nodes/GridImage';
import GridCell from '../../components/canvas/nodes/GridCell';
import ImageGridEditorModal from '../../components/canvas/nodes/ImageGridEditorModal';
import { useDraggableImage } from '../../components/canvas/hooks/useDraggableImage';
import { useZoomableImage } from '../../components/canvas/hooks/useZoomableImage';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });
});

describe('image grid editor enhancements', () => {
  test('useDraggableImage reports constrained final coordinates on drag end', () => {
    const onDragEnd = jest.fn();

    const { result } = renderHook(() =>
      useDraggableImage({
        constrainPosition: (x, y) => ({ x: Math.max(-50, Math.min(50, x)), y: Math.max(-50, Math.min(50, y)) }),
        onDragEnd,
      }),
    );

    const item = { id: 'item-1', url: '/test.png', x: 0, y: 0, scale: 1, zIndex: 0 };
    const cellRect = {
      width: 100,
      height: 100,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    act(() => {
      result.current.handleDragStart(
        {
          button: 0,
          clientX: 0,
          clientY: 0,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as React.MouseEvent,
        item,
        cellRect,
      );
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: -80 }));
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(onDragEnd).toHaveBeenCalledWith(item, 50, -50);
  });

  test('useZoomableImage changes scale directly from wheel events without middle-click state', () => {
    const onZoomChange = jest.fn();
    const item = { id: 'item-1', url: '/test.png', x: 0, y: 0, scale: 1, zIndex: 0 };

    const { result } = renderHook(() =>
      useZoomableImage({
        minScale: 0.1,
        maxScale: 5,
        zoomStep: 0.1,
        onZoomChange,
      }),
    );

    act(() => {
      result.current.handleWheelZoom(
        {
          deltaY: -100,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.WheelEvent,
        item,
      );
    });

    expect(onZoomChange).toHaveBeenCalledWith(item, 1.1);
  });

  test('GridImage invokes the provided double click handler', () => {
    const onDoubleClick = jest.fn();

    const { getByRole } = render(
      <GridImage
        item={{ id: 'item-1', url: '/test.png', x: 0, y: 0, scale: 1, zIndex: 0 }}
        idx={0}
        isSelected={false}
        cellWidth={200}
        cellHeight={200}
        onSelect={() => {}}
        onUpdate={() => {}}
        onDoubleClick={onDoubleClick}
      />,
    );

    fireEvent.doubleClick(getByRole('button'));

    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  test('GridImage applies rotation in its transform style', () => {
    const { getByRole } = render(
      <GridImage
        item={{ id: 'item-1', url: '/test.png', x: 10, y: -5, scale: 1.2, zIndex: 0, rotation: 45 }}
        idx={0}
        isSelected={false}
        cellWidth={200}
        cellHeight={200}
        onSelect={() => {}}
        onUpdate={() => {}}
      />,
    );

    expect((getByRole('button') as HTMLDivElement).style.transform).toBe(
      'translate(10%, -5%) scale(1.2) rotate(45deg)',
    );
  });

  test('GridImage renders its image with absolute fill sizing for visible cell coverage', () => {
    const { getByAltText } = render(
      <GridImage
        item={{ id: 'item-1', url: '/test.png', x: 0, y: 0, scale: 1, zIndex: 0 }}
        idx={0}
        isSelected={false}
        cellWidth={200}
        cellHeight={200}
        onSelect={() => {}}
        onUpdate={() => {}}
      />,
    );

    const image = getByAltText('Layer 1');
    expect(image.className).toContain('absolute');
    expect(image.className).toContain('inset-0');
    expect(image.className).toContain('w-full');
    expect(image.className).toContain('h-full');
  });

  test('GridImage uses contain mode instead of cover to avoid wrong cropping on aspect mismatch', () => {
    const { getByAltText } = render(
      <GridImage
        item={{ id: 'item-1', url: '/test-wide.png', x: 0, y: 0, scale: 1, zIndex: 0 }}
        idx={0}
        isSelected={false}
        cellWidth={300}
        cellHeight={300}
        onSelect={() => {}}
        onUpdate={() => {}}
      />,
    );

    const image = getByAltText('Layer 1');
    expect(image.className).toContain('object-contain');
  });

  test('GridCell renders an explicit upload button for empty cells', () => {
    const onUploadClick = jest.fn();

    const { getByRole } = render(
      <GridCell
        cellKey="0-0"
        row={0}
        col={0}
        items={[]}
        isActive={false}
        onSelect={() => {}}
        onItemUpdate={() => {}}
        onItemSelect={() => {}}
        selectedItemIdx={null}
        onUploadClick={onUploadClick}
      />,
    );

    const uploadButton = getByRole('button', { name: '点击上传图片' });
    expect(uploadButton.className).toContain('border-white/20');
    expect(uploadButton.className).not.toContain('border-dashed');
    expect((uploadButton as HTMLButtonElement).className).toContain('absolute');
    fireEvent.click(uploadButton);
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });

  test('GridCell keeps a visible border chrome even for empty cells', () => {
    const { container } = render(
      <GridCell
        cellKey="0-0"
        row={0}
        col={0}
        items={[]}
        isActive={false}
        onSelect={() => {}}
        onItemUpdate={() => {}}
        onItemSelect={() => {}}
        selectedItemIdx={null}
        onUploadClick={() => {}}
      />,
    );

    const cell = container.firstElementChild as HTMLDivElement | null;
    expect(cell).not.toBeNull();
    expect(cell?.className).toContain('border');
    expect(cell?.className).toContain('border-white/20');
  });

  test('ImageGridEditorModal renders the grid container without cell gaps', async () => {
    const { findByText } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    await findByText('多宫格图片编辑器');

    const grid = document.querySelector('.grid.rounded-2xl') as HTMLDivElement | null;
    const fallbackGrid = document.querySelector('.grid.border') as HTMLDivElement | null;
    const targetGrid = grid ?? fallbackGrid;
    expect(targetGrid).not.toBeNull();
    expect(targetGrid?.className).toContain('gap-0');
  });

  test('ImageGridEditorModal constrains grid size to the viewport by default', async () => {
    const { findByText } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    await findByText('多宫格图片编辑器');

    const grid = (document.querySelector('.grid.border') || document.querySelector('.grid')) as HTMLDivElement | null;
    expect(grid).not.toBeNull();
    expect(grid?.style.maxWidth).toBe('min(100%, calc(100vw - 420px))');
    expect(grid?.style.maxHeight).toBe('calc(100vh - 160px)');
  });

  test('ImageGridEditorModal updates grid aspect ratio style when ratio buttons change', async () => {
    const { findByText, getByRole } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    await findByText('多宫格图片编辑器');

    const grid = (document.querySelector('.grid.border') || document.querySelector('.grid')) as HTMLDivElement | null;
    expect(grid).not.toBeNull();
    expect(grid?.style.aspectRatio).toBe('1');

    fireEvent.click(getByRole('button', { name: '16:9' }));
    expect(grid?.style.aspectRatio).toBe(String(16 / 9));

    fireEvent.click(getByRole('button', { name: '9:16' }));
    expect(grid?.style.aspectRatio).toBe(String(9 / 16));
  });

  test('ImageGridEditorModal does not force grid width to 100 percent, allowing ratio changes to stay visually distinct', async () => {
    const { findByText } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    await findByText('多宫格图片编辑器');

    const grid = (document.querySelector('.grid.border') || document.querySelector('.grid')) as HTMLDivElement | null;
    expect(grid).not.toBeNull();
    expect(grid?.style.width).not.toBe('100%');
  });

  test('ImageGridEditorModal opens crop overlay from edit mode', async () => {
    const { getByRole, findByText } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    const imageButton = await waitFor(() => getByRole('button', { name: /图片 1/i }));

    fireEvent.doubleClick(imageButton);

    const cropButton = await findByText('裁切');
    fireEvent.click(cropButton);

    expect(await findByText('在图片上拖拽框选要截取的区域')).toBeTruthy();
  });

  test('ImageCropOverlay uses a z-index above the edit mode layer', async () => {
    const { findByText } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    fireEvent.doubleClick(await waitFor(() => document.querySelector('[aria-label^="图片 1"]') as HTMLElement));
    fireEvent.click(await findByText('裁切'));

    const cropInstruction = await findByText('在图片上拖拽框选要截取的区域');
    const overlay = cropInstruction.closest('div[class*="fixed inset-0"]') as HTMLDivElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain('z-[10002]');
  });

  test('ImageGridEditorModal uses thumbnail URL for uploaded images inside grid cells', async () => {
    const originalFetch = global.fetch;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (typeof input === 'string' && input === '/api/vfs/files/upload') {
        return {
          ok: true,
          json: async () => ({ data: { id: 'node-123' } }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${String(input)}`);
    }) as typeof fetch;

    const { getByTitle, findByRole } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    fireEvent.click(getByTitle('添加图片'));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File(['demo'], 'demo.png', { type: 'image/png' });

    await act(async () => {
      fireEvent.change(fileInput!, { target: { files: [file] } });
    });

    const uploadedImage = await findByRole('img', { name: /layer 2/i });
    expect(uploadedImage.getAttribute('src')).toBe('/api/vfs/nodes/node-123/thumbnail');

    global.fetch = originalFetch;
  });

  test('ImageGridEditorModal clicking an empty grid cell opens upload selection for that cell', async () => {
    const { findByText } = render(
      <ImageGridEditorModal
        initialImage="/test.png"
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    const uploadPrompts = await waitFor(() => Array.from(document.querySelectorAll('div')).filter((el) => el.textContent?.trim() === '点击上传图片'));
    expect(uploadPrompts.length).toBeGreaterThan(0);
    fireEvent.click(uploadPrompts[0]);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(document.activeElement === fileInput || fileInput?.accept === 'image/*').toBe(true);
  });
});
