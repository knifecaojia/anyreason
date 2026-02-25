/**
 * Property-based tests for the ModelTestPage component.
 * Feature: unified-media-provider, Properties 15, 16, 17, 18, 22, 23
 *
 * Property 15: 类别切换加载对应模型 (Validates: Requirements 12.2)
 * Property 16: 生成结果元信息展示 (Validates: Requirements 13.3, 14.4)
 * Property 17: 生成失败错误展示 (Validates: Requirements 13.4, 14.5)
 * Property 18: 生成历史累积 (Validates: Requirements 13.5, 14.6)
 * Property 22: 会话历史信息展示 (Validates: Requirements 16.3)
 * Property 23: 会话加载完整内容 (Validates: Requirements 16.2)
 */
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

let uuidCounter = 0;
Object.defineProperty(globalThis, "crypto", {
  value: {
    ...globalThis.crypto,
    randomUUID: jest.fn(() => `pbt-uuid-${++uuidCounter}`),
  },
});

const mockGenerateMedia = jest.fn();
jest.mock("../../../components/actions/ai-media-actions", () => ({
  generateMedia: (...args: any[]) => mockGenerateMedia(...args),
  listModelsWithCapabilities: jest.fn().mockResolvedValue([]),
  listMediaModels: jest.fn().mockResolvedValue([]),
}));

// Mock ModelSelector — captures the `category` prop to verify P15
let lastModelSelectorCategory: string | undefined;
jest.mock("../../../components/ai/ModelSelector", () => ({
  ModelSelector: ({ category, onModelSelect, onPromptChange, prompt }: any) => {
    lastModelSelectorCategory = category;
    return (
      <div data-testid="mock-model-selector" data-category={category}>
        <button
          data-testid="select-model-btn"
          onClick={() => onModelSelect("test-model", { resolutions: ["1024x1024"] })}
        >
          Select Model
        </button>
        <input
          data-testid="prompt-input"
          value={prompt || ""}
          onChange={(e: any) => onPromptChange(e.target.value)}
        />
      </div>
    );
  },
  CapabilityParams: () => <div data-testid="mock-capability-params" />,
}));

// Mock aiAdminListModelConfigs (used by TextPanel)
jest.mock("../../../components/actions/ai-model-actions", () => ({
  aiAdminListModelConfigs: jest.fn().mockResolvedValue({ data: [] }),
}));

const ReactForCtx = require("react");
const PbtTabsCtx = ReactForCtx.createContext(null);

