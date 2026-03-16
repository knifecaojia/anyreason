/**
 * AIPolishWizard 类型定义
 */

import type { PromptPreset } from "@/components/canvas/PromptTemplateModal";
import type { BatchVideoAsset } from "../../types";

export type WizardStep = 
  | "template" 
  | "model" 
  | "confirm" 
  | "processing" 
  | "result";

export interface LineMapping {
  id: string;
  originalIndex: number;
  originalText: string;
  outputIndex: number | null;
  outputText: string;
  isManualEdit: boolean;
  status: "matched" | "unmatched" | "edited" | "inserted" | "deleted";
}

export interface WizardResult {
  success: boolean;
  originalLines: string[];
  outputLines: string[];
  mismatch?: { 
    expected: number; 
    actual: number;
  };
  mappings?: LineMapping[];
}

export interface WizardState {
  step: WizardStep;
  selectedTemplate: PromptPreset | null;
  selectedModelId: string | null;
  isProcessing: boolean;
  processingAbort: AbortController | null;
  result: WizardResult | null;
  error: string | null;
}

export type WizardAction =
  | { type: "SELECT_TEMPLATE"; payload: PromptPreset }
  | { type: "SELECT_MODEL"; payload: string }
  | { type: "GO_TO_STEP"; payload: WizardStep }
  | { type: "START_PROCESSING" }
  | { type: "SET_PROCESSING_ABORT"; payload: AbortController }
  | { type: "PROCESSING_COMPLETE"; payload: WizardResult }
  | { type: "PROCESSING_ERROR"; payload: string }
  | { type: "UPDATE_MAPPINGS"; payload: LineMapping[] }
  | { type: "RESET" };

export const wizardReducer = (state: WizardState, action: WizardAction): WizardState => {
  switch (action.type) {
    case "SELECT_TEMPLATE":
      return { ...state, selectedTemplate: action.payload };
    case "SELECT_MODEL":
      return { ...state, selectedModelId: action.payload };
    case "GO_TO_STEP":
      return { ...state, step: action.payload };
    case "START_PROCESSING":
      return { ...state, step: "processing", isProcessing: true, error: null };
    case "SET_PROCESSING_ABORT":
      return { ...state, processingAbort: action.payload };
    case "PROCESSING_COMPLETE":
      return { 
        ...state, 
        step: "result", 
        isProcessing: false, 
        result: action.payload,
        error: null 
      };
    case "PROCESSING_ERROR":
      return { 
        ...state, 
        step: "result", 
        isProcessing: false, 
        error: action.payload 
      };
    case "UPDATE_MAPPINGS":
      return {
        ...state,
        result: state.result 
          ? { ...state.result, mappings: action.payload }
          : null
      };
    case "RESET":
      return {
        step: "template",
        selectedTemplate: null,
        selectedModelId: null,
        isProcessing: false,
        processingAbort: null,
        result: null,
        error: null,
      };
    default:
      return state;
  }
};

export const initialWizardState: WizardState = {
  step: "template",
  selectedTemplate: null,
  selectedModelId: null,
  isProcessing: false,
  processingAbort: null,
  result: null,
  error: null,
};

export interface AIPolishWizardProps {
  open: boolean;
  selectedAssets: BatchVideoAsset[];
  onClose: () => void;
  onComplete: (updates: Array<{ asset_id: string; prompt: string }>) => void;
  onCancel: () => void;
}

export const STEP_LABELS: Record<WizardStep, string> = {
  template: "选择模板",
  model: "选择模型",
  confirm: "确认执行",
  processing: "处理中",
  result: "处理结果",
};

export const STEP_ORDER: WizardStep[] = ["template", "model", "confirm", "processing", "result"];
