"use client";

/**
 * AIPolishWizard — 分步向导组件用于批量视频分镜 AI 润色
 * 
 * 步骤流程：
 * 1. template - 选择提示词模板
 * 2. model - 选择 AI 文本模型
 * 3. confirm - 确认配置并预览
 * 4. processing - 调用 AI 处理中
 * 5. result - 处理结果展示
 */

import { useReducer, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { 
  AIPolishWizardProps, 
  WizardStep, 
  STEP_LABELS, 
  STEP_ORDER,
  wizardReducer, 
  initialWizardState 
} from "./types";
import TemplateStep from "./steps/TemplateStep";
import ModelStep from "./steps/ModelStep";
import ConfirmStep from "./steps/ConfirmStep";
import ProcessingStep from "./steps/ProcessingStep";
import ResultStep from "./steps/ResultStep";

const STEP_COUNT = STEP_ORDER.length;

export default function AIPolishWizard({
  open,
  selectedAssets,
  onClose,
  onComplete,
  onCancel,
}: AIPolishWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Reset state when wizard opens
  useEffect(() => {
    if (open) {
      dispatch({ type: "RESET" });
    }
  }, [open]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (state.processingAbort) {
        state.processingAbort.abort();
      }
    };
  }, [state.processingAbort]);

  const currentStepIndex = STEP_ORDER.indexOf(state.step);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEP_COUNT - 1;
  const isProcessingStep = state.step === "processing";

  const canGoNext = useCallback(() => {
    switch (state.step) {
      case "template":
        return state.selectedTemplate !== null;
      case "model":
        return state.selectedModelId !== null;
      case "confirm":
        return true;
      default:
        return false;
    }
  }, [state.step, state.selectedTemplate, state.selectedModelId]);

  const handleNext = useCallback(() => {
    if (currentStepIndex < STEP_COUNT - 1) {
      const nextStep = STEP_ORDER[currentStepIndex + 1];
      dispatch({ type: "GO_TO_STEP", payload: nextStep });
    }
  }, [currentStepIndex]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0 && !isProcessingStep) {
      const prevStep = STEP_ORDER[currentStepIndex - 1];
      dispatch({ type: "GO_TO_STEP", payload: prevStep });
    }
  }, [currentStepIndex, isProcessingStep]);

  const handleCancel = useCallback(() => {
    if (state.processingAbort) {
      state.processingAbort.abort();
    }
    onCancel();
    onClose();
  }, [state.processingAbort, onCancel, onClose]);

  const handleComplete = useCallback((updates: Array<{ asset_id: string; prompt: string }>) => {
    onComplete(updates);
    onClose();
  }, [onComplete, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={!isProcessingStep ? handleCancel : undefined}
      />

      {/* Main Modal */}
      <div className="relative w-[900px] h-[700px] max-w-[95vw] max-h-[95vh] rounded-2xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-textMain">AI 润色向导</h2>
            <div className="flex items-center gap-1 text-sm text-textMuted">
              <span>步骤 {currentStepIndex + 1}</span>
              <span>/</span>
              <span>{STEP_COUNT}</span>
            </div>
          </div>
          {!isProcessingStep && (
            <button
              type="button"
              onClick={handleCancel}
              className="w-8 h-8 rounded-lg hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Step Progress Bar */}
        <div className="px-6 py-3 border-b border-border/40 bg-surface/30 shrink-0">
          <div className="flex items-center justify-between">
            {STEP_ORDER.map((step, index) => {
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              const isClickable = index < currentStepIndex && !isProcessingStep;

              return (
                <div key={step} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={isClickable ? () => dispatch({ type: "GO_TO_STEP", payload: step }) : undefined}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : isCompleted
                        ? "text-textMain hover:bg-surfaceHighlight"
                        : "text-textMuted"
                    } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      isActive
                        ? "bg-primary text-white"
                        : isCompleted
                        ? "bg-green-500 text-white"
                        : "bg-border text-textMuted"
                    }`}>
                      {isCompleted ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
                  </button>
                  {index < STEP_ORDER.length - 1 && (
                    <div className={`flex-1 h-px mx-2 ${
                      isCompleted ? "bg-green-500/50" : "bg-border"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {state.step === "template" && (
            <TemplateStep
              selectedTemplate={state.selectedTemplate}
              onSelect={(template) => dispatch({ type: "SELECT_TEMPLATE", payload: template })}
              showTemplateModal={showTemplateModal}
              onShowTemplateModalChange={setShowTemplateModal}
            />
          )}

          {state.step === "model" && (
            <ModelStep
              selectedModelId={state.selectedModelId}
              onSelect={(modelId) => dispatch({ type: "SELECT_MODEL", payload: modelId })}
            />
          )}

          {state.step === "confirm" && (
            <ConfirmStep
              selectedAssets={selectedAssets}
              selectedTemplate={state.selectedTemplate}
              selectedModelId={state.selectedModelId}
            />
          )}

          {state.step === "processing" && (
            <ProcessingStep
              selectedAssets={selectedAssets}
              selectedTemplate={state.selectedTemplate}
              selectedModelId={state.selectedModelId}
              dispatch={dispatch}
            />
          )}

          {state.step === "result" && (
            <ResultStep
              result={state.result}
              error={state.error}
              selectedAssets={selectedAssets}
              onComplete={handleComplete}
              onRetry={() => dispatch({ type: "GO_TO_STEP", payload: "confirm" })}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/60 shrink-0 bg-surface/30">
          <div className="flex items-center gap-2 text-sm text-textMuted">
            {state.step === "confirm" && (
              <>
                <span>将处理</span>
                <span className="font-medium text-textMain">{selectedAssets.length}</span>
                <span>个分镜</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {state.step === "result" ? (
              // Result step buttons
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
                >
                  关闭
                </button>
              </>
            ) : state.step === "processing" ? (
              // Processing step - no buttons
              <button
                type="button"
                onClick={() => {
                  if (state.processingAbort) {
                    state.processingAbort.abort();
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-500 transition-colors flex items-center gap-1.5"
              >
                <X size={14} />
                取消处理
              </button>
            ) : (
              // Normal navigation buttons
              <>
                {!isFirstStep && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
                  >
                    上一步
                  </button>
                )}
                {state.step === "template" && !state.selectedTemplate ? (
                  // Template step without selection - show open modal button
                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(true)}
                    className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                  >
                    <Sparkles size={16} />
                    选择模板
                  </button>
                ) : (
                  // Normal next button
                  <button
                    type="button"
                    onClick={isLastStep ? undefined : handleNext}
                    disabled={!canGoNext()}
                    className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {state.step === "confirm" ? "开始润色" : "下一步"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
