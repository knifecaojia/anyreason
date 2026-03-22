"use client";

import { useState, useCallback } from "react";
import { MediaGenerationResponse, ModelCapabilities } from "@/lib/aistudio/types";
import { generateMedia } from "@/components/actions/ai-media-actions";
import { ModelSelector } from "@/components/ai/ModelSelector";
import { CreditCostPreview } from "@/components/credits/CreditCostPreview";
import { useCredits } from "@/components/credits/CreditsContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ImageGenerationPage() {
    const [selectedModelCode, setSelectedModelCode] = useState("");
    const [caps, setCaps] = useState<ModelCapabilities>({});
    const [prompt, setPrompt] = useState("");
    const [negativePrompt, setNegativePrompt] = useState("");
    const [capParams, setCapParams] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<MediaGenerationResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { balance, refresh } = useCredits();

    const handleModelSelect = useCallback((code: string, c: ModelCapabilities) => {
        setSelectedModelCode(code);
        setCaps(c);
    }, []);

    const handleGenerate = async () => {
        if (!selectedModelCode || !prompt) return;
        setLoading(true);
        setError(null);
        try {
            const res = await generateMedia({
                model_key: selectedModelCode,
                prompt,
                negative_prompt: negativePrompt || undefined,
                param_json: capParams,
                category: "image",
            });
            setResult(res);
        } catch (e: any) {
            setError(e.message || "生成失败");
        } finally {
            setLoading(false);
            refresh().catch(console.error);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 h-[calc(100vh-60px)]">
            <div className="col-span-1 space-y-6 overflow-y-auto pr-2">
                <Card className="p-4 space-y-4">
                    <h2 className="text-lg font-semibold">图片生成配置</h2>
                    <ModelSelector
                        category="image"
                        onModelSelect={handleModelSelect}
                        onParamsChange={setCapParams}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        negativePrompt={negativePrompt}
                        onNegativePromptChange={setNegativePrompt}
                    />
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                        <div className="min-w-0">
                            <div className="text-xs font-medium text-foreground">生成前积分预估</div>
                            <div className="text-[11px] text-muted-foreground">
                                {selectedModelCode ? `当前模型：${selectedModelCode}` : "请选择模型后查看积分预估"}
                            </div>
                        </div>
                        <CreditCostPreview
                            category="image"
                            userBalance={balance}
                            size="sm"
                            className="shrink-0"
                        />
                    </div>
                    <Button onClick={handleGenerate} disabled={loading || !prompt} className="w-full">
                        {loading ? "生成中..." : "生成图片"}
                    </Button>
                    {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
                </Card>
            </div>

            <div className="col-span-2 h-full">
                <Card className="p-4 h-full flex flex-col items-center justify-center bg-muted/20 relative">
                    {result ? (
                        <div className="space-y-4 text-center max-w-full max-h-full flex flex-col items-center">
                            <div className="relative max-w-full max-h-[calc(100vh-200px)] overflow-hidden rounded-lg shadow-lg">
                                <img src={result.url} alt="Generated" className="object-contain max-w-full max-h-full" />
                            </div>
                            <div className="text-sm text-muted-foreground bg-background/80 p-2 rounded backdrop-blur-sm">
                                <p>Usage ID: {result.usage_id}</p>
                                {result.cost !== undefined && <p>Cost: {result.cost} credits</p>}
                                <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">
                                    在新标签页打开
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="text-muted-foreground text-center">
                            <div className="text-4xl mb-2">🎨</div>
                            <p className="text-lg font-medium">预览区域</p>
                            <p className="text-sm">配置参数并点击生成，结果将显示在这里</p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
