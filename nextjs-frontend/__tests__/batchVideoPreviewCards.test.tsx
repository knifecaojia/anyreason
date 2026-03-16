import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import BatchVideoPage from "@/app/(aistudio)/batch-video/page";

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/hooks/useAIModelList", () => ({
  useAIModelList: () => ({ models: [] }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const jobsPayload = {
  code: 200,
  data: {
    items: [
      {
        id: "job-1",
        user_id: "user-1",
        title: "Job One",
        config: { duration: 3, resolution: "1280x720" },
        status: "processing",
        total_assets: 2,
        completed_assets: 1,
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      },
    ],
  },
};

const assetsPayload = {
  code: 200,
  data: [
    {
      id: "asset-1",
      job_id: "job-1",
      source_url: "/img/source-1.jpg",
      thumbnail_url: "/img/thumb-1.jpg",
      prompt: "镜头一提示词",
      index: 0,
      status: "completed",
      result_url: "https://cdn.example.com/a1.mp4",
      created_at: "2026-03-16T00:00:00Z",
      updated_at: "2026-03-16T00:00:00Z",
    },
  ],
};

const pendingImagesPayload = { code: 200, data: [] };

const previewCardsPayload = {
  code: 200,
  data: {
    job: jobsPayload.data.items[0],
    cards: [
      {
        asset_id: "asset-1",
        index: 0,
        card_thumbnail_url: "/img/thumb-1.jpg",
        card_source_url: "/img/source-1.jpg",
        prompt: "镜头一提示词",
        latest_task: {
          task_id: "task-success",
          status: "succeeded",
          progress: 100,
          created_at: "2026-03-16T00:00:00Z",
          updated_at: "2026-03-16T00:00:10Z",
          completed_at: "2026-03-16T00:00:10Z",
          result_url: "https://cdn.example.com/a1.mp4",
          error_message: null,
          external_task_id: "vidu-1",
        },
        latest_success: {
          result_url: "https://cdn.example.com/a1.mp4",
          completed_at: "2026-03-16T00:00:10Z",
        },
        history: [
          {
            task_id: "task-success",
            status: "succeeded",
            progress: 100,
            created_at: "2026-03-16T00:00:00Z",
            updated_at: "2026-03-16T00:00:10Z",
            completed_at: "2026-03-16T00:00:10Z",
            result_url: "https://cdn.example.com/a1.mp4",
            error_message: null,
            external_task_id: "vidu-1",
          },
          {
            task_id: "task-failed",
            status: "failed",
            progress: 100,
            created_at: "2026-03-15T00:00:00Z",
            updated_at: "2026-03-15T00:00:10Z",
            completed_at: "2026-03-15T00:00:10Z",
            result_url: null,
            error_message: "前一次失败",
            external_task_id: "vidu-0",
          },
        ],
      },
      {
        asset_id: "asset-2",
        index: 1,
        card_thumbnail_url: "/img/thumb-2.jpg",
        card_source_url: "/img/source-2.jpg",
        prompt: "镜头二提示词",
        latest_task: {
          task_id: "task-running",
          status: "waiting_external",
          progress: 10,
          created_at: "2026-03-16T01:00:00Z",
          updated_at: "2026-03-16T01:00:10Z",
          completed_at: null,
          result_url: null,
          error_message: null,
          external_task_id: "vidu-2",
        },
        latest_success: null,
        history: [
          {
            task_id: "task-running",
            status: "waiting_external",
            progress: 10,
            created_at: "2026-03-16T01:00:00Z",
            updated_at: "2026-03-16T01:00:10Z",
            completed_at: null,
            result_url: null,
            error_message: null,
            external_task_id: "vidu-2",
          },
        ],
      },
    ],
  },
};

function mockJson(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => data });
}

