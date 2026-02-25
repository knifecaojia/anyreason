/**
 * Unit tests for the frontend async task submit flow.
 * Feature: model-test-async-tasks
 *
 * Tests the ModelTestModal component's rendering of async task states:
 * - Submitted state (modelTestSubmitting = true) shows "任务已提交" indicator
 * - Succeeded task results (image/video runs) are displayed correctly
 * - Failed task results (error_message) are displayed correctly
 * - Progress/submitting state shows loading indicator
 *
 * Validates: Requirements 4.1, 4.3, 4.4, 4.5
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

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
function createDefaultProps(overrides: Partial<React.ComponentProps<typeof ModelTestModal>> = {}) {
  const noop = () => {};
  const noopAsync = async () => {};
  return {
    open: true,
    onClose: noop,
    activeModelTab: "image" as any,
    aiModelConfigs: [{ id: "cfg-1", manufacturer: "TestVendor", model: "test-model" }],
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

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("ModelTestModal - Async Task Submit Flow", () => {
  /* ---- Requirement 4.1: 提交后显示"任务已提交"状态 ---- */
  describe("Submitted state (Requirement 4.1)", () => {
    it("shows '图片生成任务已提交，请等待…' when modelTestSubmitting is true for image tab", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestSubmitting: true,
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("图片生成任务已提交，请等待…")).toBeInTheDocument();
    });

    it("shows '视频生成任务已提交，请等待…' when modelTestSubmitting is true for video tab", () => {
      const props = createDefaultProps({
        activeModelTab: "video",
        modelTestSubmitting: true,
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("视频生成任务已提交，请等待…")).toBeInTheDocument();
    });

    it("does not show submitted indicator when modelTestSubmitting is false", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestSubmitting: false,
      });
      render(<ModelTestModal {...props} />);

      expect(screen.queryByText("图片生成任务已提交，请等待…")).not.toBeInTheDocument();
    });

    it("disables model config select during submission", () => {
      const props = createDefaultProps({
        modelTestSubmitting: true,
      });
      render(<ModelTestModal {...props} />);

      const select = screen.getByRole("combobox");
      expect(select).toBeDisabled();
    });

    it("disables 清空对话 button during submission", () => {
      const props = createDefaultProps({
        modelTestSubmitting: true,
      });
      render(<ModelTestModal {...props} />);

      const resetBtn = screen.getByText("清空对话");
      expect(resetBtn.closest("button")).toBeDisabled();
    });
  });

  /* ---- Requirement 4.3: succeeded 事件触发结果展示 ---- */
  describe("Succeeded result display (Requirement 4.3)", () => {
    it("displays image result when imageRun has output_file_node_id with image content type", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestImageRuns: [
          {
            id: "run-1",
            prompt: "test prompt",
            resolution: "1024x1024",
            input_file_node_ids: [],
            output_file_node_id: "file-node-123",
            output_content_type: "image/png",
            output_url: null,
            error_message: null,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      // The image should be rendered with the VFS download URL
      const img = screen.getByAltText("generated");
      expect(img).toHaveAttribute(
        "src",
        "/api/vfs/nodes/file-node-123/download"
      );
    });

    it("displays video result when videoRun has output_file_node_id with video content type", () => {
      const props = createDefaultProps({
        activeModelTab: "video",
        modelTestVideoRuns: [
          {
            id: "run-v1",
            prompt: "test video prompt",
            aspect_ratio: "16:9",
            input_file_node_ids: [],
            output_file_node_id: "video-node-456",
            output_content_type: "video/mp4",
            output_url: null,
            error_message: null,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      // Video element should be rendered with the VFS download URL
      const video = document.querySelector("video");
      expect(video).toBeTruthy();
      expect(video?.getAttribute("src")).toBe("/api/vfs/nodes/video-node-456/download");
    });

    it("displays download link when output_file_node_id exists but content type is not image", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestImageRuns: [
          {
            id: "run-2",
            prompt: "test prompt",
            resolution: "1024x1024",
            input_file_node_ids: [],
            output_file_node_id: "file-node-789",
            output_content_type: "application/octet-stream",
            output_url: null,
            error_message: null,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("下载生成结果")).toBeInTheDocument();
    });

    it("displays original URL link when only output_url is available", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestImageRuns: [
          {
            id: "run-3",
            prompt: "test prompt",
            resolution: "1024x1024",
            input_file_node_ids: [],
            output_file_node_id: null,
            output_content_type: null,
            output_url: "https://example.com/generated.png",
            error_message: null,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("打开原始链接")).toBeInTheDocument();
    });

    it("shows prompt text in the user bubble for image runs", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestImageRuns: [
          {
            id: "run-4",
            prompt: "a beautiful sunset over mountains",
            resolution: "1024x1024",
            input_file_node_ids: [],
            output_file_node_id: "file-1",
            output_content_type: "image/png",
            output_url: null,
            error_message: null,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("a beautiful sunset over mountains")).toBeInTheDocument();
    });
  });

  /* ---- Requirement 4.4: failed 事件触发错误展示 ---- */
  describe("Failed result display (Requirement 4.4)", () => {
    it("displays error message from imageRun error_message", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestImageRuns: [
          {
            id: "run-err-1",
            prompt: "test prompt",
            resolution: "1024x1024",
            input_file_node_ids: [],
            output_file_node_id: null,
            output_content_type: null,
            output_url: null,
            error_message: "AI Gateway 调用失败: 模型不可用",
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("AI Gateway 调用失败: 模型不可用")).toBeInTheDocument();
    });

    it("displays error message from videoRun error_message", () => {
      const props = createDefaultProps({
        activeModelTab: "video",
        modelTestVideoRuns: [
          {
            id: "run-err-v1",
            prompt: "test video prompt",
            aspect_ratio: "16:9",
            input_file_node_ids: [],
            output_file_node_id: null,
            output_content_type: null,
            output_url: null,
            error_message: "视频生成超时",
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("视频生成超时")).toBeInTheDocument();
    });

    it("displays global error from modelTestError prop", () => {
      const props = createDefaultProps({
        modelTestError: "任务执行失败",
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("任务执行失败")).toBeInTheDocument();
    });

    it("shows empty response text when run has no output and no error", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestImageRuns: [
          {
            id: "run-empty-1",
            prompt: "test prompt",
            resolution: "1024x1024",
            input_file_node_ids: [],
            output_file_node_id: null,
            output_content_type: null,
            output_url: null,
            error_message: null,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("（空响应）")).toBeInTheDocument();
    });
  });

  /* ---- Requirement 4.5: 进度百分比显示 ---- */
  describe("Progress/loading indicator (Requirement 4.5)", () => {
    it("shows loading spinner during image submission", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestSubmitting: true,
      });
      const { container } = render(<ModelTestModal {...props} />);

      // The LoaderCircle component renders with animate-spin class
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("shows loading spinner during video submission", () => {
      const props = createDefaultProps({
        activeModelTab: "video",
        modelTestSubmitting: true,
      });
      const { container } = render(<ModelTestModal {...props} />);

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("passes submitting state to ImagePromptComposer", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestSubmitting: true,
        modelTestImagePrompt: "test",
      });
      render(<ModelTestModal {...props} />);

      expect(screen.getByTestId("composer-submitting")).toBeInTheDocument();
    });

    it("does not show submitting indicator in composer when not submitting", () => {
      const props = createDefaultProps({
        activeModelTab: "image",
        modelTestSubmitting: false,
        modelTestImagePrompt: "test",
      });
      render(<ModelTestModal {...props} />);

      expect(screen.queryByTestId("composer-submitting")).not.toBeInTheDocument();
    });

    it("disables new session button during submission", () => {
      const props = createDefaultProps({
        modelTestSubmitting: true,
      });
      render(<ModelTestModal {...props} />);

      const newBtn = screen.getByText("新建");
      expect(newBtn.closest("button")).toBeDisabled();
    });
  });

  /* ---- Modal visibility ---- */
  describe("Modal visibility", () => {
    it("renders nothing when open is false", () => {
      const props = createDefaultProps({ open: false });
      const { container } = render(<ModelTestModal {...props} />);

      expect(container.innerHTML).toBe("");
    });

    it("renders modal content when open is true", () => {
      const props = createDefaultProps({ open: true });
      render(<ModelTestModal {...props} />);

      expect(screen.getByText("模型测试")).toBeInTheDocument();
    });
  });
});
