/**
 * Unit tests for the VideoPanel component (embedded in ModelTestPage).
 *
 * Since VideoPanel is a local function component inside page.tsx and not exported,
 * we test it through the ModelTestPage by switching to the "video" tab.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock crypto.randomUUID
const mockUUID = "test-video-uuid-1234";
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
          onModelSelect("test-video-model", { duration_options: [5, 10] })
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

// Mock Radix UI Tabs
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

/** Switch to the video tab and set up model + prompt for generation */
async function setupVideoPanel() {
  const result = render(<ModelTestPage />);

  // Switch to video tab
  const videoTab = screen.getByRole("tab", { name: /视频/i });
  fireEvent.click(videoTab);

  // Select a model
  const selectBtn = screen.getByTestId("select-model-btn");
  fireEvent.click(selectBtn);

  // Enter a prompt
  const promptInput = screen.getByTestId("prompt-input");
  fireEvent.change(promptInput, { target: { value: "test video prompt" } });

  return result;
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("VideoPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /* ---- Idle state ---- */
  describe("Idle state", () => {
    it("shows empty placeholder when no task is running", () => {
      render(<ModelTestPage />);
      const videoTab = screen.getByRole("tab", { name: /视频/i });
      fireEvent.click(videoTab);

      expect(screen.getByText("视频预览区域")).toBeInTheDocument();
      expect(screen.getByText(/配置参数并点击生成/)).toBeInTheDocument();
    });
  });

  /* ---- Task status indicator states (Requirement 14.1) ---- */
  describe("Task status indicator states", () => {
    it("transitions through submitting state (submitting → queued happens synchronously)", async () => {
      // The component sets submitting then immediately sets queued in the same
      // synchronous block, so by the time React re-renders we see "queued".
      // We verify the button text reflects a processing state after click.
      mockGenerateMedia.mockReturnValue(new Promise(() => {}));

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // After click, the component is in queued state (submitting is transient)
      // The button should show a processing label
      const buttons = screen.getAllByRole("button");
      const processingBtn = buttons.find(
        (b) =>
          b.textContent?.includes("提交中") ||
          b.textContent?.includes("排队中")
      );
      expect(processingBtn).toBeTruthy();
      expect(processingBtn).toBeDisabled();
    });

    it("shows queued state after submitting", async () => {
      mockGenerateMedia.mockReturnValue(new Promise(() => {}));

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // The component transitions from submitting → queued synchronously
      // After the click, it should be in queued state
      expect(screen.getByTestId("video-queued")).toBeInTheDocument();
      expect(screen.getByText("任务排队中，请稍候...")).toBeInTheDocument();
    });

    it("shows generating state with timer after queued", async () => {
      mockGenerateMedia.mockReturnValue(new Promise(() => {}));

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Advance past the 500ms setTimeout to transition to generating
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(screen.getByTestId("video-generating")).toBeInTheDocument();
      expect(screen.getByText("视频生成中...")).toBeInTheDocument();
      expect(screen.getByTestId("video-elapsed-timer")).toBeInTheDocument();
    });

    it("shows completed state with video player on success", async () => {
      mockGenerateMedia.mockResolvedValue({
        url: "https://example.com/video.mp4",
        usage_id: "video-usage-123",
        cost: 20,
        duration: 10,
        meta: { resolution: "1280x720" },
      });

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Advance past the 500ms setTimeout
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-completed")).toBeInTheDocument();
      });
    });

    it("shows failed state with error on failure", async () => {
      mockGenerateMedia.mockRejectedValue(
        new Error("请求失败 502: Internal Server Error")
      );

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Advance past the 500ms setTimeout
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-failed")).toBeInTheDocument();
      });
    });
  });

  /* ---- Video player (Requirement 14.3) ---- */
  describe("Video player", () => {
    it("renders video player element on completion", async () => {
      mockGenerateMedia.mockResolvedValue({
        url: "https://example.com/video.mp4",
        usage_id: "v-123",
        cost: 15,
        duration: 5,
        meta: { resolution: "1920x1080" },
      });

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-player")).toBeInTheDocument();
      });

      const videoEl = screen.getByTestId("video-player") as HTMLVideoElement;
      expect(videoEl.tagName).toBe("VIDEO");
      expect(videoEl).toHaveAttribute("src", "https://example.com/video.mp4");
    });

    it("displays video metadata badges on completion", async () => {
      mockGenerateMedia.mockResolvedValue({
        url: "https://example.com/video.mp4",
        usage_id: "v-meta-456",
        cost: 25,
        duration: 10,
        meta: { resolution: "1280x720" },
      });

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-meta")).toBeInTheDocument();
      });

      expect(screen.getByText(/时长: 10s/)).toBeInTheDocument();
      expect(screen.getByText(/分辨率: 1280x720/)).toBeInTheDocument();
      expect(screen.getByText(/usage_id: v-meta-456/)).toBeInTheDocument();
      expect(screen.getByText(/积分消耗: 25/)).toBeInTheDocument();
    });
  });

  /* ---- Error state (Requirement 14.5) ---- */
  describe("Error state", () => {
    it("displays error code badge and error message on failure", async () => {
      mockGenerateMedia.mockRejectedValue(
        new Error("请求失败 502: Internal Server Error")
      );

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-failed")).toBeInTheDocument();
      });

      expect(screen.getByText(/错误码: 502/)).toBeInTheDocument();
      expect(
        screen.getByText(/请求失败 502: Internal Server Error/)
      ).toBeInTheDocument();
    });

    it("shows UNKNOWN error code when no code in message", async () => {
      mockGenerateMedia.mockRejectedValue(new Error("网络连接失败"));

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-failed")).toBeInTheDocument();
      });

      expect(screen.getByText(/错误码: UNKNOWN/)).toBeInTheDocument();
      expect(screen.getByText("网络连接失败")).toBeInTheDocument();
    });

    it("uses default error message when error has no message", async () => {
      mockGenerateMedia.mockRejectedValue(new Error());

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-failed")).toBeInTheDocument();
      });

      expect(screen.getByText("生成失败")).toBeInTheDocument();
    });
  });

  /* ---- Elapsed timer (Requirement 14.2) ---- */
  describe("Elapsed timer", () => {
    it("shows elapsed time during generating state", async () => {
      mockGenerateMedia.mockReturnValue(new Promise(() => {}));

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Advance to generating state
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(screen.getByTestId("video-elapsed-timer")).toBeInTheDocument();
      // Initial timer should show 00:00
      expect(screen.getByText("00:00")).toBeInTheDocument();

      // Advance timer by 5 seconds
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(screen.getByText("00:05")).toBeInTheDocument();

      // Advance timer by another 60 seconds
      await act(async () => {
        jest.advanceTimersByTime(60000);
      });

      expect(screen.getByText("01:05")).toBeInTheDocument();
    });
  });

  /* ---- Generate button disabled states ---- */
  describe("Generate button", () => {
    it("is disabled when no model is selected", () => {
      render(<ModelTestPage />);
      const videoTab = screen.getByRole("tab", { name: /视频/i });
      fireEvent.click(videoTab);

      const promptInput = screen.getByTestId("prompt-input");
      fireEvent.change(promptInput, { target: { value: "test" } });

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      expect(generateBtn).toBeDisabled();
    });

    it("is disabled when prompt is empty", () => {
      render(<ModelTestPage />);
      const videoTab = screen.getByRole("tab", { name: /视频/i });
      fireEvent.click(videoTab);

      const selectBtn = screen.getByTestId("select-model-btn");
      fireEvent.click(selectBtn);

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      expect(generateBtn).toBeDisabled();
    });

    it("is disabled during processing", async () => {
      mockGenerateMedia.mockReturnValue(new Promise(() => {}));

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Button should be disabled during processing
      const buttons = screen.getAllByRole("button");
      const genBtn = buttons.find(
        (b) =>
          b.textContent?.includes("提交中") ||
          b.textContent?.includes("排队中") ||
          b.textContent?.includes("生成中")
      );
      expect(genBtn).toBeDisabled();
    });
  });

  /* ---- History list ---- */
  describe("History list", () => {
    it("shows history list after a completed run", async () => {
      mockGenerateMedia.mockResolvedValue({
        url: "https://example.com/video.mp4",
        usage_id: "v-hist-1",
        cost: 10,
        duration: 5,
        meta: {},
      });

      await setupVideoPanel();

      const generateBtn = screen.getByRole("button", { name: /生成视频/ });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId("video-completed")).toBeInTheDocument();
      });

      expect(screen.getByTestId("video-history")).toBeInTheDocument();
    });
  });
});