describe("BatchVideoPage video preview cards", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/batch-video/jobs") return mockJson(jobsPayload);
      if (url === "/api/batch-video/jobs/job-1/assets") return mockJson(assetsPayload);
      if (url === "/api/batch-video/jobs/job-1/pending-images") return mockJson(pendingImagesPayload);
      if (url === "/api/batch-video/jobs/job-1/preview-cards") return mockJson(previewCardsPayload);
      if (url === "/api/batch-video/tasks/task-running/stop") return mockJson({ code: 200, data: { task_id: "task-running", asset_id: "asset-2", status: "canceled", external_cancel: { attempted: true, supported: false, message: "provider_cancel_not_supported" } } });
      if (url === "/api/batch-video/tasks/task-failed/retry") return mockJson({ code: 200, data: { task_id: "task-retry-new", asset_id: "asset-1", status: "pending" } });
      return mockJson({ code: 200, data: [] });
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders preview cards, expandable history, and task actions", async () => {
    await act(async () => {
      render(<BatchVideoPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "视频预览" }));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/batch-video/jobs/job-1/preview-cards");
    });

    expect(screen.getByText("镜头一提示词")).toBeInTheDocument();
    expect(screen.getByText("镜头二提示词")).toBeInTheDocument();
    expect(screen.getAllByText("云端生成中").length).toBeGreaterThan(0);
    expect(screen.getByText("已完成" )).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /展开任务历史/i })[0]!);
    expect(screen.getByText("task-failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /停止/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/batch-video/tasks/task-running/stop", expect.objectContaining({ method: "POST" }));
    });

    fireEvent.click(screen.getAllByRole("button", { name: /重试/i })[0]!);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/batch-video/tasks/task-failed/retry", expect.objectContaining({ method: "POST" }));
    });
  });

  it("falls back to source image when preview thumbnail fails to load", async () => {
    await act(async () => {
      render(<BatchVideoPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "视频预览" }));
    });

    const thumb = await screen.findByAltText("镜头一提示词");
    expect(thumb).toHaveAttribute("src", "/img/thumb-1.jpg");

    fireEvent.error(thumb);

    await waitFor(() => {
      expect(thumb).toHaveAttribute("src", "/img/source-1.jpg");
    });
  });

  it("auto-refreshes preview cards while there are cloud-running tasks and stops after success", async () => {
    let previewCallCount = 0;
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/batch-video/jobs") return mockJson(jobsPayload);
      if (url === "/api/batch-video/jobs/job-1/assets") return mockJson(assetsPayload);
      if (url === "/api/batch-video/jobs/job-1/pending-images") return mockJson(pendingImagesPayload);
      if (url === "/api/batch-video/jobs/job-1/preview-cards") {
        previewCallCount += 1;
        if (previewCallCount === 1) {
          return mockJson(previewCardsPayload);
        }
        return mockJson({
          code: 200,
          data: {
            ...previewCardsPayload.data,
            cards: previewCardsPayload.data.cards.map((card) =>
              card.asset_id === "asset-2"
                ? {
                    ...card,
                    latest_task: {
                      ...card.latest_task,
                      status: "succeeded",
                      progress: 100,
                      result_url: "https://cdn.example.com/a2.mp4",
                      completed_at: "2026-03-16T01:00:20Z",
                    },
                    latest_success: {
                      result_url: "https://cdn.example.com/a2.mp4",
                      completed_at: "2026-03-16T01:00:20Z",
                    },
                    history: [
                      {
                        ...card.history[0],
                        status: "succeeded",
                        progress: 100,
                        result_url: "https://cdn.example.com/a2.mp4",
                        completed_at: "2026-03-16T01:00:20Z",
                      },
                    ],
                  }
                : card
            ),
          },
        });
      }
      if (url === "/api/batch-video/tasks/task-running/stop") return mockJson({ code: 200, data: { task_id: "task-running", asset_id: "asset-2", status: "canceled", external_cancel: { attempted: true, supported: false, message: "provider_cancel_not_supported" } } });
      if (url === "/api/batch-video/tasks/task-failed/retry") return mockJson({ code: 200, data: { task_id: "task-retry-new", asset_id: "asset-1", status: "pending" } });
      return mockJson({ code: 200, data: [] });
    });

    await act(async () => {
      render(<BatchVideoPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "视频预览" }));
    });

    expect(screen.getAllByText("云端生成中").length).toBeGreaterThan(0);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(previewCallCount).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("已完成").length).toBeGreaterThanOrEqual(2);
    });

    const callsAfterSuccess = previewCallCount;

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    expect(previewCallCount).toBe(callsAfterSuccess);
  });
});
