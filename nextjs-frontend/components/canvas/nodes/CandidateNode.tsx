'use client';

import { useState } from 'react';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow } from '@/lib/canvas/xyflow-compat';
import type { CandidateNodeData, AssetCandidate } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import NodeShell from './NodeShell';

/** Parse AI response JSON into AssetCandidate[] */
function parseCandidateOutput(json: unknown): AssetCandidate[] {
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
  return arr.map((item: any) => ({
    name: String(item.name ?? ''),
    description: item.description ? String(item.description) : undefined,
    tags: Array.isArray(item.tags)
      ? item.tags.map((t: unknown) => String(t))
      : undefined,
  }));
}

export default function CandidateNode(props: NodeProps) {
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, data: any) => void;
  const data = props.data as unknown as CandidateNodeData;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('candidateNode');
  const ports = reg?.ports ?? [];
  const candidates = data.candidates ?? [];

  const handleStartExtract = async () => {
    const inputText = data.inputText;
    if (!inputText) return;

    updateNodeData(props.id, { ...data, isProcessing: true, error: undefined });

    try {
      const res = await fetch('/api/ai/text/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          binding_key: 'canvas-candidate',
          messages: [
            {
              role: 'system',
              content:
                '你是一个专业的资产提取助手。请从用户提供的剧本文本中提取所有资产候选，包括角色、场景、道具和特效。每个候选项包含 name（名称）、description（描述）和 tags（标签数组）。请以 JSON 数组格式返回，不要包含其他文字。',
            },
            { role: 'user', content: inputText },
          ],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const extractedCandidates = parseCandidateOutput(json);
      if (extractedCandidates.length === 0) {
        throw new Error('AI 未返回有效的资产候选数据');
      }
      updateNodeData(props.id, {
        ...data,
        isProcessing: false,
        candidates: extractedCandidates,
        error: undefined,
      });
    } catch (err: any) {
      updateNodeData(props.id, {
        ...data,
        isProcessing: false,
        error: err?.message || '提取失败',
      });
    }
  };

  return (
    <NodeShell
      nodeId={props.id}
      title="资产候选清单"
      icon={reg?.icon}
      colorClass={reg?.colorClass}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      ports={ports}
      selected={selected}
    >
      <div className="min-h-[60px]">
        {data.isProcessing ? (
          <div className="flex items-center justify-center py-4 text-xs text-textMuted">
            <span className="animate-pulse">提取中...</span>
          </div>
        ) : data.error ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="text-[10px] text-red-400 text-center px-2">
              {data.error}
            </div>
            <button
              className="px-3 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              onClick={handleStartExtract}
            >
              重试
            </button>
          </div>
        ) : candidates.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {candidates.map((c, idx) => (
              <div
                key={`${c.name}-${idx}`}
                className="bg-surfaceHighlight p-2 rounded border border-border"
              >
                <div className="font-medium text-xs text-orange-200 truncate">
                  {c.name}
                </div>
                {c.description && (
                  <div className="text-[10px] text-textMuted line-clamp-2 mt-0.5">
                    {c.description}
                  </div>
                )}
                {c.tags && c.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[9px] bg-white/5 px-1 rounded text-textMuted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : data.inputText ? (
          <div className="flex items-center justify-center py-4">
            <button
              className="px-3 py-1.5 text-xs rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              onClick={handleStartExtract}
            >
              开始提取
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
