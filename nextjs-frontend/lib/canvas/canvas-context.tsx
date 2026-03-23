'use client';

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

export type HandlerContextMenuItem = {
  label: string;
  onClick: () => void;
};

export type HandlerContextMenuState = {
  x: number;
  y: number;
  items: HandlerContextMenuItem[];
} | null;

export type HandlerContextMenuCallback = (
  event: { clientX: number; clientY: number },
  nodeId: string,
  handleId: string,
  direction: 'input' | 'output'
) => void;

type CanvasContextType = {
  contextMenu: HandlerContextMenuState;
  showContextMenu: (state: HandlerContextMenuState) => void;
  hideContextMenu: () => void;
  onHandlerContextMenu?: HandlerContextMenuCallback;
};

const CanvasContext = createContext<CanvasContextType | null>(null);

export function CanvasProvider({ 
  children,
  onHandlerContextMenu 
}: { 
  children: ReactNode;
  onHandlerContextMenu?: HandlerContextMenuCallback;
}) {
  const [contextMenu, setContextMenu] = useState<HandlerContextMenuState>(null);

  const showContextMenu = useCallback((state: HandlerContextMenuState) => {
    setContextMenu(state);
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <CanvasContext.Provider value={{ contextMenu, showContextMenu, hideContextMenu, onHandlerContextMenu }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvasContext() {
  const ctx = useContext(CanvasContext);
  if (!ctx) {
    throw new Error('useCanvasContext must be used within CanvasProvider');
  }
  return ctx;
}

/** Hook specifically for handler context menu functionality */
export function useHandlerContextMenu(): HandlerContextMenuCallback | null {
  const ctx = useContext(CanvasContext);
  if (!ctx) {
    return null;
  }
  return ctx.onHandlerContextMenu || null;
}