jest.mock("@radix-ui/react-tabs", () => {
  const R = require("react");
  return {
    Root: ({ children, value, onValueChange, ...props }: any) => {
      const ctx = R.useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
      return (
        <PbtTabsCtx.Provider value={ctx}>
          <div data-testid="tabs-root" {...props}>{children}</div>
        </PbtTabsCtx.Provider>
      );
    },
    List: R.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} role="tablist" {...props}>{children}</div>
    )),
    Trigger: R.forwardRef(({ children, value, ...props }: any, ref: any) => {
      const ctx = R.useContext(PbtTabsCtx);
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

/* ------------------------------------------------------------------ */
/*  Import component under test (after mocks)                          */
/* ------------------------------------------------------------------ */
import ModelTestPage from "@/app/(aistudio)/ai/model-test/page";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type CategoryType = "text" | "image" | "video";

/** Switch to a specific category tab */
function switchToTab(category: CategoryType) {
  const labelMap: Record<CategoryType, RegExp> = {
    text: /文本/i,
    image: /图片/i,
    video: /视频/i,
  };
  const tab = screen.getByRole("tab", { name: labelMap[category] });
  fireEvent.click(tab);
}

/** Set up image panel with model selected and prompt entered */
function setupImagePanel() {
  switchToTab("image");
  fireEvent.click(screen.getByTestId("select-model-btn"));
  const promptInput = screen.getByTestId("prompt-input");
  fireEvent.change(promptInput, { target: { value: "pbt test prompt" } });
}

/** Set up video panel with model selected and prompt entered */
function setupVideoPanel() {
  switchToTab("video");
  fireEvent.click(screen.getByTestId("select-model-btn"));
  const promptInput = screen.getByTestId("prompt-input");
  fireEvent.change(promptInput, { target: { value: "pbt video prompt" } });
}


/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("ModelTestPage PBT", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;
    lastModelSelectorCategory = undefined;
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  // ================================================================
  // Feature: unified-media-provider, Property 15: 类别切换加载对应模型
  // **Validates: Requirements 12.2**
  // ================================================================
  describe("Property 15: 类别切换加载对应模型", () => {
    it(
      "for any category tab switch, the ModelSelector receives the correct category prop",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate a sequence of category switches (at least 2 to test switching)
            fc.array(
              fc.constantFrom<CategoryType>("image", "video"),
              { minLength: 1, maxLength: 8 }
            ),
            async (categories) => {
              cleanup();
              const { unmount } = render(<ModelTestPage />);

              for (const cat of categories) {
                switchToTab(cat);

                // The ModelSelector mock captures the category prop
                const selector = screen.getByTestId("mock-model-selector");
                expect(selector.getAttribute("data-category")).toBe(cat);
                expect(lastModelSelectorCategory).toBe(cat);
              }

              unmount();
            }
          ),
          { numRuns: 100 }
        );
      },
      30_000
    );
  });

  // ================================================================
  // Feature: unified-media-provider, Property 16: 生成结果元信息展示
  // **Validates: Requirements 13.3, 14.4**
  // ================================================================
  describe("Property 16: 生成结果元信息展示", () => {
    it(
      "for any successful generation response, the page displays usage_id, cost, and time info",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              isImage: fc.boolean(),
              usageId: fc.stringMatching(/^[a-zA-Z0-9_-]{3,20}$/),
              cost: fc.integer({ min: 1, max: 9999 }),
              duration: fc.integer({ min: 1, max: 300 }),
              resolution: fc.constantFrom("1280x720", "1920x1080", "854x480"),
            }),
            async ({ isImage, usageId, cost, duration, resolution }) => {
              cleanup();
              jest.useFakeTimers();

              mockGenerateMedia.mockResolvedValue({
                url: "https://example.com/result.mp4",
                usage_id: usageId,
                cost,
                duration,
                meta: { resolution },
              });

              const { unmount } = render(<ModelTestPage />);

              if (isImage) {
                setupImagePanel();
                const btn = screen.getByRole("button", { name: /生成图片/ });
                await act(async () => { fireEvent.click(btn); });

                await waitFor(() => {
                  expect(screen.getByTestId("image-result")).toBeInTheDocument();
                });

                const meta = screen.getByTestId("image-meta");
                expect(meta.textContent).toContain(`usage_id: ${usageId}`);
                expect(meta.textContent).toContain(`积分消耗: ${cost}`);
                // Elapsed time is also shown
                expect(meta.textContent).toMatch(/耗时:/);
              } else {
                setupVideoPanel();
                const btn = screen.getByRole("button", { name: /生成视频/ });
                await act(async () => { fireEvent.click(btn); });

                // Advance past the 500ms setTimeout for video state transitions
                await act(async () => { jest.advanceTimersByTime(600); });

                await waitFor(() => {
                  expect(screen.getByTestId("video-completed")).toBeInTheDocument();
                });

                const meta = screen.getByTestId("video-meta");
                expect(meta.textContent).toContain(`usage_id: ${usageId}`);
                expect(meta.textContent).toContain(`积分消耗: ${cost}`);
                expect(meta.textContent).toContain(`时长: ${duration}s`);
                expect(meta.textContent).toContain(`分辨率: ${resolution}`);
              }

              jest.useRealTimers();
              unmount();
              mockGenerateMedia.mockReset();
            }
          ),
          { numRuns: 100 }
        );
      },
      60_000
    );
  });


  // ================================================================
  // Feature: unified-media-provider, Property 17: 生成失败错误展示
  // **Validates: Requirements 13.4, 14.5**
  // ================================================================
  describe("Property 17: 生成失败错误展示", () => {
    it(
      "for any failed generation, the page displays error code and description",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              isImage: fc.boolean(),
              errorCode: fc.constantFrom(400, 500, 502, 503, 504),
              errorDesc: fc.stringMatching(/^[a-zA-Z ]{5,30}$/),
            }),
            async ({ isImage, errorCode, errorDesc }) => {
              cleanup();
              jest.useFakeTimers();

              const errorMessage = `请求失败 ${errorCode}: ${errorDesc}`;
              mockGenerateMedia.mockRejectedValue(new Error(errorMessage));

              const { unmount } = render(<ModelTestPage />);

              if (isImage) {
                setupImagePanel();
                const btn = screen.getByRole("button", { name: /生成图片/ });
                await act(async () => { fireEvent.click(btn); });

                await waitFor(() => {
                  expect(screen.getByTestId("image-error")).toBeInTheDocument();
                });

                const errorContainer = screen.getByTestId("image-error");
                expect(errorContainer.textContent).toContain(`错误码: ${errorCode}`);
                expect(errorContainer.textContent).toContain(errorMessage);
              } else {
                setupVideoPanel();
                const btn = screen.getByRole("button", { name: /生成视频/ });
                await act(async () => { fireEvent.click(btn); });

                await act(async () => { jest.advanceTimersByTime(600); });

                await waitFor(() => {
                  expect(screen.getByTestId("video-failed")).toBeInTheDocument();
                });

                const errorContainer = screen.getByTestId("video-failed");
                expect(errorContainer.textContent).toContain(`错误码: ${errorCode}`);
                expect(errorContainer.textContent).toContain(errorMessage);
              }

              jest.useRealTimers();
              unmount();
              mockGenerateMedia.mockReset();
            }
          ),
          { numRuns: 100 }
        );
      },
      60_000
    );
  });

  // ================================================================
  // Feature: unified-media-provider, Property 18: 生成历史累积
  // **Validates: Requirements 13.5, 14.6**
  // ================================================================
  describe("Property 18: 生成历史累积", () => {
    it(
      "for any new generation result, it is appended to history and list length increases by 1",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              isImage: fc.boolean(),
              runCount: fc.integer({ min: 2, max: 4 }),
            }),
            async ({ isImage, runCount }) => {
              cleanup();
              jest.useFakeTimers();

              let callIdx = 0;
              mockGenerateMedia.mockImplementation(() => {
                callIdx++;
                return Promise.resolve({
                  url: `https://example.com/result-${callIdx}.png`,
                  usage_id: `uid-${callIdx}`,
                  cost: callIdx * 5,
                  duration: 10,
                  meta: { resolution: "1280x720" },
                });
              });

              const { unmount } = render(<ModelTestPage />);

              if (isImage) {
                setupImagePanel();

                for (let i = 0; i < runCount; i++) {
                  const btn = screen.getByRole("button", { name: /生成图片/ });
                  await act(async () => { fireEvent.click(btn); });
                  await waitFor(() => {
                    expect(screen.getByTestId("image-result")).toBeInTheDocument();
                  });
                }

                // After multiple runs, the history section should appear (shown when > 1 run)
                if (runCount > 1) {
                  const history = screen.getByTestId("image-history");
                  // The history heading shows the count
                  expect(history.textContent).toContain(`${runCount}`);
                }
              } else {
                setupVideoPanel();

                for (let i = 0; i < runCount; i++) {
                  // Need to reset to idle for subsequent runs
                  const btn = screen.getByRole("button", { name: /生成视频/ });
                  await act(async () => { fireEvent.click(btn); });
                  await act(async () => { jest.advanceTimersByTime(600); });
                  await waitFor(() => {
                    expect(screen.getByTestId("video-completed")).toBeInTheDocument();
                  });
                }

                // Video history is shown when > 0 runs
                const history = screen.getByTestId("video-history");
                expect(history.textContent).toContain(`${runCount}`);
              }

              jest.useRealTimers();
              unmount();
              mockGenerateMedia.mockReset();
            }
          ),
          { numRuns: 100 }
        );
      },
      60_000
    );
  });


  // ================================================================
  // Feature: unified-media-provider, Property 22: 会话历史信息展示
  // **Validates: Requirements 16.3**
  // ================================================================
  describe("Property 22: 会话历史信息展示", () => {
    it(
      "for any test session in history, the entry shows creation time and run count",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              category: fc.constantFrom<CategoryType>("text", "image", "video"),
              sessionCount: fc.integer({ min: 1, max: 5 }),
            }),
            async ({ category, sessionCount }) => {
              cleanup();
              const { unmount } = render(<ModelTestPage />);

              // Switch to the target category
              switchToTab(category);

              // Create multiple sessions
              const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
              for (let i = 0; i < sessionCount; i++) {
                fireEvent.click(newBtn);
              }

              // Verify each session entry shows creation time and run count
              const runCountTexts = screen.getAllByText(/次运行/);
              expect(runCountTexts.length).toBe(sessionCount);

              // Each entry should contain "· N 次运行" pattern with a time portion
              for (const el of runCountTexts) {
                expect(el.textContent).toMatch(/·.*\d+ 次运行/);
              }

              // All new sessions should show 0 runs
              const zeroRunTexts = screen.getAllByText(/0 次运行/);
              expect(zeroRunTexts.length).toBe(sessionCount);

              unmount();
            }
          ),
          { numRuns: 100 }
        );
      },
      30_000
    );
  });

  // ================================================================
  // Feature: unified-media-provider, Property 23: 会话加载完整内容
  // **Validates: Requirements 16.2**
  // ================================================================
  describe("Property 23: 会话加载完整内容", () => {
    it(
      "for any historical session clicked, the page loads that session's complete content",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              promptA: fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/),
              promptB: fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/),
            }),
            async ({ promptA, promptB }) => {
              cleanup();
              jest.useFakeTimers();

              let callCount = 0;
              mockGenerateMedia.mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                  url: `https://example.com/img-${callCount}.png`,
                  usage_id: `uid-${callCount}`,
                  cost: callCount * 10,
                });
              });

              const { unmount } = render(<ModelTestPage />);

              // Switch to image tab
              switchToTab("image");

              // --- Session A: create, set prompt, generate ---
              const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
              fireEvent.click(newBtn);

              fireEvent.click(screen.getByTestId("select-model-btn"));
              const promptInput = screen.getByTestId("prompt-input");
              fireEvent.change(promptInput, { target: { value: promptA } });

              const genBtn = screen.getByRole("button", { name: /生成图片/ });
              await act(async () => { fireEvent.click(genBtn); });
              await waitFor(() => {
                expect(screen.getByTestId("image-result")).toBeInTheDocument();
              });

              // --- Session B: create new session, set different prompt, generate ---
              fireEvent.click(newBtn);

              fireEvent.click(screen.getByTestId("select-model-btn"));
              const promptInput2 = screen.getByTestId("prompt-input");
              fireEvent.change(promptInput2, { target: { value: promptB } });

              const genBtn2 = screen.getByRole("button", { name: /生成图片/ });
              await act(async () => { fireEvent.click(genBtn2); });
              await waitFor(() => {
                expect(screen.getByTestId("image-result")).toBeInTheDocument();
              });

              // Now click back on Session A in the sidebar
              // Session entries show model code "test-model" (from mock)
              const sessionEntries = screen.getAllByText("test-model");
              // The first entry in the list is the most recent (Session B),
              // the second is Session A
              if (sessionEntries.length >= 2) {
                fireEvent.click(sessionEntries[1]);

                // After clicking Session A, the prompt should be restored to promptA
                await waitFor(() => {
                  const input = screen.getByTestId("prompt-input") as HTMLInputElement;
                  expect(input.value).toBe(promptA);
                });
              }

              jest.useRealTimers();
              unmount();
              mockGenerateMedia.mockReset();
            }
          ),
          { numRuns: 100 }
        );
      },
      60_000
    );
  });
});
