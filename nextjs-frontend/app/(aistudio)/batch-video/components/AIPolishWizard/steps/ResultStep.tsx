"use client";

/**
 * ResultStep - 步骤5：处理结果（增强版）
 * 
 * 功能：
 * - 行数匹配时：显示成功状态，展示前后对比
 * - 行数不匹配时：提供可视化对比编辑器
 * - 支持行级操作：编辑、插入、删除、合并
 * - 智能匹配建议
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  ArrowLeft, 
  RotateCcw,
  Plus,
  Trash2,
  Combine,
  Undo2,
  Wand2
} from "lucide-react";
import type { BatchVideoAsset } from "../../../types";
import type { WizardResult, LineMapping } from "../types";

interface ResultStepProps {
  result: WizardResult | null;
  error: string | null;
  selectedAssets: BatchVideoAsset[];
  onComplete: (updates: Array<{ asset_id: string; prompt: string }>) => void;
  onRetry: () => void;
}

// Calculate text similarity
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  const words1 = s1.match(/[\u4e00-\u9fa5]+|[a-z]+/g) || [];
  const words2 = s2.match(/[\u4e00-\u9fa5]+|[a-z]+/g) || [];
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

export default function ResultStep({
  result,
  error,
  selectedAssets,
  onComplete,
  onRetry,
}: ResultStepProps) {
  const [showAllLines, setShowAllLines] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [mappings, setMappings] = useState<LineMapping[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState<LineMapping[][]>([]);

  // Initialize mappings
  useEffect(() => {
    if (!result) return;
    
    const initialMappings: LineMapping[] = selectedAssets.map((asset, index) => ({
      id: `line-${index}`,
      originalIndex: index,
      originalText: asset.prompt?.trim() || "",
      outputIndex: index < result.outputLines.length ? index : null,
      outputText: result.outputLines[index] || "",
      isManualEdit: false,
      status: index < result.outputLines.length ? "matched" : "unmatched"
    }));
    
    setMappings(initialMappings);
    setHistory([initialMappings]);
  }, [result, selectedAssets]);

  const saveToHistory = useCallback((newMappings: LineMapping[]) => {
    setHistory(prev => [...prev.slice(-9), newMappings]);
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length <= 1) return;
    const previousState = history[history.length - 2];
    setMappings(previousState);
    setHistory(prev => prev.slice(0, -1));
  }, [history]);

  const hasMismatch = result?.mismatch != null;

  const suggestions = useMemo(() => {
    if (!result || !hasMismatch) return [];
    return selectedAssets.map((asset, i) => {
      let bestMatch = { index: -1, score: 0 };
      result.outputLines.forEach((line, j) => {
        const score = calculateSimilarity(asset.prompt || "", line);
        if (score > bestMatch.score) bestMatch = { index: j, score };
      });
      return {
        originalIndex: i,
        suggestedOutputIndex: bestMatch.score > 0.3 ? bestMatch.index : null,
        confidence: bestMatch.score
      };
    });
  }, [result, hasMismatch, selectedAssets]);

  const handleEditStart = (index: number, currentValue: string) => {
    setEditingIndex(index);
    setEditValue(currentValue);
  };

  const handleEditSave = (index: number) => {
    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      outputText: editValue,
      isManualEdit: true,
      status: editValue.trim() ? "edited" : "deleted"
    };
    setMappings(newMappings);
    saveToHistory(newMappings);
    setEditingIndex(null);
  };

  const handleInsertLine = (afterIndex: number) => {
    const newMappings: LineMapping[] = [];
    for (let i = 0; i < mappings.length; i++) {
      newMappings.push(mappings[i]);
      if (i === afterIndex) {
        newMappings.push({
          id: `line-inserted-${Date.now()}`,
          originalIndex: -1,
          originalText: "",
          outputIndex: null,
          outputText: "",
          isManualEdit: true,
          status: "inserted"
        });
      }
    }
    setMappings(newMappings);
    saveToHistory(newMappings);
  };

  const handleDeleteLine = (index: number) => {
    const newMappings = mappings.map((m, i) => 
      i === index ? { ...m, outputText: "", status: "deleted" as const } : m
    );
    setMappings(newMappings);
    saveToHistory(newMappings);
  };

  const handleMergeWithNext = (index: number) => {
    if (index >= mappings.length - 1) return;
    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      outputText: `${newMappings[index].outputText}\n${newMappings[index + 1].outputText}`.trim(),
      isManualEdit: true,
      status: "edited"
    };
    newMappings.splice(index + 1, 1);
    setMappings(newMappings);
    saveToHistory(newMappings);
  };

  const applySuggestions = () => {
    if (!result) return;
    const newMappings = mappings.map((m, i) => {
      const suggestion = suggestions[i];
      if (suggestion?.suggestedOutputIndex !== null && suggestion.confidence > 0.5) {
        return {
          ...m,
          outputText: result.outputLines[suggestion.suggestedOutputIndex!],
          outputIndex: suggestion.suggestedOutputIndex,
          status: "matched" as const
        };
      }
      return m;
    });
    setMappings(newMappings);
    saveToHistory(newMappings);
    setShowSuggestions(false);
  };

  const handleApply = () => {
    const updates = selectedAssets.map((asset, index) => ({
      asset_id: asset.id,
      prompt: mappings[index]?.outputText || asset.prompt || ""
    }));
    onComplete(updates);
  };

  const canApply = mappings.every(m => m.outputText.trim() !== "");

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <XCircle size={28} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-textMain">润色失败</h3>
            <p className="text-sm text-red-400 mt-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 mx-auto"
          >
            <RotateCcw size={14} />
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="text-center text-textMuted">
          处理结果不可用
        </div>
      </div>
    );
  }

  if (!hasMismatch) {
    return (
      <div className="h-full flex flex-col p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-textMain">润色完成</h3>
          <p className="text-sm text-textMuted mt-1">
            成功润色 {selectedAssets.length} 个分镜
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3">
            {(showAllLines ? selectedAssets : selectedAssets.slice(0, 3)).map(
              (asset, index) => (
                <div key={asset.id} className="rounded-lg border border-border p-3">
                  <div className="text-xs text-textMuted mb-1">分镜 {index + 1}</div>
                  <div className="text-xs text-textMuted line-through mb-1">
                    {asset.prompt?.slice(0, 60)}
                    {(asset.prompt?.length ?? 0) > 60 && "..."}
                  </div>
                  <div className="text-sm text-textMain">
                    {result.outputLines[index]?.slice(0, 60)}
                    {(result.outputLines[index]?.length ?? 0) > 60 && "..."}
                  </div>
                </div>
              )
            )}
            {selectedAssets.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllLines(!showAllLines)}
                className="w-full py-2 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                {showAllLines ? "收起" : `查看全部 ${selectedAssets.length} 个分镜`}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            应用结果
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-amber-500 mb-2">
          <AlertCircle size={20} />
          <span className="font-medium">行数不匹配</span>
          <span className="text-xs text-textMuted ml-2">
            AI 返回 {result.mismatch?.actual} 行，期望 {result.mismatch?.expected} 行
          </span>
        </div>
        <p className="text-sm text-textMuted">
          请调整右侧内容以匹配分镜数量。你可以编辑、插入或删除行。
        </p>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={handleUndo}
          disabled={history.length <= 1}
          className="px-3 py-1.5 text-xs font-medium text-textMuted hover:text-textMain disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 border border-border rounded-lg"
        >
          <Undo2 size={12} />
          撤销
        </button>
        
        <button
          type="button"
          onClick={() => setShowSuggestions(!showSuggestions)}
          className="px-3 py-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 border border-primary/30 rounded-lg"
        >
          <Wand2 size={12} />
          智能匹配
        </button>

        <div className="flex-1" />

        <div className="text-xs text-textMuted">
          当前: {mappings.filter(m => m.outputText.trim()).length} / {selectedAssets.length} 行
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-textMain">智能匹配建议</span>
            <button
              type="button"
              onClick={applySuggestions}
              className="text-xs text-primary hover:text-primary/80 font-medium"
            >
              应用建议
            </button>
          </div>
          <div className="space-y-1 text-xs">
            {suggestions.filter(s => s.confidence > 0.3).slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-textMuted">
                <span>分镜 {s.originalIndex + 1}</span>
                <span>→</span>
                <span>AI 输出 {s.suggestedOutputIndex !== null ? s.suggestedOutputIndex + 1 : "无"}</span>
                <span className="text-primary">({Math.round(s.confidence * 100)}% 匹配)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto border border-border rounded-lg">
        <div className="grid grid-cols-[auto_1fr_1fr] gap-px bg-border">
          <div className="bg-surfaceHighlight px-3 py-2 text-xs font-medium text-textMuted text-center">#</div>
          <div className="bg-surfaceHighlight px-3 py-2 text-xs font-medium text-textMuted">原始提示词</div>
          <div className="bg-surfaceHighlight px-3 py-2 text-xs font-medium text-textMuted">AI 润色结果（可编辑）</div>

          {mappings.map((mapping, index) => (
            <>
              <div className="bg-background px-2 py-2 text-xs text-textMuted text-center flex flex-col items-center justify-center gap-1">
                <span>{index + 1}</span>
                {mapping.status === "inserted" && (
                  <span className="text-[9px] px-1 py-0.5 bg-blue-500/20 text-blue-500 rounded">新增</span>
                )}
                {mapping.status === "deleted" && (
                  <span className="text-[9px] px-1 py-0.5 bg-red-500/20 text-red-500 rounded">删除</span>
                )}
                {mapping.isManualEdit && mapping.status === "edited" && (
                  <span className="text-[9px] px-1 py-0.5 bg-amber-500/20 text-amber-500 rounded">编辑</span>
                )}
              </div>

              <div className={`bg-background px-3 py-2 text-sm text-textMuted ${mapping.status === "deleted" ? "opacity-50 line-through" : ""}`}>
                {mapping.originalText || "(空)"}
              </div>

              <div className="bg-background px-2 py-2">
                {editingIndex === index ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full min-h-[60px] text-sm text-textMain bg-surface border border-primary rounded-lg p-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditSave(index)}
                        className="px-2 py-1 text-xs bg-primary text-white rounded"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        className="px-2 py-1 text-xs text-textMuted hover:text-textMain"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => handleEditStart(index, mapping.outputText)}
                    className={`min-h-[40px] text-sm cursor-pointer rounded-lg p-2 transition-colors ${
                      mapping.outputText.trim() 
                        ? "text-textMain hover:bg-surfaceHighlight" 
                        : "text-textMuted/50 hover:bg-surfaceHighlight border border-dashed border-border"
                    }`}
                  >
                    {mapping.outputText || "点击编辑..."}
                  </div>
                )}

                {!editingIndex && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleInsertLine(index)}
                      title="在下方插入行"
                      className="p-1 text-textMuted hover:text-primary transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLine(index)}
                      title="删除此行"
                      className="p-1 text-textMuted hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                    {index < mappings.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMergeWithNext(index)}
                        title="与下一行合并"
                        className="p-1 text-textMuted hover:text-primary transition-colors"
                      >
                        <Combine size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between">
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-textMuted hover:text-textMain transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          返回重试
        </button>
        
        <div className="flex items-center gap-3">
          {!canApply && (
            <span className="text-xs text-amber-500">
              还有 {mappings.filter(m => !m.outputText.trim()).length} 个空行需要填写
            </span>
          )}
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            应用编辑结果
          </button>
        </div>
      </div>
    </div>
  );
}
