"use client";

/**
 * ModelStep - 步骤2：选择 AI 文本模型
 */

import { useAIModelList } from "@/hooks/useAIModelList";
import { Check, Bot } from "lucide-react";

interface ModelStepProps {
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
}

export default function ModelStep({ selectedModelId, onSelect }: ModelStepProps) {
  const { models, selectedConfigId, selectModel } = useAIModelList("text");

  const effectiveSelectedId = selectedModelId || selectedConfigId;

  const handleSelect = (modelId: string) => {
    onSelect(modelId);
    selectModel(modelId);
  };

  // Get manufacturer icon/color
  const getManufacturerStyle = (manufacturer: string) => {
    const styles: Record<string, { bg: string; icon: string }> = {
      openai: { bg: "bg-green-500/20", icon: "text-green-500" },
      anthropic: { bg: "bg-orange-500/20", icon: "text-orange-500" },
      google: { bg: "bg-blue-500/20", icon: "text-blue-500" },
      aliyun: { bg: "bg-red-500/20", icon: "text-red-500" },
      volcengine: { bg: "bg-purple-500/20", icon: "text-purple-500" },
    };
    return styles[manufacturer.toLowerCase()] || { bg: "bg-gray-500/20", icon: "text-gray-500" };
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-textMain mb-2">选择 AI 文本模型</h3>
        <p className="text-sm text-textMuted">
          选择用于润色分镜提示词的 AI 模型。不同模型在创意性和遵循指令能力上有所差异。
        </p>
      </div>

      {models.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
              <Bot size={20} className="text-amber-500" />
            </div>
            <p className="text-textMuted">暂无可用的文本模型</p>
            <p className="text-xs text-textMuted">请先在 AI 模型管理中配置</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {models.map((model) => {
              const isSelected = effectiveSelectedId === model.configId;
              const style = getManufacturerStyle(model.manufacturer);

              return (
                <button
                  key={model.configId}
                  type="button"
                  onClick={() => handleSelect(model.configId)}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50 hover:bg-surfaceHighlight"
                  }`}
                >
                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                      <Check size={12} />
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
                      <Bot size={18} className={style.icon} />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-textMain truncate pr-6">
                        {model.displayName}
                      </h4>
                      <p className="text-xs text-textMuted mt-0.5">
                        {model.manufacturer}
                      </p>

                      {/* Capabilities */}
                      {model.capabilities && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {model.capabilities.context_window && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceHighlight text-textMuted">
                              {Math.round(model.capabilities.context_window / 1000)}k 上下文
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Info */}
      {effectiveSelectedId && (
        <div className="mt-4 pt-4 border-t border-border/40">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-textMuted">已选择:</span>
            <span className="font-medium text-textMain">
              {models.find((m) => m.configId === effectiveSelectedId)?.displayName || "未知模型"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
