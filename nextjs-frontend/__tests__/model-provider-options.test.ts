import {
  getDefaultProvider,
  getProviderLabel,
  getProviderOptions,
  getProviderOptionsWithCurrent,
} from "@/lib/settings/model-provider-options";

describe("model provider options", () => {
  test("returns twelveai as default provider for 12ai models", () => {
    expect(getDefaultProvider("12ai", "image")).toBe("twelveai_media");
    expect(getDefaultProvider("12ai", "video")).toBe("twelveai_media");
  });

  test("includes custom provider in options when editing existing config", () => {
    expect(getProviderOptionsWithCurrent("image", "custom_provider")).toContain("custom_provider");
  });

  test("keeps provider option lists category-specific", () => {
    expect(getProviderOptions("text")).toEqual(["openai", "gemini", "other"]);
    expect(getProviderOptions("video")).toEqual(["twelveai_media", "vidu", "volcengine_video", "other"]);
  });

  test("formats known and unknown provider labels", () => {
    expect(getProviderLabel("twelveai_media")).toContain("12AI Media");
    expect(getProviderLabel("custom_provider")).toBe("custom_provider");
  });
});
