/**
 * Unit tests for the TextPanel component (embedded in ModelTestPage).
 *
 * Since TextPanel is a local function component inside page.tsx and not exported,
 * we test it through the ModelTestPage (which defaults to the "text" tab).
 *
 * Validates: Requirements 15.3, 15.4, 15.5
 */
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream } from "stream/web";

// Polyfill Web APIs for jsdom
Object.assign(globalThis, {
  TextEncoder,
  TextDecoder,
  ReadableStream,
});

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = jest.fn();

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock crypto.randomUUID
const mockUUID = "test-text-uuid-1234";
Object.defineProperty(globalThis, "crypto", {
  value: {
    ...globalThis.crypto,
    randomUUID: jest.fn(() => mockUUID),
  },
});

// Mock generateMedia server action
jest.mock("../../../components/actions/ai-media-actions", () => ({
  generateMedia: jest.fn().mockResolvedValue({}),
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

// Mock aiAdminListModelConfigs to return test model configs
const mockListModelConfigs = jest.fn();
jest.mock("../../../components/actions/ai-model-actions", () => ({
  aiAdminListModelConfigs: (...args: any[]) => mockListModelConfigs(...args),
}));

// Mock Radix UI Tabs (used by @/components/ui/tabs)
jest.mock("@radix-ui/react-tabs", () => {
  const R = require("react");
  return {
    Root: ({ children, value, onValueChange, ...props }: any) => {
      const ctx = R.useMemo(
        () => ({ value, onValueChange }),
        [value, onValueChange],
      );
      return (
        <TabsCtx.Provider value={ctx}>
          <div data-testid="tabs-root" {...props}>
            {children}
          </div>
        </TabsCtx.Provider>
      );
    },
    List: R.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} role="tablist" {...props}>
        {children}
      </div>
    )),
    Trigger: R.forwardRef(
      ({ children, value, ...props }: any, ref: any) => {
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
      },
    ),
    Content: R.forwardRef(
      ({ children, value, ...props }: any, ref: any) => {
        const ctx = R.useContext(TabsCtx);
        if (ctx?.value !== value) return null;
        return (
          <div ref={ref} role="tabpanel" {...props}>
            {children}
          </div>
        );
      },
    ),
  };
});

// Create a context for the mock Tabs
const React2 = require("react");
const TabsCtx = React2.createContext(null);

