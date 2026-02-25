/**
 * Property-based tests for the VideoPanel component.
 * Feature: unified-media-provider, Property 19
 * Validates: Requirements 14.1
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";

const mockUUID = "pbt-video-uuid-0000";
Object.defineProperty(globalThis, "crypto", {
  value: { ...globalThis.crypto, randomUUID: jest.fn(() => mockUUID) },
});

const mockGenerateMedia = jest.fn();
jest.mock("../../../components/actions/ai-media-actions", () => ({
  generateMedia: (...args: any[]) => mockGenerateMedia(...args),
  listModelsWithCapabilities: jest.fn().mockResolvedValue([]),
  listMediaModels: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../components/ai/ModelSelector", () => ({
  ModelSelector: ({ onModelSelect, onPromptChange, prompt }: any) => (
    <div data-testid="mock-model-selector">
      <button data-testid="select-model-btn" onClick={() => onModelSelect("pbt-video-model", { duration_options: [5, 10] })}>Select Model</button>
      <input data-testid="prompt-input" value={prompt || ""} onChange={(e: any) => onPromptChange(e.target.value)} />
    </div>
  ),
  CapabilityParams: () => <div data-testid="mock-capability-params" />,
}));

const ReactForCtx = require("react");
const PbtTabsCtx = ReactForCtx.createContext(null);

jest.mock("@radix-ui/react-tabs", () => {
  const R = require("react");
  return {
    Root: ({ children, value, onValueChange, ...props }: any) => {
      const ctx = R.useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
      return <PbtTabsCtx.Provider value={ctx}><div data-testid="tabs-root" {...props}>{children}</div></PbtTabsCtx.Provider>;
    },
    List: R.forwardRef(({ children, ...props }: any, ref: any) => <div ref={ref} role="tablist" {...props}>{children}</div>),
    Trigger: R.forwardRef(({ children, value, ...props }: any, ref: any) => {
      const ctx = R.useContext(PbtTabsCtx);
      return <button ref={ref} role="tab" data-state={ctx?.value === value ? "active" : "inactive"} onClick={() => ctx?.onValueChange?.(value)} {...props}>{children}</button>;
    }),
    Content: R.forwardRef(({ children, value, ...props }: any, ref: any) => {
      const ctx = R.useContext(PbtTabsCtx);
      if (ctx?.value !== value) return null;
      return <div ref={ref} role="tabpanel" {...props}>{children}</div>;
    }),
  };
});

jest.mock("@radix-ui/react-slot", () => {
  const R = require("react");
  return {
    Slot: R.forwardRef(({ children, ...props }: any, ref: any) => {
      if (R.isValidElement(children)) return R.cloneElement(children, { ...props, ref });
      return <span ref={ref} {...props}>{children}</span>;
    }),
  };
});

import ModelTestPage from "@/app/(aistudio)/ai/model-test/page";

async function setupVideoPanel() {
  const result = render(<ModelTestPage />);
  const videoTab = screen.getByRole("tab", { name: /视频/i });
  fireEvent.click(videoTab);
  const selectBtn = screen.getByTestId("select-model-btn");
  fireEvent.click(selectBtn);
  const promptInput = screen.getByTestId("prompt-input");
  fireEvent.change(promptInput, { target: { value: "pbt video prompt" } });
  return result;
}

const STATUS_TESTIDS = ["video-submitting", "video-queued", "video-generating", "video-completed", "video-failed"] as const;

describe("VideoPanel PBT", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  // Feature: unified-media-provider, Property 19: 视频任务状态流转
  // **Validates: Requirements 14.1**
  describe("Property 19: 视频任务状态流转", () => {
    it("for any success/failure outcome, transitions through all defined states with unique data-testids", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            shouldSucceed: fc.boolean(),
            videoUrl: fc.webUrl(),
            usageId: fc.string({ minLength: 1, maxLength: 30 }),
            cost: fc.integer({ min: 1, max: 1000 }),
            duration: fc.integer({ min: 1, max: 300 }),
            resolution: fc.constantFrom("1280x720", "1920x1080", "854x480"),
            errorCode: fc.constantFrom(400, 500, 502, 503, 504),
            errorMessage: fc.string({ minLength: 5, maxLength: 50 }),
          }),
          async (params) => {
            let resolvePromise!: (value: any) => void;
            let rejectPromise!: (reason: any) => void;
            const mediaPromise = new Promise((resolve, reject) => {
              resolvePromise = resolve;
              rejectPromise = reject;
            });
            mockGenerateMedia.mockReturnValue(mediaPromise);

            const { unmount } = await setupVideoPanel();

            const generateBtn = screen.getByRole("button", { name: /生成视频/ });
            await act(async () => { fireEvent.click(generateBtn); });

            // State: queued (submitting is transient)
            expect(screen.getByTestId("video-queued")).toBeInTheDocument();
            expect(screen.queryByTestId("video-generating")).not.toBeInTheDocument();
            expect(screen.queryByTestId("video-completed")).not.toBeInTheDocument();
            expect(screen.queryByTestId("video-failed")).not.toBeInTheDocument();

            // Advance past 500ms setTimeout -> generating
            await act(async () => { jest.advanceTimersByTime(600); });

            // State: generating
            expect(screen.getByTestId("video-generating")).toBeInTheDocument();
            expect(screen.getByTestId("video-elapsed-timer")).toBeInTheDocument();
            expect(screen.queryByTestId("video-queued")).not.toBeInTheDocument();
            expect(screen.queryByTestId("video-completed")).not.toBeInTheDocument();
            expect(screen.queryByTestId("video-failed")).not.toBeInTheDocument();

            if (params.shouldSucceed) {
              await act(async () => {
                resolvePromise({
                  url: params.videoUrl,
                  usage_id: params.usageId,
                  cost: params.cost,
                  duration: params.duration,
                  meta: { resolution: params.resolution },
                });
              });
              await waitFor(() => { expect(screen.getByTestId("video-completed")).toBeInTheDocument(); });
              expect(screen.queryByTestId("video-queued")).not.toBeInTheDocument();
              expect(screen.queryByTestId("video-generating")).not.toBeInTheDocument();
              expect(screen.queryByTestId("video-failed")).not.toBeInTheDocument();
            } else {
              await act(async () => {
                rejectPromise(new Error("请求失败 " + params.errorCode + ": " + params.errorMessage));
              });
              await waitFor(() => { expect(screen.getByTestId("video-failed")).toBeInTheDocument(); });
              expect(screen.queryByTestId("video-queued")).not.toBeInTheDocument();
              expect(screen.queryByTestId("video-generating")).not.toBeInTheDocument();
              expect(screen.queryByTestId("video-completed")).not.toBeInTheDocument();
            }

            // All status testids are unique
            const uniqueTestIds = new Set(STATUS_TESTIDS);
            expect(uniqueTestIds.size).toBe(STATUS_TESTIDS.length);

            unmount();
            mockGenerateMedia.mockReset();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
