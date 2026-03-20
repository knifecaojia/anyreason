import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type BatchVideoJobLike = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  name?: string | null;
  config?: {
    model?: string;
    duration?: number;
    resolution?: string;
    off_peak?: boolean;
  } | null;
  status?: string | null;
  total_assets?: number | null;
  card_count?: number | null;
  completed_assets?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BatchVideoAssetLike = {
  id: string;
  job_id?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  cropped_url?: string | null;
  prompt?: string | null;
  index?: number | null;
  status?: string | null;
  result_url?: string | null;
  error_message?: string | null;
  source_image_id?: string | null;
  slice_index?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BatchVideoPendingImageLike = {
  id: string;
  job_id?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  original_filename?: string | null;
  content_type?: string | null;
  mode?: string | null;
  linked_cell_key?: string | null;
  linked_cell_label?: string | null;
  processed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BatchVideoApiEnvelope = {
  code?: number;
  msg?: string;
  data?: unknown;
};

type BatchVideoPreviewCardLike = {
  asset_id: string;
  index?: number | null;
  card_thumbnail_url?: string | null;
  card_source_url?: string | null;
  prompt?: string | null;
  latest_task?: unknown;
  latest_success?: unknown;
  history?: unknown[];
};

function getApiBaseUrl() {
  return (
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
  );
}

function normalizeJob(project: BatchVideoJobLike) {
  return {
    id: project.id,
    user_id: project.user_id ?? "",
    title: project.title ?? project.name ?? "未命名任务",
    config: project.config ?? {
      model: "vidu",
      duration: 5,
      resolution: "1280x720",
      off_peak: false,
    },
    status: project.status ?? "draft",
    total_assets: project.total_assets ?? project.card_count ?? 0,
    completed_assets: project.completed_assets ?? 0,
    created_at: project.created_at,
    updated_at: project.updated_at ?? project.created_at,
  };
}

function normalizeAsset(card: BatchVideoAssetLike) {
  const normalizeVfsUrl = (url?: string | null) => {
    if (!url) return url;
    return url.replace(/^\/api\/v1\/vfs\//, "/api/vfs/");
  };

  return {
    id: card.id,
    job_id: card.job_id ?? "",
    source_url: normalizeVfsUrl(card.source_url),
    thumbnail_url: normalizeVfsUrl(card.thumbnail_url ?? card.cropped_url ?? card.source_url),
    prompt: card.prompt ?? "",
    index: card.index ?? 0,
    status: card.status === "processing" ? "generating" : card.status,
    result_url: card.result_url,
    error_message: card.error_message,
    source_image_id: card.source_image_id ?? null,
    slice_index: card.slice_index ?? null,
    created_at: card.created_at ?? null,
    updated_at: card.updated_at ?? null,
  };
}

function normalizePendingImage(item: BatchVideoPendingImageLike) {
  const normalizeVfsUrl = (url?: string | null) => {
    if (!url) return url;
    return url.replace(/^\/api\/v1\/vfs\//, "/api/vfs/");
  };

  return {
    id: item.id,
    job_id: item.job_id ?? "",
    source_url: normalizeVfsUrl(item.source_url),
    thumbnail_url: normalizeVfsUrl(item.thumbnail_url ?? item.source_url),
    original_filename: item.original_filename ?? null,
    content_type: item.content_type ?? null,
    mode: item.mode ?? "16:9",
    linked_cell_key: item.linked_cell_key ?? null,
    linked_cell_label: item.linked_cell_label ?? null,
    processed: Boolean(item.processed),
    created_at: item.created_at ?? null,
    updated_at: item.updated_at ?? null,
  };
}

function normalizePreviewCard(card: BatchVideoPreviewCardLike) {
  const normalizeVfsUrl = (url?: string | null) => {
    if (!url) return url;
    return url.replace(/^\/api\/v1\/vfs\//, "/api/vfs/");
  };

  return {
    ...card,
    card_thumbnail_url: normalizeVfsUrl(card.card_thumbnail_url),
    card_source_url: normalizeVfsUrl(card.card_source_url),
  };
}

function getPathSegments(path: string | string[]) {
  return Array.isArray(path) ? path : [path];
}

function mapPath(method: string, path: string | string[]) {
  const segments = getPathSegments(path);

  if (segments[0] === "history") {
    return { upstreamPath: "history", mode: "history-query" as const };
  }

  if (segments[0] === "jobs") {
    if (segments.length === 1) {
      return { upstreamPath: "jobs", mode: "jobs-list" as const };
    }

    if (segments.length === 2) {
      return {
        upstreamPath: `jobs/${segments[1]}`,
        mode: method === "DELETE" ? ("job-delete" as const) : ("job-detail" as const),
      };
    }

    if (segments.length === 3 && segments[2] === "assets") {
      return { upstreamPath: `jobs/${segments[1]}/assets`, mode: "job-assets" as const };
    }

    if (segments.length === 4 && segments[2] === "assets" && segments[3] === "upload") {
      return { upstreamPath: `jobs/${segments[1]}/assets/upload`, mode: "job-assets-upload" as const };
    }

    if (segments.length === 3 && segments[2] === "pending-images") {
      return { upstreamPath: `jobs/${segments[1]}/pending-images`, mode: "job-pending-images" as const };
    }

    if (segments.length === 3 && segments[2] === "import-excel") {
      return { upstreamPath: `jobs/${segments[1]}/import-excel`, mode: "job-import-excel" as const };
    }
  }

  if (segments[0] === "assets") {
    if (segments.length === 2 && segments[1] === "generate") {
      return { upstreamPath: "assets/generate", mode: "asset-generate" as const };
    }

    if (segments.length === 2 && segments[1] === "polish") {
      return { upstreamPath: "assets/polish", mode: "asset-polish" as const };
    }

    if (segments.length === 2) {
      return { upstreamPath: `assets/${segments[1]}`, mode: "asset-detail" as const };
    }

    if (segments.length === 3 && segments[1] === "batch-update-prompts") {
      return { upstreamPath: "assets/batch-update-prompts", mode: "asset-batch-update-prompts" as const };
    }
  }

  if (segments[0] === "pending-images") {
    if (segments.length === 2) {
      return { upstreamPath: `pending-images/${segments[1]}`, mode: "pending-image-detail" as const };
    }
  }

  if (segments[0] === "cards" && segments[1] === "batch-update-prompts") {
    return { upstreamPath: "assets/batch-update-prompts", mode: "asset-batch-update-prompts" as const };
  }

  return { upstreamPath: segments.join("/"), mode: "passthrough" as const };
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fileToDataUrl(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${file.type || "image/png"};base64,${base64}`;
}

function transformResponse(mode: string, data: unknown) {
  if (!data || typeof data !== "object") return data;

  const envelope = data as BatchVideoApiEnvelope;

  if (mode === "jobs-list" && Array.isArray(envelope.data)) {
    const items = envelope.data.map((item) => normalizeJob(item as BatchVideoJobLike));
    return { ...envelope, data: { items, total: items.length } };
  }

  if ((mode === "job-detail" || mode === "job-delete") && envelope.data) {
    return { ...envelope, data: normalizeJob(envelope.data as BatchVideoJobLike) };
  }

  if (mode === "job-assets" && Array.isArray(envelope.data)) {
    return { ...envelope, data: envelope.data.map((item) => normalizeAsset(item as BatchVideoAssetLike)) };
  }

  if (mode === "job-pending-images" && Array.isArray(envelope.data)) {
    return { ...envelope, data: envelope.data.map((item) => normalizePendingImage(item as BatchVideoPendingImageLike)) };
  }

  if (mode === "history-query" && Array.isArray(envelope.data)) {
    return envelope;
  }

  if (
    mode === "passthrough" &&
    envelope.data &&
    typeof envelope.data === "object" &&
    "cards" in (envelope.data as Record<string, unknown>) &&
    Array.isArray((envelope.data as { cards?: unknown[] }).cards)
  ) {
    const preview = envelope.data as { job?: unknown; cards: BatchVideoPreviewCardLike[] };
    return {
      ...envelope,
      data: {
        ...preview,
        cards: preview.cards.map((item) => normalizePreviewCard(item)),
      },
    };
  }

  if (mode === "asset-detail" && envelope.data) {
    return { ...envelope, data: normalizeAsset(envelope.data as BatchVideoAssetLike) };
  }

  if (mode === "pending-image-detail" && envelope.data) {
    return { ...envelope, data: normalizePendingImage(envelope.data as BatchVideoPendingImageLike) };
  }

  if (mode === "job-assets-upload" && Array.isArray(envelope.data)) {
    return { ...envelope, data: envelope.data.map((item) => normalizeAsset(item as BatchVideoAssetLike)) };
  }

  if (mode === "asset-generate" && Array.isArray(envelope.data)) {
    return envelope;
  }

  if (mode === "jobs-list" && envelope.code === 200 && !envelope.data) {
    return { ...envelope, data: { items: [], total: 0 } };
  }

  return envelope;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string | string[] }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return NextResponse.json(
      { code: 401, msg: "Unauthorized", data: null },
      { status: 401 }
    );
  }

  const { path } = await params;
  const { upstreamPath, mode } = mapPath("GET", path);
  const searchParams = request.nextUrl.search.toString();
  const historyAssetId = mode === "history-query" ? request.nextUrl.searchParams.get("asset_id") : null;
  const url =
    mode === "history-query" && historyAssetId
      ? `${getApiBaseUrl()}/api/v1/batch-video/history?asset_id=${encodeURIComponent(historyAssetId)}`
      : `${getApiBaseUrl()}/api/v1/batch-video/${upstreamPath}${searchParams ? `?${searchParams}` : ""}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await parseJsonSafe(response);
  return NextResponse.json(transformResponse(mode, data), { status: response.status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string | string[] }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return NextResponse.json(
      { code: 401, msg: "Unauthorized", data: null },
      { status: 401 }
    );
  }

  const { path } = await params;
  const { upstreamPath, mode } = mapPath("POST", path);
  const url = `${getApiBaseUrl()}/api/v1/batch-video/${upstreamPath}`;

  const contentType = request.headers.get("content-type") || "";
  let body: string | FormData = "";
  let fetchOptions: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  if (contentType.includes("application/json")) {
    const payload = await request.json();
    const mappedPayload =
      mode === "jobs-list"
        ? {
            title: payload.title ?? payload.name ?? "未命名任务",
            config: payload.config ?? {},
          }
        : payload;
    body = JSON.stringify(mappedPayload);
    fetchOptions = {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        "Content-Type": "application/json",
      },
      body,
    };
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();

    if (mode === "job-assets-upload") {
      const files = formData.getAll("files").filter((v): v is File => v instanceof File);
      const images = await Promise.all(
        files.map(async (file) => ({
          dataUrl: await fileToDataUrl(file),
        }))
      );

      body = JSON.stringify({ images });
      fetchOptions = {
        ...fetchOptions,
        headers: {
          ...fetchOptions.headers,
          "Content-Type": "application/json",
        },
        body,
      };
    } else {
      body = formData;
      fetchOptions.body = body;
    }
  } else {
    body = await request.text();
    fetchOptions.body = body;
  }

  const timeoutMs = mode === "asset-generate" ? 60000 : 10000;
  const response = await fetchWithTimeout(url, fetchOptions, timeoutMs);

  const data = await parseJsonSafe(response);
  return NextResponse.json(transformResponse(mode, data), { status: response.status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string | string[] }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return NextResponse.json(
      { code: 401, msg: "Unauthorized", data: null },
      { status: 401 }
    );
  }

  const { path } = await params;
  const { upstreamPath, mode } = mapPath("PATCH", path);
  const url = `${getApiBaseUrl()}/api/v1/batch-video/${upstreamPath}`;
  const body = JSON.stringify(await request.json());

  const response = await fetchWithTimeout(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const data = await parseJsonSafe(response);
  return NextResponse.json(transformResponse(mode, data), { status: response.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string | string[] }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return NextResponse.json(
      { code: 401, msg: "Unauthorized", data: null },
      { status: 401 }
    );
  }

  const { path } = await params;
  const { upstreamPath, mode } = mapPath("DELETE", path);

  const url = `${getApiBaseUrl()}/api/v1/batch-video/${upstreamPath}`;

  const response = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await parseJsonSafe(response);
  return NextResponse.json(transformResponse(mode, data), { status: response.status });
}
