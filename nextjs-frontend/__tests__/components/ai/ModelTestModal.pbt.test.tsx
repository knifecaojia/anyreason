/**
 * Property-based test for ModelTestModal component.
 * # Feature: model-test-async-tasks, Property 6: 前端任务状态正确映射到 UI 状态
 *
 * Uses fast-check to generate random task event sequences
 * (queued → running/progress → succeeded or failed), verifying UI state
 * transitions are correct:
 * - queued/running → modelTestSubmitting=true → shows progress indicator
 * - succeeded → modelTestImageRuns/modelTestVideoRuns contain result → shows result
 * - failed → modelTestImageRuns/modelTestVideoRuns contain error_message → shows error
 *
 * **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
 */
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";

/* ------------------------------------------------------------------ */
/*  Mock ImagePromptComposer to avoid complex dependency chain         */
/* ------------------------------------------------------------------ */
jest.mock("../../../components/aistudio/ImagePromptComposer", () => ({
  ImagePromptComposer: (props: any) => (
    <div data-testid="mock-image-prompt-composer">
      {props.submitting && <span data-testid="composer-submitting">提交中</span>}
      <button
        data-testid="composer-submit-btn"
        disabled={props.submitDisabled}
        onClick={props.onSubmit}
      >
        {props.generationLabel}
      </button>
    </div>
  ),
}));

/* ------------------------------------------------------------------ */
/*  Import the component under test (after mocks)                      */
/* ------------------------------------------------------------------ */
import { ModelTestModal } from "@/app/(aistudio)/settings/_components/ModelTestModal";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Create default props for ModelTestModal with sensible defaults */
function createDefaultProps(
  overrides: Partial<React.ComponentProps<typeof ModelTestModal>> = {}
) {
  const noop = () => {};
  const noopAsync = async () => {};
  return {
    open: true,
    onClose: noop,
    activeModelTab: "image" as any,
    aiModelConfigs: [
      { id: "cfg-1", manufacturer: "TestVendor", model: "test-model" },
    ],
    modelTestModelConfigId: "cfg-1",
    setModelTestModelConfigId: noop,
    modelTestSubmitting: false,
    resetModelTestChat: noop,
    modelTestError: null,
    modelTestMessages: [],
    modelTestSessionsLoading: false,
    modelTestSessions: [],
    modelTestSessionId: "session-1",
    setModelTestSessionId: noop,
    createModelTestSession: async () => "session-1",
    modelTestImageRuns: [],
    modelTestVideoRuns: [],
    modelTestLastRaw: null,
    modelTestInput: "",
    setModelTestInput: noop,
    submitModelTestChat: noopAsync,
    modelTestSessionImageAttachmentNodeIds: [],
    parseMentionIndices: () => [],
    insertModelTestImageMention: noop,
    removeModelTestSessionImageAttachment: noop,
    addModelTestImages: noop,
    modelTestImagePromptRef: React.createRef<HTMLTextAreaElement>(),
    modelTestImagePrompt: "",
    handlePromptChange: noop,
    mentionPopupOpen: false,
    mentionPosition: null,
    handleMentionSelect: noop,
    setMentionPopupOpen: noop,
    submitModelTestImage: noopAsync,
    modelTestImageResolution: "1024x1024",
    setModelTestImageResolution: noop,
    ...overrides,
  } as React.ComponentProps<typeof ModelTestModal>;
}

/* ------------------------------------------------------------------ */
/*  Arbitraries                                                        */
/* ------------------------------------------------------------------ */

/** Task terminal outcome: either succeeded or failed */
type TaskOutcome = "succeeded" | "failed";

/** A generated task event sequence scenario */
interface TaskScenario {
  category: "image" | "video";
  outcome: TaskOutcome;
  resultUrl: string;
  errorMessage: string;
  fileNodeId: string;
  contentType: string;
  prompt: string;
}

/** Generate a non-empty alphanumeric string without leading/trailing spaces */
const safeTextArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,19}$/)
  .filter((s) => s.trim().length > 0);

