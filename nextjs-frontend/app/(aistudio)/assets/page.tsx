"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Image,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tag,
  User,
  Wand2,
  X,
  FileText,
  Save,
  CheckCircle,
  Star,
  Trash2,
  Settings,
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  GripVertical,
  Square,
  CheckSquare,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ASSETS } from "@/lib/aistudio/constants";
import type { Asset, AssetType } from "@/lib/aistudio/types";
import { ImagePromptComposer } from "@/components/aistudio/ImagePromptComposer";
import { getCaretAbsoluteCoordinates } from "@/lib/utils/caret-coordinates";

type VfsNode = {
  id: string;
  parent_id?: string | null;
  name: string;
  is_folder: boolean;
  content_type?: string | null;
  size_bytes?: number;
  created_at?: string;
  updated_at?: string;
};

type AIModelConfig = {
  id: string;
  category: "text" | "image" | "video";
  manufacturer: string;
  model: string;
  enabled: boolean;
};

type GeneratedImage = {
  id: string;
  url: string;
  prompt: string;
  createdAt: number;
  nodeId?: string;
};

type ScriptItem = {
  id: string;
  title: string;
};

type EpisodeRow = {
  id: string;
  episode_code: string;
  episode_number: number;
  title?: string | null;
  asset_root_node_id?: string | null;
  storyboard_root_node_id?: string | null;
};

export function stripMarkdownMetadata(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n/g, "\n");
  let lines = text.split("\n");
  if (lines[0] && lines[0].charCodeAt(0) === 0xfeff) {
    lines[0] = lines[0].slice(1);
  }
  const firstNonEmpty = lines.findIndex((line) => line.trim() !== "");
  if (firstNonEmpty !== -1 && lines[firstNonEmpty].trim() === "---") {
    const endIndex = lines.slice(firstNonEmpty + 1).findIndex((line) => line.trim() === "---");
    lines = endIndex === -1 ? lines.slice(firstNonEmpty + 1) : lines.slice(firstNonEmpty + endIndex + 2);
  }
  const isMarkdownLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return /^(#{1,6}\s|[-*+]\s+|\d+\.\s+|>\s+|```|`{3}|!\[|\[.+\]\(.+\))/.test(trimmed);
  };
  const isMetadataLine = (line: string) => /^[a-z_][a-z0-9_]*\s*:\s*/.test(line.trim());
  let start = 0;
  for (; start < lines.length; start += 1) {
    const line = lines[start];
    if (isMarkdownLine(line)) break;
    if (!line.trim()) continue;
    if (isMetadataLine(line)) continue;
    break;
  }
  return lines.slice(start).join("\n").trim();
}

