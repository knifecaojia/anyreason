/**
 * Unit tests for the Test History sidebar (embedded in ModelTestPage).
 *
 * The sidebar is part of ModelTestPage and shows session history,
 * a "新建" button, and an empty state message.
 *
 * Validates: Requirements 16.1, 16.4
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock crypto.randomUUID — return incrementing IDs
let uuidCounter = 0;
Object.defineProperty(globalThis, "crypto", {
  value: {
    ...globalThis.crypto,
    randomUUID: jest.fn(() => `session-uuid-${++uuidCounter}`),
  },
});

// Mock generateMedia server action
jest.mock("../../../components/actions/ai-media-actions", () => ({
  generateMedia: jest.fn().mockResolvedValue({}),
  listModelsWithCapabilities: jest.fn().mockResolvedValue([]),
  listMediaModels: jest.fn().mockResolvedValue([]),
}));

// Mock ModelSelector
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

// Mock aiAdminListModelConfigs (used by TextPanel)
jest.mock("../../../components/actions/ai-model-actions", () => ({
  aiAdminListModelConfigs: jest.fn().mockResolvedValue({ data: [] }),
}));

// Mock Radix UI Tabs
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

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("TestHistory sidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;
  });

  /* ---- Requirement 16.1: Session list renders in the sidebar ---- */
  describe("Session list in sidebar (Req 16.1)", () => {
    it("renders the '测试历史' heading in the sidebar", () => {
      render(<ModelTestPage />);
      expect(screen.getByText("测试历史")).toBeInTheDocument();
    });

    it("renders session entries in the sidebar after creating sessions", () => {
      render(<ModelTestPage />);

      // Create two sessions
      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);
      fireEvent.click(newBtn);

      // Both sessions should appear as "未选择模型" (no model selected yet)
      const entries = screen.getAllByText("未选择模型");
      expect(entries.length).toBe(2);
    });

    it("displays session creation time and run count", () => {
      render(<ModelTestPage />);

      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);

      // Session entry should show "0 次运行"
      expect(screen.getByText(/0 次运行/)).toBeInTheDocument();
    });
  });

  /* ---- Requirement 16.4: "新建" button creates a new session ---- */
  describe("New session button (Req 16.4)", () => {
    it("renders the '+ 新建' button", () => {
      render(<ModelTestPage />);
      expect(
        screen.getByRole("button", { name: /\+ 新建/ }),
      ).toBeInTheDocument();
    });

    it("creates a new session when clicked", () => {
      render(<ModelTestPage />);

      // Initially empty
      expect(screen.getByText("暂无历史记录")).toBeInTheDocument();

      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);

      // Empty message should be gone, session entry should appear
      expect(screen.queryByText("暂无历史记录")).not.toBeInTheDocument();
      expect(screen.getByText("未选择模型")).toBeInTheDocument();
    });

    it("creates multiple sessions with unique entries", () => {
      render(<ModelTestPage />);

      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);
      fireEvent.click(newBtn);
      fireEvent.click(newBtn);

      const entries = screen.getAllByText("未选择模型");
      expect(entries.length).toBe(3);
    });
  });

  /* ---- Empty state ---- */
  describe("Empty state", () => {
    it("shows '暂无历史记录' when no sessions exist", () => {
      render(<ModelTestPage />);
      expect(screen.getByText("暂无历史记录")).toBeInTheDocument();
    });

    it("shows empty state per category after switching tabs", () => {
      render(<ModelTestPage />);

      // Create a session in text tab
      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);
      expect(screen.queryByText("暂无历史记录")).not.toBeInTheDocument();

      // Switch to image tab — should show empty state (no image sessions)
      const imageTab = screen.getByRole("tab", { name: /图片/i });
      fireEvent.click(imageTab);
      expect(screen.getByText("暂无历史记录")).toBeInTheDocument();
    });
  });

  /* ---- Session entries show creation time and run count ---- */
  describe("Session entry details", () => {
    it("shows model name in session entry when model is selected before creating session", () => {
      render(<ModelTestPage />);

      // Switch to image tab so we can select a model via the mock
      const imageTab = screen.getByRole("tab", { name: /图片/i });
      fireEvent.click(imageTab);

      // Select a model first
      const selectBtn = screen.getByTestId("select-model-btn");
      fireEvent.click(selectBtn);

      // Now create a session — it should capture the selected model code
      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);

      // The session entry should show the model code "test-model"
      expect(screen.getByText("test-model")).toBeInTheDocument();
    });

    it("shows run count as 0 for a new session", () => {
      render(<ModelTestPage />);

      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);

      expect(screen.getByText(/0 次运行/)).toBeInTheDocument();
    });

    it("shows creation time in session entry", () => {
      render(<ModelTestPage />);

      const newBtn = screen.getByRole("button", { name: /\+ 新建/ });
      fireEvent.click(newBtn);

      // The session entry should contain a time string alongside the run count.
      // The format is: "{toLocaleString()} · 0 次运行"
      // We verify the combined text pattern exists in the entry.
      const entry = screen.getByText(/次运行/);
      expect(entry).toBeInTheDocument();
      // The text content should include both a date/time portion and the run count
      expect(entry.textContent).toMatch(/·.*0 次运行/);
    });
  });
});
