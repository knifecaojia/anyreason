'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow } from '@/lib/canvas/xyflow-compat';
import type { SlicerNodeData, StoryboardItem } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import NodeShell from './NodeShell';

/** Parse AI response JSON into StoryboardItem[] */
function parseSlicerOutput(json: unknown): StoryboardItem[] {
  // Expected shape: { code: 200, data: { output_text: "...", raw: {...} } }
  const outputText =
    (json as any)?.data?.output_text ?? (json as any)?.output_text ?? '';
  if (!outputText) return [];

  // The output_text is a string containing a JSON array
  let parsed: unknown;
  try {
    // Strip possible markdown code fences
    const cleaned = outputText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI 返回格式异常，无法解析 JSON');
  }

  const arr = Array.isArray(parsed) ? parsed : [];
  return arr.map((item: any, idx: number) => ({
    shotNumber: typeof item.shotNumber === 'number' ? item.shotNumber : idx + 1,
    sceneDescription: String(item.sceneDescription ?? ''),
    dialogue: item.dialogue ? String(item.dialogue) : undefined,
  }));
}

export default function SlicerNode(props: NodeProps) {
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, data: any) => void;
  const data = props.data as unknown as SlicerNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('slicerNode');
  const ports = reg?.ports ?? [];
  const { expand, collapse: collapseIcon, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const items = data.storyboardItems ?? [];

  const handleStartSplit = async () => {
    const inputText = data.inputText;
    if (!inputText) return;

    updateNodeData(props.id, { ...data, isProcessing: true, error: undefined });

    try {
      const res = await fetch('/api/ai/text/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          binding_key: 'canvas-slicer',
          messages: [
            {
              role: 'system',
              content:
                '你是一个专业的分镜拆分助手。请将用户提供的剧本文本拆分为分镜列表。每个分镜包含 shotNumber（镜头编号，从1开始的整数）、sceneDescription（场景描述）和 dialogue（对白，可为空字符串）。请以 JSON 数组格式返回，不要包含其他文字。',
            },
            { role: 'user', content: inputText },
          ],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const storyboardItems = parseSlicerOutput(json);
      if (storyboardItems.length === 0) {
        throw new Error('AI 未返回有效的分镜数据');
      }
      updateNodeData(props.id, {
        ...data,
        isProcessing: false,
        storyboardItems,
        error: undefined,
      });
    } catch (err: any) {
      updateNodeData(props.id, {
        ...data,
        isProcessing: false,
        error: err?.message || '拆分失败',
      });
    }
  };

  return (
    <NodeShell
      nodeId={props.id}
      title="拆分节点"
      icon={reg?.icon}
      iconEmoji="✂️"
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      renderLevel={renderLevel}
      onExpand={expand}
      onCollapse={collapseIcon}
      ports={ports}
      selected={selected}
    >
      <div className="min-h-[60px]">
        {data.isProcessing ? (
          <div className="flex items-center justify-center py-4 text-xs text-textMuted">
            <span className="animate-pulse">拆分中...</span>
          </div>
        ) : data.error ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="text-[10px] text-red-400 text-center px-2">
              {data.error}
            </div>
            <button
              className="px-3 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              onClick={handleStartSplit}
            >
              重试
            </button>
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {items.map((item, idx) => (
              <div
                key={`shot-${item.shotNumber}-${idx}`}
                className="bg-surfaceHighlight p-2 rounded border border-border text-[11px]"
              >
                <div className="font-medium text-textMain">
                  #{item.shotNumber}
                </div>
                <div className="text-textMuted line-clamp-2">
                  {item.sceneDescription}
                </div>
              </div>
            ))}
            <div className="text-[10px] text-textMuted text-right">
              共 {items.length} 个分镜
            </div>
          </div>
        ) : data.inputText ? (
          <div className="flex items-center justify-center py-4">
            <button
              className="px-3 py-1.5 text-xs rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              onClick={handleStartSplit}
            >
              开始拆分
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4 text-[10px] text-textMuted">
            等待输入
          </div>
        )}
      </div>
    </NodeShell>
  );
}
