"use client";

/**
 * TemplateStep - 步骤1：选择提示词模板
 * 
 * 复用 PromptTemplateModal 的核心 UI 结构
 */

import { Sparkles, Check } from "lucide-react";
import type { PromptPreset } from "@/components/canvas/PromptTemplateModal";
import PromptTemplateModal from "@/components/canvas/PromptTemplateModal";

interface TemplateStepProps {
  selectedTemplate: PromptPreset | null;
  onSelect: (template: PromptPreset) => void;
  showTemplateModal: boolean;
  onShowTemplateModalChange: (show: boolean) => void;
}

export default function TemplateStep({ 
  selectedTemplate, 
  onSelect,
  showTemplateModal,
  onShowTemplateModalChange 
}: TemplateStepProps) {

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-textMain mb-2">选择提示词模板</h3>
        <p className="text-sm text-textMuted">
          选择一个预设的提示词模板作为 AI 润色的系统指令，或创建新的模板。
        </p>
      </div>

      {selectedTemplate ? (
        <div className="flex-1 flex flex-col">
          {/* Selected Template Card */}
          <div className="rounded-xl border-2 border-primary bg-primary/5 p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Sparkles size={16} className="text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-textMain">{selectedTemplate.name}</h4>
                  {selectedTemplate.group && (
                    <span className="text-xs text-textMuted">分组：{selectedTemplate.group}</span>
                  )}
                </div>
              </div>
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                <Check size={14} />
              </div>
            </div>

            <div className="rounded-lg bg-background border border-border p-3">
              <div className="text-xs text-textMuted mb-1">模板内容</div>
              <pre className="text-sm text-textMain whitespace-pre-wrap font-mono">
                {selectedTemplate.prompt_template}
              </pre>
            </div>

            <div className="flex items-center justify-between text-xs text-textMuted">
              <span>
                {selectedTemplate.provider && selectedTemplate.model 
                  ? `${selectedTemplate.provider}/${selectedTemplate.model}`
                  : "通用模板"}
              </span>
              <span>
                更新于 {new Date(selectedTemplate.updated_at).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>

          {/* Change Button */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => onShowTemplateModalChange(true)}
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              更换模板
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-surfaceHighlight flex items-center justify-center mx-auto">
              <Sparkles size={24} className="text-textMuted" />
            </div>
            <div>
              <p className="text-textMain font-medium mb-2">选择或创建模板</p>
              <p className="text-sm text-textMuted mb-6">
                从模板库中选择现有模板，或创建新的润色模板
              </p>
            </div>
            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onShowTemplateModalChange(true)}
                className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Sparkles size={16} />
                打开模板库
              </button>
            </div>
            <p className="text-xs text-textMuted">
              提示：在模板库中可以新建、编辑和管理模板
            </p>
          </div>
        </div>
      )}

      {/* Template Modal */}
      <PromptTemplateModal
        open={showTemplateModal}
        toolKey="batch_video_polish"
        onClose={() => onShowTemplateModalChange(false)}
        onSelect={(template) => {
          onSelect(template);
          onShowTemplateModalChange(false);
        }}
      />
    </div>
  );
}
