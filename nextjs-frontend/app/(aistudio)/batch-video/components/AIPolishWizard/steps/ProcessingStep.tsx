"use client";

/**
 * ProcessingStep - 步骤4：处理中
 * 
 * 调用 AI API 并处理结果
 */

import { useEffect, useRef } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { PromptPreset } from "@/components/canvas/PromptTemplateModal";
import type { BatchVideoAsset } from "../../../types";
import type { WizardAction } from "../types";

interface ProcessingStepProps {
  selectedAssets: BatchVideoAsset[];
  selectedTemplate: PromptPreset | null;
  selectedModelId: string | null;
  dispatch: React.Dispatch<WizardAction>;
}

export default function ProcessingStep({
  selectedAssets,
  selectedTemplate,
  selectedModelId,
  dispatch,
}: ProcessingStepProps) {
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const processPolish = async () => {
      console.log("[AI Polish] Starting process...");
      console.log("[AI Polish] selectedAssets:", selectedAssets.length, "assets");
      console.log("[AI Polish] selectedTemplate:", selectedTemplate?.name);
      console.log("[AI Polish] selectedModelId:", selectedModelId);

      if (!selectedTemplate || !selectedModelId) {
        console.error("[AI Polish] Missing template or model");
        dispatch({ type: "PROCESSING_ERROR", payload: "模板或模型未选择" });
        return;
      }

      const abortController = new AbortController();
      dispatch({ type: "SET_PROCESSING_ABORT", payload: abortController });

      try {
        // 获取分镜提示词（用户输入）
        const input = selectedAssets
          .map((asset) => asset.prompt?.trim() || "")
          .join("\n");
        console.log("[AI Polish] Input text (user content):", input.substring(0, 100) + "...");

        // 模板内容作为系统提示词
        const systemPrompt = selectedTemplate.prompt_template;
        console.log("[AI Polish] System prompt (template):", systemPrompt.substring(0, 200) + "...");

        const requestBody = {
          model_config_id: selectedModelId,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            { role: "user", content: input },
          ],
        };
        console.log("[AI Polish] Request body:", JSON.stringify(requestBody, null, 2));

        const response = await fetch("/api/ai/text/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        console.log("[AI Polish] Response status:", response.status);
        
        const result = await response.json();
        console.log("[AI Polish] Response result:", JSON.stringify(result, null, 2));

        if (result.code === 200) {
          const outputText = String(result.data?.output_text || "").trim();
          console.log("[AI Polish] Output text:", outputText.substring(0, 200) + "...");
          console.log("[AI Polish] Output text length:", outputText.length);
          
          const outputLines = outputText
            .split(/\r?\n/)
            .map((line: string) => line.trim())
            .filter(Boolean);
          console.log("[AI Polish] Output lines count:", outputLines.length);

          const originalLines = selectedAssets.map((asset) =>
            asset.prompt?.trim() || ""
          );

          const mismatch =
            outputLines.length !== originalLines.length
              ? { expected: originalLines.length, actual: outputLines.length }
              : undefined;

          dispatch({
            type: "PROCESSING_COMPLETE",
            payload: {
              success: !mismatch,
              originalLines,
              outputLines,
              mismatch,
            },
          });
        } else {
          console.error("[AI Polish] API error:", result.msg);
          dispatch({
            type: "PROCESSING_ERROR",
            payload: result.msg || "AI 润色失败",
          });
        }
      } catch (error) {
        console.error("[AI Polish] Exception:", error);
        if (error instanceof Error && error.name === "AbortError") {
          dispatch({ type: "PROCESSING_ERROR", payload: "已取消" });
        } else {
          dispatch({
            type: "PROCESSING_ERROR",
            payload:
              error instanceof Error ? error.message : "处理过程中发生错误",
          });
        }
      }
    };

    processPolish();
  }, [selectedAssets, selectedTemplate, selectedModelId, dispatch]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="text-center space-y-6">        <div className="relative">          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">            <Sparkles size={32} className="text-primary animate-pulse" />          </div>          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />        </div>
        <div className="space-y-2">          <h3 className="text-lg font-semibold text-textMain">正在润色分镜...</h3>          <p className="text-sm text-textMuted">            正在使用 AI 模型润色 {selectedAssets.length} 个分镜的提示词
          </p>        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-textMuted">          <Loader2 size={14} className="animate-spin" />          <span>处理中，请稍候...</span>        </div>      </div>    </div>  );
}
