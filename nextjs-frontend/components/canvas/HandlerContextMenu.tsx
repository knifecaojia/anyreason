'use client';

import { useEffect } from 'react';
import { useCanvasContext } from '@/lib/canvas/canvas-context';

export type HandlerContextMenuItem = {
  label: string;
  onClick: () => void;
};

export type HandlerContextMenuState = {
  x: number;
  y: number;
  items: HandlerContextMenuItem[];
} | null;

export default function HandlerContextMenu() {
  const { contextMenu, hideContextMenu } = useCanvasContext();

  // Close menu with Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu, hideContextMenu]);

  if (!contextMenu) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" onMouseDown={hideContextMenu} />
      <div
        className="handler-context-menu fixed z-[51] bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {contextMenu.items.map((item, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              item.onClick();
              hideContextMenu();
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-textMain hover:bg-surfaceHighlight transition-colors"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
