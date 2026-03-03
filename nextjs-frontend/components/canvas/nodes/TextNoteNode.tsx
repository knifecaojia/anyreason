'use client';

import { useCallback, useRef, useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow, Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { TextNoteNodeData } from '@/lib/canvas/types';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';

const NOTE_COLORS = [
  { label: '紫', bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-100' },
  { label: '蓝', bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-100' },
  { label: '绿', bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-100' },
  { label: '黄', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-yellow-100' },
] as const;

export default function TextNoteNode(props: NodeProps) {
  const data = props.data as unknown as TextNoteNodeData;
  const selected = Boolean(props.selected);
  const { expand, collapse, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, data: any) => void;
  const editRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);

  const colorIdx = (data as any).colorIndex ?? 0;
  const noteColor = NOTE_COLORS[colorIdx % NOTE_COLORS.length];

  const handleContentBlur = useCallback(() => {
    setEditing(false);
    const text = editRef.current?.innerText ?? '';
    if (text !== data.content) {
      updateNodeData(props.id, { ...data, content: text });
    }
  }, [data, props.id, updateNodeData]);

  // Icon mode: purple small block + ✏️
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 bg-purple-500/20 ${
          selected ? 'ring-2 ring-primary' : 'border border-border/50'
        }`}
        title={data.title || '笔记'}
      >
        <span className="text-base leading-none">✏️</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); expand(); }}
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={60}
        lineClassName="!border-primary/40"
        handleClassName="!w-2.5 !h-2.5 !bg-primary !border-background !border-2 !rounded-sm"
      />
      {/* Input handle — left center, animated */}
      <Handle id="in" type="target" position={Position.Left}
        className="node-handle-in"
        style={{ width: 28, height: 28, borderRadius: 9999, background: '#374151', border: '3px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#9ca3af', top: '50%', zIndex: 30 }}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>
      {/* Output handle — right center, animated */}
      <Handle id="out" type="source" position={Position.Right}
        className="node-handle-out"
        style={{ width: 28, height: 28, borderRadius: 9999, background: '#374151', border: '3px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#9ca3af', top: '50%', zIndex: 30 }}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>
      <div
        className={`rounded-xl ${noteColor.bg} ${noteColor.border} border backdrop-blur min-w-[140px] min-h-[60px] w-full h-full relative ${
          selected ? 'ring-2 ring-primary' : ''
        }`}
      >
        {/* Content area — directly editable */}
        <div
          ref={editRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onDoubleClick={() => setEditing(true)}
          onBlur={handleContentBlur}
          className={`nodrag p-3 text-xs leading-relaxed outline-none ${noteColor.text} ${
            editing ? 'cursor-text' : 'cursor-default'
          }`}
          style={{ minHeight: 40, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {data.content || (editing ? '' : '双击编辑内容')}
        </div>
      </div>
    </>
  );
}
