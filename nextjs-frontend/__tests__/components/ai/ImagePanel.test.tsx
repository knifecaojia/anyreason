/**
 * Unit tests for the ImagePanel component (embedded in ModelTestPage).
 *
 * Since ImagePanel is a local function component inside page.tsx and not exported,
 * we test it through the ModelTestPage by switching to the "image" tab.
 *
 * Validates: Requirements 13.1, 13.2, 13.4
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock crypto.randomUUID
const mockUUID = "test-uuid-1234";
Object.defineProperty(globalThis, "crypto", {
  value: {
    ...globalThis.crypto,
    randomUUID: jest.fn(() => mockUUID),
  },
});

// Mock generateMedia server action
const mockGenerateMedia = jest.fn();
jest.mock("../../../components/actions/ai-media-actions", () => ({
  generateMedia: (...args: any[]) => mockGenerateMedia(...args),
  listModelsWithCapabilities: jest.fn().mockResolvedValue([]),
  listMediaModels: jest.fn().mockResolvedValue([]),
}));

// Mock ModelSelector to avoid complex dependency chain
jest.mock("../../../components/ai/ModelSelector", () => ({
  ModelSelector: ({ onModelSelect, onPromptChange, prompt }: any) => (
    <div data-testid="mock-model-selector">
      <button
        data-testid="select-model-btn"
        onClick={() =>
          onModelSelect("test-model", { resolutions: ["1024x1024"] })
        }
      >
        Select Model
      </button>
      <input
        data-testid="prompt-input"
        value={prompt || ""}
        onChange={(e: any) => onPromptChange(e.target.value)}
      />
    </div>
  ),
  CapabilityParams: () => <div data-testid="mock-capability-params" />,
}));

// Mock Radix UI Tabs (used by @/components/ui/tabs)
jest.mock("@radix-ui/react-tabs", () => {
  const R = require("react");
  return {
    Root: ({ children, value, onValueChange, ...props }: any) => {
      const ctx = R.useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
      return (
        <TabsCtx.Provider value={ctx}>
          <div data-testid="tabs-root" {...props}>{children}</div>
        </TabsCtx.Provider>
      );
    },
    List: R.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} role="tablist" {...props}>{children}</div>
    )),
    Trigger: R.forwardRef(({ children, value, ...props }: any, ref: any) => {
      const ctx = R.useContext(TabsCtx);
      return (
        <button
          ref={ref}
          role="tab"
          data-state={ctx?.value === value ? "active" : "inactive"}
          onClick={() => ctx?.onValueChange?.(value)}
          {...props}
        >
          {children}
        </button>
      );
    }),
    Content: R.forwardRef(({ children, value, ...props }: any, ref: any) => {
      const ctx = R.useContext(TabsCtx);
      if (ctx?.value !== value) return null;
      return <div ref={ref} role="tabpanel" {...props}>{children}</div>;
    }),
  };
});

// Create a context for the mock Tabs
const React2 = require("react");
const TabsCtx = React2.createContext(null) as React.Context<any>;

// Mock Radix Slot (used by Button)
jest.mock("@radix-ui/react-slot", () => {
  const R = require("react");
  return {
    Slot: R.forwardRef(({ children, ...props }: any, ref: any) => {
      if (R.isValidElement(children)) {
        return R.cloneElement(children, { ...props, ref });
      }
      return <span ref={ref} {...props}>{children}</span>;
    }),
  };
});

/* ------------------------------------------------------------------ */
/*  Import the component under test (after mocks)                      */
/* ------------------------------------------------------------------ */
import ModelTestPage from "@/app/(aistudio)/ai/model-test/page";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Switch to the image tab and set up model + prompt for generation */
async function setupImagePanel() {
  const result = render(<ModelTestPage />);

  // Switch to image tab
  const imageTab = screen.getByRole("tab", { name: /图片/i });
  fireEvent.click(imageTab);

  // Select a model
  const selectBtn = screen.getByTestId("select-model-btn");
  fireEvent.click(selectBtn);

  // Enter a prompt
  const promptInput = screen.getByTestId("prompt-input");
  fireEvent.change(promptInput, { target: { value: "test prompt" } });

  return result;
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("ImagePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ---- Empty state ---- */
  describe("Empty state", () => {
    it("shows empty placeholder when no results yet", () => {
      render(<ModelTestPage />);
      const imageTab = screen.getByRole("tab", { name: /图片/i });
      fireEvent.click(imageTab);

      expect(screen.getByTestId("image-empty")).toBeInTheDocument();
      expect(screen.getByText("图片预览区域")).toBeInTheDocument();
      expect(screen.getByText(/配置参数并点击生成/)).toBeInTheDocument();
    });
  });

  /* ---- Loading state (Requirement 13.1) ---- */
  describe("Loading state", () => {
    it("shows spinner and '生成中...' text during generation", async () => {
      mockGenerateMedia.mockReturnValue(new Promise(() => {}));

      await setupImagePanel();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      expect(screen.getByTestId("image-loading")).toBeInTheDocument();
      // The "生成中..." text appears both in the button and in the loading area
      const loadingTexts = screen.getAllByText("生成中...");
      expect(loadingTexts.length).toBeGreaterThanOrEqual(1);
    });

    it("disables generate button during loading", async () => {
      mockGenerateMedia.mockReturnValue(new Promise(() => {}));

      await setupImagePanel();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Find the button that now says "生成中..."
      const buttons = screen.getAllByRole("button");
      const genBtn = buttons.find((b) => b.textContent?.includes("生成中"));
      expect(genBtn).toBeDisabled();
    });
  });

  /* ---- Success state (Requirement 13.2) ---- */
  describe("Success state", () => {
    it("displays generated image and metadata on success", async () => {
      mockGenerateMedia.mockResolvedValue({
        url: "https://example.com/image.png",
        usage_id: "usage-abc-123",
        cost: 10,
      });

      await setupImagePanel();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId("image-result")).toBeInTheDocument();
      });

      // Image should be displayed
      const img = screen.getByAltText("Generated");
      expect(img).toHaveAttribute("src", "https://example.com/image.png");

      // Metadata should be shown
      expect(screen.getByTestId("image-meta")).toBeInTheDocument();
      expect(screen.getByText(/usage_id: usage-abc-123/)).toBeInTheDocument();
      expect(screen.getByText(/积分消耗: 10/)).toBeInTheDocument();
    });

    it("displays elapsed time in metadata", async () => {
      const originalNow = Date.now;
      let callCount = 0;
      jest.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? 1000 : 3500;
      });

      mockGenerateMedia.mockResolvedValue({
        url: "https://example.com/image.png",
        usage_id: "usage-123",
        cost: 5,
      });

      await setupImagePanel();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId("image-result")).toBeInTheDocument();
      });

      expect(screen.getByText(/耗时: 2\.5s/)).toBeInTheDocument();

      jest.spyOn(Date, "now").mockRestore();
    });
  });

  /* ---- Error state (Requirement 13.4) ---- */
  describe("Error state", () => {
    it("displays error code badge and error message on failure", async () => {
      mockGenerateMedia.mockRejectedValue(
        new Error("请求失败 502: Internal Server Error")
      );

      await setupImagePanel();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId("image-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/错误码: 502/)).toBeInTheDocument();
      expect(
        screen.getByText(/请求失败 502: Internal Server Error/)
      ).toBeInTheDocument();
    });

    it("shows UNKNOWN error code when no code in message", async () => {
      mockGenerateMedia.mockRejectedValue(new Error("网络连接失败"));

      await setupImagePanel();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId("image-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/错误码: UNKNOWN/)).toBeInTheDocument();
      expect(screen.getByText("网络连接失败")).toBeInTheDocument();
    });

    it("uses default error message when error has no message", async () => {
      mockGenerateMedia.mockRejectedValue(new Error());

      await setupImagePanel();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId("image-error")).toBeInTheDocument();
      });

      expect(screen.getByText("生成失败")).toBeInTheDocument();
    });
  });

  /* ---- State transitions ---- */
  describe("State transitions", () => {
    it("transitions from empty → loading → success", async () => {
      let resolveGenerate: (value: any) => void;
      mockGenerateMedia.mockReturnValue(
        new Promise((resolve) => {
          resolveGenerate = resolve;
        })
      );

      await setupImagePanel();

      // Initially empty
      expect(screen.getByTestId("image-empty")).toBeInTheDocument();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Should be loading
      expect(screen.getByTestId("image-loading")).toBeInTheDocument();
      expect(screen.queryByTestId("image-empty")).not.toBeInTheDocument();

      // Resolve with success
      await act(async () => {
        resolveGenerate!({
          url: "https://example.com/result.png",
          usage_id: "u-1",
          cost: 5,
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId("image-result")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("image-loading")).not.toBeInTheDocument();
    });

    it("transitions from empty → loading → error", async () => {
      let rejectGenerate: (reason: any) => void;
      mockGenerateMedia.mockReturnValue(
        new Promise((_, reject) => {
          rejectGenerate = reject;
        })
      );

      await setupImagePanel();

      expect(screen.getByTestId("image-empty")).toBeInTheDocument();

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      expect(screen.getByTestId("image-loading")).toBeInTheDocument();

      await act(async () => {
        rejectGenerate!(new Error("请求失败 500: Server Error"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("image-error")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("image-loading")).not.toBeInTheDocument();
    });
  });

  /* ---- Generate button disabled states ---- */
  describe("Generate button", () => {
    it("is disabled when no model is selected", () => {
      render(<ModelTestPage />);
      const imageTab = screen.getByRole("tab", { name: /图片/i });
      fireEvent.click(imageTab);

      const promptInput = screen.getByTestId("prompt-input");
      fireEvent.change(promptInput, { target: { value: "test" } });

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      expect(generateBtn).toBeDisabled();
    });

    it("is disabled when prompt is empty", () => {
      render(<ModelTestPage />);
      const imageTab = screen.getByRole("tab", { name: /图片/i });
      fireEvent.click(imageTab);

      const selectBtn = screen.getByTestId("select-model-btn");
      fireEvent.click(selectBtn);

      const generateBtn = screen.getByRole("button", { name: /生成图片/ });
      expect(generateBtn).toBeDisabled();
    });
  });
});