export function deriveAssetIdFromNodeName(nodeName: string, assets: Asset[]): string | null {
  if (!nodeName) return null;
  const normalizeName = (value: string) => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    return trimmed
      .replace(/\\/g, "_")
      .replace(/\//g, "_")
      .replace(/\s+/g, "_")
      .replace(/[<>:"|?*]+/g, "_")
      .replace(/[._-]+$/g, "")
      .replace(/^[._-]+/g, "");
  };
  const base = nodeName.replace(/\.md$/i, "");
  const parts = base.split("_");
  if (parts.length > 1) {
    const prefix = parts[0];
    const shouldUseAssetIdPrefix =
      parts.length > 2 && /^[A-Za-z]+$/.test(parts[0]) && /^\d+$/.test(parts[1]);
    const assetIdCandidate = shouldUseAssetIdPrefix ? `${parts[0]}_${parts[1]}` : parts[0];
    const restName = shouldUseAssetIdPrefix ? parts.slice(2).join("_") : parts.slice(1).join("_");
    const assetIdMatch = assets.find((a) => a.assetId && a.assetId === assetIdCandidate);
    if (assetIdMatch) return assetIdMatch.id;
    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prefix);
    if (uuidLike) return prefix;
    const prefixMap: Record<string, AssetType> = {
      character: "CHARACTER",
      prop: "PROP",
      location: "SCENE",
      scene: "SCENE",
      vfx: "EFFECT",
      effect: "EFFECT",
    };
    const mappedType = prefixMap[prefix.toLowerCase()];
    if (mappedType) {
      const matched = assets.find((a) => a.type === mappedType && normalizeName(a.name) === restName);
      if (matched) return matched.id;
    }
  }
  const normalizedBase = normalizeName(base);
  const directMatch = assets.find((a) => normalizeName(a.name) === normalizedBase);
  return directMatch ? directMatch.id : null;
}

type HierarchyAssetResource = {
  id?: string;
  meta_data?: { file_node_id?: string | null } | null;
};

type HierarchyAsset = {
  id: string;
  asset_id: string;
  name: string;
  type: string;
  resources?: HierarchyAssetResource[];
};

type HierarchyEpisode = {
  assets?: HierarchyAsset[];
};

export function mapHierarchyAssets(episodes: HierarchyEpisode[]): Asset[] {
  const map = new Map<string, Asset>();
  const typeMap: Record<string, AssetType> = {
    character: "CHARACTER",
    scene: "SCENE",
    location: "SCENE",
    prop: "PROP",
    vfx: "EFFECT",
    effect: "EFFECT",
  };
  episodes.forEach((ep) => {
    (ep.assets || []).forEach((asset) => {
      const mappedType = typeMap[asset.type?.toLowerCase?.() || ""];
      if (!mappedType) return;
      const existing = map.get(asset.id);
      const resources = (asset.resources || [])
        .map((r) => {
          const nodeId = r.meta_data?.file_node_id || "";
          return nodeId ? { id: r.id || nodeId, thumbnail: `/api/vfs/nodes/${nodeId}/download` } : null;
        })
        .filter((r): r is { id: string; thumbnail: string } => !!r);
      if (existing) {
        if (!existing.resources || existing.resources.length === 0) {
          existing.resources = resources;
        }
        return;
      }
      map.set(asset.id, {
        id: asset.id,
        assetId: asset.asset_id,
        name: asset.name,
        type: mappedType,
        thumbnail: "",
        tags: [],
        createdAt: new Date().toISOString(),
        resources,
      });
    });
  });
  return Array.from(map.values());
}

export function resolveTargetAssetId({
  selectedDraftId,
  targetAssetId,
  assets,
}: {
  selectedDraftId: string | null;
  targetAssetId: string | null;
  assets: Asset[];
}): string | null {
  if (selectedDraftId) return selectedDraftId;
  if (targetAssetId) return targetAssetId;
  return null;
}

async function vfsListNodes(params: { parent_id?: string | null; project_id?: string | null }): Promise<VfsNode[]> {
  const sp = new URLSearchParams();
  if (params.parent_id) sp.set("parent_id", params.parent_id);
  if (params.project_id) sp.set("project_id", params.project_id);
  const res = await fetch(`/api/vfs/nodes?${sp.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: VfsNode[] };
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchTask(taskId: string): Promise<{ status: string; progress: number; error?: string | null; result_json?: any }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: { status: string; progress?: number; error?: string | null; result_json?: any } };
  return {
    status: json.data?.status || "unknown",
    progress: typeof json.data?.progress === "number" ? json.data.progress : 0,
    error: json.data?.error,
    result_json: json.data?.result_json,
  };
}

async function createTask(payload: { type: string; entity_type?: string | null; entity_id?: string | null; input_json: Record<string, unknown> }): Promise<{ id: string; status: string }> {
  const res = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: { id: string; status: string } };
  if (!json.data?.id) throw new Error("任务创建失败");
  return json.data;
}

export function AssetCardView({ asset, onGenerate }: { asset: Asset; onGenerate: (assetId: string) => void }) {
  const resourceThumbs = asset.resources || [];
  const displayThumb = asset.thumbnail || resourceThumbs[0]?.thumbnail || "";
  const isDraft = !displayThumb;
  const hasVariants = !!(asset.variants && asset.variants.length > 0);
  const [currentThumb, setCurrentThumb] = useState(displayThumb);

  useEffect(() => {
    setCurrentThumb(displayThumb);
  }, [displayThumb]);

  return (
    <div
      className={`group relative bg-surface rounded-xl overflow-hidden border transition-all cursor-pointer flex flex-col ${
        isDraft
          ? "border-dashed border-textMuted hover:border-primary"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div className="aspect-square relative overflow-hidden bg-surfaceHighlight/30 flex items-center justify-center">
        {isDraft ? (
          <div className="flex flex-col items-center gap-2 text-textMuted opacity-60">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <Wand2 size={20} />
            </div>
            <span className="text-xs">待生成视觉</span>
          </div>
        ) : (
          <>
            <img
              src={currentThumb}
              alt={asset.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center pointer-events-none p-4">
              {hasVariants && (
                <div className="flex gap-1 mb-2 pointer-events-auto">
                  {asset.thumbnail && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentThumb(asset.thumbnail);
                      }}
                      className="w-6 h-6 rounded border border-white/50 overflow-hidden"
                      type="button"
                    >
                      <img
                        src={asset.thumbnail}
                        className="w-full h-full object-cover"
                        alt="Variant"
                      />
                    </button>
                  )}
                  {asset.variants?.map((v) => (
                    <button
                      key={v.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentThumb(v.thumbnail);
                      }}
                      className="w-6 h-6 rounded border border-white/50 overflow-hidden"
                      type="button"
                    >
                      <img
                        src={v.thumbnail}
                        className="w-full h-full object-cover"
                        alt={v.name}
                      />
                    </button>
                  ))}
                </div>
              )}
              <span className="text-white bg-white/10 backdrop-blur border border-white/20 px-3 py-1 rounded text-xs font-medium">
                查看详情
              </span>
            </div>
          </>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-center justify-between">
          <h4
            className={`text-sm font-medium truncate ${
              isDraft ? "text-textMuted italic" : "text-textMain"
            }`}
          >
            {asset.name}
          </h4>
          {hasVariants && (
            <div title={`${asset.variants?.length} variants`}>
              <Layers size={14} className="text-primary" />
            </div>
          )}
        </div>

        <div className="flex gap-1 mt-2 flex-wrap mb-2">
          {asset.source === "script_extraction" && (
             <span className="text-[10px] px-1.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">剧本提取</span>
          )}
          {asset.tags.map((tag) => (
            <span
              key={tag}
              className={`text-[10px] px-1.5 rounded ${
                tag === "待生成"
                  ? "text-yellow-400 bg-yellow-400/10"
                  : "text-accent bg-accent/10"
              }`}
            >
              {tag}
            </span>
          ))}
        </div>

        {resourceThumbs.length > 0 && (
          <div className="mt-1 flex items-center gap-1">
            {resourceThumbs.slice(0, 4).map((res) => (
              <img
                key={res.id}
                src={res.thumbnail}
                alt="资源缩略图"
                className="h-8 w-8 rounded object-cover border border-border"
              />
            ))}
            {resourceThumbs.length > 4 && (
              <div className="h-8 w-8 rounded bg-surfaceHighlight/60 text-[10px] text-textMuted flex items-center justify-center border border-border">
                +{resourceThumbs.length - 4}
              </div>
            )}
          </div>
        )}

        {isDraft && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerate(asset.id);
            }}
            className="mt-auto w-full py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
            type="button"
          >
            <Wand2 size={12} /> 去生成
          </button>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "list";
  const targetAssetId = searchParams.get("assetId");
  const sourceNodeId = searchParams.get("sourceNodeId");
  const seriesId = searchParams.get("seriesId");

  const [activeTab, setActiveTab] = useState<"ALL" | AssetType>("ALL");
  const [assets, setAssets] = useState<Asset[]>([]);

  // Studio Mode State
  const [sourceContent, setSourceContent] = useState<string>("");
  const [sourceNodeName, setSourceNodeName] = useState<string>("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceParentId, setSourceParentId] = useState<string | null>(null);
  
  const [prompt, setPrompt] = useState("");
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionPopupOpen, setMentionPopupOpen] = useState(false);
  const [mentionPosition, setMentionPosition] = useState<{ top: number; left: number } | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [scriptAssetImageNodes, setScriptAssetImageNodes] = useState<VfsNode[]>([]);
  const [scriptAssetImageCache, setScriptAssetImageCache] = useState<Record<string, VfsNode[]>>({});
  const [scriptAssetImageLoading, setScriptAssetImageLoading] = useState(false);
  const [publicAssetImageNodes, setPublicAssetImageNodes] = useState<VfsNode[]>([]);
  const [publicAssetImageCache, setPublicAssetImageCache] = useState<VfsNode[] | null>(null);
  const [publicAssetImageLoading, setPublicAssetImageLoading] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<GeneratedImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  
  // Model Config
  const [aiModelConfigs, setAiModelConfigs] = useState<AIModelConfig[]>([]);
  const [selectedModelConfigId, setSelectedModelConfigId] = useState<string>("");
  const [resolution, setResolution] = useState<string>("1920x1920");
  const [isPublic, setIsPublic] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attachmentNodeIds, setAttachmentNodeIds] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);

  // Context Selection
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [assetRootNodes, setAssetRootNodes] = useState<VfsNode[]>([]);
  const [assetsRootId, setAssetsRootId] = useState<string | null>(null);
  const [publicAssetsRootId, setPublicAssetsRootId] = useState<string | null>(null);
  const [assetExpanded, setAssetExpanded] = useState<Record<string, boolean>>({});
  const [assetChildren, setAssetChildren] = useState<Record<string, VfsNode[]>>({});
  const [storyboardNodes, setStoryboardNodes] = useState<VfsNode[]>([]);
  
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(seriesId || null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [selectorModalOpen, setSelectorModalOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState<"ASSETS" | "STORYBOARD">("ASSETS");
  const [previewText, setPreviewText] = useState<Record<string, string>>({});
  const [pendingSourceNodeId, setPendingSourceNodeId] = useState<string | null>(null);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; originX: number; originY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [tagTerm, setTagTerm] = useState("");
  const [sortKey, setSortKey] = useState<"time" | "name" | "type">("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [assetDocNodes, setAssetDocNodes] = useState<VfsNode[]>([]);
  const [assetDocsLoading, setAssetDocsLoading] = useState(false);
  const [storyboardCache, setStoryboardCache] = useState<Record<string, VfsNode[]>>({});
  const [storyboardLoading, setStoryboardLoading] = useState(false);
  const assetGridRef = useRef<HTMLDivElement | null>(null);
  const storyboardGridRef = useRef<HTMLDivElement | null>(null);
  const [assetGridMetrics, setAssetGridMetrics] = useState({ width: 0, height: 0, scrollTop: 0 });
  const [storyGridMetrics, setStoryGridMetrics] = useState({ width: 0, height: 0, scrollTop: 0 });
  const [assetVisibleCount, setAssetVisibleCount] = useState(60);
  const [storyVisibleCount, setStoryVisibleCount] = useState(60);
  
  // Tasks tracking
  const [tasksRunning, setTasksRunning] = useState<Array<{ id: string; label: string; status?: string; progress?: number; error?: string | null }>>([]);
  const [deletingImageIds, setDeletingImageIds] = useState<Set<string>>(new Set());

  // Load scripts for context selector
  useEffect(() => {
    if (mode === 'create') {
      fetch("/api/scripts?page=1&size=100")
        .then(res => res.json())
        .then(json => {
          if (json.data?.items) setScripts(json.data.items);
        })
        .catch(console.error);
    }
  }, [mode]);

  // Load episodes and assets when script selected
  useEffect(() => {
    if (selectedScriptId) {
      // Load Episodes
      fetch(`/api/scripts/${selectedScriptId}/hierarchy`)
        .then((res) => res.json())
        .then((json) => {
          if (json.data?.episodes) {
            setEpisodes(json.data.episodes);
          }
        })
        .catch(console.error);

      // Load Assets
      fetch(`/api/assets?project_id=${selectedScriptId}`)
        .then((res) => res.json())
        .then((json) => {
          if (Array.isArray(json.data)) {
             const typeMap: Record<string, AssetType> = {
                character: "CHARACTER",
                scene: "SCENE",
                prop: "PROP",
                vfx: "EFFECT",
                location: "SCENE",
                effect: "EFFECT"
             };
             const mapped: Asset[] = json.data.map((item: any) => {
                let coverThumb = "";
                const resources = (item.resources || []).map((r: any) => {
                    const nodeId = r.meta_data?.file_node_id;
                    const url = nodeId ? `/api/vfs/nodes/${nodeId}/download` : "";
                    if (r.meta_data?.is_cover) {
                        coverThumb = url;
                    }
                    return {
                        id: r.id,
                        thumbnail: url
                    };
                }).filter((r: any) => !!r.thumbnail);
                
                // Try to find cover (usually the first resource or explicitly set)
                // Backend list_resources_by_asset sorts by created_at asc
                // TODO: Support explicit cover field in AssetRead
                let thumb = coverThumb;
                if (!thumb && resources.length > 0) thumb = resources[0].thumbnail;
                
                return {
                    id: item.id,
                    assetId: item.asset_id,
                    name: item.name,
                    type: typeMap[item.type?.toLowerCase()] || "CHARACTER",
                    thumbnail: thumb,
                    tags: item.tags || [],
                    createdAt: item.created_at,
                    source: item.source,
                    variants: [],
                    resources: resources
                };
             });
             setAssets(mapped);
          }
        })
        .catch(console.error);
    } else {
      setEpisodes([]);
      setAssets([]);
    }
  }, [selectedScriptId]);

  useEffect(() => {
    if (!selectedEpisodeId) return;
    const exists = episodes.some((e) => e.id === selectedEpisodeId);
    if (!exists) setSelectedEpisodeId(null);
  }, [episodes, selectedEpisodeId]);

  useEffect(() => {
    if (!selectorModalOpen) return;
    setPendingSourceNodeId(sourceNodeId || null);
    setSelectedNodeIds(new Set());
    setSearchTerm("");
    setTagTerm("");
    setAssetVisibleCount(60);
    setStoryVisibleCount(60);
    setModalOffset({ x: 0, y: 0 });
  }, [selectorModalOpen, sourceNodeId]);

  useEffect(() => {
    if (!selectorModalOpen) return;
    if (selectorTab === "ASSETS") setAssetVisibleCount(60);
    else setStoryVisibleCount(60);
  }, [selectorModalOpen, selectorTab, searchTerm, tagTerm, sortKey, sortDir]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setModalOffset({
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!selectorModalOpen || !selectedScriptId) {
      setAssetDocsLoading(false);
      setAssetDocNodes([]);
      return;
    }
    if (!assetsRootId || assetRootNodes.length === 0) {
      setAssetDocsLoading(false);
      setAssetDocNodes([]);
      return;
    }
    setAssetDocsLoading(true);
    (async () => {
      const childrenList = await Promise.all(
        assetRootNodes.map(async (folder) => {
          if (assetChildren[folder.id]) return assetChildren[folder.id];
          try {
            const nodes = await vfsListNodes({ parent_id: folder.id, project_id: selectedScriptId });
            setAssetChildren((prev) => ({ ...prev, [folder.id]: nodes }));
            return nodes;
          } catch {
            return [];
          }
        }),
      );
      const docs = childrenList
        .flat()
        .filter((n) => n.name.endsWith(".md"))
        .sort((a, b) => a.name.localeCompare(b.name));
      setAssetDocNodes(docs);
      setAssetDocsLoading(false);
    })();
  }, [
    selectorModalOpen,
    selectedScriptId,
    assetsRootId,
    assetRootNodes.map((n) => n.id).join(","),
    Object.keys(assetChildren).join(","),
  ]);

  useEffect(() => {
    const el = assetGridRef.current;
    if (!el) return;
    const update = () =>
      setAssetGridMetrics({
        width: el.clientWidth,
        height: el.clientHeight,
        scrollTop: el.scrollTop,
      });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update);
    update();
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [selectorModalOpen, selectorTab]);

  useEffect(() => {
    const el = storyboardGridRef.current;
    if (!el) return;
    const update = () =>
      setStoryGridMetrics({
        width: el.clientWidth,
        height: el.clientHeight,
        scrollTop: el.scrollTop,
      });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update);
    update();
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [selectorModalOpen, selectorTab]);

  // 不再在选择剧本/剧集后自动弹出窗口，改为用户手动点击按钮触发弹窗


  const fetchPreviewSnippet = async (nodeId: string) => {
    if (previewText[nodeId]) return;
    try {
      const res = await fetch(`/api/vfs/nodes/${nodeId}/download`);
      const txt = await res.text();
      const lines = txt.split("\n").filter(l => l.trim());
      const snippet = lines.slice(0, 3).join(" ").slice(0, 120);
      setPreviewText(prev => ({ ...prev, [nodeId]: snippet }));
    } catch {}
  };

  useEffect(() => {
    if (mode !== "create") return;
    (async () => {
      try {
        const res = await fetch("/api/ai/admin/model-configs?category=image", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const items: AIModelConfig[] = Array.isArray(json.data) ? json.data : [];
        const list = items.filter((m) => m.category === "image" && m.enabled);
        setAiModelConfigs(list);
        if (!selectedModelConfigId && list.length > 0) setSelectedModelConfigId(list[0].id);
      } catch {}
    })();
  }, [mode]);

  // 自动复用会话：加载已保存的会话
  useEffect(() => {
    if (!selectedModelConfigId) return;
    const key = `assetSession:image:${selectedModelConfigId}:${selectedScriptId || "global"}`;
    const sid = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (sid) {
      setSessionId(sid);
      // 拉取会话附件数量
      fetch(`/api/ai/generate-sessions/${sid}`)
        .then(res => res.json())
        .then(json => {
          const ids: string[] = (json?.data?.image_attachment_node_ids || []).map((x: any) => String(x));
          if (Array.isArray(ids)) {
            setAttachmentNodeIds(ids);
          }
        }).catch(()=>{});
    }
  }, [selectedModelConfigId, selectedScriptId]);

  // 选择上下文后自动创建会话（若不存在）
  useEffect(() => {
    const autoCreate = async () => {
      if (!selectedModelConfigId) return;
      if (sessionId) return;
      try {
        const res = await fetch("/api/ai/generate-sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ category: "image", ai_model_config_id: selectedModelConfigId }),
        });
        const json = await res.json();
        const sid = json?.data?.id;
        if (!sid) return;
        setSessionId(sid);
        setAttachmentNodeIds([]);
        const key = `assetSession:image:${selectedModelConfigId}:${selectedScriptId || "global"}`;
        if (typeof window !== "undefined") window.localStorage.setItem(key, sid);
      } catch {}
    };
    // 当选剧本/故事板或资产文档时触发自动创建
    if (selectedScriptId || sourceNodeId) {
      autoCreate();
    }
  }, [selectedModelConfigId, selectedScriptId, sourceNodeId, sessionId]);

  useEffect(() => {
    if (!selectedScriptId) {
      setAssetRootNodes([]);
      setAssetExpanded({});
      setAssetChildren({});
      return;
    }
    (async () => {
      try {
        const allNodes = await vfsListNodes({ parent_id: null, project_id: selectedScriptId });
        const assetsRoot = allNodes.find((n) => n.name === "资产" && n.is_folder);
        if (assetsRoot) {
          setAssetsRootId(assetsRoot.id);
          const nodes = await vfsListNodes({ parent_id: assetsRoot.id, project_id: selectedScriptId });
          setAssetRootNodes(nodes.sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          setAssetsRootId(null);
          setAssetRootNodes([]);
        }
      } catch {}
    })();
  }, [selectedScriptId]);

  useEffect(() => {
    if (!selectedEpisodeId) {
      setStoryboardNodes([]);
      setStoryboardLoading(false);
      return;
    }
    if (storyboardCache[selectedEpisodeId]) {
      setStoryboardNodes(storyboardCache[selectedEpisodeId]);
      setStoryboardLoading(false);
      return;
    }
    const ep = episodes.find((e) => e.id === selectedEpisodeId) || null;
    if (!ep?.storyboard_root_node_id) {
      setStoryboardNodes([]);
      setStoryboardLoading(false);
      return;
    }
    setStoryboardLoading(true);
    (async () => {
      try {
        const nodes = await vfsListNodes({ parent_id: ep.storyboard_root_node_id, project_id: selectedScriptId });
        const list = nodes.filter((n) => !n.is_folder).sort((a, b) => a.name.localeCompare(b.name));
        setStoryboardNodes(list);
        setStoryboardCache((prev) => ({ ...prev, [selectedEpisodeId]: list }));
      } catch {}
      setStoryboardLoading(false);
    })();
  }, [selectedEpisodeId, episodes.map((e) => e.id).join(","), selectedScriptId, storyboardCache]);

  useEffect(() => {
    if (!selectedScriptId || !assetsRootId) {
      setScriptAssetImageNodes([]);
      setScriptAssetImageLoading(false);
      return;
    }
    if (scriptAssetImageCache[selectedScriptId]) {
      setScriptAssetImageNodes(scriptAssetImageCache[selectedScriptId]);
      setScriptAssetImageLoading(false);
      return;
    }
    setScriptAssetImageLoading(true);
    (async () => {
      try {
        const rootChildren = await vfsListNodes({ parent_id: assetsRootId, project_id: selectedScriptId });
        const childrenList = await Promise.all(
          rootChildren.map(async (node) => {
            if (!node.is_folder) return isImageNode(node) ? [node] : [];
            try {
              return await vfsListNodes({ parent_id: node.id, project_id: selectedScriptId });
            } catch {
              return [];
            }
          }),
        );
        const images = childrenList.flat().filter(isImageNode);
        setScriptAssetImageNodes(images);
        setScriptAssetImageCache((prev) => ({ ...prev, [selectedScriptId]: images }));
      } catch {
        setScriptAssetImageNodes([]);
      }
      setScriptAssetImageLoading(false);
    })();
  }, [selectedScriptId, assetsRootId, scriptAssetImageCache]);

  useEffect(() => {
    if (mode !== "create") return;
    if (publicAssetImageCache) {
      setPublicAssetImageNodes(publicAssetImageCache);
      return;
    }
    setPublicAssetImageLoading(true);
    (async () => {
      try {
        const rootNodes = await vfsListNodes({ parent_id: null, project_id: null });
        const assetsRoot =
          rootNodes.find((n) => n.name === "公共资产" && n.is_folder) ||
          rootNodes.find((n) => n.name === "资产" && n.is_folder) ||
          null;
        if (!assetsRoot) {
          setPublicAssetsRootId(null);
          setPublicAssetImageNodes([]);
          setPublicAssetImageCache([]);
          setPublicAssetImageLoading(false);
          return;
        }
        setPublicAssetsRootId(assetsRoot.id);
        const nodes = await vfsListNodes({ parent_id: assetsRoot.id, project_id: null });
        const childrenList = await Promise.all(
          nodes.map(async (node) => {
            if (!node.is_folder) return isImageNode(node) ? [node] : [];
            try {
              return await vfsListNodes({ parent_id: node.id, project_id: null });
            } catch {
              return [];
            }
          }),
        );
        const images = childrenList.flat().filter(isImageNode);
        setPublicAssetImageNodes(images);
        setPublicAssetImageCache(images);
      } catch {
        setPublicAssetsRootId(null);
        setPublicAssetImageNodes([]);
        setPublicAssetImageCache([]);
      }
      setPublicAssetImageLoading(false);
    })();
  }, [mode, publicAssetImageCache]);

  // Auto-resolve asset from source node name
  useEffect(() => {
    if (sourceNodeName && !targetAssetId && assets.length > 0) {
       const derived = deriveAssetIdFromNodeName(sourceNodeName, assets);
       if (derived) {
          setSelectedDraftId(derived);
       }
    }
  }, [sourceNodeName, targetAssetId, assets]);

  // Load Source Content
  useEffect(() => {
    if (sourceNodeId && mode === "create") {
      setSourceLoading(true);
      (async () => {
        try {
          const metaRes = await fetch(`/api/vfs/nodes/${sourceNodeId}`);
          const ct = metaRes.headers.get("content-type") || "";
          const metaTxt = await metaRes.text();
          let metaObj: unknown = null;
          if (ct.includes("application/json") && metaTxt) {
            try {
              metaObj = JSON.parse(metaTxt);
            } catch {}
          }
          const isMeta = (x: unknown): x is { data?: { name?: string; parent_id?: string | null } } =>
            !!x && typeof x === "object" && "data" in (x as Record<string, unknown>);
          if (isMeta(metaObj) && metaObj.data) {
            if (typeof metaObj.data.name === "string") setSourceNodeName(metaObj.data.name);
            setSourceParentId(metaObj.data.parent_id ?? null);
          }
        } catch {}
        try {
          const dlRes = await fetch(`/api/vfs/nodes/${sourceNodeId}/download`);
          const text = await dlRes.text();
          const body = stripMarkdownMetadata(text);
          setSourceContent(body);
          const m1 = body.match(/prompt_en\s*[:：]\s*(.+)$/im);
          if (m1 && m1[1]) setPrompt(m1[1].trim());
          else {
            const m2 = body.match(/prompt\s*[:：]\s*(.+)$/im);
            if (m2 && m2[1]) setPrompt(m2[1].trim());
            else {
              const lines = body
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l && !l.startsWith("#") && !l.startsWith("Use:"));
              if (lines.length > 0) setPrompt(lines[0]);
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          setSourceLoading(false);
        }
      })();
    }
  }, [sourceNodeId, mode]);

  // Task Polling
  useEffect(() => {
    if (tasksRunning.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled && tasksRunning.length > 0) {
        const statuses = await Promise.all(tasksRunning.map(async (x) => ({ meta: x, state: await fetchTask(x.id) })));
        
        // Handle completed tasks
        const completed = statuses.filter(s => s.state.status === "succeeded");
        for (const c of completed) {
           if (c.meta.label === "生成图片") {
             const result = c.state.result_json;
             if (result?.file_node_id) {
                // Add to history
                const newNodeId = result.file_node_id;
                const newImg: GeneratedImage = {
                  id: c.meta.id,
                  url: `/api/vfs/nodes/${newNodeId}/download`,
                  prompt: result.prompt || prompt,
                  createdAt: Date.now(),
                  nodeId: newNodeId
                };
                setGenerationHistory(prev => [newImg, ...prev]);
                setSelectedImages(prev => new Set(prev).add(c.meta.id));
                if (!coverImageId) setCoverImageId(c.meta.id);
             }
           }
        }

        // Handle failed
        const failed = statuses.filter(s => s.state.status === "failed" || s.state.status === "canceled");
        if (failed.length > 0) {
           const msg = failed[0]?.state.error || "任务失败";
           setStudioError(msg);
           console.error("Task failed", failed);
        }

        const active = statuses.filter(s => s.state.status !== "succeeded" && s.state.status !== "failed" && s.state.status !== "canceled");
        setTasksRunning(active.map(s => ({
          ...s.meta,
          status: s.state.status,
          progress: s.state.progress,
          error: s.state.error,
        })));
        setIsGenerating(active.length > 0);

        if (active.length === 0) break;
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [tasksRunning, prompt, coverImageId]);


  const tabs = useMemo(
    () =>
      [
        { id: "ALL", label: "全部", icon: null },
        { id: "CHARACTER", label: "角色", icon: User },
        { id: "SCENE", label: "场景", icon: Image },
        { id: "PROP", label: "道具", icon: Box },
        { id: "EFFECT", label: "特效", icon: Wand2 },
      ] satisfies ReadonlyArray<{ id: "ALL" | AssetType; label: string; icon: LucideIcon | null }>,
    [],
  );

  const assetTypeLabelMap = useMemo(
    () => ({
      CHARACTER: "角色",
      SCENE: "场景",
      PROP: "道具",
      EFFECT: "特效",
    }),
    [],
  );

  const creatorAssetTypes = useMemo(() => ["CHARACTER", "SCENE", "PROP"] satisfies AssetType[], []);
  const [assetType, setAssetType] = useState<AssetType>("CHARACTER");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(targetAssetId);
  useEffect(() => {
    setSelectedDraftId(targetAssetId);
  }, [targetAssetId]);

  const setQuery = (next: Record<string, string | null | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    });
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleModeChange = (newMode: string, params?: Record<string, string>) => {
    setQuery({ mode: newMode, ...(params || {}), assetId: params?.assetId ?? null });
  };

  const parseMentionIndices = (text: string) => {
    const matches = text.match(/@(\d+)/g) || [];
    const nums = matches
      .map((m) => Number(m.slice(1)))
      .filter((n) => Number.isFinite(n) && n > 0);
    return Array.from(new Set(nums));
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setPrompt(value);
    setStudioError(null);
    if (value[cursorPos - 1] === "@") {
      const coords = getCaretAbsoluteCoordinates(e.currentTarget, cursorPos);
      setMentionPosition({ top: coords.top, left: coords.left });
      setMentionPopupOpen(true);
    }
  };

  const handleMentionSelect = (idx: number) => {
    const textarea = promptRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart || value.length;
    const lastAt = value.lastIndexOf("@", cursorPos - 1);
    if (lastAt === -1) {
      setMentionPopupOpen(false);
      return;
    }
    const before = value.slice(0, lastAt);
    const after = value.slice(cursorPos);
    const newValue = `${before}@${idx} ${after}`;
    setPrompt(newValue);
    setMentionPopupOpen(false);
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = lastAt + `@${idx} `.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  const insertAssetImageMention = (n: number) => {
    const textarea = promptRef.current;
    const start = textarea?.selectionStart ?? prompt.length;
    const end = textarea?.selectionEnd ?? prompt.length;
    const before = prompt.slice(0, start);
    const after = prompt.slice(end);
    const token = `@${n} `;
    setPrompt(`${before}${token}${after}`);
    setMentionPopupOpen(false);
    requestAnimationFrame(() => {
      if (!textarea) return;
      const pos = before.length + token.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  };

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    if (!selectedModelConfigId) {
      setStudioError("请选择一个模型配置");
      return null;
    }
    try {
      const res = await fetch("/api/ai/generate-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "image", ai_model_config_id: selectedModelConfigId }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const json = await res.json();
      const sid = json?.data?.id;
      if (sid) {
        setSessionId(sid);
        const key = `assetSession:image:${selectedModelConfigId}:${selectedScriptId || "global"}`;
        if (typeof window !== "undefined") window.localStorage.setItem(key, sid);
      }
      return sid || null;
    } catch {
      setStudioError("创建会话失败");
      return null;
    }
  };

  const addAssetImages = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    const maxBytes = 10 * 1024 * 1024;
    const available = Math.max(0, 14 - attachmentNodeIds.length);
    if (available <= 0) {
      setStudioError("最多上传 14 张参考图");
      return;
    }

    const readAsDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取文件失败"));
        reader.readAsDataURL(file);
      });

    const next: string[] = [];
    for (const f of list) {
      if (next.length >= available) break;
      if (f.size > maxBytes) {
        setStudioError("单张图片不能超过 10MB");
        continue;
      }
      try {
        const dataUrl = (await readAsDataUrl(f)).trim();
        if (dataUrl) next.push(dataUrl);
      } catch {
        setStudioError("读取图片失败");
        continue;
      }
    }
    if (!next.length) return;

    const sid = await ensureSession();
    if (!sid) return;

    setIsUploading(true);
    setStudioError(null);
    try {
      const res = await fetch(`/api/ai/generate-sessions/${encodeURIComponent(sid)}/image-attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data_urls: next }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const json = await res.json();
      const ids: string[] = Array.isArray(json?.data) ? json.data : [];
      setAttachmentNodeIds(ids);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      setStudioError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const addAssetImageFromNode = async (nodeId: string) => {
    if (!nodeId) return;
    const available = Math.max(0, 14 - attachmentNodeIds.length);
    if (available <= 0) {
      setStudioError("最多上传 14 张参考图");
      return;
    }
    const sid = await ensureSession();
    if (!sid) return;
    setIsUploading(true);
    setStudioError(null);
    try {
      const res = await fetch(`/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`);
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) throw new Error("读取图片失败");
      const prevCount = attachmentNodeIds.length;
      const uploadRes = await fetch(`/api/ai/generate-sessions/${encodeURIComponent(sid)}/image-attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data_urls: [dataUrl] }),
      });
      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        throw new Error(t || uploadRes.statusText);
      }
      const json = await uploadRes.json();
      const ids: string[] = Array.isArray(json?.data) ? json.data.map((x: any) => String(x)) : [];
      setAttachmentNodeIds(ids);
      const nextIndex = prevCount + 1;
      if (ids.length >= nextIndex) {
        insertAssetImageMention(nextIndex);
      }
      setMentionPopupOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "添加失败";
      setStudioError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const removeAssetAttachment = async (nodeId: string) => {
    if (!sessionId) return;
    setIsUploading(true);
    try {
      await fetch(`/api/ai/generate-sessions/${encodeURIComponent(sessionId)}/image-attachments/${encodeURIComponent(nodeId)}`, {
        method: "DELETE",
      });
      const next = attachmentNodeIds.filter((x) => x !== nodeId);
      setAttachmentNodeIds(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "移除失败";
      setStudioError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateAsset = async () => {
    if (!prompt) return;
    const parentId = selectedScriptId ? sourceParentId || assetsRootId : publicAssetsRootId;
    if (!parentId) {
      setStudioError(selectedScriptId ? "请先选择保存目录或展开并选择一个资产文档/资产根目录" : "未找到公共资产目录");
      return;
    }
    setIsGenerating(true);
    setStudioError(null);

    try {
      const mentionIndices = parseMentionIndices(prompt);
      const invalid = mentionIndices.find((n) => n > attachmentNodeIds.length);
      if (invalid) {
        setIsGenerating(false);
        setStudioError(`引用了不存在的参考图 @${invalid}`);
        return;
      }
      const mentionIds = mentionIndices
        .map((n) => attachmentNodeIds[n - 1])
        .filter((id) => typeof id === "string");
      const activeSessionId = sessionId || (await ensureSession());

      // Try to construct a meaningful filename
      let filename = "generated.png";
      const targetAsset = assets.find(a => a.id === selectedDraftId);
      if (targetAsset) {
         const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
         filename = `${targetAsset.name}_${timestamp}.png`;
      }

      const task = await createTask({
        type: "asset_image_generate",
        entity_type: selectedScriptId ? "project" : "public",
        entity_id: selectedScriptId || null,
        input_json: {
           project_id: selectedScriptId || null,
           parent_node_id: parentId, 
           prompt: prompt.trim(),
           resolution: resolution,
           model_config_id: selectedModelConfigId || null,
           session_id: activeSessionId || null,
           attachment_file_node_ids: mentionIds.length > 0 ? mentionIds : undefined,
           filename: filename, // Pass explicit filename
        }
      });
      setTasksRunning(prev => [...prev, { id: task.id, label: "生成图片" }]);
      setPrompt("");
    } catch (e) {
      setStudioError("启动生成任务失败");
      setIsGenerating(false);
    }
  };

  const handleSaveAsset = async () => {
    if (selectedImages.size === 0) return;
    
    let targetId = resolveTargetAssetId({ selectedDraftId, targetAssetId, assets });
    
    const chosen = generationHistory.filter((img) => selectedImages.has(img.id) && img.nodeId);
    if (chosen.length === 0) {
      setStudioError("请选择已生成的图片");
      return;
    }
    const cover = coverImageId ? chosen.find((img) => img.id === coverImageId) : chosen[0];
    setStudioError(null);

    if (!targetId) {
       try {
           const defaultName = sourceNodeName ? sourceNodeName.replace(/\.md$/i, "") : (prompt || "New Asset");
           const newName = defaultName.slice(0, 30);
           
           // Determine type from name or default to character
           let assetType = "character";
           const lowerName = defaultName.toLowerCase();
           if (lowerName.includes("scene") || lowerName.includes("location") || lowerName.includes("background")) assetType = "scene";
           else if (lowerName.includes("prop") || lowerName.includes("item")) assetType = "prop";
           else if (lowerName.includes("vfx") || lowerName.includes("effect")) assetType = "vfx";

           const createRes = await fetch("/api/assets", {
               method: "POST",
               headers: { "content-type": "application/json" },
               body: JSON.stringify({
                   project_id: null,
                   script_id: selectedScriptId || null,
                   name: newName,
                   type: assetType,
                   source: "manual"
               })
           });
           
           if (!createRes.ok) {
                const txt = await createRes.text();
                throw new Error(`创建新资产失败: ${txt}`);
           }
           
           const json = await createRes.json();
           const newAsset = json.data;
           targetId = newAsset.id;
           
           if (selectedScriptId && newAsset.project_id) {
                const typeMap: Record<string, AssetType> = {
                    character: "CHARACTER",
                    scene: "SCENE",
                    prop: "PROP",
                    vfx: "EFFECT",
                    location: "SCENE",
                    effect: "EFFECT"
                 };
               setAssets(prev => [{
                    id: newAsset.id,
                    assetId: newAsset.asset_id,
                    name: newAsset.name,
                    type: typeMap[newAsset.type?.toLowerCase()] || "CHARACTER",
                    thumbnail: "",
                    tags: newAsset.tags || [],
                    createdAt: newAsset.created_at,
                    source: newAsset.source,
                    variants: [],
                    resources: []
               }, ...prev]);
           }
       } catch (e) {
           setStudioError(e instanceof Error ? e.message : "创建资产失败");
           return;
       }
    }

    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(targetId)}/resources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          file_node_ids: chosen.map((img) => img.nodeId),
          res_type: "image",
          cover_file_node_id: cover?.nodeId || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newResources = chosen.map((img) => ({ id: img.id, thumbnail: img.url }));
      const coverThumb = cover?.url || newResources[0]?.thumbnail || "";
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === targetId
            ? {
                ...asset,
                thumbnail: coverThumb || asset.thumbnail,
                resources: [...(asset.resources || []), ...newResources],
                tags: asset.tags.filter((t) => t !== "待生成"),
              }
            : asset,
        ),
      );
      setSelectedImages(new Set());
      setCoverImageId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setStudioError(msg);
    }
  };

  const handleDeleteGeneratedImage = async (img: GeneratedImage) => {
    if (!img.nodeId) {
      setStudioError("无法删除该图片");
      return;
    }
    setDeletingImageIds(prev => new Set(prev).add(img.id));
    setStudioError(null);
    try {
      const res = await fetch(`/api/vfs/nodes/${encodeURIComponent(img.nodeId)}`, { method: "DELETE" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      setGenerationHistory(prev => prev.filter((x) => x.id !== img.id));
      const remainingSelected = new Set(selectedImages);
      remainingSelected.delete(img.id);
      setSelectedImages(remainingSelected);
      setCoverImageId(prev => (prev === img.id ? (remainingSelected.values().next().value ?? null) : prev));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setStudioError(msg);
    } finally {
      setDeletingImageIds(prev => {
        const next = new Set(prev);
        next.delete(img.id);
        return next;
      });
    }
  };

  const canGenerate = !!selectedModelConfigId && !!prompt.trim() && (!!selectedScriptId || !!publicAssetsRootId);

  const filteredAssets = useMemo(() => {
    if (activeTab === "ALL") return assets;
    return assets.filter((a) => a.type === activeTab);
  }, [activeTab, assets]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const normalizedTag = tagTerm.trim().toLowerCase();

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx += 1;
    }
    return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)}${units[idx]}`;
  };

  const formatDate = (value?: string) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const isImageNode = (node: VfsNode) => {
    if (node.is_folder) return false;
    const name = node.name.toLowerCase();
    if (node.content_type?.includes("image")) return true;
    return [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) => name.endsWith(ext));
  };

  const getNodeType = (node: VfsNode) => {
    if (node.content_type?.includes("image")) return "图片";
    if (node.name.endsWith(".md")) return "文档";
    return node.content_type || "文件";
  };

  const filterAndSortNodes = (nodes: VfsNode[]) => {
    const filtered = nodes.filter((node) => {
      const name = node.name.toLowerCase();
      const snippet = (previewText[node.id] || "").toLowerCase();
      const tags = name.replace(".md", "").split(/[\s-_]+/).filter(Boolean);
      const matchSearch = !normalizedSearch || name.includes(normalizedSearch) || snippet.includes(normalizedSearch);
      const matchTag = !normalizedTag || tags.some((t) => t.toLowerCase().includes(normalizedTag));
      return matchSearch && matchTag;
    });
    const list = [...filtered];
    list.sort((a, b) => {
      let va = "";
      let vb = "";
      if (sortKey === "name") {
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
      } else if (sortKey === "type") {
        va = getNodeType(a).toLowerCase();
        vb = getNodeType(b).toLowerCase();
      } else {
        va = a.updated_at || a.created_at || "";
        vb = b.updated_at || b.created_at || "";
      }
      if (va === vb) return 0;
      const res = va > vb ? 1 : -1;
      return sortDir === "asc" ? res : -res;
    });
    return list;
  };

  const assetFilteredNodes = useMemo(() => filterAndSortNodes(assetDocNodes), [
    assetDocNodes,
    normalizedSearch,
    normalizedTag,
    sortKey,
    sortDir,
    previewText,
  ]);

  const storyboardFilteredNodes = useMemo(
    () => filterAndSortNodes(storyboardNodes.filter((n) => n.name.endsWith(".md"))),
    [storyboardNodes, normalizedSearch, normalizedTag, sortKey, sortDir, previewText],
  );

  const activeFilteredNodes = selectorTab === "ASSETS" ? assetFilteredNodes : storyboardFilteredNodes;
  const confirmSourceNodeId =
    pendingSourceNodeId || (multiSelect ? Array.from(selectedNodeIds)[0] || null : null);

  const mentionTabs = useMemo(() => {
    const sessionImages = attachmentNodeIds.map((id, idx) => ({
      id,
      url: `/api/vfs/nodes/${encodeURIComponent(id)}/download`,
      index: idx + 1,
      isSelected: parseMentionIndices(prompt).includes(idx + 1),
      title: `参考图 @${idx + 1}`,
    }));
    const scriptImages = scriptAssetImageNodes.map((node, idx) => ({
      id: node.id,
      url: `/api/vfs/nodes/${encodeURIComponent(node.id)}/download`,
      index: idx + 1,
      isSelected: false,
      title: node.name,
    }));
    const publicImages = publicAssetImageNodes.map((node, idx) => ({
      id: node.id,
      url: `/api/vfs/nodes/${encodeURIComponent(node.id)}/download`,
      index: idx + 1,
      isSelected: false,
      title: node.name,
    }));
    return [
      {
        id: "session",
        label: "当前会话",
        images: sessionImages,
        allowUpload: true,
        emptyText: "暂无会话附件",
      },
      {
        id: "script",
        label: "本剧本",
        images: scriptImages,
        onSelect: (
          _idx: number,
          image: { id: string; url: string; index: number; isSelected: boolean; title?: string },
        ) => addAssetImageFromNode(image.id),
        allowUpload: false,
        emptyText: selectedScriptId ? "本剧本暂无可用图片" : "请先选择剧本",
        loading: scriptAssetImageLoading,
        badgeLabel: "添加",
      },
      {
        id: "public",
        label: "公共资产",
        images: publicImages,
        onSelect: (
          _idx: number,
          image: { id: string; url: string; index: number; isSelected: boolean; title?: string },
        ) => addAssetImageFromNode(image.id),
        allowUpload: false,
        emptyText: "公共资产暂无可用图片",
        loading: publicAssetImageLoading,
        badgeLabel: "添加",
      },
    ];
  }, [
    attachmentNodeIds,
    parseMentionIndices,
    prompt,
    scriptAssetImageNodes,
    publicAssetImageNodes,
    scriptAssetImageLoading,
    publicAssetImageLoading,
    selectedScriptId,
    addAssetImageFromNode,
  ]);

  const toggleNodeSelection = (nodeId: string) => {
    if (multiSelect) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
      setPendingSourceNodeId(nodeId);
      return;
    }
    setPendingSourceNodeId(nodeId);
  };

  const openNodeInNewTab = (nodeId: string) => {
    window.open(`/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`, "_blank");
  };

  const renderVirtualGrid = (
    nodes: VfsNode[],
    gridRef: React.RefObject<HTMLDivElement | null>,
    metrics: { width: number; height: number; scrollTop: number },
    loading: boolean,
    visibleCount: number,
    onLoadMore: () => void,
  ) => {
    const cardWidth = 220;
    const cardHeight = 150;
    const gap = 12;
    const visibleNodes = nodes.slice(0, visibleCount);
    const perRow = Math.max(1, Math.floor((metrics.width + gap) / (cardWidth + gap)));
    const totalRows = Math.ceil(visibleNodes.length / perRow);
    const visibleRows = Math.ceil(metrics.height / (cardHeight + gap)) + 2;
    const startRow = Math.max(0, Math.floor(metrics.scrollTop / (cardHeight + gap)) - 1);
    const endRow = Math.min(totalRows, startRow + visibleRows);
    const startIndex = startRow * perRow;
    const endIndex = Math.min(visibleNodes.length, endRow * perRow);
    const topSpacer = startRow * (cardHeight + gap);
    const bottomSpacer = Math.max(0, (totalRows - endRow) * (cardHeight + gap));
    const hasMore = visibleNodes.length < nodes.length;
    return (
      <div
        ref={gridRef}
        className="h-full overflow-auto"
        onScroll={(e) => {
          const target = e.currentTarget;
          const update = {
            width: target.clientWidth,
            height: target.clientHeight,
            scrollTop: target.scrollTop,
          };
          if (selectorTab === "ASSETS") setAssetGridMetrics(update);
          else setStoryGridMetrics(update);
          if (hasMore && target.scrollTop + target.clientHeight >= target.scrollHeight - 120) {
            onLoadMore();
          }
        }}
      >
        <div style={{ paddingTop: topSpacer, paddingBottom: bottomSpacer }}>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
            {loading &&
              Array.from({ length: 8 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="h-[150px] rounded-xl border border-border bg-surfaceHighlight/30 animate-pulse" />
              ))}
            {!loading &&
              visibleNodes.slice(startIndex, endIndex).map((node) => {
                const isSelected = multiSelect ? selectedNodeIds.has(node.id) : pendingSourceNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    onMouseEnter={() => fetchPreviewSnippet(node.id)}
                    onClick={() => toggleNodeSelection(node.id)}
                    onDoubleClick={() => openNodeInNewTab(node.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        toggleNodeSelection(node.id);
                        return;
                      }
                      if (e.key === " ") {
                        e.preventDefault();
                        toggleNodeSelection(node.id);
                      }
                    }}
                    tabIndex={0}
                    className={`relative group p-3 rounded-xl border text-left text-[11px] bg-surfaceHighlight/20 hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      isSelected ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <div className="h-16 rounded-lg bg-surfaceHighlight/40 flex items-center justify-center mb-2 overflow-hidden">
                      {node.content_type?.includes("image") ? (
                        <img
                          loading="lazy"
                          src={`/api/vfs/nodes/${encodeURIComponent(node.id)}/download`}
                          alt={node.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText size={18} className="text-textMuted" />
                      )}
                    </div>
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openNodeInNewTab(node.id);
                        }}
                        className="px-2 py-1 rounded bg-surface text-textMain border border-border text-[10px]"
                        type="button"
                      >
                        打开
                      </button>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold line-clamp-1">{node.name.replace(".md", "")}</div>
                      {multiSelect ? (
                        <span className="text-primary">{isSelected ? <CheckSquare size={14} /> : <Square size={14} />}</span>
                      ) : (
                        isSelected && <CheckCircle size={14} className="text-primary" />
                      )}
                    </div>
                    <div className="text-[10px] text-textMuted mt-1 line-clamp-2">
                      {previewText[node.id] || "暂无预览"}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-textMuted">
                      <span className="px-2 py-0.5 rounded-full bg-surfaceHighlight/40">{getNodeType(node)}</span>
                      <span>{formatDate(node.updated_at || node.created_at)}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-textMuted">{formatBytes(node.size_bytes)}</div>
                  </div>
                );
              })}
          </div>
          {!loading && nodes.length === 0 && (
            <div className="py-16 text-center text-xs text-textMuted">暂无匹配内容</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in">
      <div className="flex justify-between items-center border-b border-border pb-4">
        <div className="flex gap-6">
          <button
            onClick={() => handleModeChange("list")}
            className={`text-lg font-bold transition-colors ${
              mode === "list" ? "text-primary" : "text-textMuted hover:text-textMain"
            }`}
            type="button"
          >
            资产清单 (Library)
          </button>
          <button
            onClick={() => handleModeChange("create")}
            className={`text-lg font-bold transition-colors ${
              mode === "create"
                ? "text-primary"
                : "text-textMuted hover:text-textMain"
            }`}
            type="button"
          >
            资产创作 (Studio)
          </button>
        </div>

        {mode === "list" && (
          <div className="flex gap-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted"
                size={16}
              />
              <input
                type="text"
                placeholder="检索资产..."
                className="bg-surface border border-border rounded-lg pl-9 pr-4 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none text-textMain w-64"
              />
            </div>
            <button
              className="p-2 border border-border rounded-lg text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
              type="button"
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        )}
      </div>

      {mode === "list" && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-surface text-textMain shadow-md border border-border"
                      : "text-textMuted hover:text-textMain hover:bg-surfaceHighlight"
                  }`}
                  type="button"
                >
                  {Icon && <Icon size={14} />}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-10">
            <button
              onClick={() => handleModeChange("create")}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-surface/50 transition-all flex flex-col items-center justify-center cursor-pointer text-textMuted hover:text-primary gap-2 group"
              type="button"
            >
              <div className="w-12 h-12 rounded-full bg-surfaceHighlight group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                <Plus size={24} />
              </div>
              <span className="text-xs font-medium">新建资产</span>
            </button>

            {filteredAssets.map((asset) => (
              <AssetCardView key={asset.id} asset={asset} onGenerate={(id) => handleModeChange("create", { assetId: id })} />
            ))}
          </div>
        </div>
      )}

      {mode === "create" && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          {/* Left Column: Config & Preview */}
          <div className="bg-surface border border-border rounded-2xl flex flex-col overflow-hidden">
             <div className="p-4 border-b border-border bg-surfaceHighlight/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-textMain">
                    <Settings size={16} className="text-primary" /> 创作配置
                  </h3>
                  <button
                    type="button"
                    onClick={() => setConfigDrawerOpen(true)}
                    className="px-2.5 py-1 rounded-full border border-border bg-surfaceHighlight/40 text-[11px] text-textMain hover:border-primary/60 flex items-center gap-1"
                  >
                    <SlidersHorizontal size={12} /> 生成配置
                  </button>
                </div>
                {sourceNodeName && (
                  <div className="text-xs text-textMuted bg-surfaceHighlight/50 px-2 py-1 rounded truncate max-w-[150px]" title={sourceNodeName}>
                    {sourceNodeName.replace(".md", "")}
                  </div>
                )}
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-textMuted">归属上下文</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectorTab("ASSETS");
                        setSelectorModalOpen(true);
                      }}
                      className="flex-1 flex items-center justify-between px-3 py-2 bg-surfaceHighlight/30 border border-border rounded-lg text-xs hover:border-primary/50 transition-colors"
                      type="button"
                    >
                      <span className="truncate text-textMain">
                        {selectedScriptId ? (scripts.find((s) => s.id === selectedScriptId)?.title || "未知剧本") : "选择剧本"}
                        {selectedEpisodeId ? ` > ${episodes.find((e) => e.id === selectedEpisodeId)?.episode_code || ""}` : ""}
                      </span>
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectorTab(selectedEpisodeId ? "STORYBOARD" : "ASSETS");
                        setSelectorModalOpen(true);
                      }}
                      className="px-3 py-2 bg-primary/90 hover:bg-primary text-white rounded-lg text-xs"
                      type="button"
                    >
                      选择内容
                    </button>
                  </div>
                </div>

                {/* Markdown Preview */}
                <div className="space-y-2">
                   <label className="text-xs font-medium text-textMuted">资产描述 (Markdown)</label>
                   <div className="h-40 overflow-y-auto rounded-lg border border-border bg-surfaceHighlight/10 p-3">
                      {sourceLoading ? (
                        <div className="flex items-center justify-center h-full text-textMuted"><Loader2 size={14} className="animate-spin" /></div>
                      ) : sourceContent ? (
                        <div className="markdown-body prose prose-invert prose-xs max-w-none text-[11px] leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{sourceContent}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="text-xs text-textMuted text-center py-10">暂无描述内容</div>
                      )}
                   </div>
                </div>

                {studioError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs px-3 py-2">
                    {studioError}
                  </div>
                )}

                <ImagePromptComposer
                  prompt={prompt}
                  onPromptChange={handlePromptChange}
                  onPromptKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setMentionPopupOpen(false);
                      return;
                    }
                    if (e.key !== "Enter") return;
                    if (e.shiftKey) return;
                    e.preventDefault();
                    void handleGenerateAsset();
                  }}
                  promptRef={promptRef}
                  images={attachmentNodeIds.map((id, idx) => ({
                    id,
                    url: `/api/vfs/nodes/${encodeURIComponent(id)}/download`,
                    index: idx + 1,
                    isSelected: parseMentionIndices(prompt).includes(idx + 1),
                    title: `参考图 @${idx + 1}`,
                  }))}
                  mentionTabs={mentionTabs}
                  mentionPopupOpen={mentionPopupOpen}
                  mentionPosition={mentionPosition}
                  onMentionSelect={handleMentionSelect}
                  onCloseMention={() => setMentionPopupOpen(false)}
                  onUpload={addAssetImages}
                  onPreview={(url, _title) => setLightboxUrl(url)}
                  onInsertMention={insertAssetImageMention}
                  onRemoveAttachment={removeAssetAttachment}
                  disabled={isGenerating || isUploading}
                  submitDisabled={isGenerating || isUploading || !canGenerate}
                  onSubmit={handleGenerateAsset}
                  placeholder="请描述你想生成的图片，输入 @ 引用参考图"
                  generationLabel="图片生成"
                  modelLabel={(() => {
                    const cfg = aiModelConfigs.find((c) => c.id === selectedModelConfigId);
                    if (!cfg) return "未选择模型";
                    return `${cfg.manufacturer} · ${cfg.model}`;
                  })()}
                  attachmentCountLabel={`参考 ${attachmentNodeIds.length}/14`}
                  leftControls={
                    <div className="px-3 py-2 rounded-xl border border-border bg-surfaceHighlight/40 text-xs font-bold text-textMain">
                      {sessionId ? "会话已建立" : "会话未建立"}
                    </div>
                  }
                />
                
            {selectorModalOpen && (
              <div className="fixed inset-0 z-50">
                <div className="absolute inset-0 bg-black/50" onClick={() => setSelectorModalOpen(false)} />
                <div
                  className="absolute left-1/2 top-1/2 w-[980px] max-w-[95vw] bg-surface rounded-2xl border border-border shadow-xl overflow-hidden"
                  style={{ transform: `translate(calc(-50% + ${modalOffset.x}px), calc(-50% + ${modalOffset.y}px))` }}
                >
                  <div
                    className="p-3 border-b border-border flex items-center justify-between cursor-move"
                    onMouseDown={(e) => {
                      dragRef.current.dragging = true;
                      dragRef.current.startX = e.clientX;
                      dragRef.current.startY = e.clientY;
                      dragRef.current.originX = modalOffset.x;
                      dragRef.current.originY = modalOffset.y;
                    }}
                  >
                    <div className="text-xs font-bold text-textMain flex items-center gap-2">
                      <GripVertical size={14} className="text-textMuted" />
                      <span>剧本/剧集与内容选择</span>
                    </div>
                    <button onClick={() => setSelectorModalOpen(false)} className="text-textMuted hover:text-textMain" type="button">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="rounded-xl border border-border p-3 bg-surfaceHighlight/20 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="text-[10px] text-textMuted">剧本</div>
                          <select
                            value={selectedScriptId || ""}
                            onChange={(e) => {
                              const next = e.target.value || null;
                              setSelectedScriptId(next);
                              setSelectedEpisodeId(null);
                              setSelectorTab("ASSETS");
                            }}
                            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs"
                          >
                            <option value="">请选择剧本</option>
                            {scripts.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] text-textMuted">剧集</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setSelectedEpisodeId(null)}
                              className={`px-3 py-2 rounded-lg border text-[11px] ${
                                !selectedEpisodeId ? "border-primary text-primary bg-primary/5" : "border-border text-textMuted hover:border-primary/50"
                              }`}
                              type="button"
                            >
                              不指定
                            </button>
                            {episodes.map((e) => (
                              <button
                                key={e.id}
                                onClick={() => setSelectedEpisodeId(e.id)}
                                className={`px-3 py-2 rounded-lg border text-left text-[11px] ${
                                  selectedEpisodeId === e.id ? "border-primary text-primary bg-primary/5" : "border-border text-textMain hover:border-primary/50"
                                }`}
                                type="button"
                              >
                                <div className="font-semibold">{e.episode_code}</div>
                                {e.title && <div className="text-[10px] text-textMuted truncate">{e.title}</div>}
                              </button>
                            ))}
                          </div>
                          {selectedScriptId && episodes.length === 0 && (
                            <div className="text-[10px] text-textMuted">当前剧本暂无剧集</div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectorTab("ASSETS")}
                          className={`px-3 py-1.5 rounded text-xs transition-all ${
                            selectorTab === "ASSETS" ? "bg-primary text-white" : "bg-surfaceHighlight/40 text-textMain border border-border hover:border-primary/50"
                          }`}
                          type="button"
                        >
                          资产
                        </button>
                        <button
                          onClick={() => selectedEpisodeId && setSelectorTab("STORYBOARD")}
                          disabled={!selectedEpisodeId}
                          className={`px-3 py-1.5 rounded text-xs transition-all ${
                            selectorTab === "STORYBOARD"
                              ? "bg-primary text-white"
                              : !selectedEpisodeId
                                ? "bg-surfaceHighlight/20 text-textMuted border border-border cursor-not-allowed"
                                : "bg-surfaceHighlight/40 text-textMain border border-border hover:border-primary/50"
                          }`}
                          type="button"
                        >
                          故事板
                        </button>
                      </div>
                      {!selectedEpisodeId && selectorTab === "STORYBOARD" && (
                        <div className="text-[10px] text-red-500">请先选择剧集</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex items-center gap-2">
                        <Search size={14} className="text-textMuted" />
                        <input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="搜索名称或内容"
                          className="w-[200px] bg-surface border border-border rounded-lg px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="relative flex items-center gap-2">
                        <Tag size={14} className="text-textMuted" />
                        <input
                          value={tagTerm}
                          onChange={(e) => setTagTerm(e.target.value)}
                          placeholder="标签关键词"
                          className="w-[160px] bg-surface border border-border rounded-lg px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <ArrowUpDown size={14} className="text-textMuted" />
                        <select
                          value={sortKey}
                          onChange={(e) => setSortKey(e.target.value as "time" | "name" | "type")}
                          className="bg-surface border border-border rounded-lg px-2 py-1 text-xs"
                        >
                          <option value="time">按时间</option>
                          <option value="name">按名称</option>
                          <option value="type">按类型</option>
                        </select>
                        <button
                          onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                          className="px-2 py-1 rounded-lg border border-border text-xs text-textMain hover:border-primary/50"
                          type="button"
                        >
                          {sortDir === "asc" ? "升序" : "降序"}
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setMultiSelect((prev) => !prev);
                          setSelectedNodeIds(new Set());
                        }}
                        className={`px-3 py-1 rounded-lg border text-xs ${
                          multiSelect ? "border-primary text-primary bg-primary/10" : "border-border text-textMain hover:border-primary/50"
                        }`}
                        type="button"
                      >
                        多选模式
                      </button>
                      <div className="text-[10px] text-textMuted">
                        共 {activeFilteredNodes.length} 项
                      </div>
                    </div>
                    <div className="h-[420px] border border-border rounded-xl bg-surfaceHighlight/10">
                      {selectorTab === "ASSETS" &&
                        renderVirtualGrid(
                          assetFilteredNodes,
                          assetGridRef,
                          assetGridMetrics,
                          assetDocsLoading,
                          assetVisibleCount,
                          () =>
                            setAssetVisibleCount((prev) =>
                              Math.min(assetFilteredNodes.length, prev + 40),
                            ),
                        )}
                      {selectorTab === "STORYBOARD" &&
                        (selectedEpisodeId
                          ? renderVirtualGrid(
                              storyboardFilteredNodes,
                              storyboardGridRef,
                              storyGridMetrics,
                              storyboardLoading,
                              storyVisibleCount,
                              () =>
                                setStoryVisibleCount((prev) =>
                                  Math.min(storyboardFilteredNodes.length, prev + 40),
                                ),
                            )
                          : (
                            <div className="h-full flex items-center justify-center text-xs text-textMuted">请选择剧集以查看故事板</div>
                          ))}
                    </div>
                  </div>
                  <div className="p-3 border-t border-border flex items-center justify-between">
                    <div className="text-xs text-textMuted flex items-center gap-2">
                      <span>已选 {multiSelect ? selectedNodeIds.size : pendingSourceNodeId ? 1 : 0} 项</span>
                      {pendingSourceNodeId && !multiSelect && (
                        <span className="text-textMain">当前选择：{activeFilteredNodes.find((n) => n.id === pendingSourceNodeId)?.name || "—"}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {multiSelect && selectedNodeIds.size > 0 && (
                        <button
                          onClick={() => {
                            Array.from(selectedNodeIds).forEach((id) => openNodeInNewTab(id));
                          }}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs text-textMain hover:border-primary/50"
                          type="button"
                        >
                          批量打开
                        </button>
                      )}
                      <button
                        onClick={() => setSelectorModalOpen(false)}
                        className="px-3 py-1.5 rounded-lg border border-border text-xs text-textMain hover:border-primary/50"
                        type="button"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          const chosenNode = activeFilteredNodes.find((n) => n.id === confirmSourceNodeId);
                          const derivedAssetId = chosenNode ? deriveAssetIdFromNodeName(chosenNode.name, assets) : null;
                          setSelectedDraftId(derivedAssetId);
                          setQuery({ sourceNodeId: confirmSourceNodeId, assetId: derivedAssetId });
                          setSelectorModalOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs hover:bg-primary/90 disabled:opacity-50"
                        type="button"
                        disabled={!selectedScriptId}
                      >
                        应用选择
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {configDrawerOpen && (
              <div className="fixed inset-0 z-[55]">
                <div className="absolute inset-0 bg-black/40" onClick={() => setConfigDrawerOpen(false)} />
                <div className="absolute right-0 top-0 h-full w-[360px] bg-surface border-l border-border shadow-xl flex flex-col">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="text-sm font-bold text-textMain">图片生成配置</div>
                    <button onClick={() => setConfigDrawerOpen(false)} className="text-textMuted hover:text-textMain" type="button">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-textMuted">模型</div>
                      <select
                        value={selectedModelConfigId}
                        onChange={(e) => setSelectedModelConfigId(e.target.value)}
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs outline-none"
                        disabled={isGenerating}
                      >
                        {aiModelConfigs.length === 0 ? (
                          <option value="">暂无可用模型</option>
                        ) : (
                          aiModelConfigs.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.manufacturer} · {m.model}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium text-textMuted">分辨率</div>
                      <select
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs outline-none"
                        disabled={isGenerating}
                      >
                        <option value="1920x1920">1920x1920 (1:1)</option>
                        <option value="2560x1440">2560x1440 (16:9)</option>
                        <option value="1440x2560">1440x2560 (9:16)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-textMuted">
                        <span>可见性</span>
                        <span title="开启后可被其他剧本引用">
                          <HelpCircle size={12} className="text-textMuted" />
                        </span>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-textMain">
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={(e) => setIsPublic(e.target.checked)}
                          disabled={isGenerating}
                        />
                        允许其他剧本引用（默认开启）
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

             </div>
          </div>

          {/* Right Column: Results & History */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl flex flex-col overflow-hidden relative">
             <div className="p-4 border-b border-border bg-surfaceHighlight/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-textMain">
                     <Image size={16} className="text-primary" /> 生成结果
                  </h3>
                  <div className="text-xs text-textMuted">
                     已选 <span className="text-primary font-bold">{selectedImages.size}</span> 张
                     {coverImageId && <span className="ml-2">(含封面)</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <button
                     onClick={handleSaveAsset}
                     disabled={selectedImages.size === 0}
                     className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg shadow-sm flex items-center gap-2 text-xs font-bold transition-colors disabled:opacity-50 disabled:grayscale"
                     type="button"
                   >
                     <Save size={14} /> 保存到资产库
                   </button>
                </div>
             </div>

             {tasksRunning.length > 0 && (
               <div className="px-4 pt-3">
                 <div className="rounded-xl border border-border bg-surfaceHighlight/20 p-3 space-y-2">
                   <div className="text-xs font-semibold text-textMain">任务进度</div>
                   {tasksRunning.map((t) => {
                     const progress = typeof t.progress === "number" ? Math.max(0, Math.min(100, t.progress)) : 0;
                     const statusText =
                       t.status === "queued"
                         ? "排队中"
                         : t.status === "running"
                           ? "生成中"
                           : "处理中";
                     return (
                       <div key={t.id} className="space-y-1">
                         <div className="flex items-center justify-between text-[11px]">
                           <span className="text-textMain">{t.label}</span>
                           <span className="text-textMuted">
                             {statusText}
                             {progress > 0 ? ` ${progress}%` : ""}
                           </span>
                         </div>
                         <div className="h-1.5 rounded-full bg-surfaceHighlight/60 overflow-hidden">
                           <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}

          {lightboxUrl && (
            <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
              <img src={lightboxUrl} className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg border border-border" alt="preview" />
            </div>
          )}

             <div className="flex-1 overflow-y-auto p-4 bg-background/50">
                {generationHistory.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-textMuted space-y-3 opacity-60">
                      <div className="w-16 h-16 bg-surfaceHighlight rounded-2xl flex items-center justify-center">
                         <Image size={32} />
                      </div>
                      <div className="text-sm">暂无生成记录</div>
                      <div className="text-xs">配置左侧参数并点击生成</div>
                   </div>
                ) : (
                   <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                      {generationHistory.map((img) => {
                         const isSelected = selectedImages.has(img.id);
                         const isCover = coverImageId === img.id;
                         return (
                            <div 
                              key={img.id} 
                              className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"}`}
                              onClick={() => {
                                 const next = new Set(selectedImages);
                                 if (next.has(img.id)) next.delete(img.id);
                                 else next.add(img.id);
                                 setSelectedImages(next);
                                 // Auto set cover if it's the first one selected
                                 if (!coverImageId && next.size === 1 && next.has(img.id)) {
                                    setCoverImageId(img.id);
                                 }
                                 // Unset cover if deselected
                                 if (coverImageId === img.id && !next.has(img.id)) {
                                    setCoverImageId(null);
                                 }
                              }}
                            >
                               <img src={img.url} className="w-full h-full object-cover" alt="Generated" />
                               
                               {/* Selection Indicator */}
                               <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border border-white/50 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "bg-black/30 hover:bg-black/50"}`}>
                                  {isSelected && <CheckCircle size={12} className="text-white" />}
                               </div>

                               {/* Cover Indicator */}
                               {(isSelected || isCover) && (
                                  <button
                                    onClick={(e) => {
                                       e.stopPropagation();
                                       setCoverImageId(img.id);
                                       if (!selectedImages.has(img.id)) {
                                          setSelectedImages(prev => new Set(prev).add(img.id));
                                       }
                                    }}
                                    className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${isCover ? "bg-yellow-500 text-white shadow-lg" : "bg-black/30 text-white/50 hover:bg-yellow-500/80 hover:text-white"}`}
                                    title="设为封面"
                                  >
                                     <Star size={12} fill={isCover ? "currentColor" : "none"} />
                                  </button>
                               )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteGeneratedImage(img);
                                }}
                                disabled={!img.nodeId || deletingImageIds.has(img.id)}
                                className="absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center bg-black/40 text-white/70 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50 disabled:grayscale"
                                title="删除"
                              >
                                <Trash2 size={12} />
                              </button>

                               {/* Prompt Tooltip */}
                               <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 transform translate-y-full group-hover:translate-y-0 transition-transform">
                                  <p className="text-[10px] text-white/90 line-clamp-2">{img.prompt}</p>
                               </div>
                            </div>
                         );
                      })}
                   </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
