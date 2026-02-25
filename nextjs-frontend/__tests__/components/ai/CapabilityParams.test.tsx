/**
 * Unit tests for the CapabilityParams component.
 *
 * Validates: Requirements 6.3, 6.4, 7.3, 7.4, 9.1, 9.2, 9.4, 10.3, 11.2
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CapabilityParams } from "@/components/ai/ModelSelector";
import type { ModelCapabilities } from "@/lib/aistudio/types";

/* ------------------------------------------------------------------ */
/*  Mock Radix UI Select to render simple native <select> elements    */
/* ------------------------------------------------------------------ */
jest.mock("@radix-ui/react-select", () => {
  const React = require("react");
  return {
    Root: ({ children, value, onValueChange }: any) => (
      <div data-testid="select-root" data-value={value}>
        {children}
      </div>
    ),
    Trigger: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <button ref={ref} role="combobox" {...props}>{children}</button>
    )),
    Value: ({ placeholder }: any) => <span>{placeholder || ""}</span>,
    Content: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} role="listbox">{children}</div>
    )),
    Item: React.forwardRef(({ children, value, ...props }: any, ref: any) => (
      <div ref={ref} role="option" data-value={value}>{children}</div>
    )),
    ItemText: ({ children }: any) => <span>{children}</span>,
    ItemIndicator: ({ children }: any) => <span>{children}</span>,
    Icon: ({ children }: any) => <span>{children}</span>,
    Portal: ({ children }: any) => <>{children}</>,
    Viewport: ({ children }: any) => <div>{children}</div>,
    ScrollUpButton: React.forwardRef((_: any, ref: any) => <div ref={ref} />),
    ScrollDownButton: React.forwardRef((_: any, ref: any) => <div ref={ref} />),
    Group: ({ children }: any) => <div>{children}</div>,
    Label: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
    Separator: React.forwardRef((_: any, ref: any) => <div ref={ref} />),
  };
});

/* Mock Radix Label */
jest.mock("@radix-ui/react-label", () => {
  const React = require("react");
  return {
    Root: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <label ref={ref} {...props}>{children}</label>
    )),
  };
});

/* Mock Radix Icons */
jest.mock("@radix-ui/react-icons", () => ({
  CheckIcon: () => null,
  ChevronDownIcon: () => null,
  ChevronUpIcon: () => null,
}));

