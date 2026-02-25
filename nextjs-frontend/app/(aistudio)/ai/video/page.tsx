"use client";

import { useState, useCallback } from "react";
import { MediaGenerationResponse, ModelCapabilities } from "@/lib/aistudio/types";
import { generateMedia } from "@/components/actions/ai-media-actions";
import { ModelSelector } from "@/components/ai/ModelSelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function VideoGenerationPage() {
    const [selectedModelCode, setSelectedModelCode] = useState("");
    const [caps, setCaps] = useState<ModelCapabilities>({});
    const [prompt, setPrompt] = useState("");
    const [negativePrompt, setNegativePrompt] = useState("");
    const [capParams, setCapParams] = useState<Record<string, any>>({});
    const [referenceImageUrl, setReferenceImageUrl] = useState<string | undefined>();
    const [referenceFile, setReferenceFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<MediaGenerationResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleModelSelect = useCallback((code: string, c: ModelCapabilities) => {
        setSelectedModelCode(code);
        setCaps(c);
    }, []);

    const handleReferenceImageChange = useCallback((file: File | null) => {
        setReferenceFile(file);
        if (file) {
            setReferenceImageUrl(URL.createObjectURL(file));
        } else {
            setReferenceImageUrl(undefined);
        }
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
                category: "video",
            });
            setResult(res);
        } catch (e: any) {
            setError(e.message || "生成失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 h-[calc(100vh-60px)]">
            <div className="col-span-1 space-y-6 overflow-y-auto pr-2">
                <Card className="p-4 space-y-4">
                    <h2 className="text-lg font-semibold">视频生成配置</h2>
                    <ModelSelector
                        category="video"
                        onModelSelect={handleModelSelect}
                        onParamsChange={setCapParams}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        negativePrompt={negativePrompt}
                        onNegativePromptChange={setNegativePrompt}
                        referenceImageUrl={referenceImageUrl}
                        onReferenceImageChange={handleReferenceImageChange}
                    />
                    <Button onClick={handleGenerate} disabled={loading || !prompt} className="w-full">
                        {loading ? "生成中 (可能需要几分钟)..." : "生成视频"}
                    </Button>
                    {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
                </Card>
            </div>

            <div className="col-span-2 h-full">
                <Card className="p-4 h-full flex flex-col items-center justify-center bg-muted/20 relative">
                    {result ? (
                        <div className="space-y-4 text-center max-w-full max-h-full flex flex-col items-center">
                            <div className="relative max-w-full max-h-[calc(100vh-200px)] overflow-hidden rounded-lg shadow-lg">
                                <video src={result.url} controls autoPlay loop className="object-contain max-w-full max-h-full" />
                            </div>
                            <div className="text-sm text-muted-foreground bg-background/80 p-2 rounded backdrop-blur-sm">
                                <p>Usage ID: {result.usage_id}</p>
                                {result.duration && <p>Duration: {result.duration}s</p>}
                                {result.cost !== undefined && <p>Cost: {result.cost} credits</p>}
                                <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">
                                    下载视频
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="text-muted-foreground text-center">
                            <div className="text-4xl mb-2">🎬</div>
                            <p className="text-lg font-medium">预览区域</p>
                            <p className="text-sm">配置参数并点击生成，结果将显示在这里</p>
                            {loading && <p className="text-xs mt-4 animate-pulse">正在与模型提供商通信...</p>}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
