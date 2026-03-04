"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { addEdge, Controls, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useOnSelectionChange, useReactFlow } from "@xyflow/react";
import { buildReactFlowNodeTypes, getNodeType, getAllNodeTypes } from "@/lib/canvas/node-registry";
import NodeLibrary from "@/components/canvas/NodeLibrary";
import { useDataFlow } from "@/hooks/useDataFlow";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import TypedEdge, { TYPED_EDGE_TYPE } from "@/components/canvas/TypedEdge";
import CanvasToolbar from "@/components/canvas/CanvasToolbar";
import { serializeCanvas, exportToFile, exportSelectedNodes, importFromFile } from "@/lib/canvas/serializer";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { usePerformanceMode } from "@/hooks/usePerformanceMode";
import AlignmentGuides from "@/components/canvas/AlignmentGuides";
import type { DraggingNodeBounds, NodeBounds } from "@/components/canvas/AlignmentGuides";
import type { PerformanceMode, StoryboardNodeData, SlicerNodeData } from "@/lib/canvas/types";
import { createStoryboardNodesFromSlicerOutput, generateFullWorkflow } from "@/lib/canvas/workflow-generator";
import { needsMigration, migrateCanvasSnapshot } from "@/lib/canvas/migrate-canvas";
import { syncAfterSave, startupSyncValidation, uploadCanvasThumbnail } from "@/lib/canvas/canvas-sync";
import { ArrowLeft, Check, Loader2, AlertCircle, Pencil } from "lucide-react";

// ===== Shared types =====

type ScriptItem = { id: string; title: string };

type StoryboardRow = {
  id: string;
  shot_code: string;
  scene_code?: string | null;
  description?: string | null;
  dialogue?: string | null;
};

type AssetBriefResource = {
  id: string;
  res_type: string;
  meta_data?: { file_node_id?: string; [key: string]: any };
};

type AssetBrief = {
  id: string;
  asset_id: string;
  name: string;
  type: string;
  category?: string | null;
  resources?: AssetBriefResource[];
};

function assetThumbnailUrl(a: AssetBrief): string {
  const r = a.resources?.find(r => r.meta_data?.file_node_id);
  return r?.meta_data?.file_node_id ? `/api/vfs/nodes/${r.meta_data.file_node_id}/thumbnail` : '';
}

function assetResourceUrls(a: AssetBrief): { thumbnail: string; download: string }[] {
  return (a.resources ?? []).filter(r => r.meta_data?.file_node_id).map(r => ({
    thumbnail: `/api/vfs/nodes/${r.meta_data!.file_node_id}/thumbnail`,
    download: `/api/vfs/nodes/${r.meta_data!.file_node_id}/download`,
  }));
}

type EpisodeWithStoryboard = {
  id: string;
  episode_code: string;
  episode_number: number;
  title?: string | null;
  storyboards?: StoryboardRow[];
  assets?: AssetBrief[];
};

type VfsNode = {
  id: string;
  parent_id?: string | null;
  project_id?: string | null;
  name: string;
  is_folder: boolean;
  created_at: string;
  updated_at: string;
};

type AssetNodeData = {
  kind: "asset";
  assetId: string;
  name: string;
  assetType: string;
};

type WorkshopNodeData = AssetNodeData | StoryboardNodeData | Record<string, unknown>;

type WorkshopNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkshopNodeData;
  selected?: boolean;
};

type WorkshopEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: { relation?: "reference"; portType?: string };
};

// ===== VFS helpers =====

