"use client";

import type { ModelCapabilities } from "@/lib/aistudio/types";

const INPUT_MODE_LABELS: Record<string, string> = {
  text_to_video: "文生视频",
  first_frame: "首帧生视频",
  first_last_frame: "首尾帧生视频",
  reference_to_video: "参考生视频",
  multi_frame: "智能多帧",
};

export function CapabilityParams({
  caps,
  params,
  onChange,
  onBatchChange,
  category = "image",
}: {
  caps: ModelCapabilities;
  params: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onBatchChange?: (updates: Record<string, any>) => void;
  category?: "image" | "video";
}) {
  const isArrayTiers = Array.isArray(caps.resolution_tiers) && caps.resolution_tiers.length > 0;
  const hasTiers =
    !isArrayTiers &&
    caps.resolution_tiers &&
    typeof caps.resolution_tiers === "object" &&
    !Array.isArray(caps.resolution_tiers) &&
    Object.keys(caps.resolution_tiers).length > 0;
  const hasFlatResolutions = !hasTiers && !isArrayTiers && caps.resolutions && caps.resolutions.length > 0;
  const tierKeys = hasTiers ? Object.keys(caps.resolution_tiers!) : [];
  const currentTier = params.resolution_tier || tierKeys[0] || "";
  const tierResolutions =
    hasTiers && currentTier ? ((caps.resolution_tiers as Record<string, string[]>)[currentTier] ?? []) : [];

  return (
    <div className="space-y-3 text-xs">
      {/* 简单分辨率档位（如 ["1K", "2K", "4K"]，直接作为 size 参数） */}
      {isArrayTiers && (
        <div>
          <div className="text-textMuted font-medium mb-1">清晰度</div>
          <div className="flex gap-1 flex-wrap">
            {(caps.resolution_tiers as string[]).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => onChange("size", tier)}
                className={`px-2.5 py-1 rounded-md border transition-colors ${
                  params.size === tier
                    ? "bg-primary/20 border-primary/40 text-primary font-bold"
                    : "border-border bg-background/40 text-textMain hover:bg-surfaceHighlight"
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 分辨率档位（对象形式，含子分辨率列表） */}
      {hasTiers && (
        <>
          <div>
            <div className="text-textMuted font-medium mb-1">清晰度</div>
            <div className="flex gap-1 flex-wrap">
              {tierKeys.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => {
                    const resolutions = (caps.resolution_tiers as Record<string, string[]>)[tier] ?? [];
                    const firstRes = resolutions[0] || "";
                    if (onBatchChange) onBatchChange({ resolution_tier: tier, resolution: firstRes });
                    else {
                      onChange("resolution_tier", tier);
                      onChange("resolution", firstRes);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md border transition-colors ${
                    currentTier === tier
                      ? "bg-primary/20 border-primary/40 text-primary font-bold"
                      : "border-border bg-background/40 text-textMain hover:bg-surfaceHighlight"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
          {tierResolutions.length > 0 && (
            <div>
              <div className="text-textMuted font-medium mb-1">分辨率</div>
              <select
                value={params.resolution || ""}
                onChange={(e) => onChange("resolution", e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-textMain outline-none focus:border-primary"
              >
                {tierResolutions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {/* 平铺分辨率 */}
      {hasFlatResolutions && (
        <div>
          <div className="text-textMuted font-medium mb-1">分辨率</div>
          <select
            value={params.resolution || ""}
            onChange={(e) => onChange("resolution", e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-textMain outline-none focus:border-primary"
          >
            {caps.resolutions!.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      )}

      {/* 宽高比 */}
      {caps.aspect_ratios && caps.aspect_ratios.length > 0 && (
        <div>
          <div className="text-textMuted font-medium mb-1">宽高比</div>
          <div className="flex gap-1 flex-wrap">
            {caps.aspect_ratios.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChange("aspect_ratio", r)}
                className={`px-2 py-1 rounded-md border transition-colors ${
                  params.aspect_ratio === r
                    ? "bg-primary/20 border-primary/40 text-primary font-bold"
                    : "border-border bg-background/40 text-textMain hover:bg-surfaceHighlight"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 时长 */}
      {category === "video" && caps.duration_options && caps.duration_options.length > 0 && (
        <div>
          <div className="text-textMuted font-medium mb-1">时长</div>
          <div className="flex gap-1 flex-wrap">
            {caps.duration_options.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange("duration", d)}
                className={`px-2.5 py-1 rounded-md border transition-colors ${
                  params.duration === d
                    ? "bg-primary/20 border-primary/40 text-primary font-bold"
                    : "border-border bg-background/40 text-textMain hover:bg-surfaceHighlight"
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
      )}
      {category === "video" && !caps.duration_options?.length && caps.duration_range && (
        <div>
          <div className="text-textMuted font-medium mb-1">
            时长 ({params.duration ?? caps.duration_range.min}s)
          </div>
          <input
            type="range"
            min={caps.duration_range.min}
            max={caps.duration_range.max}
            step={1}
            value={params.duration ?? caps.duration_range.min}
            onChange={(e) => onChange("duration", Number(e.target.value))}
            className="w-full h-1.5 bg-surfaceHighlight rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}

      {/* 输入模式 */}
      {category === "video" && caps.input_modes && caps.input_modes.length > 0 && (
        <div>
          <div className="text-textMuted font-medium mb-1">输入模式</div>
          <select
            value={params.input_mode || ""}
            onChange={(e) => onChange("input_mode", e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-textMain outline-none focus:border-primary"
          >
            {caps.input_modes.map((m) => (
              <option key={m} value={m}>{INPUT_MODE_LABELS[m] || m}</option>
            ))}
          </select>
        </div>
      )}

      {/* 开关类参数 */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {caps.supports_prompt_extend === true && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!params.prompt_extend}
              onChange={() => onChange("prompt_extend", !params.prompt_extend)}
              className="rounded border-border w-3.5 h-3.5"
            />
            <span className="text-textMain">提示词扩展</span>
          </label>
        )}
        {caps.supports_watermark === true && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!params.watermark}
              onChange={() => onChange("watermark", !params.watermark)}
              className="rounded border-border w-3.5 h-3.5"
            />
            <span className="text-textMain">水印</span>
          </label>
        )}
        {caps.supports_off_peak === true && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!params.off_peak}
              onChange={() => onChange("off_peak", !params.off_peak)}
              className="rounded border-border w-3.5 h-3.5"
            />
            <span className="text-textMain">错峰模式</span>
          </label>
        )}
      </div>

      {/* Seed */}
      {caps.supports_seed === true && (
        <div>
          <div className="text-textMuted font-medium mb-1">Seed</div>
          <input
            type="number"
            value={params.seed ?? ""}
            onChange={(e) =>
              onChange("seed", e.target.value === "" ? undefined : Number(e.target.value))
            }
            placeholder="随机"
            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-textMain outline-none focus:border-primary font-mono"
          />
        </div>
      )}

      {/* Guidance Scale */}
      {caps.supports_guidance_scale === true && caps.guidance_scale_range && (
        <div>
          <div className="text-textMuted font-medium mb-1">
            引导强度 ({params.guidance_scale ?? caps.guidance_scale_range.default ?? caps.guidance_scale_range.min})
          </div>
          <input
            type="range"
            min={caps.guidance_scale_range.min}
            max={caps.guidance_scale_range.max}
            step={0.5}
            value={params.guidance_scale ?? caps.guidance_scale_range.default ?? caps.guidance_scale_range.min}
            onChange={(e) => onChange("guidance_scale", Number(e.target.value))}
            className="w-full h-1.5 bg-surfaceHighlight rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}

      {/* 生成数量 */}
      {caps.max_output_images != null && caps.max_output_images > 1 && (
        <div>
          <div className="text-textMuted font-medium mb-1">
            数量 (最多 {caps.max_output_images})
          </div>
          <input
            type="number"
            min={1}
            max={caps.max_output_images}
            value={params.batch_count ?? 1}
            onChange={(e) => {
              const raw = Number(e.target.value);
              onChange(
                "batch_count",
                Math.max(1, Math.min(caps.max_output_images!, Math.round(raw))),
              );
            }}
            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-textMain outline-none focus:border-primary font-mono"
          />
        </div>
      )}
    </div>
  );
}
