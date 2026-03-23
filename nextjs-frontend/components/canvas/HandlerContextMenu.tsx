'use client';

import { useState, useEffect, useCallback } from 'react';

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
  const [contextMenu, setContextMenu] = useState<HandlerContextMenuState>(null);

  const handleShowMenu = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<{ x: number; y: number; items: HandlerContextMenuItem[] }>;
    setContextMenu({
      x: customEvent.detail.x,
      y: customEvent.detail.y,
      items: customEvent.detail.items,
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    window.addEventListener('show-handler-context-menu', handleShowMenu);
    return () => {
      window.removeEventListener('show-handler-context-menu', handleShowMenu);
    };
  }, [handleShowMenu]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.handler-context-menu')) {
        hideContextMenu();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu, hideContextMenu]);

  if (!contextMenu) return null;

  return (
    <div
      className="handler-context-menu fixed z-50 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
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
  );
}