async function vfsListNodes(params: { parent_id?: string | null }): Promise<VfsNode[]> {
  const sp = new URLSearchParams();
  if (params.parent_id) sp.set("parent_id", params.parent_id);
  const res = await fetch(`/api/vfs/nodes?${sp.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: VfsNode[] };
  return Array.isArray(json.data) ? json.data : [];
}

async function vfsCreateFolder(payload: { name: string; parent_id?: string | null }): Promise<VfsNode> {
  const res = await fetch("/api/vfs/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: VfsNode };
  if (!json.data?.id) throw new Error("创建文件夹失败");
  return json.data;
}

async function vfsCreateFile(payload: { name: string; content: string; parent_id?: string | null }): Promise<VfsNode> {
  const res = await fetch("/api/vfs/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: VfsNode };
  if (!json.data?.id) throw new Error("创建文件失败");
  return json.data;
}

async function vfsDeleteNode(nodeId: string, opts: { recursive?: boolean } = {}): Promise<void> {
  const sp = new URLSearchParams();
  if (opts.recursive) sp.set("recursive", "true");
  const res = await fetch(`/api/vfs/nodes/${encodeURIComponent(nodeId)}?${sp.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

async function vfsDownloadText(nodeId: string): Promise<string> {
  const res = await fetch(`/api/vfs/nodes/${encodeURIComponent(nodeId)}/download`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return await res.text();
}

// ===== Ensure VFS canvas folder =====

async function ensureCanvasFolder(): Promise<string> {
  const root = await vfsListNodes({ parent_id: null });
  const workshop = root.find((n) => n.is_folder && n.name === "创作工坊") || (await vfsCreateFolder({ name: "创作工坊" }));
  const children = await vfsListNodes({ parent_id: workshop.id });
  const canvases = children.find((n) => n.is_folder && n.name === "画布") || (await vfsCreateFolder({ name: "画布", parent_id: workshop.id }));
  return canvases.id;
}

// ===== Top Toolbar (immersive) =====

function ImmersiveToolbar({
  canvasName,
  onNameChange,
  saveStatus,
}: {
  canvasName: string;
  onNameChange: (name: string) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(canvasName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditValue(canvasName);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, canvasName]);

  const commitName = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== canvasName) {
      onNameChange(trimmed);
    }
    setEditing(false);
  };

  return (
    <header className="h-10 shrink-0 border-b border-border/50 bg-background/80 backdrop-blur flex items-center justify-between px-3 z-20 relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/studio")}
          className="w-7 h-7 rounded-md hover:bg-surfaceHighlight flex items-center justify-center text-textMuted hover:text-textMain transition-colors"
          title="返回画布列表 (ESC)"
        >
          <ArrowLeft size={15} />
        </button>

        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-7 w-48 rounded-md border border-primary/40 bg-background px-2 text-sm text-textMain outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 h-7 px-2 rounded-md hover:bg-surfaceHighlight text-sm font-medium text-textMain transition-colors group"
          >
            <span className="truncate max-w-[200px]">{canvasName}</span>
            <Pencil size={11} className="text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-textMuted">
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" />保存中…</span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1 text-green-400"><Check size={12} />已保存</span>
        )}
        {saveStatus === "error" && (
          <span className="flex items-center gap-1 text-red-400"><AlertCircle size={12} />保存失败</span>
        )}
      </div>
    </header>
  );
}

// ===== Reference Data Browser (Right Panel) =====

