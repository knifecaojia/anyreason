"use client";

import { useState, useEffect } from "react";
import { MediaModelConfig, MediaGenerationResponse } from "@/lib/aistudio/types";
import { listMediaModels, generateMedia } from "@/components/actions/ai-media-actions";
import { MediaGenerationForm } from "@/components/ai/MediaGenerationForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export default function VideoGenerationPage() {
    const [models, setModels] = useState<MediaModelConfig[]>([]);
    const [selectedModelKey, setSelectedModelKey] = useState<string>("");
    const [prompt, setPrompt] = useState("");
    const [negativePrompt, setNegativePrompt] = useState("");
    const [params, setParams] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<MediaGenerationResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listMediaModels("video")
            .then(data => {
                setModels(data || []);
                if (data && data.length > 0) {
                    setSelectedModelKey(data[0].model);
                }
            })
            .catch(err => console.error("Failed to load models", err));
    }, []);

    const selectedModel = models.find(m => m.model === selectedModelKey);

    useEffect(() => {
        if (selectedModel) {
            // Reset params based on schema defaults
            const defaults: Record<string, any> = {};
            if (selectedModel.param_schema && selectedModel.param_schema.properties) {
                Object.entries(selectedModel.param_schema.properties).forEach(([k, v]) => {
                    if (v.default !== undefined) defaults[k] = v.default;
                });
            }
            setParams(defaults);
        }
    }, [selectedModelKey, selectedModel]);

    const handleGenerate = async () => {
        if (!selectedModel) return;
        setLoading(true);
        setError(null);
        try {
            const res = await generateMedia({
                model_key: selectedModel.model,
                prompt,
                negative_prompt: negativePrompt,
                param_json: params,
                category: "video"
            });
            setResult(res);
        } catch (e: any) {
            console.error(e);
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
                    
                    <div className="space-y-2">
                        <Label>模型</Label>
                        <Select value={selectedModelKey} onValueChange={setSelectedModelKey}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择模型" />
                            </SelectTrigger>
                            <SelectContent>
                                {models.map(m => (
                                    <SelectItem key={m.model} value={m.model}>
                                        {m.name} ({m.manufacturer})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedModel?.doc_url && (
                            <a href={selectedModel.doc_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                                查看官方文档
                            </a>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>提示词</Label>
                        <textarea 
                            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="描述你想要的视频场景..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>反向提示词 (可选)</Label>
                        <Input 
                            value={negativePrompt}
                            onChange={e => setNegativePrompt(e.target.value)}
                            placeholder="不希望出现的元素..."
                        />
                    </div>

                    {selectedModel && (
                        <div className="border-t pt-4 mt-4">
                            <h3 className="text-sm font-medium mb-3">高级参数</h3>
                            <MediaGenerationForm 
                                schema={selectedModel.param_schema}
                                value={params}
                                onChange={setParams}
                            />
                        </div>
                    )}

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
                                <video 
                                    src={result.url} 
                                    controls 
                                    autoPlay 
                                    loop 
                                    className="object-contain max-w-full max-h-full" 
                                />
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
