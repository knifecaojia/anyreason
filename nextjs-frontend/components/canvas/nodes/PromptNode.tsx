'use client';

/**
 * PromptNode — simple text-only node with no AI features.
 * Directly passes user-typed text content to downstream nodes via connections.
 *
 * Ports:
 *   in  (text)  — optional upstream text input
 *   out (text)  — user-edited text output
 */

import { useCallback, useRef, useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow, Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { PromptNodeData } from '@/lib/canvas/types';
import { propagateData } from '@/lib/canvas/data-flow';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import PromptTemplateModal, { type PromptPreset } from '@/components/canvas/PromptTemplateModal';
import { BookOpen } from 'lucide-react';

// ===== Handle style constants =====
const HANDLE_STYLE: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 9999,
  background: '#374151', border: '3px solid #1f2937',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 700, color: '#9ca3af',
  top: '50%', zIndex: 30,
};

export default function PromptNode(props: NodeProps) {
  const data = props.data as unknown as PromptNodeData;
  const selected = Boolean(props.selected);
  const { expand, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, d: any) => void;
  const getNodes = rf.getNodes as () => any[];
  const getEdges = rf.getEdges as () => any[];
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const content = data.content ?? '';
  const charCount = content.length;

  const handleContentChange = useCallback((newContent: string) => {
    updateNodeData(props.id, { ...data, content: newContent });

    // Debounce propagation to avoid excessive downstream updates while typing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const currentNodes = getNodes();
      const currentEdges = getEdges();
      propagateData(props.id, 'out', newContent, currentNodes, currentEdges, rf.setNodes);
    }, 300);
  }, [data, props.id, updateNodeData, getNodes, getEdges, rf.setNodes]);

  // Icon mode
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border ${
          selected ? 'border-primary/50' : 'border-border/70'
        } bg-background/95`}
        title="提示词"
      >
        <span className="text-base leading-none">💬</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); expand(); }}
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-border text-textMuted text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">+</button>
      </div>
    );
  }

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={280} minHeight={120}
        lineClassName="!border-primary/30"
        handleClassName="!w-2 !h-2 !bg-textMuted !border-background !border-2 !rounded-sm" />

      {/* Input handle — optional upstream text */}
      <Handle id="in" type="target" position={Position.Left}
        className="node-handle-in"
        style={HANDLE_STYLE}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>
      {/* Output handle */}
      <Handle id="out" type="source" position={Position.Right}
        className="node-handle-out"
        style={HANDLE_STYLE}>
        <span className="pointer-events-none select-none leading-none">+</span>
      </Handle>

      <div
        className={`rounded-xl border bg-background/95 overflow-hidden flex flex-col relative ${
          selected ? 'border-primary/50' : 'border-border/70'
        }`}
        style={{ width: props.width || 340, height: props.height || 180 }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
          <span className="text-[11px] text-textMuted flex items-center gap-1">
            <span>💬</span> 提示词
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowTemplateModal(true)}
              className="nodrag text-textMuted/50 hover:text-textMain transition-colors"
              title="提示词模板">
              <BookOpen size={11} />
            </button>
            <span className="text-[10px] text-textMuted/60 tabular-nums">{charCount}字</span>
          </div>
        </div>

        {/* Editable textarea */}
        <textarea
          className="nodrag nowheel w-full flex-1 min-h-0 bg-transparent p-3 text-[12px] leading-relaxed text-textMain placeholder:text-textMuted/40 outline-none resize-none"
          placeholder="输入提示词内容，将直接传递给下游节点..."
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
        />
      </div>

      {/* Prompt template modal */}
      <PromptTemplateModal
        open={showTemplateModal}
        toolKey="canvas"
        onClose={() => setShowTemplateModal(false)}
        onSelect={(preset: PromptPreset) => {
          handleContentChange(preset.prompt_template);
        }}
      />
    </>
  );
}
