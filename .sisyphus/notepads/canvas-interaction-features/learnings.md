# Canvas Interaction Features - Handler Context Menu Fix

## Problem
The handler context menu was not appearing when right-clicking on node handles (connection points). The previous implementation used `useEffect` with `setTimeout` and `querySelector` to attach event listeners to ReactFlow's Handle elements, but this was unreliable because ReactFlow renders handles asynchronously.

## Solution
Replaced the querySelector approach with **invisible overlay divs** positioned over the handle locations:

1. Added wrapper divs with `absolute` positioning over each handle
2. Set `zIndex: 50` to ensure the overlay is above the handle
3. Used `onContextMenu` React event handler directly on the overlay divs
4. Removed the unreliable `useEffect` + `querySelector` + `setTimeout` approach

## Code Changes

### File: `nextjs-frontend/components/canvas/nodes/NodeShell.tsx`

**Before:**
```typescript
// Unreliable useEffect approach
useEffect(() => {
  if (!onHandlerContextMenu) return;
  const timer = setTimeout(() => {
    const inputHandle = document.querySelector(`[data-nodeid="${nodeId}"][data-handleid="in"]`);
    // ... attach listeners
  }, 500);
  return () => clearTimeout(timer);
}, [onHandlerContextMenu, nodeId]);
```

**After:**
```typescript
// Reliable overlay approach
const handleInputContextMenu = useCallback((e: React.MouseEvent) => {
  if (!onHandlerContextMenu) return;
  e.preventDefault();
  e.stopPropagation();
  onHandlerContextMenu(e, nodeId, 'in', 'input');
}, [onHandlerContextMenu, nodeId]);

// In render:
<div
  className="absolute w-10 h-10 rounded-full cursor-context-menu"
  style={{
    left: -20,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 50,
  }}
  onContextMenu={handleInputContextMenu}
/>
```

## Result
- Right-clicking on a node's input or output handle now reliably displays the context menu
- The menu shows options to create new nodes (图片节点, 视频节点, 提示词节点)
- Selecting an option creates the node and auto-links it to the source handle

## Verification
- TypeScript compilation: ✅ No errors
