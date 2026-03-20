const jsonMock = jest.fn();

jest.mock("next/server", () => ({
  NextResponse: {
    json: (...args: unknown[]) => jsonMock(...args),
  },
}));

jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "accessToken" ? { value: "token-123" } : undefined),
  }),
}));

import { GET, POST } from "@/app/api/batch-video/[...path]/route";

describe("batch-video api route preview-cards normalization", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jsonMock.mockReset();
    jsonMock.mockImplementation((data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }));
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 200,
          data: {
            job: { id: "job-1", title: "Job 1" },
            cards: [
              {
                asset_id: "asset-1",
                index: 0,
                card_thumbnail_url: "/api/v1/vfs/nodes/node-1/thumbnail",
                card_source_url: "/api/v1/vfs/nodes/node-1/download",
                prompt: "镜头一提示词",
                latest_task: null,
                latest_success: null,
                history: [],
              },
            ],
          },
        }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it("normalizes preview card VFS URLs to frontend proxy paths", async () => {
    const req = { nextUrl: { search: "", searchParams: new URLSearchParams() } };

    await GET(req as any, { params: Promise.resolve({ path: ["jobs", "job-1", "preview-cards"] }) });

    expect(jsonMock).toHaveBeenCalled();
    const payload = jsonMock.mock.calls[0][0] as any;
    expect(payload.data.cards[0].card_thumbnail_url).toBe("/api/vfs/nodes/node-1/thumbnail");
    expect(payload.data.cards[0].card_source_url).toBe("/api/vfs/nodes/node-1/download");
  });

  it("keeps assets/generate success payload as an array of created tasks", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 200,
          msg: "OK",
          data: [
            { asset_id: "asset-1", task_id: "task-1" },
            { asset_id: "asset-2", task_id: "task-2" },
          ],
        }),
    });

    const req = {
      headers: { get: () => "application/json" },
      json: async () => ({ asset_ids: ["asset-1", "asset-2"] }),
    };

    await POST(req as any, { params: Promise.resolve({ path: ["assets", "generate"] }) });

    expect(jsonMock).toHaveBeenCalled();
    const payload = jsonMock.mock.calls[0][0] as any;
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data).toEqual([
      { asset_id: "asset-1", task_id: "task-1" },
      { asset_id: "asset-2", task_id: "task-2" },
    ]);
  });
});
