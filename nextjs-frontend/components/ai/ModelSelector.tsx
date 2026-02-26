"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ManufacturerWithModels,
  ModelCapabilities,
} from "@/lib/aistudio/types";
import { listModelsWithCapabilities } from "@/components/actions/ai-media-actions";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ModelSelectorProps {
  category: "image" | "video";
  onModelSelect: (modelCode: string, caps: ModelCapabilities) => void;
  /** Fires when capability-driven params (resolution, aspect_ratio, duration, input_mode) change */
  onParamsChange: (params: Record<string, any>) => void;
  /** Prompt fields */
  prompt: string;
  onPromptChange: (v: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (v: string) => void;
  /** Reference image (for video models that support it) */
  referenceImageUrl?: string;
  onReferenceImageChange?: (file: File | null) => void;
}

export function ModelSelector({
  category,
  onModelSelect,
  onParamsChange,
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  referenceImageUrl,
  onReferenceImageChange,
}: ModelSelectorProps) {
  const [manufacturers, setManufacturers] = useState<ManufacturerWithModels[]>([]);
  const [selectedModelCode, setSelectedModelCode] = useState<string>("");
  const [capParams, setCapParams] = useState<Record<string, any>>({});

  // Dynamic reference image upload state
  const [firstFrameFile, setFirstFrameFile] = useState<{ file: File; url: string } | null>(null);
  const [lastFrameFile, setLastFrameFile] = useState<{ file: File; url: string } | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<{ file: File; url: string }[]>([]);
  const prevInputModeRef = useRef<string | undefined>(undefined);

  // Load models grouped by manufacturer
  useEffect(() => {
    listModelsWithCapabilities(category)
      .then((data) => {
        setManufacturers(data || []);
        // Auto-select first model
        const first = data?.[0]?.models?.[0];
        if (first) {
          setSelectedModelCode(first.code);
          onModelSelect(first.code, first.model_capabilities);
        }
      })
      .catch((err) => console.error("Failed to load models", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Find selected model across all manufacturers
  const selectedModel = useMemo(() => {
    for (const mfr of manufacturers) {
      const found = mfr.models.find((m) => m.code === selectedModelCode);
      if (found) return found;
    }
    return null;
  }, [manufacturers, selectedModelCode]);

  const caps = selectedModel?.model_capabilities;

  // When model changes, reset capability params and notify parent
  useEffect(() => {
    if (!selectedModel) return;
    const defaults: Record<string, any> = {};
    // resolution_tiers takes priority over flat resolutions
    if (caps?.resolution_tiers && !Array.isArray(caps.resolution_tiers) && Object.keys(caps.resolution_tiers).length > 0) {
      const tiers = caps.resolution_tiers as Record<string, string[]>;
      const tierKeys = Object.keys(tiers);
      const firstTier = tierKeys[0];
      defaults.resolution_tier = firstTier;
      const tierResolutions = tiers[firstTier];
      if (tierResolutions?.length) defaults.resolution = tierResolutions[0];
    } else if (caps?.resolutions?.length) {
      defaults.resolution = caps.resolutions[0];
    }
    if (caps?.aspect_ratios?.length) defaults.aspect_ratio = caps.aspect_ratios[0];
    if (caps?.duration_options?.length) {
      defaults.duration = caps.duration_options[0];
    } else if (caps?.duration_range) {
      defaults.duration = caps.duration_range.min;
    }
    if (caps?.input_modes?.length) defaults.input_mode = caps.input_modes[0];
    setCapParams(defaults);
    onParamsChange(defaults);
    onModelSelect(selectedModel.code, selectedModel.model_capabilities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelCode, selectedModel]);

  const handleCapParamChange = (key: string, value: any) => {
    setCapParams((prev) => {
      const next = { ...prev, [key]: value };
      onParamsChange(next);
      return next;
    });
  };

  /** Batch-update multiple capability params at once (e.g. tier + resolution) */
  const handleCapParamsBatch = (updates: Record<string, any>) => {
    setCapParams((prev) => {
      const next = { ...prev, ...updates };
      onParamsChange(next);
      return next;
    });
  };

  const handleModelChange = (code: string) => {
    setSelectedModelCode(code);
  };

  // Clear uploaded images when input_mode changes
  const currentInputMode = capParams.input_mode as string | undefined;
  useEffect(() => {
    if (prevInputModeRef.current !== undefined && prevInputModeRef.current !== currentInputMode) {
      setFirstFrameFile((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
      setLastFrameFile((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
      setReferenceFiles((prev) => { prev.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
    }
    prevInputModeRef.current = currentInputMode;
  }, [currentInputMode]);

  // Sync uploaded images into capParams as image_data_urls (data URL format)
  // so they get sent to the backend via param_json
  useEffect(() => {
    const filesToConvert: File[] = [];
    if (currentInputMode === "first_frame" && firstFrameFile) {
      filesToConvert.push(firstFrameFile.file);
    } else if (currentInputMode === "first_last_frame") {
      if (firstFrameFile) filesToConvert.push(firstFrameFile.file);
      if (lastFrameFile) filesToConvert.push(lastFrameFile.file);
    } else if (currentInputMode === "reference_to_video" && referenceFiles.length > 0) {
      referenceFiles.forEach((rf) => filesToConvert.push(rf.file));
    }

    if (filesToConvert.length === 0) {
      // Clear image_data_urls from params when no images
      setCapParams((prev) => {
        if (!prev.image_data_urls) return prev;
        const next = { ...prev };
        delete next.image_data_urls;
        onParamsChange(next);
        return next;
      });
      return;
    }

    // Convert all files to data URLs
    let cancelled = false;
    Promise.all(
      filesToConvert.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          }),
      ),
    ).then((dataUrls) => {
      if (cancelled) return;
      setCapParams((prev) => {
        const next = { ...prev, image_data_urls: dataUrls };
        onParamsChange(next);
        return next;
      });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstFrameFile, lastFrameFile, referenceFiles, currentInputMode]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (firstFrameFile) URL.revokeObjectURL(firstFrameFile.url);
      if (lastFrameFile) URL.revokeObjectURL(lastFrameFile.url);
      referenceFiles.forEach((f) => URL.revokeObjectURL(f.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSingleUpload = (
    setter: React.Dispatch<React.SetStateAction<{ file: File; url: string } | null>>,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setter((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
    e.target.value = "";
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const maxImages = caps?.max_reference_images ?? 10;
    setReferenceFiles((prev) => {
      const remaining = maxImages - prev.length;
      if (remaining <= 0) return prev;
      const newFiles = Array.from(files).slice(0, remaining).map((f) => ({
        file: f,
        url: URL.createObjectURL(f),
      }));
      return [...prev, ...newFiles];
    });
    e.target.value = "";
  };

  const removeReferenceFile = (index: number) => {
    setReferenceFiles((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div className="space-y-4">
      {/* Model selector grouped by manufacturer */}
      <div className="space-y-2">
        <Label>模型</Label>
        <Select value={selectedModelCode} onValueChange={handleModelChange}>
          <SelectTrigger>
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {manufacturers.map((mfr) => (
              <SelectGroup key={mfr.code}>
                <SelectLabel>{mfr.name}</SelectLabel>
                {mfr.models.map((m) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label>提示词</Label>
        <textarea
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={category === "image" ? "描述你想要的画面..." : "描述你想要的视频场景..."}
        />
      </div>

      {/* Negative prompt - conditionally rendered */}
      {caps?.supports_negative_prompt !== false && (
        <div className="space-y-2">
          <Label>反向提示词 (可选)</Label>
          <Input
            value={negativePrompt}
            onChange={(e) => onNegativePromptChange(e.target.value)}
            placeholder="不希望出现的元素..."
          />
        </div>
      )}

      {/* Reference image upload - legacy (kept for backward compatibility) */}
      {caps?.supports_reference_image && onReferenceImageChange && !caps?.input_modes?.length && (
        <div className="space-y-2">
          <Label>参考图片</Label>
          {referenceImageUrl && (
            <div className="relative w-full h-32 rounded-md overflow-hidden border mb-2">
              <img src={referenceImageUrl} alt="参考图" className="object-cover w-full h-full" />
            </div>
          )}
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              onReferenceImageChange(file);
            }}
          />
        </div>
      )}

      {/* Dynamic capability params */}
      {caps && <CapabilityParams caps={caps} params={capParams} onChange={handleCapParamChange} onBatchChange={handleCapParamsBatch} category={category} />}

      {/* Dynamic reference image upload based on input_mode */}
      {currentInputMode === "first_frame" && (
        <div className="space-y-2" data-testid="upload-first-frame">
          <Label>首帧图片</Label>
          {firstFrameFile && (
            <div className="relative w-full h-32 rounded-md overflow-hidden border mb-2">
              <img src={firstFrameFile.url} alt="首帧图片" className="object-cover w-full h-full" />
              <button
                type="button"
                onClick={() => setFirstFrameFile((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; })}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/80"
              >
                ✕
              </button>
            </div>
          )}
          <Input type="file" accept="image/*" onChange={handleSingleUpload(setFirstFrameFile)} />
        </div>
      )}

      {currentInputMode === "first_last_frame" && (
        <div className="space-y-4">
          <div className="space-y-2" data-testid="upload-first-frame">
            <Label>首帧图片</Label>
            {firstFrameFile && (
              <div className="relative w-full h-32 rounded-md overflow-hidden border mb-2">
                <img src={firstFrameFile.url} alt="首帧图片" className="object-cover w-full h-full" />
                <button
                  type="button"
                  onClick={() => setFirstFrameFile((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; })}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/80"
                >
                  ✕
                </button>
              </div>
            )}
            <Input type="file" accept="image/*" onChange={handleSingleUpload(setFirstFrameFile)} />
          </div>
          <div className="space-y-2" data-testid="upload-last-frame">
            <Label>尾帧图片</Label>
            {lastFrameFile && (
              <div className="relative w-full h-32 rounded-md overflow-hidden border mb-2">
                <img src={lastFrameFile.url} alt="尾帧图片" className="object-cover w-full h-full" />
                <button
                  type="button"
                  onClick={() => setLastFrameFile((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; })}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/80"
                >
                  ✕
                </button>
              </div>
            )}
            <Input type="file" accept="image/*" onChange={handleSingleUpload(setLastFrameFile)} />
          </div>
        </div>
      )}

      {currentInputMode === "reference_to_video" && (
        <div className="space-y-2" data-testid="upload-reference-images">
          <Label>参考图片</Label>
          {caps?.max_reference_images && (
            <p className="text-xs text-muted-foreground">最多 {caps.max_reference_images} 张</p>
          )}
          {referenceFiles.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              {referenceFiles.map((rf, idx) => (
                <div key={idx} className="relative h-24 rounded-md overflow-hidden border">
                  <img src={rf.url} alt={`参考图片 ${idx + 1}`} className="object-cover w-full h-full" />
                  <button
                    type="button"
                    onClick={() => removeReferenceFile(idx)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black/80"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {referenceFiles.length < (caps?.max_reference_images ?? 10) && (
            <Input type="file" accept="image/*" multiple onChange={handleReferenceUpload} />
          )}
        </div>
      )}

      {/* text_to_video mode: no upload area rendered */}
    </div>
  );
}

/** Renders dynamic selectors based on model_capabilities */
export function CapabilityParams({
  caps,
  params,
  onChange,
  onBatchChange,
  category,
}: {
  caps: ModelCapabilities;
  params: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onBatchChange?: (updates: Record<string, any>) => void;
  category: "image" | "video";
}) {
  const tiers = (caps.resolution_tiers && !Array.isArray(caps.resolution_tiers)) ? (caps.resolution_tiers as Record<string, string[]>) : undefined;
  const hasTiers = !!tiers && Object.keys(tiers).length > 0;
  const hasFlatResolutions = !hasTiers && caps.resolutions && caps.resolutions.length > 0;

  // Tier keys for the first-level selector
  const tierKeys = hasTiers && tiers ? Object.keys(tiers) : [];
  const currentTier = params.resolution_tier || tierKeys[0] || "";
  const tierResolutions: string[] = hasTiers && tiers && currentTier ? (tiers[currentTier] ?? []) : [];

  const handleTierChange = (tier: string) => {
    if (!tiers) return;
    const resolutions = tiers[tier] ?? [];
    const firstRes = resolutions[0] || "";
    // Atomically update both tier and resolution to avoid stale state
    if (onBatchChange) {
      onBatchChange({ resolution_tier: tier, resolution: firstRes });
    } else {
      onChange("resolution_tier", tier);
      onChange("resolution", firstRes);
    }
  };

  return (
    <div className="border-t pt-4 mt-4 space-y-4">
      <h3 className="text-sm font-medium">生成参数</h3>

      {/* Tiered resolution: two-level cascading selector */}
      {hasTiers && (
        <div className="space-y-2">
          <Label>清晰度档位</Label>
          <Select value={currentTier} onValueChange={handleTierChange}>
            <SelectTrigger>
              <SelectValue placeholder="选择档位" />
            </SelectTrigger>
            <SelectContent>
              {tierKeys.map((tier) => (
                <SelectItem key={tier} value={tier}>{tier}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {tierResolutions.length > 0 && (
            <div className="space-y-2">
              <Label>分辨率</Label>
              <Select value={params.resolution || ""} onValueChange={(v) => onChange("resolution", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择分辨率" />
                </SelectTrigger>
                <SelectContent>
                  {tierResolutions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Flat resolution: single-level dropdown */}
      {hasFlatResolutions && (
        <div className="space-y-2">
          <Label>分辨率</Label>
          <Select value={params.resolution || ""} onValueChange={(v) => onChange("resolution", v)}>
            <SelectTrigger>
              <SelectValue placeholder="选择分辨率" />
            </SelectTrigger>
            <SelectContent>
              {caps.resolutions!.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Aspect ratio */}
      {caps.aspect_ratios && caps.aspect_ratios.length > 0 && (
        <div className="space-y-2">
          <Label>宽高比</Label>
          <Select value={params.aspect_ratio || ""} onValueChange={(v) => onChange("aspect_ratio", v)}>
            <SelectTrigger>
              <SelectValue placeholder="选择宽高比" />
            </SelectTrigger>
            <SelectContent>
              {caps.aspect_ratios.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Duration: duration_options button group takes priority over duration_range slider */}
      {category === "video" && caps.duration_options && caps.duration_options.length > 0 ? (
        <div className="space-y-2">
          <Label>时长 (秒)</Label>
          <div className="flex items-center gap-2" data-testid="duration-options">
            {caps.duration_options.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange("duration", d)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  params.duration === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input hover:bg-accent"
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
      ) : category === "video" && caps.duration_range ? (
        <div className="space-y-2">
          <Label>时长 (秒)</Label>
          <div className="flex items-center gap-4" data-testid="duration-range">
            <input
              type="range"
              min={caps.duration_range.min}
              max={caps.duration_range.max}
              step={1}
              value={params.duration ?? caps.duration_range.min}
              onChange={(e) => onChange("duration", Number(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm w-12 text-right">{params.duration ?? caps.duration_range.min}s</span>
          </div>
        </div>
      ) : null}

      {/* Input mode (video only) */}
      {category === "video" && caps.input_modes && caps.input_modes.length > 0 && (
        <div className="space-y-2">
          <Label>输入模式</Label>
          <Select value={params.input_mode || ""} onValueChange={(v) => onChange("input_mode", v)}>
            <SelectTrigger>
              <SelectValue placeholder="选择输入模式" />
            </SelectTrigger>
            <SelectContent>
              {caps.input_modes.map((m) => (
                <SelectItem key={m} value={m}>{INPUT_MODE_LABELS[m] || m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Prompt extend toggle */}
      {caps.supports_prompt_extend === true && (
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt-extend-switch">提示词扩展</Label>
          <button
            id="prompt-extend-switch"
            type="button"
            role="switch"
            aria-checked={!!params.prompt_extend}
            data-testid="prompt-extend-switch"
            onClick={() => onChange("prompt_extend", !params.prompt_extend)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              params.prompt_extend ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                params.prompt_extend ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {/* Watermark toggle */}
      {caps.supports_watermark === true && (
        <div className="flex items-center justify-between">
          <Label htmlFor="watermark-switch">添加水印</Label>
          <button
            id="watermark-switch"
            type="button"
            role="switch"
            aria-checked={!!params.watermark}
            data-testid="watermark-switch"
            onClick={() => onChange("watermark", !params.watermark)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              params.watermark ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                params.watermark ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {/* Seed number input */}
      {caps.supports_seed === true && (
        <div className="space-y-2">
          <Label htmlFor="seed-input">种子值</Label>
          <Input
            id="seed-input"
            type="number"
            data-testid="seed-input"
            value={params.seed ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onChange("seed", val === "" ? undefined : Number(val));
            }}
            placeholder="留空则随机"
          />
        </div>
      )}

      {/* Batch count input: only when max_output_images > 1 */}
      {caps.max_output_images != null && caps.max_output_images > 1 && (
        <div className="space-y-2">
          <Label htmlFor="batch-count-input">生成数量</Label>
          <Input
            id="batch-count-input"
            type="number"
            data-testid="batch-count-input"
            min={1}
            max={caps.max_output_images}
            value={params.batch_count ?? 1}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const clamped = Math.max(1, Math.min(caps.max_output_images!, Math.round(raw)));
              onChange("batch_count", clamped);
            }}
          />
        </div>
      )}

      {/* Special features badges */}
      {caps.special_features && caps.special_features.length > 0 && (
        <div className="space-y-2" data-testid="special-features">
          <Label>特殊功能</Label>
          <div className="flex flex-wrap gap-2">
            {caps.special_features.map((feature) => (
              <Badge key={feature} variant="secondary">{feature}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const INPUT_MODE_LABELS: Record<string, string> = {
  text_to_video: "文生视频",
  first_frame: "首帧生视频",
  first_last_frame: "首尾帧生视频",
  reference_to_video: "参考生视频",
};