// Mock Radix Slot (used by Button)
jest.mock("@radix-ui/react-slot", () => {
  const R = require("react");
  return {
    Slot: R.forwardRef(({ children, ...props }: any, ref: any) => {
      if (R.isValidElement(children)) {
        return R.cloneElement(children, { ...props, ref });
      }
      return (
        <span ref={ref} {...props}>
          {children}
        </span>
      );
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

/** Standard text model configs for testing */
const textModelConfigs = [
  {
    id: "cfg-gpt4o",
    category: "text" as const,
    manufacturer: "openai",
    model: "gpt-4o",
    enabled: true,
    sort_order: 1,
    has_api_key: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
  {
    id: "cfg-qwen",
    category: "text" as const,
    manufacturer: "alibaba",
    model: "qwen-turbo",
    enabled: true,
    sort_order: 2,
    has_api_key: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
];

/** Model config that supports image input (gpt-4o) */
const imageCapableConfigs = [
  {
    id: "cfg-gpt4o",
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

/** Model config that does NOT support image input */
const noImageConfigs = [
  {
    id: "cfg-qwen",
    category: "text" as const,
    manufacturer: "alibaba",
    model: "qwen-turbo",
    enabled: true,
    sort_order: 1,
    has_api_key: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
];

/** Helper to create a mock SSE ReadableStream */
function createSSEStream(events: Array<{ type: string; [key: string]: any }>) {
  const encoder = new TextEncoder();
  const chunks = events.map(
    (evt) => `data: ${JSON.stringify(evt)}\n\n`,
  );
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/** Render ModelTestPage — it defaults to the "text" tab */
function renderTextPanel() {
  return render(<ModelTestPage />);
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("TextPanel", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: return text model configs
    mockListModelConfigs.mockResolvedValue({
      data: textModelConfigs,
    });
    // Default: mock fetch to return an empty SSE stream
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /* ---- Requirement 15.3: Clear conversation button ---- */
  describe("Clear conversation (Req 15.3)", () => {
    it("clear button is disabled when there are no messages", async () => {
      await act(async () => {
        renderTextPanel();
      });

      const clearBtn = screen.getByTestId("text-clear-btn");
      expect(clearBtn).toBeDisabled();
    });

    it("clears all messages when clear button is clicked", async () => {
      // Setup: mock a successful SSE response
      const stream = createSSEStream([
        { type: "delta", delta: "Hello" },
        { type: "done", output_text: "Hello" },
      ]);
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: stream,
      });

      await act(async () => {
        renderTextPanel();
      });

      // Wait for model configs to load
      await waitFor(() => {
        expect(mockListModelConfigs).toHaveBeenCalledWith("text");
      });

      // Type a message and send
      const input = screen.getByTestId("text-input");
      fireEvent.change(input, { target: { value: "Hello AI" } });

      const sendBtn = screen.getByTestId("text-send-btn");
      await act(async () => {
        fireEvent.click(sendBtn);
      });

      // Wait for the assistant response to appear
      await waitFor(() => {
        expect(screen.getByText("Hello AI")).toBeInTheDocument();
        expect(screen.getByText("Hello")).toBeInTheDocument();
      });

      // Now click clear
      const clearBtn = screen.getByTestId("text-clear-btn");
      expect(clearBtn).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(clearBtn);
      });

      // Messages should be gone, empty state should show
      expect(screen.queryByText("Hello AI")).not.toBeInTheDocument();
      expect(screen.getByText("文本对话测试")).toBeInTheDocument();
    });
  });

  /* ---- Requirement 15.4: Stop generation button ---- */
  describe("Stop generation (Req 15.4)", () => {
    it("shows stop button during streaming and hides send button", async () => {
      // Create a stream that never completes
      const stream = new ReadableStream({
        start() {
          // Never enqueue or close — simulates ongoing streaming
        },
      });
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: stream,
      });

      await act(async () => {
        renderTextPanel();
      });

      await waitFor(() => {
        expect(mockListModelConfigs).toHaveBeenCalled();
      });

      // Send a message to start streaming
      const input = screen.getByTestId("text-input");
      fireEvent.change(input, { target: { value: "Test message" } });

      await act(async () => {
        fireEvent.click(screen.getByTestId("text-send-btn"));
      });

      // Stop button should appear, send button should be gone
      expect(screen.getByTestId("text-stop-btn")).toBeInTheDocument();
      expect(screen.queryByTestId("text-send-btn")).not.toBeInTheDocument();
    });

    it("aborts streaming when stop button is clicked", async () => {
      // Mock fetch that respects the abort signal
      (globalThis.fetch as jest.Mock).mockImplementation(
        (_url: string, init?: RequestInit) => {
          const signal = init?.signal;
          const encoder = new TextEncoder();

          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              // Enqueue one delta
              controller.enqueue(
                encoder.encode('data: {"type":"delta","delta":"Partial"}\n\n'),
              );
              // Listen for abort to cancel the stream
              signal?.addEventListener("abort", () => {
                try { controller.close(); } catch { /* already closed */ }
              });
            },
          });

          return Promise.resolve({ ok: true, body: stream });
        },
      );

      await act(async () => {
        renderTextPanel();
      });

      await waitFor(() => {
        expect(mockListModelConfigs).toHaveBeenCalled();
      });

      const input = screen.getByTestId("text-input");
      fireEvent.change(input, { target: { value: "Test" } });

      await act(async () => {
        fireEvent.click(screen.getByTestId("text-send-btn"));
      });

      // Wait for stop button to appear
      await waitFor(() => {
        expect(screen.getByTestId("text-stop-btn")).toBeInTheDocument();
      });

      // Click stop
      await act(async () => {
        fireEvent.click(screen.getByTestId("text-stop-btn"));
      });

      // After stopping, send button should reappear
      await waitFor(() => {
        expect(screen.getByTestId("text-send-btn")).toBeInTheDocument();
        expect(screen.queryByTestId("text-stop-btn")).not.toBeInTheDocument();
      });
    });
  });

  /* ---- Requirement 15.5: Image attachment ---- */
  describe("Image attachment (Req 15.5)", () => {
    it("shows image attach button when model supports image (gpt-4o)", async () => {
      mockListModelConfigs.mockResolvedValue({
        data: imageCapableConfigs,
      });

      await act(async () => {
        renderTextPanel();
      });

      await waitFor(() => {
        expect(mockListModelConfigs).toHaveBeenCalledWith("text");
      });

      // gpt-4o supports image — attach button should be visible
      await waitFor(() => {
        expect(screen.getByTestId("text-image-attach")).toBeInTheDocument();
      });
    });

    it("hides image attach button when model does not support image", async () => {
      mockListModelConfigs.mockResolvedValue({
        data: noImageConfigs,
      });

      await act(async () => {
        renderTextPanel();
      });

      await waitFor(() => {
        expect(mockListModelConfigs).toHaveBeenCalledWith("text");
      });

      // qwen-turbo does not support image — attach button should not be visible
      expect(screen.queryByTestId("text-image-attach")).not.toBeInTheDocument();
    });

    it("shows image attach button when switching to an image-capable model", async () => {
      mockListModelConfigs.mockResolvedValue({
        data: textModelConfigs, // both gpt-4o and qwen-turbo
      });

      await act(async () => {
        renderTextPanel();
      });

      await waitFor(() => {
        expect(mockListModelConfigs).toHaveBeenCalledWith("text");
      });

      // Default selected is first config (gpt-4o) which supports image
      await waitFor(() => {
        expect(screen.getByTestId("text-image-attach")).toBeInTheDocument();
      });

      // Switch to qwen-turbo (no image support)
      const select = screen.getByDisplayValue(/openai \/ gpt-4o/i);
      fireEvent.change(select, { target: { value: "cfg-qwen" } });

      await waitFor(() => {
        expect(
          screen.queryByTestId("text-image-attach"),
        ).not.toBeInTheDocument();
      });

      // Switch back to gpt-4o
      fireEvent.change(select, { target: { value: "cfg-gpt4o" } });

      await waitFor(() => {
        expect(screen.getByTestId("text-image-attach")).toBeInTheDocument();
      });
    });
  });
});
