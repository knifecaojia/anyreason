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
  useAIModelList: (category: string) => {
    if (category === "text") {
      return {
        models: [
          {
            configId: "text-model-1",
            displayName: "deepseek/deepseek-chat",
            manufacturer: "deepseek",
            model: "deepseek-chat",
          },
        ],
        loading: false,
        currentConfigId: null,
        selectedConfigId: "text-model-1",
        selectModel: jest.fn(),
      };
    }
    return { models: [], loading: false, currentConfigId: null, selectedConfigId: null, selectModel: jest.fn() };
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function mockJson(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => data });
}

describe("BatchVideo storyboard pending-image filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/batch-video/jobs") {
        return mockJson({
          code: 200,
          data: {
            items: [
              {
                id: "job-1",
                user_id: "user-1",
                title: "Job One",
                config: { duration: 3, resolution: "1280x720" },
                status: "draft",
                total_assets: 3,
                completed_assets: 0,
                created_at: "2026-03-16T00:00:00Z",
                updated_at: "2026-03-16T00:00:00Z",
              },
            ],
          },
        });
      }
      if (url === "/api/batch-video/jobs/job-1/assets") {
        return mockJson({
          code: 200,
          data: [
            {
              id: "asset-1",
              job_id: "job-1",
              source_url: "/img/a1.jpg",
              thumbnail_url: "/img/a1.jpg",
              prompt: "关联图片1-card1",
              index: 0,
              status: "pending",
              source_image_id: "pending-1",
              slice_index: 0,
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:00Z",
            },
            {
              id: "asset-2",
              job_id: "job-1",
              source_url: "/img/a2.jpg",
              thumbnail_url: "/img/a2.jpg",
              prompt: "关联图片1-card2",
              index: 1,
              status: "pending",
              source_image_id: "pending-1",
              slice_index: 1,
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:00Z",
            },
            {
              id: "asset-3",
              job_id: "job-1",
              source_url: "/img/a3.jpg",
              thumbnail_url: "/img/a3.jpg",
              prompt: "关联图片2-card1",
              index: 2,
              status: "pending",
              source_image_id: "pending-2",
              slice_index: 0,
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:00Z",
            },
          ],
        });
      }
      if (url === "/api/batch-video/jobs/job-1/pending-images") {
        return mockJson({
          code: 200,
          data: [
            {
              id: "pending-1",
              job_id: "job-1",
              source_url: "/img/p1.jpg",
              thumbnail_url: "/img/p1.jpg",
              mode: "16:9",
              processed: false,
              linked_cell_key: null,
              linked_cell_label: null,
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:00Z",
            },
            {
              id: "pending-2",
              job_id: "job-1",
              source_url: "/img/p2.jpg",
              thumbnail_url: "/img/p2.jpg",
              mode: "16:9",
              processed: false,
              linked_cell_key: null,
              linked_cell_label: null,
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:00Z",
            },
          ],
        });
      }
      if (url === "/api/batch-video/jobs/job-1/preview-cards") {
        return mockJson({ code: 200, data: { job: {}, cards: [] } });
      }
      return mockJson({ code: 200, data: [] });
    });
  });

  it("filters middle cards by clicked pending image and supports clearing filter", async () => {
    await act(async () => {
      render(<BatchVideoPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "分镜准备" }));
    });

    await waitFor(() => {
      expect(screen.getByText("关联图片1-card1")).toBeInTheDocument();
      expect(screen.getByText("关联图片2-card1")).toBeInTheDocument();
    });

    const pendingFilterButton = screen.getByRole("button", { name: /筛选待处理图片 pending-1/i });
    fireEvent.click(pendingFilterButton);

    expect(screen.getByText("关联图片1-card1")).toBeInTheDocument();
    expect(screen.getByText("关联图片1-card2")).toBeInTheDocument();
    expect(screen.queryByText("关联图片2-card1")).not.toBeInTheDocument();
    expect(screen.getByText("已按待处理图片过滤")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /显示全部/i }));

    expect(screen.getByText("关联图片2-card1")).toBeInTheDocument();

    fireEvent.click(pendingFilterButton);
    fireEvent.click(pendingFilterButton);

    expect(screen.getByText("关联图片2-card1")).toBeInTheDocument();
  });

  it("opens two-stage AI polish flow on 分镜准备 and warns for line-count mismatch", async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/batch-video/jobs") {
        return mockJson({
          code: 200,
          data: {
            items: [
              {
                id: "job-1",
                user_id: "user-1",
                title: "Job One",
                config: { duration: 3, resolution: "1280x720" },
                status: "draft",
                total_assets: 2,
                completed_assets: 0,
                created_at: "2026-03-16T00:00:00Z",
                updated_at: "2026-03-16T00:00:00Z",
              },
            ],
          },
        });
      }
      if (url === "/api/batch-video/jobs/job-1/assets") {
        return mockJson({
          code: 200,
          data: [
            {
              id: "asset-1",
              job_id: "job-1",
              source_url: "/img/a1.jpg",
              thumbnail_url: "/img/a1.jpg",
              prompt: "原始提示词1",
              index: 0,
              status: "pending",
              source_image_id: "pending-1",
              slice_index: 0,
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:00Z",
            },
            {
              id: "asset-2",
              job_id: "job-1",
              source_url: "/img/a2.jpg",
              thumbnail_url: "/img/a2.jpg",
              prompt: "原始提示词2",
              index: 1,
              status: "pending",
              source_image_id: "pending-1",
              slice_index: 1,
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:00Z",
            },
          ],
        });
      }
      if (url === "/api/batch-video/jobs/job-1/pending-images") {
        return mockJson({ code: 200, data: [] });
      }
      if (url === "/api/batch-video/jobs/job-1/preview-cards") {
        return mockJson({ code: 200, data: { job: {}, cards: [] } });
      }
      if (url === "/api/ai/text/chat") {
        return mockJson({
          code: 200,
          data: {
            output_text: "只返回一行",
            raw: {},
          },
        });
      }
      if (url === "/api/batch-video/cards/batch-update-prompts") return mockJson({ code: 200, data: [] });
      return mockJson({ code: 200, data: [] });
    });

    await act(async () => {
      render(<BatchVideoPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "分镜准备" }));
    });

    const openPolish = await screen.findByRole("button", { name: /AI 润色/i });
    expect(openPolish).toBeInTheDocument();

    const selectButtons = screen.getAllByRole("button").filter((btn) => btn.className.includes("rounded-full border"));
    fireEvent.click(selectButtons[0]!);

    await act(async () => {
      fireEvent.click(openPolish);
    });

    expect(await screen.findByText("提示词模板编辑")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("文本模型"), { target: { value: "text-model-1" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /开始 AI 润色/i }));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/ai/text/chat",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    expect(screen.getByText(/AI 返回行数与所选分镜数不一致/)).toBeInTheDocument();
  });
});
