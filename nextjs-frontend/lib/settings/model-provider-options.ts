import type { AICategory } from "@/components/actions/ai-model-actions";

export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI Compatible",
  other: "Custom / Other",
  gemini: "Google Gemini",
  vidu: "Vidu Video",
  volcengine_video: "Volcengine Video",
  twelveai_media: "12AI Media (Nano Banana / Sora / Veo)",
};

export const MANUFACTURER_PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "openai",
  google: "gemini",
  gemini: "gemini",
  vidu: "vidu",
  volcengine_video: "volcengine_video",
  "12ai": "twelveai_media",
  twelveai: "twelveai_media",
};

export function getProviderOptions(category: AICategory): string[] {
  if (category === "text") return ["openai", "gemini", "other"];
  if (category === "image") return ["openai", "gemini", "twelveai_media", "other"];
  return ["twelveai_media", "vidu", "volcengine_video", "other"];
}

export function getDefaultProvider(manufacturer: string, category: AICategory): string {
  const normalizedManufacturer = (manufacturer || "").trim().toLowerCase();
  return MANUFACTURER_PROVIDER_DEFAULTS[normalizedManufacturer] || getProviderOptions(category)[0] || "other";
}

export function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] || provider;
}

export function getProviderOptionsWithCurrent(category: AICategory, currentProvider?: string | null): string[] {
  const options = getProviderOptions(category);
  const normalizedCurrent = (currentProvider || "").trim();
  if (!normalizedCurrent || options.includes(normalizedCurrent)) {
    return options;
  }
  return [...options, normalizedCurrent];
}