function ReferenceDataBrowser({
  collapsed,
  activeTab,
  setActiveTab,
  onToggleCollapsed,
  children,
}: {
  collapsed: boolean;
  activeTab: "scripts" | "storyboards" | "assets" | "details";
  setActiveTab: (tab: "scripts" | "storyboards" | "assets" | "details") => void;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "scripts", label: "剧本" },
    { key: "storyboards", label: "故事板" },
    { key: "assets", label: "资产库" },
    { key: "details", label: "画布详情" },
  ];

  return (
    <div
      className={[
        "shrink-0 border-l border-border bg-background/70 backdrop-blur flex flex-col",
        collapsed ? "w-10" : "w-80",
      ].join(" ")}
    >
      <div className="h-10 flex items-center justify-between px-2 border-b border-border/50">
        {collapsed ? (
          <div className="w-full flex items-center justify-center text-xs text-textMuted">▸</div>
        ) : (
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "px-2 py-1 rounded-md text-[11px] whitespace-nowrap transition-colors",
                  activeTab === tab.key ? "bg-surface text-textMain font-medium" : "text-textMuted hover:text-textMain",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          className="w-6 h-6 rounded-md hover:bg-surface flex items-center justify-center text-textMuted hover:text-textMain shrink-0"
        >
          {collapsed ? "◂" : "▸"}
        </button>
      </div>
      {collapsed ? null : <div className="flex-1 overflow-auto">{children}</div>}
    </div>
  );
}

// ===== Main Editor =====

function StudioCanvasEditor() {
  const params = useParams();
  const router = useRouter();
  const canvasId = params.canvasId as string;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rf = useReactFlow() as any;
  const screenToFlowPosition = rf.screenToFlowPosition as (pos: { x: number; y: number }) => { x: number; y: number };
  const rfAddNodes = rf.addNodes as (nodes: any[]) => void;

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkshopNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkshopEdge>([]);

  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [collapsedRight, setCollapsedRight] = useState(false);
  const [activeTab, setActiveTab] = useState<"scripts" | "storyboards" | "assets" | "details">("storyboards");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const [canvasName, setCanvasName] = useState("未命名画布");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reference data states
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [activeScriptId, setActiveScriptId] = useState("");

  const [episodes, setEpisodes] = useState<EpisodeWithStoryboard[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState("");

  const [selectedInspectorItem, setSelectedInspectorItem] = useState<
    | null
    | { kind: "storyboard"; shotCode: string; description?: string; dialogue?: string }
    | { kind: "asset"; name: string; assetType: string }
  >(null);

  const { mode: perfMode, setMode: setPerfMode, getNodeRenderLevel, suggestedMode } = usePerformanceMode(nodes.length);
  const [layoutMode, setLayoutMode] = useState<"card" | "timeline">("card");
  const { push: pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo(setNodes as any, setEdges as any);
  const clipboardRef = useRef<{ nodes: any[]; edges: any[] } | null>(null);
  const saveCountRef = useRef(0);
  const [draggingNodeBounds, setDraggingNodeBounds] = useState<DraggingNodeBounds | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  useOnSelectionChange({
    onChange: ({ nodes: selected }) => {
      setSelectedNodeId(selected[0]?.id ?? null);
      setSelectedNodeIds(selected.map((n) => n.id));
    },
  });

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const activeEpisode = useMemo(() => {
    if (!activeEpisodeId) return null;
    return episodes.find((e) => e.id === activeEpisodeId) || null;
  }, [episodes, activeEpisodeId]);

  // --- Load scripts ---
  useEffect(() => {
    let cancelled = false;
    setScriptsLoading(true);
    setScriptsError(null);
    (async () => {
      const res = await fetch("/api/scripts?page=1&size=100", { cache: "no-store" });
      if (!res.ok) { if (!cancelled) setScriptsError(await res.text()); return; }
      const json = (await res.json()) as { data?: { items?: ScriptItem[] } };
      if (cancelled) return;
      setScripts(Array.isArray(json.data?.items) ? json.data?.items! : []);
    })()
      .catch((e) => { if (!cancelled) setScriptsError(String(e?.message || e)); })
      .finally(() => { if (!cancelled) setScriptsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // --- Load episodes when script changes ---
  useEffect(() => {
    if (!activeScriptId) { setEpisodes([]); setActiveEpisodeId(""); return; }
    let cancelled = false;
    setEpisodesLoading(true);
    setEpisodesError(null);
    (async () => {
      const res = await fetch(`/api/scripts/${encodeURIComponent(activeScriptId)}/hierarchy`, { cache: "no-store" });
      if (!res.ok) { if (!cancelled) setEpisodesError(await res.text()); return; }
      const json = (await res.json()) as { data?: { episodes?: EpisodeWithStoryboard[] } };
      const list = Array.isArray(json.data?.episodes) ? json.data?.episodes! : [];
      if (cancelled) return;
      setEpisodes(list);
      setActiveEpisodeId((prev) => prev || list[0]?.id || "");
    })()
      .catch((e) => { if (!cancelled) setEpisodesError(String(e?.message || e)); })
      .finally(() => { if (!cancelled) setEpisodesLoading(false); });
    return () => { cancelled = true; };
  }, [activeScriptId]);

  // --- VFS save/load ---
  const getSnapshot = useCallback(() => {
    const base = serializeCanvas(canvasId, nodes as any, edges as any, viewport);
    return { ...base, name: canvasName, status: "active" };
  }, [canvasId, edges, nodes, viewport, canvasName]);

  const saveToVfs = useCallback(async () => {
    if (!canvasId) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const folderId = await ensureCanvasFolder();
      const existing = await vfsListNodes({ parent_id: folderId });
      const filename = `${canvasId}.json`;
      const old = existing.find((n) => !n.is_folder && n.name === filename);
      if (old) await vfsDeleteNode(old.id);
      const content = JSON.stringify(getSnapshot(), null, 2);
      await vfsCreateFile({ name: filename, content, parent_id: folderId });
      localStorage.removeItem(`studio_canvas_draft_${canvasId}`);
      setSaveStatus("saved");
      // M2.5: Fire-and-forget DB sync after VFS save
      void syncAfterSave(canvasId, canvasName, nodes as any[]);
      // M4.4: Throttled thumbnail capture — every 5th save
      saveCountRef.current += 1;
      if (saveCountRef.current % 5 === 1) {
        void (async () => {
          try {
            const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
            if (!el) return;
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(el, { width: 400, height: 300, quality: 0.7, skipAutoScale: true });
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            void uploadCanvasThumbnail(canvasId, b64, 'image/png');
          } catch { /* thumbnail capture is best-effort */ }
        })();
      }
    } catch (e: any) {
      localStorage.setItem(`studio_canvas_draft_${canvasId}`, JSON.stringify(getSnapshot(), null, 2));
      setSaveStatus("error");
      setSaveError(String(e?.message || e));
    }
  }, [canvasId, getSnapshot]);

  // Load canvas on mount
  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    (async () => {
      const folderId = await ensureCanvasFolder();
      const existing = await vfsListNodes({ parent_id: folderId });
      const filename = `${canvasId}.json`;
      const node = existing.find((n) => !n.is_folder && n.name === filename);
      if (!node) {
        const draft = localStorage.getItem(`studio_canvas_draft_${canvasId}`);
        if (draft) {
          try {
            const parsed = JSON.parse(draft);
            if (!cancelled && parsed?.reactflow?.nodes && parsed?.reactflow?.edges) {
              setNodes(parsed.reactflow.nodes);
              setEdges(parsed.reactflow.edges);
              if (parsed.reactflow.viewport) setViewport(parsed.reactflow.viewport);
              if (parsed.name) setCanvasName(parsed.name);
            }
          } catch { /* ignore */ }
        }
        return;
      }
      const txt = await vfsDownloadText(node.id);
      let parsed = JSON.parse(txt);
      // M1.2: Lazy migration for deprecated node types & old port names
      if (parsed?.reactflow && needsMigration(parsed)) {
        parsed = migrateCanvasSnapshot(parsed);
      }
      if (!cancelled) {
        if (parsed?.reactflow?.nodes && parsed?.reactflow?.edges) {
          setNodes(parsed.reactflow.nodes);
          setEdges(parsed.reactflow.edges);
          if (parsed.reactflow.viewport) setViewport(parsed.reactflow.viewport);
          // M3.4: Startup sync validation — repair VFS/DB drift (fire-and-forget)
          void startupSyncValidation(canvasId, parsed.reactflow.nodes);
        }
        if (parsed.name) setCanvasName(parsed.name);
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [canvasId, setEdges, setNodes]);

  // DEBUG: Monitor nodes count changes
  useEffect(() => {
    console.log('[DEBUG] nodes count:', nodes.length, 'types:', nodes.map((n: any) => n.type).join(','));
  }, [nodes]);

  // Auto-save debounce
  useEffect(() => {
    if (!canvasId) return;
    const t = window.setTimeout(() => { void saveToVfs(); }, 800);
    return () => window.clearTimeout(t);
  }, [canvasId, edges, nodes, saveToVfs, viewport]);

  // ESC to go back
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") router.push("/studio");
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [router]);

  const { onConnect: validateConnect, topologyOrder, hasCycle, propagate } = useDataFlow(nodes as any, edges as any, setNodes as any);

  // --- Batch queue ---
  const executeTask = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error("Node not found");
    const data = node.data as any;
    const mode = data.generationMode || 'image';
    const endpoint = mode === 'video' ? '/api/ai/video/generate' : '/api/ai/image/generate';
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: data.prompt || "", neg_prompt: data.negPrompt || "", resolution: data.aspectRatio || "1:1" }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    return json.data?.task_id || json.task_id || "";
  }, [nodes]);

  const { enqueue, start, stopAll, cancelTask, queueState } = useBatchQueue({ executeTask, maxConcurrency: 3 });

  const handleGenerateFromPanel = useCallback((nid: string) => {
    enqueue([nid], nodes, edges);
    start();
  }, [enqueue, start, nodes, edges]);

  useEffect(() => {
    for (const item of queueState.items) {
      if (item.status === "succeeded") {
        const node = nodes.find((n) => n.id === item.nodeId);
        if (node) {
          const data = node.data as any;
          if (data.lastImage) propagate(item.nodeId, "out", data.lastImage);
        }
      }
    }
  }, [queueState.items, nodes, propagate]);

  // --- Storyboard node sync ---
  const storyboardSyncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const storyboardNodes = nodes.filter(
      (n: any) => n.type === "storyboardNode" && n.data?.kind === "storyboard" && n.data?.sourceStoryboardId,
    );
    for (const node of storyboardNodes) {
      const data = node.data as unknown as StoryboardNodeData;
      const storyboardId = data.sourceStoryboardId!;
      const key = node.id;
      const existing = storyboardSyncTimers.current.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        storyboardSyncTimers.current.delete(key);
        fetch(`/api/storyboards/${encodeURIComponent(storyboardId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ description: data.sceneDescription || "", dialogue: data.dialogue || "" }),
        }).catch((err) => console.error(`[StoryboardSync] Failed:`, err));
      }, 1000);
      storyboardSyncTimers.current.set(key, timer);
    }
    return () => { for (const timer of storyboardSyncTimers.current.values()) clearTimeout(timer); };
  }, [nodes]);

  // --- Auto-create storyboard nodes from slicer ---
  const processedSlicerOutputs = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const slicerNodes = nodes.filter((n: any) => n.type === 'slicerNode' && n.data?.kind === 'slicer');
    for (const node of slicerNodes) {
      const data = node.data as unknown as SlicerNodeData;
      const items = data.storyboardItems;
      if (!items || items.length === 0) continue;
      const prevCount = processedSlicerOutputs.current.get(node.id);
      if (prevCount === items.length) continue;
      processedSlicerOutputs.current.set(node.id, items.length);
      const slicerPos = node.position ?? { x: 0, y: 0 };
      const result = createStoryboardNodesFromSlicerOutput(node.id, items, { x: slicerPos.x, y: slicerPos.y + 200 });
      if (result.nodes.length > 0) {
        setNodes((ns) => ns.concat(result.nodes as any));
        if (result.edges.length > 0) setEdges((es) => es.concat(result.edges as any));
      }
    }
  }, [nodes, setNodes, setEdges]);

  // --- Execution handlers ---
  const handleRunAll = useCallback(() => { enqueue(nodes.map((n) => n.id), nodes, edges); start(); }, [nodes, edges, enqueue, start]);
  const handleRunSelected = useCallback(() => { enqueue(selectedNodeIds, nodes, edges); start(); }, [selectedNodeIds, nodes, edges, enqueue, start]);
  const handleStopAll = useCallback(() => { stopAll(); }, [stopAll]);

  const hasStoryboardSelection = useMemo(() => {
    return selectedNodeIds.some((id) => nodes.find((n) => n.id === id)?.type === 'storyboardNode');
  }, [selectedNodeIds, nodes]);

  const handleBatchGenerateImage = useCallback(() => {
    const sbIds = selectedNodeIds.filter((id) => nodes.find((n) => n.id === id)?.type === 'storyboardNode');
    const genIds: string[] = [];
    for (const sbId of sbIds) {
      for (const edge of edges.filter((e: any) => e.source === sbId)) {
        const t = nodes.find((n) => n.id === (edge as any).target);
        if ((t?.type === 'imageOutputNode' || t?.type === 'videoOutputNode') && !genIds.includes(t.id)) genIds.push(t.id);
      }
    }
    if (genIds.length > 0) { enqueue(genIds, nodes, edges); start(); }
  }, [selectedNodeIds, nodes, edges, enqueue, start]);

  const handleBatchGenerateVideo = handleBatchGenerateImage;

  // --- Layout mode ---
  const handleLayoutModeChange = useCallback((mode: 'card' | 'timeline') => {
    setLayoutMode(mode);
    const sorted = [...nodes.filter((n: any) => n.type === 'storyboardNode')]
      .sort((a: any, b: any) => ((a.data as any)?.shotNumber ?? 0) - ((b.data as any)?.shotNumber ?? 0));
    if (sorted.length === 0) return;
    const anchor = sorted[0]?.position ?? { x: 0, y: 0 };
    pushUndo({ nodes: nodes as any, edges: edges as any });
    const idToPos = new Map<string, { x: number; y: number }>();
    if (mode === 'timeline') {
      sorted.forEach((n, i) => idToPos.set(n.id, { x: anchor.x + i * 300, y: anchor.y }));
    } else {
      sorted.forEach((n, i) => idToPos.set(n.id, { x: anchor.x + (i % 4) * 250, y: anchor.y + Math.floor(i / 4) * 200 }));
    }
    setNodes((ns) => ns.map((n: any) => { const pos = idToPos.get(n.id); return pos ? { ...n, position: pos } : n; }) as any);
  }, [nodes, setNodes, pushUndo, edges]);

  // --- Import / Export ---
  const handleExportWorkflow = useCallback(() => {
    exportToFile(serializeCanvas(canvasId, nodes as any, edges as any, viewport));
  }, [canvasId, nodes, edges, viewport]);
  const handleExportSelected = useCallback(() => {
    exportToFile(exportSelectedNodes(selectedNodeIds, nodes as any, edges as any, canvasId));
  }, [selectedNodeIds, nodes, edges, canvasId]);
  const handleImportWorkflow = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json"; input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      const result = await importFromFile(file);
      if (result.success) {
        const imported = result.snapshot;
        const idMap = new Map<string, string>();
        const newNodes = imported.reactflow.nodes.map((n) => {
          const newId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          idMap.set(n.id, newId);
          return { id: newId, type: n.type, position: { x: n.position.x + 100, y: n.position.y + 100 }, data: n.data };
        });
        const newEdges = imported.reactflow.edges
          .filter((e) => idMap.has(e.source) && idMap.has(e.target))
          .map((e) => ({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            source: idMap.get(e.source)!, target: idMap.get(e.target)!,
            sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
            type: TYPED_EDGE_TYPE, data: e.data,
          }));
        setNodes((ns) => ns.concat(newNodes as any));
        setEdges((es) => es.concat(newEdges as any));
      } else { alert(`导入失败：${result.errors.join(", ")}`); }
    };
    document.body.appendChild(input); input.click(); document.body.removeChild(input);
  }, [setNodes, setEdges]);

  // --- Context menu ---
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: any) => {
    event.preventDefault();
    if (node.type !== "imageOutputNode" && node.type !== "videoOutputNode") return;
    const q = queueState.items.find((i) => i.nodeId === node.id);
    if (!q || q.status !== "running") return;
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, [queueState.items]);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && (e.key === "a" || e.key === "A") && !e.shiftKey) {
        e.preventDefault(); setNodes((ns) => ns.map((n) => ({ ...n, selected: true })) as any); return;
      }
      if (isCtrl && (e.key === "c" || e.key === "C") && !e.shiftKey) {
        e.preventDefault();
        const sel = nodes.filter((n: any) => n.selected); if (sel.length === 0) return;
        const ids = new Set(sel.map((n) => n.id));
        clipboardRef.current = { nodes: sel as any, edges: edges.filter((ed: any) => ids.has(ed.source) && ids.has(ed.target)) as any };
        return;
      }
      if (isCtrl && (e.key === "v" || e.key === "V") && !e.shiftKey) {
        e.preventDefault();
        if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return;
        pushUndo({ nodes: nodes as any, edges: edges as any });
        const idMap = new Map<string, string>();
        const newNodes = clipboardRef.current.nodes.map((n: any) => {
          const newId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          idMap.set(n.id, newId);
          return { ...n, id: newId, position: { x: n.position.x + 50, y: n.position.y + 50 }, selected: false };
        });
        const newEdges = clipboardRef.current.edges
          .filter((ed: any) => idMap.has(ed.source) && idMap.has(ed.target))
          .map((ed: any) => ({ ...ed, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, source: idMap.get(ed.source)!, target: idMap.get(ed.target)!, selected: false }));
        setNodes((ns) => ns.concat(newNodes as any));
        setEdges((es) => es.concat(newEdges as any));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isCtrl) {
        e.preventDefault();
        const selNodeIds = new Set(nodes.filter((n: any) => n.selected).map((n) => n.id));
        const selEdgeIds = new Set(edges.filter((ed: any) => ed.selected).map((ed) => ed.id));
        if (selNodeIds.size === 0 && selEdgeIds.size === 0) return;
        pushUndo({ nodes: nodes as any, edges: edges as any });
        if (selNodeIds.size > 0) {
          setNodes((ns) => ns.filter((n) => !selNodeIds.has(n.id)) as any);
        }
        setEdges((es) => es.filter((ed: any) => !selEdgeIds.has(ed.id) && !selNodeIds.has(ed.source) && !selNodeIds.has(ed.target)) as any);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, setNodes, setEdges, pushUndo]);

  // --- Alignment guides ---
  const onNodeDrag = useCallback((_event: React.MouseEvent, dragNode: any) => {
    setDraggingNodeBounds({
      x: dragNode.position.x, y: dragNode.position.y,
      width: dragNode.measured?.width ?? dragNode.width ?? 200,
      height: dragNode.measured?.height ?? dragNode.height ?? 100,
    });
  }, []);
  const onNodeDragStop = useCallback(() => setDraggingNodeBounds(null), []);
  const otherNodeBounds = useMemo<NodeBounds[]>(() => {
    if (!draggingNodeBounds) return [];
    return nodes.filter((n: any) => !n.dragging).map((n: any) => ({
      id: n.id, x: n.position.x, y: n.position.y,
      width: n.measured?.width ?? n.width ?? 200, height: n.measured?.height ?? n.height ?? 100,
    }));
  }, [nodes, draggingNodeBounds]);

  // --- Connection ---
  const onConnect = useCallback((connection: any) => {
    if (!validateConnect(connection)) return;
    pushUndo({ nodes: nodes as any, edges: edges as any });
    setEdges((eds) => addEdge({ ...connection, type: TYPED_EDGE_TYPE, data: { relation: "reference" } }, eds as any) as any);
    // AssetBinding creation
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (sourceNode?.type === "assetNode" && targetNode?.type === "storyboardNode" && connection.targetHandle === "in") {
      const aData = sourceNode.data as unknown as AssetNodeData;
      const sData = targetNode.data as unknown as StoryboardNodeData;
      if (aData.assetId && sData.sourceStoryboardId) {
        fetch("/api/asset-bindings", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ asset_id: aData.assetId, storyboard_id: sData.sourceStoryboardId, episode_id: sData.episodeId || undefined }),
        }).catch((err) => console.error("[AssetBinding] Failed:", err));
      }
    }
  }, [setEdges, validateConnect, pushUndo, nodes, edges]);

  // --- Drop ---
  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }, []);

  const beginDrag = useCallback((event: React.DragEvent, payload: unknown) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const nodeTypeStr = event.dataTransfer.getData("application/reactflow-node-type");
    console.log('[onDrop] step1: nodeTypeStr=', nodeTypeStr, 'registrySize=', getAllNodeTypes().size);
    if (nodeTypeStr) {
      const reg = getNodeType(nodeTypeStr);
      console.log('[onDrop] step2: reg=', reg ? reg.type : 'UNDEFINED');
      if (!reg) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      console.log('[onDrop] step3: pos=', pos);
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      pushUndo({ nodes: nodes as any, edges: edges as any });
      const newNode = { id, type: reg.type, position: pos, data: reg.defaultData() };
      console.log('[onDrop] step4: adding node via rfAddNodes', newNode);
      rfAddNodes([newNode as any]);
      return;
    }
    const raw = event.dataTransfer.getData("application/reactflow");
    if (!raw) return;
    let payload: any;
    try { payload = JSON.parse(raw); } catch { payload = null; }
    if (!payload || typeof payload !== "object") return;
    const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (payload.kind === "reference") {
      // M1.2: referenceNode merged into storyboardNode
      pushUndo({ nodes: nodes as any, edges: edges as any });
      rfAddNodes([{ id, type: "storyboardNode", position: pos, data: {
        kind: "storyboard", shotNumber: 0,
        sceneDescription: payload.description ? String(payload.description) : String(payload.title || ""),
        dialogue: payload.dialogue ? String(payload.dialogue) : undefined,
        sourceStoryboardId: payload.sourceInfo?.shotCode ? undefined : undefined,
      } as StoryboardNodeData } as any]);
      return;
    }
    if (payload.kind === "storyboard") {
      const shotCodeStr = String(payload.shotCode || "");
      const shotNumMatch = shotCodeStr.match(/(\d+)\s*$/);
      pushUndo({ nodes: nodes as any, edges: edges as any });
      rfAddNodes([{ id, type: "storyboardNode", position: pos, data: {
        kind: "storyboard", shotNumber: shotNumMatch ? parseInt(shotNumMatch[1], 10) : 1,
        sceneDescription: payload.description ? String(payload.description) : "",
        dialogue: payload.dialogue ? String(payload.dialogue) : undefined,
        sourceStoryboardId: payload.storyboardId ? String(payload.storyboardId) : undefined,
        episodeId: payload.episodeId ? String(payload.episodeId) : undefined,
      } as StoryboardNodeData } as any]);
      return;
    }
    if (payload.kind === "asset") {
      pushUndo({ nodes: nodes as any, edges: edges as any });
      rfAddNodes([{ id, type: "assetNode", position: pos, data: {
        kind: "asset", assetId: String(payload.assetId || ""),
        name: String(payload.name || "资产"), assetType: String(payload.assetType || ""),
        thumbnail: payload.thumbnail ? String(payload.thumbnail) : undefined,
        resources: Array.isArray(payload.resources) ? payload.resources : undefined,
        activeResourceIndex: 0,
      } as AssetNodeData } as any]);
      return;
    }
  }, [screenToFlowPosition, rfAddNodes, pushUndo, nodes, edges]);

  const nodeTypes = useMemo(() => buildReactFlowNodeTypes(), []);
  const edgeTypes = useMemo(() => ({ [TYPED_EDGE_TYPE]: TypedEdge }), []);

  // Canvas name change handler
  const handleCanvasNameChange = useCallback((name: string) => {
    setCanvasName(name);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen">
      <ImmersiveToolbar canvasName={canvasName} onNameChange={handleCanvasNameChange} saveStatus={saveStatus} />

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative" ref={wrapperRef} style={{ backgroundColor: 'rgb(16, 14, 26)' }}>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(160,160,160,0.12) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
              pointerEvents: "none",
            }}
          />
          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes as any}
              edges={edges as any}
              onNodesChange={onNodesChange as any}
              onEdgesChange={onEdgesChange as any}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onMove={(_evt: any, vp: any) => { if (vp && typeof vp.zoom === "number") setViewport(vp); }}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={closeContextMenu}
              nodeTypes={nodeTypes as any}
              edgeTypes={edgeTypes as any}
              selectionOnDrag
              selectionKeyCode="Control"
              multiSelectionKeyCode="Control"
              deleteKeyCode={null}
              minZoom={0.1}
              maxZoom={2}
              fitView
            >
              <Controls className="!left-4 !bottom-4 !top-auto !flex !flex-row !w-auto !h-auto !bg-surface/90 !backdrop-blur !border !border-border !rounded-lg !shadow-xl" />
              <AlignmentGuides draggingNode={draggingNodeBounds} otherNodes={otherNodeBounds} />
            </ReactFlow>
            <NodeLibrary />
            <CanvasToolbar
              onRunAll={handleRunAll}
              onRunSelected={handleRunSelected}
              onStopAll={handleStopAll}
              queueState={queueState}
              onExportWorkflow={handleExportWorkflow}
              onImportWorkflow={handleImportWorkflow}
              onExportSelected={handleExportSelected}
              hasSelection={selectedNodeIds.length > 0}
              hasStoryboardSelection={hasStoryboardSelection}
              onBatchGenerateImage={handleBatchGenerateImage}
              onBatchGenerateVideo={handleBatchGenerateVideo}
              performanceMode={perfMode}
              onPerformanceModeChange={setPerfMode}
              layoutMode={layoutMode}
              onLayoutModeChange={handleLayoutModeChange}
            />
          </div>

          {contextMenu && (
            <>
              <div className="fixed inset-0 z-50" onClick={closeContextMenu} />
              <div className="fixed z-50 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[140px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
                <button type="button" onClick={() => { cancelTask(contextMenu.nodeId); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                  停止此任务
                </button>
              </div>
            </>
          )}

        </div>

        {/* Right panel: Reference Data Browser */}
        <ReferenceDataBrowser
          collapsed={collapsedRight}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onToggleCollapsed={() => setCollapsedRight((v) => !v)}
        >
          {activeTab === "scripts" && (
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-xs text-textMuted">选择剧本</div>
                <select value={activeScriptId} onChange={(e) => setActiveScriptId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-textMain">
                  <option value="">{scriptsLoading ? "加载中…" : "选择剧本"}</option>
                  {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                {scriptsError && <div className="text-xs text-red-500">{scriptsError}</div>}
              </div>
              <p className="text-[10px] text-textMuted">选择剧本后可在「故事板」标签中浏览镜头，拖拽到画布创建节点</p>
            </div>
          )}

          {activeTab === "storyboards" && (
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-xs text-textMuted">剧本</div>
                <select value={activeScriptId} onChange={(e) => setActiveScriptId(e.target.value)}
                  className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-textMain">
                  <option value="">{scriptsLoading ? "加载中…" : "选择剧本"}</option>
                  {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-textMuted">分集</div>
                <select value={activeEpisodeId} onChange={(e) => setActiveEpisodeId(e.target.value)}
                  className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-textMain"
                  disabled={!activeScriptId || episodesLoading}>
                  <option value="">{episodesLoading ? "加载中…" : "选择分集"}</option>
                  {episodes.map((ep) => <option key={ep.id} value={ep.id}>{ep.episode_code} {ep.title ? `· ${ep.title}` : ""}</option>)}
                </select>
                {episodesError && <div className="text-xs text-red-500">{episodesError}</div>}
              </div>
              {activeEpisode && activeEpisode.storyboards && activeEpisode.storyboards.length > 0 && (
                <button type="button" onClick={() => {
                  const result = generateFullWorkflow({
                    episodeId: activeEpisodeId, scriptText: '',
                    storyboards: (activeEpisode.storyboards ?? []).map((sb) => ({
                      id: sb.id, shot_code: sb.shot_code,
                      scene_code: sb.scene_code ?? undefined, description: sb.description ?? undefined, dialogue: sb.dialogue ?? undefined,
                    })),
                  }, { x: 100, y: 100 });
                  pushUndo({ nodes: nodes as any, edges: edges as any });
                  setNodes((ns) => ns.concat(result.nodes as any));
                  setEdges((es) => es.concat(result.edges as any));
                }} className="w-full h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
                  一键生成工作流
                </button>
              )}
              <div className="space-y-2">
                <div className="text-xs text-textMuted">镜头列表</div>
                {(activeEpisode?.storyboards || []).map((sb) => (
                  <div key={sb.id} draggable
                    onDragStart={(e) => beginDrag(e, {
                      kind: "storyboard", shotCode: sb.shot_code, sceneCode: sb.scene_code || undefined,
                      description: sb.description || undefined, dialogue: sb.dialogue || undefined,
                      storyboardId: sb.id, episodeId: activeEpisodeId,
                    })}
                    className="p-2.5 rounded-lg border border-border bg-surfaceHighlight hover:bg-surface cursor-grab active:cursor-grabbing">
                    <div className="text-xs text-textMain font-medium">{sb.shot_code}</div>
                    <div className="text-[10px] text-textMuted line-clamp-2">{sb.description || sb.dialogue || ""}</div>
                  </div>
                ))}
                {!activeEpisode?.storyboards?.length && (
                  <div className="text-xs text-textMuted">{activeScriptId ? "暂无镜头" : "请选择剧本和分集"}</div>
                )}
              </div>
            </div>
          )}

          {activeTab === "assets" && (
            <div className="p-4 space-y-3">
              <div className="text-xs text-textMuted">项目资产</div>
              {(activeEpisode?.assets || []).map((a) => {
                const thumb = assetThumbnailUrl(a);
                const urls = assetResourceUrls(a);
                return (
                  <div key={a.id} draggable
                    onDragStart={(e) => beginDrag(e, {
                      kind: "asset", assetId: a.id, name: a.name, assetType: a.type,
                      thumbnail: thumb, resources: urls,
                    })}
                    className="rounded-lg border border-border bg-surfaceHighlight hover:bg-surface cursor-grab active:cursor-grabbing overflow-hidden">
                    {thumb && (
                      <div className="w-full aspect-[16/10] bg-black/20 flex items-center justify-center">
                        <img src={thumb} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="p-2">
                      <div className="text-xs text-textMain font-medium truncate">{a.name}</div>
                      <div className="text-[10px] text-textMuted flex items-center gap-1">
                        <span>{a.type}</span>
                        {urls.length > 1 && <span className="text-textMuted/50">· {urls.length}张图</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!activeEpisode?.assets?.length && (
                <div className="text-xs text-textMuted">{activeScriptId ? "暂无资产" : "请先在故事板标签中选择剧本与分集"}</div>
              )}
            </div>
          )}

          {activeTab === "details" && (
            <div className="p-4 space-y-3">
              <div className="text-xs text-textMuted">画布信息</div>
              <div className="space-y-1">
                <div className="text-xs text-textMuted">ID: <span className="text-textMain font-mono text-[10px]">{canvasId}</span></div>
                <div className="text-xs text-textMuted">节点数: <span className="text-textMain">{nodes.length}</span></div>
                <div className="text-xs text-textMuted">连线数: <span className="text-textMain">{edges.length}</span></div>
              </div>
              {saveStatus === "error" && saveError && <div className="text-xs text-red-500">{saveError}</div>}
              <div className="h-px bg-border" />
              <div className="text-xs text-textMuted">选中节点</div>
              {selectedNode ? (
                <div className="space-y-1">
                  <div className="text-xs text-textMain font-medium">{(selectedNode.data as any).kind}</div>
                  <div className="text-[10px] text-textMuted break-all">{selectedNode.id}</div>
                </div>
              ) : (
                <div className="text-xs text-textMuted">未选中</div>
              )}
            </div>
          )}
        </ReferenceDataBrowser>
      </div>
    </div>
  );
}

// LlmPromptPanel removed in M1.3 — replaced by GeneratorPromptPanel component

// ===== Page Export =====

export default function CanvasEditorPage() {
  return (
    <ReactFlowProvider>
      <StudioCanvasEditor />
    </ReactFlowProvider>
  );
}
