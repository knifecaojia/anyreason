"use client";

/**
 * ConfirmStep - 步骤3：确认执行
 */

import { Sparkles, Bot, FileText } from "lucide-react";
import type { PromptPreset } from "@/components/canvas/PromptTemplateModal";
import type { BatchVideoAsset } from "../../../types";
import { useAIModelList } from "@/hooks/useAIModelList";

interface ConfirmStepProps {
  selectedAssets: BatchVideoAsset[];
  selectedTemplate: PromptPreset | null;
  selectedModelId: string | null;
}

export default function ConfirmStep({
  selectedAssets,
  selectedTemplate,
  selectedModelId,
}: ConfirmStepProps) {
  const { models } = useAIModelList("text");
  const selectedModel = models.find((m) => m.configId === selectedModelId);

  // Prepare preview data
  const inputPreview = selectedAssets
    .slice(0, 3)
    .map((asset) => asset.prompt?.trim() || "(空)")
    .join("\n");

  const hasMore = selectedAssets.length > 3;

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-textMain mb-2">确认配置</h3>
        <p className="text-sm text-textMuted">请确认以下配置无误，然后点击"开始润色"。</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Template Info */}
        {selectedTemplate && (
          <div className="rounded-xl border border-border bg-surface/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-primary" />
              <span className="font-medium text-textMain">提示词模板</span>
            </div>            <div className="space-y-2">
              <div className="text-sm font-medium text-textMain">
                {selectedTemplate.name}
              </div>              <pre className="text-xs text-textMuted whitespace-pre-wrap font-mono bg-background rounded-lg p-2 border border-border">
                {selectedTemplate.prompt_template.slice(0, 200)}
                {selectedTemplate.prompt_template.length > 200 && "..."}
              </pre>
            </div>          </div>        )}

        {/* Model Info */}
        {selectedModel && (
          <div className="rounded-xl border border-border bg-surface/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot size={16} className="text-primary" />
              <span className="font-medium text-textMain">AI 模型</span>
            </div>            <div className="text-sm text-textMain">              {selectedModel.displayName}
            </div>            <div className="text-xs text-textMuted">              提供商: {selectedModel.manufacturer}
            </div>          </div>        )}

        {/* Input Preview */}
        <div className="rounded-xl border border-border bg-surface/50 p-4">          <div className="flex items-center gap-2 mb-3">            <FileText size={16} className="text-primary" />
            <span className="font-medium text-textMain">输入预览</span>            <span className="text-xs text-textMuted ml-auto">              共 {selectedAssets.length} 个分镜            </span>          </div>          <pre className="text-xs text-textMuted whitespace-pre-wrap font-mono bg-background rounded-lg p-2 border border-border max-h-[120px] overflow-y-auto">            {inputPreview}
            {hasMore && `\n... 还有 ${selectedAssets.length - 3} 个分镜`}          </pre>        </div>      </div>    </div>  );
}