const taskScenarioArb: fc.Arbitrary<TaskScenario> = fc.record({
  category: fc.constantFrom<"image" | "video">("image", "video"),
  outcome: fc.constantFrom<TaskOutcome>("succeeded", "failed"),
  resultUrl: fc.constant("https://example.com/result.png"),
  errorMessage: safeTextArb,
  fileNodeId: fc.stringMatching(/^file-[a-z0-9]{4,10}$/),
  contentType: fc.constantFrom(
    "image/png",
    "image/jpeg",
    "video/mp4",
    "video/webm"
  ),
  prompt: safeTextArb,
});

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("ModelTestModal PBT - Property 6: 前端任务状态正确映射到 UI 状态", () => {
  afterEach(() => {
    cleanup();
  });

  // ================================================================
  // Phase 1: queued/running → modelTestSubmitting=true → shows progress
  // ================================================================
  it(
    "queued/running state: for any category, when modelTestSubmitting=true, " +
      "a progress indicator (spinner) and submitted message are shown",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<"image" | "video">("image", "video"),
          async (category) => {
            cleanup();

            const props = createDefaultProps({
              activeModelTab: category,
              modelTestSubmitting: true,
            });
            const { container, unmount } = render(
              <ModelTestModal {...props} />
            );

            // Spinner should be present (LoaderCircle with animate-spin)
            const spinner = container.querySelector(".animate-spin");
            expect(spinner).toBeInTheDocument();

            // Submitted message should be shown
            const expectedMsg =
              category === "image"
                ? "图片生成任务已提交，请等待…"
                : "视频生成任务已提交，请等待…";
            expect(screen.getByText(expectedMsg)).toBeInTheDocument();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  // ================================================================
  // Phase 2: succeeded → shows result url
  // ================================================================
  it(
    "succeeded state: for any successful image task, the result is displayed " +
      "via output_file_node_id or output_url",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          taskScenarioArb.filter((s) => s.outcome === "succeeded" && s.category === "image"),
          async (scenario) => {
            cleanup();

            const imageRun = {
              id: `run-${scenario.fileNodeId}`,
              prompt: scenario.prompt,
              resolution: "1024x1024",
              input_file_node_ids: [],
              output_file_node_id: scenario.fileNodeId,
              output_content_type: "image/png",
              output_url: scenario.resultUrl,
              error_message: null,
              created_at: "2024-01-01T00:00:00Z",
            };

            const props = createDefaultProps({
              activeModelTab: "image",
              modelTestSubmitting: false,
              modelTestImageRuns: [imageRun],
            });
            const { unmount } = render(<ModelTestModal {...props} />);

            // Image should be rendered with VFS download URL
            const img = screen.getByAltText("generated");
            expect(img).toHaveAttribute(
              "src",
              `/api/vfs/nodes/${scenario.fileNodeId}/download`
            );

            // Prompt should be visible
            expect(screen.getByText(scenario.prompt)).toBeInTheDocument();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    "succeeded state: for any successful video task, the result is displayed " +
      "via output_file_node_id",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          taskScenarioArb.filter((s) => s.outcome === "succeeded" && s.category === "video"),
          async (scenario) => {
            cleanup();

            const videoRun = {
              id: `run-${scenario.fileNodeId}`,
              prompt: scenario.prompt,
              aspect_ratio: "16:9",
              input_file_node_ids: [],
              output_file_node_id: scenario.fileNodeId,
              output_content_type: "video/mp4",
              output_url: scenario.resultUrl,
              error_message: null,
              created_at: "2024-01-01T00:00:00Z",
            };

            const props = createDefaultProps({
              activeModelTab: "video",
              modelTestSubmitting: false,
              modelTestVideoRuns: [videoRun],
            });
            const { unmount } = render(<ModelTestModal {...props} />);

            // Video element should be rendered with VFS download URL
            const video = document.querySelector("video");
            expect(video).toBeTruthy();
            expect(video?.getAttribute("src")).toBe(
              `/api/vfs/nodes/${scenario.fileNodeId}/download`
            );

            // Prompt should be visible
            expect(screen.getByText(scenario.prompt)).toBeInTheDocument();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  // ================================================================
  // Phase 3: failed → shows error message
  // ================================================================
  it(
    "failed state: for any failed image task, the error_message is displayed",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          taskScenarioArb.filter((s) => s.outcome === "failed" && s.category === "image"),
          async (scenario) => {
            cleanup();

            const imageRun = {
              id: `run-err-${scenario.fileNodeId}`,
              prompt: scenario.prompt,
              resolution: "1024x1024",
              input_file_node_ids: [],
              output_file_node_id: null,
              output_content_type: null,
              output_url: null,
              error_message: scenario.errorMessage,
              created_at: "2024-01-01T00:00:00Z",
            };

            const props = createDefaultProps({
              activeModelTab: "image",
              modelTestSubmitting: false,
              modelTestImageRuns: [imageRun],
            });
            const { unmount } = render(<ModelTestModal {...props} />);

            // Error message should be displayed
            expect(
              screen.getByText(scenario.errorMessage)
            ).toBeInTheDocument();

            // Prompt should still be visible in the user bubble
            expect(screen.getByText(scenario.prompt)).toBeInTheDocument();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    "failed state: for any failed video task, the error_message is displayed",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          taskScenarioArb.filter((s) => s.outcome === "failed" && s.category === "video"),
          async (scenario) => {
            cleanup();

            const videoRun = {
              id: `run-err-${scenario.fileNodeId}`,
              prompt: scenario.prompt,
              aspect_ratio: "16:9",
              input_file_node_ids: [],
              output_file_node_id: null,
              output_content_type: null,
              output_url: null,
              error_message: scenario.errorMessage,
              created_at: "2024-01-01T00:00:00Z",
            };

            const props = createDefaultProps({
              activeModelTab: "video",
              modelTestSubmitting: false,
              modelTestVideoRuns: [videoRun],
            });
            const { unmount } = render(<ModelTestModal {...props} />);

            // Error message should be displayed
            expect(
              screen.getByText(scenario.errorMessage)
            ).toBeInTheDocument();

            // Prompt should still be visible
            expect(screen.getByText(scenario.prompt)).toBeInTheDocument();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  // ================================================================
  // Full lifecycle: queued → running → succeeded/failed
  // Verifies the complete state transition sequence
  // ================================================================
  it(
    "full lifecycle: for any task event sequence, UI correctly transitions " +
      "from submitting to final state (succeeded or failed)",
    async () => {
      await fc.assert(
        fc.asyncProperty(taskScenarioArb, async (scenario) => {
          cleanup();

          // Phase 1: queued/running — modelTestSubmitting=true, no runs yet
          const submittingProps = createDefaultProps({
            activeModelTab: scenario.category,
            modelTestSubmitting: true,
            modelTestImageRuns: [],
            modelTestVideoRuns: [],
          });
          const { container: c1, unmount: u1 } = render(
            <ModelTestModal {...submittingProps} />
          );

          // Verify progress indicator is shown
          expect(c1.querySelector(".animate-spin")).toBeInTheDocument();
          const submittedMsg =
            scenario.category === "image"
              ? "图片生成任务已提交，请等待…"
              : "视频生成任务已提交，请等待…";
          expect(screen.getByText(submittedMsg)).toBeInTheDocument();
          u1();

          // Phase 2: terminal state — modelTestSubmitting=false, run record present
          if (scenario.outcome === "succeeded") {
            const run =
              scenario.category === "image"
                ? {
                    id: `run-${scenario.fileNodeId}`,
                    prompt: scenario.prompt,
                    resolution: "1024x1024",
                    input_file_node_ids: [],
                    output_file_node_id: scenario.fileNodeId,
                    output_content_type:
                      scenario.category === "image"
                        ? "image/png"
                        : "video/mp4",
                    output_url: scenario.resultUrl,
                    error_message: null,
                    created_at: "2024-01-01T00:00:00Z",
                  }
                : {
                    id: `run-${scenario.fileNodeId}`,
                    prompt: scenario.prompt,
                    aspect_ratio: "16:9",
                    input_file_node_ids: [],
                    output_file_node_id: scenario.fileNodeId,
                    output_content_type: "video/mp4",
                    output_url: scenario.resultUrl,
                    error_message: null,
                    created_at: "2024-01-01T00:00:00Z",
                  };

            const succeededProps = createDefaultProps({
              activeModelTab: scenario.category,
              modelTestSubmitting: false,
              modelTestImageRuns:
                scenario.category === "image" ? [run] : [],
              modelTestVideoRuns:
                scenario.category === "video" ? [run] : [],
            });
            const { container: c2, unmount: u2 } = render(
              <ModelTestModal {...succeededProps} />
            );

            // No spinner
            expect(c2.querySelector(".animate-spin")).not.toBeInTheDocument();

            // Result should be visible via VFS URL
            if (scenario.category === "image") {
              const img = screen.getByAltText("generated");
              expect(img).toHaveAttribute(
                "src",
                `/api/vfs/nodes/${scenario.fileNodeId}/download`
              );
            } else {
              const video = document.querySelector("video");
              expect(video).toBeTruthy();
              expect(video?.getAttribute("src")).toBe(
                `/api/vfs/nodes/${scenario.fileNodeId}/download`
              );
            }

            u2();
          } else {
            // failed
            const errorRun =
              scenario.category === "image"
                ? {
                    id: `run-err-${scenario.fileNodeId}`,
                    prompt: scenario.prompt,
                    resolution: "1024x1024",
                    input_file_node_ids: [],
                    output_file_node_id: null,
                    output_content_type: null,
                    output_url: null,
                    error_message: scenario.errorMessage,
                    created_at: "2024-01-01T00:00:00Z",
                  }
                : {
                    id: `run-err-${scenario.fileNodeId}`,
                    prompt: scenario.prompt,
                    aspect_ratio: "16:9",
                    input_file_node_ids: [],
                    output_file_node_id: null,
                    output_content_type: null,
                    output_url: null,
                    error_message: scenario.errorMessage,
                    created_at: "2024-01-01T00:00:00Z",
                  };

            const failedProps = createDefaultProps({
              activeModelTab: scenario.category,
              modelTestSubmitting: false,
              modelTestImageRuns:
                scenario.category === "image" ? [errorRun] : [],
              modelTestVideoRuns:
                scenario.category === "video" ? [errorRun] : [],
            });
            const { container: c3, unmount: u3 } = render(
              <ModelTestModal {...failedProps} />
            );

            // No spinner
            expect(c3.querySelector(".animate-spin")).not.toBeInTheDocument();

            // Error message should be displayed
            expect(
              screen.getByText(scenario.errorMessage)
            ).toBeInTheDocument();

            u3();
          }
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});
