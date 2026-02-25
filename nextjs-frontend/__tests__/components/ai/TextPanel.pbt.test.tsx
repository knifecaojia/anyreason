/**
 * Property-based tests for the TextPanel component.
 * Feature: unified-media-provider, Property 20 & 21
 *
 * Property 20: 流式文本增量显示 (Validates: Requirements 15.1)
 * Property 21: 多轮对话上下文保持 (Validates: Requirements 15.2)
 */
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream } from "stream/web";

// Polyfill Web APIs for jsdom
Object.assign(globalThis, { TextEncoder, TextDecoder, ReadableStream });

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

const mockUUID = "pbt-text-uuid-0000";
Object.defineProperty(globalThis, "crypto", {
  value: { ...globalThis.crypto, randomUUID: jest.fn(() => mockUUID) },
});

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

jest.mock("../../../components/actions/ai-media-actions", () => ({
  generateMedia: jest.fn().mockResolvedValue({}),
  listModelsWithCapabilities: jest.fn().mockResolvedValue([]),
  listMediaModels: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../components/ai/ModelSelector", () => ({
  ModelSelector: ({ onModelSelect, onPromptChange, prompt }: any) => (
    <div data-testid="mock-model-selector">
      <button data-testid="select-model-btn" onClick={() => onModelSelect("pbt-text-model", {})}>Select Model</button>
      <input data-testid="prompt-input" value={prompt || ""} onChange={(e: any) => onPromptChange(e.target.value)} />
    </div>
  ),
  CapabilityParams: () => <div data-testid="mock-capability-params" />,
}));

const mockListModelConfigs = jest.fn();
jest.mock("../../../components/actions/ai-model-actions", () => ({
  aiAdminListModelConfigs: (...args: any[]) => mockListModelConfigs(...args),
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

/* ------------------------------------------------------------------ */
/*  Import component under test (after mocks)                          */
/* ------------------------------------------------------------------ */
import ModelTestPage from "@/app/(aistudio)/ai/model-test/page";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const textModelConfigs = [
  {
    id: "cfg-pbt-text",
    category: "text" as const,
    manufacturer: "openai",
    model: "gpt-4o",
    enabled: true,
    sort_order: 1,
    has_api_key: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
];

/** Create a mock SSE ReadableStream from an array of delta strings */
function createDeltaStream(deltas: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events = [
    ...deltas.map((d) => `data: ${JSON.stringify({ type: "delta", delta: d })}\n\n`),
    `data: ${JSON.stringify({ type: "done", output_text: deltas.join("") })}\n\n`,
  ];
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("TextPanel PBT", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    cleanup();
    mockListModelConfigs.mockResolvedValue({ data: textModelConfigs });
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  // Feature: unified-media-provider, Property 20: 流式文本增量显示
  // **Validates: Requirements 15.1**
  describe("Property 20: 流式文本增量显示", () => {
    it(
      "for any sequence of SSE delta events, the final displayed content equals the concatenation of all deltas",
      async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 }),
            { minLength: 1, maxLength: 10 }
          ),
          async (deltas) => {
            cleanup();
            const expectedContent = deltas.join("");
            const stream = createDeltaStream(deltas);

            (globalThis.fetch as jest.Mock).mockResolvedValue({
              ok: true,
              body: stream,
            });

            const { unmount } = await act(async () => render(<ModelTestPage />));

            // Wait for model configs to load
            await waitFor(() => {
              expect(mockListModelConfigs).toHaveBeenCalledWith("text");
            });

            // Type a message and send
            const input = screen.getByTestId("text-input");
            fireEvent.change(input, { target: { value: "test prompt" } });

            await act(async () => {
              fireEvent.click(screen.getByTestId("text-send-btn"));
            });

            // Wait for streaming to complete — the assistant message should contain the full concatenation
            await waitFor(() => {
              // Streaming should be done (send button reappears)
              expect(screen.getByTestId("text-send-btn")).toBeInTheDocument();
            });

            // Find the assistant message content
            const messagesArea = screen.getByTestId("text-messages");
            // The final content should be the trimmed concatenation (done event trims)
            const trimmedExpected = expectedContent.trim() || "（空响应）";
            expect(messagesArea.textContent).toContain(trimmedExpected);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
      },
      60_000
    );
  });

  // Feature: unified-media-provider, Property 21: 多轮对话上下文保持
  // **Validates: Requirements 15.2**
  describe("Property 21: 多轮对话上下文保持", () => {
    it(
      "for any sequence of user messages, the fetch call includes all previous messages in order",
      async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
            { minLength: 2, maxLength: 4 }
          ),
          async (userMessages) => {
            // Clean up any previous render
            cleanup();

            // Track all fetch calls
            const fetchCalls: any[] = [];

            (globalThis.fetch as jest.Mock).mockImplementation(
              (_url: string, init?: RequestInit) => {
                fetchCalls.push(JSON.parse(init?.body as string));
                // Return a quick done stream for each call
                const encoder = new TextEncoder();
                const responseText = "reply";
                const stream = new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "delta", delta: responseText })}\n\n`)
                    );
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "done", output_text: responseText })}\n\n`)
                    );
                    controller.close();
                  },
                });
                return Promise.resolve({ ok: true, body: stream });
              }
            );

            const { unmount } = await act(async () => render(<ModelTestPage />));

            await waitFor(() => {
              expect(mockListModelConfigs).toHaveBeenCalledWith("text");
            });

            // Send each user message sequentially
            for (let i = 0; i < userMessages.length; i++) {
              const input = screen.getByTestId("text-input");
              fireEvent.change(input, { target: { value: userMessages[i] } });

              await act(async () => {
                fireEvent.click(screen.getByTestId("text-send-btn"));
              });

              // Wait for streaming to complete before sending next message
              await waitFor(() => {
                expect(screen.getByTestId("text-send-btn")).toBeInTheDocument();
              });
            }

            // Verify each fetch call contains the correct message history
            expect(fetchCalls.length).toBe(userMessages.length);

            for (let i = 0; i < fetchCalls.length; i++) {
              const body = fetchCalls[i];
              const msgs = body.messages;

              // First message is always the system prompt
              expect(msgs[0].role).toBe("system");

              // Extract non-system messages
              const nonSystem = msgs.slice(1);

              // Should contain all user messages up to index i, plus assistant replies for previous turns
              // Turn 0: [user0]
              // Turn 1: [user0, assistant0, user1]
              // Turn 2: [user0, assistant0, user1, assistant1, user2]
              const expectedCount = i * 2 + 1; // i previous (user+assistant) pairs + current user
              expect(nonSystem.length).toBe(expectedCount);

              // Verify all user messages are in order
              const userMsgsInPayload = nonSystem.filter((m: any) => m.role === "user");
              for (let j = 0; j <= i; j++) {
                expect(userMsgsInPayload[j].content).toBe(userMessages[j]);
              }

              // Verify assistant messages are present for previous turns
              const assistantMsgsInPayload = nonSystem.filter((m: any) => m.role === "assistant");
              expect(assistantMsgsInPayload.length).toBe(i);
            }

            unmount();
            fetchCalls.length = 0;
          }
        ),
        { numRuns: 100 }
      );
      },
      120_000
    );
  });
});
