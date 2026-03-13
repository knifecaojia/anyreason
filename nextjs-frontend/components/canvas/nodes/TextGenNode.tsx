'use client';

/**
 * TextGenNode — LLM-driven text/prompt generation node.
 * M1.4: Implements SSE streaming, template variables, auto-propagation.
 *
 * Ports:
 *   in-text  (text)      — upstream scene description, script fragments
 *   in-ref   (asset-ref) — upstream asset references for context
 *   out-text (text)      — generated output text
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NodeProps } from '@/lib/canvas/xyflow-compat';
import { useReactFlow, Handle, Position, NodeResizer } from '@/lib/canvas/xyflow-compat';
import type { TextGenNodeData } from '@/lib/canvas/types';
import { getNodeType } from '@/lib/canvas/node-registry';
import { propagateData } from '@/lib/canvas/data-flow';
import { useNodeIconMode } from '@/hooks/useNodeIconMode';
import { useAIModelList } from '@/hooks/useAIModelList';
import PromptTemplateModal, { type PromptPreset } from '@/components/canvas/PromptTemplateModal';
import { Loader2, Play, Square, RotateCcw, ChevronDown, X, Maximize2, BookOpen } from 'lucide-react';

// ===== Template Variable Helpers =====

interface UpstreamContext {
  sceneText: string;
  assetNames: string;
  assetDescriptions: string;
}

function collectUpstreamContext(
  nodeId: string,
  nodeData: Record<string, unknown>,
): UpstreamContext {
  const inText = nodeData['in'];
  const inRef = nodeData['in-ref'] ?? nodeData['in'];

  const sceneText = typeof inText === 'string' ? inText : '';

  let assetNames = '';
  let assetDescriptions = '';
  if (Array.isArray(inRef)) {
    const names: string[] = [];
    const descs: string[] = [];
    for (const item of inRef) {
      if (typeof item === 'object' && item !== null) {
        const a = item as Record<string, unknown>;
        if (a.name) names.push(String(a.name));
        if (a.description) descs.push(String(a.description));
      }
    }
    assetNames = names.join(', ');
    assetDescriptions = descs.join('\n');
  } else if (typeof inRef === 'object' && inRef !== null) {
    const a = inRef as Record<string, unknown>;
    if (a.name) assetNames = String(a.name);
    if (a.description) assetDescriptions = String(a.description);
  }

  return { sceneText, assetNames, assetDescriptions };
}

function renderTemplate(template: string, ctx: UpstreamContext): string {
  return template
    .replace(/\{scene_text\}/g, ctx.sceneText)
    .replace(/\{asset_names\}/g, ctx.assetNames)
    .replace(/\{asset_descriptions\}/g, ctx.assetDescriptions);
}

// ===== SSE Stream Helper =====

async function* streamChat(
  bindingKey: string,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  modelConfigId?: string,
): AsyncGenerator<string, void, unknown> {
  const res = await fetch('/api/ai/text/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      binding_key: bindingKey,
      model_config_id: modelConfigId || null,
      messages,
      attachments: [],
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Stream request failed: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed?.type === 'error') {
          throw new Error(parsed.message || 'AI 调用失败');
        }
        if (parsed?.type === 'done') return;
        const delta =
          parsed?.choices?.[0]?.delta?.content ??
          parsed?.delta?.content ??
          parsed?.delta ??
          parsed?.content ??
          '';
        if (delta) yield delta;
      } catch (e) {
        if (e instanceof Error) throw e;
        if (payload) yield payload;
      }
    }
  }
}

// ===== Editable Preview Modal =====

function TextGenPreviewModal({ text, onClose, onSave }: { text: string; onClose: () => void; onSave: (newText: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background border border-border/40 rounded-xl shadow-2xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <span className="text-sm font-medium text-textMain">{editing ? '编辑内容' : '生成内容预览'}</span>
          <div className="flex items-center gap-2">
            {!editing ? (
              <button type="button" onClick={() => { setDraft(text); setEditing(true); }}
                className="text-xs text-textMuted hover:text-textMain transition-colors px-2 py-1 rounded hover:bg-canvasNode">
                ✏️ 编辑
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(false)}
                  className="text-xs text-textMuted hover:text-textMain transition-colors px-2 py-1 rounded hover:bg-canvasNode">
                  取消
                </button>
                <button type="button" onClick={() => onSave(draft)}
                  className="text-xs text-white bg-primary hover:bg-primary/80 transition-colors px-3 py-1 rounded">
                  保存
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="text-textMuted hover:text-textMain transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        {editing ? (
          <textarea
            className="flex-1 overflow-y-auto px-4 py-3 text-sm text-textMain bg-transparent outline-none resize-none min-h-[300px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 prose prose-sm prose-invert max-w-none text-textMain">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Component =====

export default function TextGenNode(props: NodeProps) {
  const data = props.data as unknown as TextGenNodeData;
  const rawData = props.data as unknown as Record<string, unknown>;
  const selected = Boolean(props.selected);
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const reg = getNodeType('textGenNode');
  const ports = reg?.ports ?? [];
  const { expand, collapse: collapseIcon, resolveLevel } = useNodeIconMode();
  const renderLevel = resolveLevel();
  const { models: textModels, selectedConfigId, selectModel } = useAIModelList('text', data.bindingKey, data.modelConfigId);
  const rf = useReactFlow() as any;
  const updateNodeData = rf.updateNodeData as (id: string, d: any) => void;

  // Resolve display name from selected model
  const selectedModel = textModels.find((m) => m.configId === selectedConfigId);
  const modelDisplayName = selectedModel?.displayName ?? data.bindingKey ?? '未配置';

  // Auto-apply selectedConfigId to node data if not already set
  const effectiveConfigId = data.modelConfigId ?? selectedConfigId;
  const getNodes = rf.getNodes as () => any[];
  const getEdges = rf.getEdges as () => any[];

  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const status = data.status ?? ('idle' as const);
  const lastOutput = data.lastOutput ?? '';
  const displayText = isStreaming ? streamingText : lastOutput;
  const showStreaming = status === 'streaming';
  const errorMessage = (status === 'failed' && data.error) ? String(data.error) : '';

  // --- Generate handler ---
  const handleGenerate = useCallback(async () => {
    if (isStreaming) return;

    const nodeData = rawData;
    const ctx = collectUpstreamContext(props.id, nodeData);
    const systemPrompt = data.systemPrompt || 'You are a helpful AI assistant.';
    const userTemplate = data.userPromptTemplate || '{scene_text}';
    const userContent = renderTemplate(userTemplate, ctx);
    const bindingKey = data.bindingKey || 'chatbox';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsStreaming(true);
    setStreamingText('');
    updateNodeData(props.id, { ...data, status: 'streaming', error: undefined });

    let fullText = '';
    let success = false;
    try {
      const stream = streamChat(bindingKey, messages, abortController.signal, effectiveConfigId ?? undefined);
      for await (const chunk of stream) {
        fullText += chunk;
        setStreamingText(fullText);
      }
      success = true;

      updateNodeData(props.id, {
        ...data,
        status: 'succeeded',
        lastOutput: fullText,
        error: undefined,
      });

      // Auto-propagate out-text downstream
      const currentNodes = getNodes();
      const currentEdges = getEdges();
      propagateData(props.id, 'out', fullText, currentNodes, currentEdges, rf.setNodes);
    } catch (err: any) {
      console.error('[TextGenNode] generation failed:', err);
      if (err?.name === 'AbortError') {
        updateNodeData(props.id, {
          ...data,
          status: 'idle',
          lastOutput: fullText || lastOutput,
        });
      } else {
        updateNodeData(props.id, {
          ...data,
          status: 'failed',
          error: String(err?.message || err),
          lastOutput: fullText || lastOutput,
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      // Safety: If not success and not failed/idle, reset to idle
      if (!success && status === 'streaming') {
         updateNodeData(props.id, { ...data, status: 'idle' });
      }
    }
  }, [isStreaming, data, props.id, updateNodeData, getNodes, getEdges, rf.setNodes, lastOutput]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleReset = useCallback(() => {
    updateNodeData(props.id, {
      ...data,
      status: 'idle',
      lastOutput: '',
      error: undefined,
    });
  }, [data, props.id, updateNodeData]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const charCount = displayText.length;

  // Icon mode
  if (renderLevel === 'icon') {
    return (
      <div
        className={`group relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border ${
          selected ? 'border-primary/50' : 'border-border/70'
        } bg-canvasNode`}
        title="文本生成"
      >
        <span className="text-base leading-none">📝</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); expand(); }}
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-border text-textMuted text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">+</button>
      </div>
    );
  }

  return (
    <>
    <NodeResizer isVisible={selected} minWidth={320} minHeight={180}
      lineClassName="!border-primary/30"
      handleClassName="!w-2 !h-2 !bg-textMuted !border-background !border-2 !rounded-sm" />
    {/* Single input handle — left center, animated */}
    <Handle id="in" type="target" position={Position.Left}
      className="node-handle-in"
      style={{ width: 28, height: 28, borderRadius: 9999, background: '#374151', border: '3px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#9ca3af', top: '50%', zIndex: 30 }}>
      <span className="pointer-events-none select-none leading-none">+</span>
    </Handle>
    {/* Single output handle — right center, animated */}
    <Handle id="out" type="source" position={Position.Right}
      className="node-handle-out"
      style={{ width: 28, height: 28, borderRadius: 9999, background: '#374151', border: '3px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#9ca3af', top: '50%', zIndex: 30 }}>
      <span className="pointer-events-none select-none leading-none">+</span>
    </Handle>

    <div
      className={`rounded-xl border bg-canvasNode overflow-hidden flex flex-col relative ${
        selected ? 'border-primary/50' : 'border-border'
      }`}
      style={{ width: props.width || 400, height: props.height || 225 }}
    >
      {/* Top bar: label + prompt template + char count */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] text-textMuted">文本</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowTemplateModal(true)}
            className="nodrag text-textMuted/50 hover:text-textMain transition-colors"
            title="提示词模板">
            <BookOpen size={11} />
          </button>
          <span className="text-[10px] text-textMuted/60 tabular-nums">{charCount}字</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 pb-2 gap-2 flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Status indicator */}
        {showStreaming ? (
          <div className="flex items-center gap-1.5 text-[10px] text-textMuted">
            <Loader2 size={10} className="animate-spin" />
            <span>生成中...</span>
          </div>
        ) : null}
        {errorMessage ? (
          <div className="text-[10px] text-red-400/80 truncate" title={errorMessage}>
            {errorMessage}
          </div>
        ) : null}

        {/* Editable prompt textarea */}
        <textarea
          className="nodrag nowheel w-full flex-1 min-h-[2rem] rounded-lg border border-border/40 bg-background p-2 text-[11px] leading-relaxed text-textMain placeholder:text-textMuted/40 outline-none focus:border-border resize-none"
          placeholder="输入提示词..."
          value={data.userPromptTemplate || ''}
          onChange={(e) => {
            updateNodeData(props.id, { ...data, userPromptTemplate: e.target.value });
          }}
          disabled={isStreaming}
        />

        {/* Streaming / output display — fixed height, click to preview */}
        {displayText ? (
          <div
            className="nodrag nowheel w-full flex-1 min-h-[2rem] overflow-hidden rounded-lg border border-border/30 bg-background p-2 text-[11px] leading-relaxed text-textMain cursor-pointer hover:border-border/60 transition-colors relative group/output"
            onClick={() => !isStreaming && setShowPreviewModal(true)}
            title="点击预览完整内容"
          >
            <div className="line-clamp-3">{String(displayText)}</div>
            {isStreaming && (
              <span className="inline-block w-1 h-3.5 bg-textMuted ml-0.5 animate-pulse" />
            )}
            {!isStreaming && (
              <div className="absolute bottom-1 right-1 opacity-0 group-hover/output:opacity-100 transition-opacity">
                <Maximize2 size={10} className="text-textMuted" />
              </div>
            )}
          </div>
        ) : null}

        {/* Upstream context preview */}
        {rawData['in'] ? (
          <div className="text-[9px] text-textMuted/50 truncate">
            上游: {String(rawData['in']).slice(0, 60)}...
          </div>
        ) : null}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/30">
        <div className="flex items-center gap-3">
          {/* Model selector */}
          <div className="relative">
            <button type="button" onClick={() => setShowModelMenu(!showModelMenu)}
              className="nodrag text-[11px] text-textMuted hover:text-textMain flex items-center gap-0.5 transition-colors">
              <span className="truncate max-w-[120px]">{modelDisplayName}</span>
              <ChevronDown size={10} />
            </button>
            {showModelMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-background border border-border/40 rounded-lg py-1 z-20 min-w-[180px] max-h-[200px] overflow-y-auto">
                {textModels.length === 0 ? (
                  <div className="px-3 py-2 text-[10px] text-textMuted">无可用模型</div>
                ) : (
                  textModels.map((m) => (
                    <button key={m.configId} type="button"
                      onClick={() => {
                        updateNodeData(props.id, { ...data, modelConfigId: m.configId });
                        selectModel(m.configId);
                        setShowModelMenu(false);
                      }}
                      className={`nodrag block w-full px-3 py-1.5 text-[10px] text-left hover:bg-canvasNode transition-colors ${
                        selectedConfigId === m.configId ? 'text-textMain' : 'text-textMuted'
                      }`}>
                      {m.displayName}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button type="button" onClick={handleStop}
              className="nodrag text-[11px] text-textMuted hover:text-textMain transition-colors">
              ■ 停止
            </button>
          ) : (
            <button type="button" onClick={handleGenerate}
              className="nodrag text-[11px] text-textMuted hover:text-textMain transition-colors">
              ▶ 生成
            </button>
          )}
          {lastOutput && !isStreaming ? (
            <button type="button" onClick={handleReset}
              className="nodrag text-textMuted hover:text-textMain transition-colors"
              title="重置">
              <RotateCcw size={10} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Editable preview modal */}
      {showPreviewModal && typeof document !== 'undefined' && createPortal(
        <TextGenPreviewModal
          text={String(lastOutput)}
          onClose={() => setShowPreviewModal(false)}
          onSave={(newText) => {
            updateNodeData(props.id, { ...data, lastOutput: newText, status: 'succeeded' });
            const currentNodes = getNodes();
            const currentEdges = getEdges();
            propagateData(props.id, 'out', newText, currentNodes, currentEdges, rf.setNodes);
            setShowPreviewModal(false);
          }}
        />,
        document.body,
      )}

      {/* Prompt template modal */}
      <PromptTemplateModal
        open={showTemplateModal}
        toolKey="canvas"
        onClose={() => setShowTemplateModal(false)}
        onSelect={(preset: PromptPreset) => {
          updateNodeData(props.id, {
            ...data,
            userPromptTemplate: preset.prompt_template,
          });
        }}
      />
    </div>
    </>
  );
}