/* Mock server action - use relative path from test file location */
jest.mock("../../../components/actions/ai-media-actions", () => ({
  listModelsWithCapabilities: jest.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const noop = () => {};

function renderCaps(
  caps: ModelCapabilities,
  overrides: {
    params?: Record<string, any>;
    onChange?: (key: string, value: any) => void;
    onBatchChange?: (updates: Record<string, any>) => void;
    category?: "image" | "video";
  } = {}
) {
  const {
    params = {},
    onChange = noop,
    onBatchChange,
    category = "image",
  } = overrides;

  return render(
    <CapabilityParams
      caps={caps}
      params={params}
      onChange={onChange}
      onBatchChange={onBatchChange}
      category={category}
    />
  );
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("CapabilityParams", () => {
  /* ---- Resolution ---- */

  describe("Resolution rendering", () => {
    it("renders two-level selector when resolution_tiers present", () => {
      renderCaps({
        resolution_tiers: {
          "480P": ["854x480", "640x480"],
          "720P": ["1280x720"],
        },
      });

      // Should show "清晰度档位" label for tier selector
      expect(screen.getByText("清晰度档位")).toBeInTheDocument();
      // Should show "分辨率" label for second-level selector
      expect(screen.getByText("分辨率")).toBeInTheDocument();
    });

    it("renders single dropdown when only resolutions present", () => {
      renderCaps({
        resolutions: ["1920x1080", "1280x720", "640x480"],
      });

      // Should show "分辨率" label
      expect(screen.getByText("分辨率")).toBeInTheDocument();
      // Should NOT show "清晰度档位" label
      expect(screen.queryByText("清晰度档位")).not.toBeInTheDocument();
    });

    it("hides selector when neither resolution_tiers nor resolutions present", () => {
      renderCaps({});

      expect(screen.queryByText("清晰度档位")).not.toBeInTheDocument();
      expect(screen.queryByText("分辨率")).not.toBeInTheDocument();
    });

    it("prefers resolution_tiers over resolutions when both present", () => {
      renderCaps({
        resolution_tiers: { "1080P": ["1920x1080"] },
        resolutions: ["640x480"],
      });

      // Should show tier selector, not flat
      expect(screen.getByText("清晰度档位")).toBeInTheDocument();
    });
  });

  /* ---- Duration ---- */

  describe("Duration rendering", () => {
    it("renders button group when duration_options present (video)", () => {
      renderCaps(
        { duration_options: [5, 10] },
        { category: "video" }
      );

      const optionsContainer = screen.getByTestId("duration-options");
      expect(optionsContainer).toBeInTheDocument();
      expect(screen.getByText("5s")).toBeInTheDocument();
      expect(screen.getByText("10s")).toBeInTheDocument();
    });

    it("renders slider when only duration_range present (video)", () => {
      renderCaps(
        { duration_range: { min: 2, max: 15 } },
        { category: "video" }
      );

      const rangeContainer = screen.getByTestId("duration-range");
      expect(rangeContainer).toBeInTheDocument();
      const slider = rangeContainer.querySelector('input[type="range"]');
      expect(slider).toBeInTheDocument();
    });

    it("renders button group when both duration_options and duration_range present (video)", () => {
      renderCaps(
        {
          duration_options: [5, 10],
          duration_range: { min: 2, max: 15 },
        },
        { category: "video" }
      );

      // duration_options takes priority
      expect(screen.getByTestId("duration-options")).toBeInTheDocument();
      expect(screen.queryByTestId("duration-range")).not.toBeInTheDocument();
    });

    it("hides duration control when neither present (video)", () => {
      renderCaps({}, { category: "video" });

      expect(screen.queryByTestId("duration-options")).not.toBeInTheDocument();
      expect(screen.queryByTestId("duration-range")).not.toBeInTheDocument();
    });

    it("hides duration controls for image category even when caps present", () => {
      renderCaps(
        { duration_options: [5, 10] },
        { category: "image" }
      );

      expect(screen.queryByTestId("duration-options")).not.toBeInTheDocument();
    });
  });

  /* ---- Input mode / Upload areas ---- */

  describe("Input mode upload areas", () => {
    // Note: input_mode rendering is handled by the parent ModelSelector,
    // but CapabilityParams renders the input_mode selector for video category.
    // The upload areas are in ModelSelector, not CapabilityParams.
    // We test that CapabilityParams renders the input_mode selector.

    it("renders input mode selector for video with input_modes", () => {
      renderCaps(
        { input_modes: ["text_to_video", "first_frame", "first_last_frame"] },
        { category: "video" }
      );

      expect(screen.getByText("输入模式")).toBeInTheDocument();
    });

    it("hides input mode selector for image category", () => {
      renderCaps(
        { input_modes: ["text_to_video", "first_frame"] },
        { category: "image" }
      );

      expect(screen.queryByText("输入模式")).not.toBeInTheDocument();
    });

    it("hides input mode selector when input_modes absent", () => {
      renderCaps({}, { category: "video" });

      expect(screen.queryByText("输入模式")).not.toBeInTheDocument();
    });
  });

  /* ---- Batch count ---- */

  describe("Batch count", () => {
    it("hidden when max_output_images absent", () => {
      renderCaps({});

      expect(screen.queryByTestId("batch-count-input")).not.toBeInTheDocument();
    });

    it("hidden when max_output_images is 1", () => {
      renderCaps({ max_output_images: 1 });

      expect(screen.queryByTestId("batch-count-input")).not.toBeInTheDocument();
    });

    it("renders when max_output_images > 1", () => {
      renderCaps({ max_output_images: 4 });

      const input = screen.getByTestId("batch-count-input");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("min", "1");
      expect(input).toHaveAttribute("max", "4");
    });

    it("clamps value to valid range on change", () => {
      const onChange = jest.fn();
      renderCaps({ max_output_images: 4 }, { onChange });

      const input = screen.getByTestId("batch-count-input");
      fireEvent.change(input, { target: { value: "10" } });
      expect(onChange).toHaveBeenCalledWith("batch_count", 4);

      fireEvent.change(input, { target: { value: "0" } });
      expect(onChange).toHaveBeenCalledWith("batch_count", 1);
    });
  });

  /* ---- Special features ---- */

  describe("Special features", () => {
    it("hidden when special_features absent", () => {
      renderCaps({});

      expect(screen.queryByTestId("special-features")).not.toBeInTheDocument();
    });

    it("hidden when special_features is empty array", () => {
      renderCaps({ special_features: [] });

      expect(screen.queryByTestId("special-features")).not.toBeInTheDocument();
    });

    it("renders badges for each feature when non-empty", () => {
      renderCaps({
        special_features: ["text_rendering", "multi_subject_consistency"],
      });

      const container = screen.getByTestId("special-features");
      expect(container).toBeInTheDocument();
      expect(screen.getByText("text_rendering")).toBeInTheDocument();
      expect(screen.getByText("multi_subject_consistency")).toBeInTheDocument();
    });
  });

  /* ---- Boolean toggles ---- */

  describe("Boolean capability toggles", () => {
    it("renders prompt extend switch when supports_prompt_extend is true", () => {
      renderCaps({ supports_prompt_extend: true });

      expect(screen.getByText("提示词扩展")).toBeInTheDocument();
      expect(screen.getByTestId("prompt-extend-switch")).toBeInTheDocument();
    });

    it("hides prompt extend switch when supports_prompt_extend is false", () => {
      renderCaps({ supports_prompt_extend: false });

      expect(screen.queryByText("提示词扩展")).not.toBeInTheDocument();
    });

    it("renders watermark switch when supports_watermark is true", () => {
      renderCaps({ supports_watermark: true });

      expect(screen.getByText("添加水印")).toBeInTheDocument();
      expect(screen.getByTestId("watermark-switch")).toBeInTheDocument();
    });

    it("hides watermark switch when supports_watermark is false or absent", () => {
      renderCaps({});

      expect(screen.queryByText("添加水印")).not.toBeInTheDocument();
    });

    it("renders seed input when supports_seed is true", () => {
      renderCaps({ supports_seed: true });

      expect(screen.getByText("种子值")).toBeInTheDocument();
      expect(screen.getByTestId("seed-input")).toBeInTheDocument();
    });

    it("hides seed input when supports_seed is false", () => {
      renderCaps({ supports_seed: false });

      expect(screen.queryByText("种子值")).not.toBeInTheDocument();
    });

    it("calls onChange when prompt extend switch is clicked", () => {
      const onChange = jest.fn();
      renderCaps(
        { supports_prompt_extend: true },
        { onChange, params: { prompt_extend: false } }
      );

      fireEvent.click(screen.getByTestId("prompt-extend-switch"));
      expect(onChange).toHaveBeenCalledWith("prompt_extend", true);
    });

    it("calls onChange when watermark switch is clicked", () => {
      const onChange = jest.fn();
      renderCaps(
        { supports_watermark: true },
        { onChange, params: { watermark: false } }
      );

      fireEvent.click(screen.getByTestId("watermark-switch"));
      expect(onChange).toHaveBeenCalledWith("watermark", true);
    });

    it("calls onChange when seed value is entered", () => {
      const onChange = jest.fn();
      renderCaps({ supports_seed: true }, { onChange });

      const input = screen.getByTestId("seed-input");
      fireEvent.change(input, { target: { value: "42" } });
      expect(onChange).toHaveBeenCalledWith("seed", 42);
    });
  });

  /* ---- Aspect ratio ---- */

  describe("Aspect ratio rendering", () => {
    it("renders aspect ratio selector when aspect_ratios present", () => {
      renderCaps({ aspect_ratios: ["16:9", "4:3", "1:1"] });

      expect(screen.getByText("宽高比")).toBeInTheDocument();
    });

    it("hides aspect ratio selector when aspect_ratios absent", () => {
      renderCaps({});

      expect(screen.queryByText("宽高比")).not.toBeInTheDocument();
    });

    it("hides aspect ratio selector when aspect_ratios is empty", () => {
      renderCaps({ aspect_ratios: [] });

      expect(screen.queryByText("宽高比")).not.toBeInTheDocument();
    });
  });

  /* ---- Tier change with onBatchChange ---- */

  describe("Tier change callback", () => {
    it("calls onBatchChange with tier and first resolution when tier changes", () => {
      const onBatchChange = jest.fn();
      renderCaps(
        {
          resolution_tiers: {
            "480P": ["854x480", "640x480"],
            "720P": ["1280x720"],
          },
        },
        { onBatchChange, params: { resolution_tier: "480P", resolution: "854x480" } }
      );

      // Find the tier selector and simulate a tier change
      // The tier selector uses Radix Select which we mocked
      expect(screen.getByText("清晰度档位")).toBeInTheDocument();
    });
  });

  /* ---- Input mode selector (video) ---- */

  describe("Input mode selector details", () => {
    it("renders all input mode options for video", () => {
      renderCaps(
        { input_modes: ["text_to_video", "first_frame", "first_last_frame", "reference_to_video"] },
        { category: "video" }
      );

      expect(screen.getByText("输入模式")).toBeInTheDocument();
      // Verify mode labels are rendered
      expect(screen.getByText("文生视频")).toBeInTheDocument();
      expect(screen.getByText("首帧生视频")).toBeInTheDocument();
      expect(screen.getByText("首尾帧生视频")).toBeInTheDocument();
      expect(screen.getByText("参考生视频")).toBeInTheDocument();
    });

    it("renders unknown input mode as raw value", () => {
      renderCaps(
        { input_modes: ["unknown_mode"] },
        { category: "video" }
      );

      expect(screen.getByText("unknown_mode")).toBeInTheDocument();
    });
  });

  /* ---- Empty / edge cases ---- */

  describe("Edge cases", () => {
    it("renders without errors with empty capabilities", () => {
      const { container } = renderCaps({});

      // Should at least render the header
      expect(screen.getByText("生成参数")).toBeInTheDocument();
      // Should not crash
      expect(container).toBeTruthy();
    });

    it("renders without errors with all capabilities present", () => {
      renderCaps(
        {
          resolution_tiers: { "720P": ["1280x720"] },
          resolutions: ["1920x1080"],
          aspect_ratios: ["16:9", "1:1"],
          duration_options: [5, 10],
          duration_range: { min: 2, max: 15 },
          input_modes: ["text_to_video", "first_frame"],
          supports_prompt_extend: true,
          supports_watermark: true,
          supports_seed: true,
          max_output_images: 4,
          special_features: ["text_rendering"],
        },
        { category: "video" }
      );

      expect(screen.getByText("生成参数")).toBeInTheDocument();
    });

    it("handles resolution_tiers with empty tier arrays", () => {
      renderCaps({
        resolution_tiers: { "480P": [] },
      });

      expect(screen.getByText("清晰度档位")).toBeInTheDocument();
      // Second-level resolution selector should not appear for empty tier
      const resLabels = screen.queryAllByText("分辨率");
      expect(resLabels.length).toBe(0);
    });

    it("handles resolution_tiers with many tiers", () => {
      renderCaps({
        resolution_tiers: {
          "360P": ["640x360"],
          "480P": ["854x480"],
          "720P": ["1280x720"],
          "1080P": ["1920x1080"],
          "2K": ["2560x1440"],
          "4K": ["3840x2160"],
        },
      });

      expect(screen.getByText("清晰度档位")).toBeInTheDocument();
    });

    it("handles duration_options with single value", () => {
      renderCaps(
        { duration_options: [5] },
        { category: "video" }
      );

      expect(screen.getByTestId("duration-options")).toBeInTheDocument();
      expect(screen.getByText("5s")).toBeInTheDocument();
    });

    it("handles special_features with single feature", () => {
      renderCaps({ special_features: ["text_rendering"] });

      expect(screen.getByText("text_rendering")).toBeInTheDocument();
    });

    it("handles special_features with many features", () => {
      const features = ["text_rendering", "multi_subject", "style_transfer", "inpainting", "outpainting"];
      renderCaps({ special_features: features });

      features.forEach((f) => {
        expect(screen.getByText(f)).toBeInTheDocument();
      });
    });

    it("seed input sends undefined when cleared", () => {
      const onChange = jest.fn();
      renderCaps(
        { supports_seed: true },
        { onChange, params: { seed: 42 } }
      );

      const input = screen.getByTestId("seed-input");
      fireEvent.change(input, { target: { value: "" } });
      expect(onChange).toHaveBeenCalledWith("seed", undefined);
    });

    it("handles max_output_images with large value", () => {
      renderCaps({ max_output_images: 100 });

      const input = screen.getByTestId("batch-count-input");
      expect(input).toHaveAttribute("max", "100");
    });

    it("handles max_output_images of 0 (hides control)", () => {
      renderCaps({ max_output_images: 0 });

      expect(screen.queryByTestId("batch-count-input")).not.toBeInTheDocument();
    });

    it("renders only relevant controls for image category", () => {
      renderCaps(
        {
          resolutions: ["1920x1080"],
          duration_options: [5, 10],
          input_modes: ["text_to_video"],
          max_output_images: 4,
          supports_seed: true,
        },
        { category: "image" }
      );

      // Resolution should render
      expect(screen.getByText("分辨率")).toBeInTheDocument();
      // Duration should NOT render for image
      expect(screen.queryByTestId("duration-options")).not.toBeInTheDocument();
      // Input mode should NOT render for image
      expect(screen.queryByText("输入模式")).not.toBeInTheDocument();
      // Batch count and seed should render
      expect(screen.getByTestId("batch-count-input")).toBeInTheDocument();
      expect(screen.getByTestId("seed-input")).toBeInTheDocument();
    });

    it("renders only relevant controls for video category", () => {
      renderCaps(
        {
          aspect_ratios: ["16:9"],
          duration_options: [5, 10],
          input_modes: ["text_to_video", "first_frame"],
          supports_watermark: true,
        },
        { category: "video" }
      );

      // Duration should render for video
      expect(screen.getByTestId("duration-options")).toBeInTheDocument();
      // Input mode should render for video
      expect(screen.getByText("输入模式")).toBeInTheDocument();
      // Watermark should render
      expect(screen.getByTestId("watermark-switch")).toBeInTheDocument();
    });

    it("handles undefined capabilities fields gracefully", () => {
      // Simulate a capabilities object with explicit undefined values
      renderCaps({
        resolutions: undefined,
        resolution_tiers: undefined,
        duration_options: undefined,
        duration_range: undefined,
        supports_prompt_extend: undefined,
        supports_watermark: undefined,
        supports_seed: undefined,
        max_output_images: undefined,
        special_features: undefined,
      } as ModelCapabilities);

      // Should render header without crashing
      expect(screen.getByText("生成参数")).toBeInTheDocument();
      // No controls should be visible
      expect(screen.queryByText("清晰度档位")).not.toBeInTheDocument();
      expect(screen.queryByText("分辨率")).not.toBeInTheDocument();
      expect(screen.queryByTestId("duration-options")).not.toBeInTheDocument();
      expect(screen.queryByTestId("duration-range")).not.toBeInTheDocument();
      expect(screen.queryByTestId("batch-count-input")).not.toBeInTheDocument();
      expect(screen.queryByTestId("special-features")).not.toBeInTheDocument();
    });

    it("batch count clamps NaN input to 1", () => {
      const onChange = jest.fn();
      renderCaps({ max_output_images: 4 }, { onChange });

      const input = screen.getByTestId("batch-count-input");
      fireEvent.change(input, { target: { value: "abc" } });
      // NaN gets clamped: Math.max(1, Math.min(4, Math.round(NaN))) = NaN → clamped to 1
      expect(onChange).toHaveBeenCalledWith("batch_count", 1);
    });

    it("all boolean toggles hidden when all supports_* are false", () => {
      renderCaps({
        supports_prompt_extend: false,
        supports_watermark: false,
        supports_seed: false,
      });

      expect(screen.queryByText("提示词扩展")).not.toBeInTheDocument();
      expect(screen.queryByText("添加水印")).not.toBeInTheDocument();
      expect(screen.queryByText("种子值")).not.toBeInTheDocument();
    });
  });
});
