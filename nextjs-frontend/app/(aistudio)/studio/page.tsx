"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addEdge, Controls, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useOnSelectionChange, useReactFlow } from "@xyflow/react";
import { buildReactFlowNodeTypes, getNodeType } from "@/lib/canvas/node-registry";
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

type ScriptItem = {
  id: string;
  title: string;
};

type StoryboardRow = {
  id: string;
  shot_code: string;
  scene_code?: string | null;
  description?: string | null;
  dialogue?: string | null;
};

type AssetBrief = {
  id: string;
  asset_id: string;
  name: string;
  type: string;
  category?: string | null;
};

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

async function vfsListNodes(params: { parent_id?: string | null; project_id?: string | null }): Promise<VfsNode[]> {
  const sp = new URLSearchParams();
  if (params.parent_id) sp.set("parent_id", params.parent_id);
  if (params.project_id) sp.set("project_id", params.project_id);
  const res = await fetch(`/api/vfs/nodes?${sp.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: VfsNode[] };
  return Array.isArray(json.data) ? json.data : [];
}

async function vfsCreateFolder(payload: { name: string; parent_id?: string | null; project_id?: string | null }): Promise<VfsNode> {
  const res = await fetch("/api/vfs/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: VfsNode };
  if (!json.data?.id) throw new Error("创建文件夹失败");
  return json.data;
}

async function vfsCreateFile(payload: { name: string; content: string; parent_id?: string | null; project_id?: string | null }): Promise<VfsNode> {
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

type WorkshopNodeKind = "text-note" | "media" | "asset" | "reference";

type TextNoteNodeData = {
  kind: "text-note";
  title: string;
  content: string;
};

type MediaNodeData = {
  kind: "media";
  title: string;
  mediaType: "image" | "video";
};

type AssetNodeData = {
  kind: "asset";
  assetId: string;
  name: string;
  assetType: string;
};

type ReferenceNodeData = {
  kind: "reference";
  title: string;
  description?: string;
  dialogue?: string;
  sourceInfo?: {
    scriptId?: string;
    episodeId?: string;
    shotCode?: string;
  };
};

type WorkshopNodeData = TextNoteNodeData | MediaNodeData | AssetNodeData | ReferenceNodeData;

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
  data?: { relation?: "reference" };
};

function RightPanel({
  collapsed,
  activeTab,
  setActiveTab,
  onToggleCollapsed,
  children,
}: {
  collapsed: boolean;
  activeTab: "storyboard" | "assets" | "inspector";
  setActiveTab: (tab: "storyboard" | "assets" | "inspector") => void;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "shrink-0 border-l border-border bg-background/70 backdrop-blur flex flex-col",
        collapsed ? "w-12" : "w-80",
      ].join(" ")}
    >
      <div className="h-12 flex items-center justify-between px-3 border-b border-border">
        {collapsed ? (
          <div className="w-full flex items-center justify-center text-xs text-textMuted">▸</div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("storyboard")}
              className={[
                "px-2 py-1 rounded-md text-xs",
                activeTab === "storyboard" ? "bg-surface text-textMain" : "text-textMuted hover:text-textMain",
              ].join(" ")}
            >
              故事板
            </button>
            <button
              onClick={() => setActiveTab("assets")}
              className={[
                "px-2 py-1 rounded-md text-xs",
                activeTab === "assets" ? "bg-surface text-textMain" : "text-textMuted hover:text-textMain",
              ].join(" ")}
            >
              资产库
            </button>
            <button
              onClick={() => setActiveTab("inspector")}
              className={[
                "px-2 py-1 rounded-md text-xs",
                activeTab === "inspector" ? "bg-surface text-textMain" : "text-textMuted hover:text-textMain",
              ].join(" ")}
            >
              详情
            </button>
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          className="w-8 h-8 rounded-lg hover:bg-surface flex items-center justify-center text-textMuted hover:text-textMain"
        >
          {collapsed ? "◂" : "▸"}
        </button>
      </div>
      {collapsed ? null : <div className="flex-1 overflow-auto">{children}</div>}
    </div>
  );
}

function StudioCanvasInner() {
  const searchParams = useSearchParams();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkshopNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkshopEdge>([]);

  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [collapsedRight, setCollapsedRight] = useState(false);
  const [activeTab, setActiveTab] = useState<"storyboard" | "assets" | "inspector">("storyboard");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedInspectorItem, setSelectedInspectorItem] = useState<
    | null
    | { kind: "storyboard"; shotCode: string; description?: string; dialogue?: string }
    | { kind: "asset"; name: string; assetType: string }
  >(null);

  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [activeScriptId, setActiveScriptId] = useState<string>("");

  const [episodes, setEpisodes] = useState<EpisodeWithStoryboard[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string>("");

  const [canvasId, setCanvasId] = useState<string>(() => searchParams.get("canvas_id") || "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track selected node IDs for batch execution and toolbar
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  // Placeholder state for toolbar features integrated in later tasks (10.3, 10.4)
  const { mode: perfMode, setMode: setPerfMode, getNodeRenderLevel, suggestedMode } = usePerformanceMode(nodes.length);
  const [layoutMode, setLayoutMode] = useState<"card" | "timeline">("card");

  // Undo/redo integration
  const { push: pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo(setNodes as any, setEdges as any);

  // Clipboard ref for copy/paste
  const clipboardRef = useRef<{ nodes: any[]; edges: any[] } | null>(null);

  // Alignment guides: track dragging node
  const [draggingNodeBounds, setDraggingNodeBounds] = useState<DraggingNodeBounds | null>(null);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  useOnSelectionChange({
    onChange: ({ nodes: selected }) => {
      setSelectedNodeId(selected[0]?.id ?? null);
      setSelectedNodeIds(selected.map((n) => n.id));
    },
  });

  const focusedLlmNodeId = useMemo(() => {
    if (!selectedNodeId) return null;
    const n = nodes.find((x) => x.id === selectedNodeId);
    if (!n) return null;
    if (viewport.zoom < 0.6) return null;
    return n.data.kind === "media" ? n.id : null;
  }, [nodes, selectedNodeId, viewport.zoom]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const activeEpisode = useMemo(() => {
    if (!activeEpisodeId) return null;
    return episodes.find((e) => e.id === activeEpisodeId) || null;
  }, [episodes, activeEpisodeId]);

  useEffect(() => {
    let cancelled = false;
    setScriptsLoading(true);
    setScriptsError(null);
    (async () => {
      const res = await fetch("/api/scripts?page=1&size=100", { cache: "no-store" });
      if (!res.ok) {
        if (!cancelled) setScriptsError(await res.text());
        return;
      }
      const json = (await res.json()) as { data?: { items?: ScriptItem[] } };
      if (cancelled) return;
      setScripts(Array.isArray(json.data?.items) ? json.data?.items : []);
    })()
      .catch((e) => {
        if (!cancelled) setScriptsError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setScriptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeScriptId) {
      setEpisodes([]);
      setActiveEpisodeId("");
      return;
    }
    let cancelled = false;
    setEpisodesLoading(true);
    setEpisodesError(null);
    (async () => {
      const res = await fetch(`/api/scripts/${encodeURIComponent(activeScriptId)}/hierarchy`, { cache: "no-store" });
      if (!res.ok) {
        if (!cancelled) setEpisodesError(await res.text());
        return;
      }
      const json = (await res.json()) as { data?: { episodes?: EpisodeWithStoryboard[] } };
      const list = Array.isArray(json.data?.episodes) ? json.data?.episodes : [];
      if (cancelled) return;
      setEpisodes(list);
      setActiveEpisodeId((prev) => prev || list[0]?.id || "");
    })()
      .catch((e) => {
        if (!cancelled) setEpisodesError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setEpisodesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeScriptId]);

  useEffect(() => {
    if (!canvasId) {
      const created = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setCanvasId(created);
      const url = new URL(window.location.href);
      url.searchParams.set("canvas_id", created);
      window.history.replaceState(null, "", url.toString());
    }
  }, [canvasId]);

  const getSnapshot = useCallback(() => {
    return serializeCanvas(canvasId, nodes as any, edges as any, viewport);
  }, [canvasId, edges, nodes, viewport]);

  const ensureCanvasFolder = useCallback(async () => {
    const root = await vfsListNodes({ parent_id: null, project_id: null });
    const workshop = root.find((n) => n.is_folder && n.name === "创作工坊") || (await vfsCreateFolder({ name: "创作工坊" }));
    const children = await vfsListNodes({ parent_id: workshop.id, project_id: null });
    const canvases = children.find((n) => n.is_folder && n.name === "画布") || (await vfsCreateFolder({ name: "画布", parent_id: workshop.id }));
    return canvases.id;
  }, []);

  const saveToVfs = useCallback(async () => {
    if (!canvasId) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const folderId = await ensureCanvasFolder();
      const existing = await vfsListNodes({ parent_id: folderId, project_id: null });
      const filename = `${canvasId}.json`;
      const old = existing.find((n) => !n.is_folder && n.name === filename);
      if (old) await vfsDeleteNode(old.id);
      const content = JSON.stringify(getSnapshot(), null, 2);
      await vfsCreateFile({ name: filename, content, parent_id: folderId });
      localStorage.removeItem(`studio_canvas_draft_${canvasId}`);
      setSaveStatus("saved");
    } catch (e: any) {
      localStorage.setItem(`studio_canvas_draft_${canvasId}`, JSON.stringify(getSnapshot(), null, 2));
      setSaveStatus("error");
      setSaveError(String(e?.message || e));
    }
  }, [canvasId, ensureCanvasFolder, getSnapshot]);

  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    (async () => {
      const folderId = await ensureCanvasFolder();
      const existing = await vfsListNodes({ parent_id: folderId, project_id: null });
      const filename = `${canvasId}.json`;
      const node = existing.find((n) => !n.is_folder && n.name === filename);
      if (!node) {
        const draft = localStorage.getItem(`studio_canvas_draft_${canvasId}`);
        if (draft) {
          try {
            const parsed = JSON.parse(draft);
            if (parsed?.reactflow?.nodes && parsed?.reactflow?.edges) {
              if (!cancelled) {
                setNodes(parsed.reactflow.nodes);
                setEdges(parsed.reactflow.edges);
                if (parsed.reactflow.viewport) setViewport(parsed.reactflow.viewport);
              }
              return;
            }
          } catch {
            return;
          }
        }
        return;
      }
      const txt = await vfsDownloadText(node.id);
      const parsed = JSON.parse(txt);
      if (!cancelled) {
        if (parsed?.reactflow?.nodes && parsed?.reactflow?.edges) {
          setNodes(parsed.reactflow.nodes);
          setEdges(parsed.reactflow.edges);
          if (parsed.reactflow.viewport) setViewport(parsed.reactflow.viewport);
        }
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canvasId, ensureCanvasFolder, setEdges, setNodes]);

  useEffect(() => {
    if (!canvasId) return;
    const t = window.setTimeout(() => {
      void saveToVfs();
    }, 800);
    return () => window.clearTimeout(t);
  }, [canvasId, edges, nodes, saveToVfs, viewport]);

  const { onConnect: validateConnect, topologyOrder, hasCycle, propagate } = useDataFlow(nodes as any, edges as any, setNodes as any);

  // --- Batch queue integration ---
  const executeTask = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error("Node not found");
    const data = node.data as any;
    const mode = data.generationMode || 'image';
    const endpoint = mode === 'video' ? '/api/ai/video/generate' : '/api/ai/image/generate';
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: data.prompt || "",
        neg_prompt: data.negPrompt || "",
        resolution: data.aspectRatio || "1:1",
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    return json.data?.task_id || json.task_id || "";
  }, [nodes]);

  const { enqueue, start, stopAll, cancelTask, queueState } = useBatchQueue({
    executeTask,
    maxConcurrency: 3,
  });

  // When a queue item succeeds, propagate result to downstream nodes
  useEffect(() => {
    for (const item of queueState.items) {
      if (item.status === "succeeded") {
        const node = nodes.find((n) => n.id === item.nodeId);
        if (node) {
          const data = node.data as any;
          if (data.lastImage) {
            propagate(item.nodeId, "image", data.lastImage);
          }
        }
      }
    }
  }, [queueState.items, nodes, propagate]);

  // --- Storyboard node sync to backend (task 11.1) ---
  // Debounce storyboard node edits and sync to backend via PATCH /api/storyboards/{id}
  const storyboardSyncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const storyboardNodes = nodes.filter(
      (n: any) => n.type === "storyboardNode" && n.data?.kind === "storyboard" && n.data?.sourceStoryboardId,
    );
    for (const node of storyboardNodes) {
      const data = node.data as unknown as StoryboardNodeData;
      const storyboardId = data.sourceStoryboardId!;
      const key = node.id;

      // Clear any existing timer for this node
      const existing = storyboardSyncTimers.current.get(key);
      if (existing) clearTimeout(existing);

      // Set a new debounced sync timer (1000ms)
      const timer = setTimeout(() => {
        storyboardSyncTimers.current.delete(key);
        fetch(`/api/storyboards/${encodeURIComponent(storyboardId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            description: data.sceneDescription || "",
            dialogue: data.dialogue || "",
          }),
        }).catch((err) => {
          console.error(`[StoryboardSync] Failed to sync storyboard ${storyboardId}:`, err);
        });
      }, 1000);
      storyboardSyncTimers.current.set(key, timer);
    }

    return () => {
      // Cleanup all timers on unmount
      for (const timer of storyboardSyncTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, [nodes]);

  // --- Auto-create storyboard nodes from slicer output (task 11.2, Req 4.3) ---
  // Track which slicer nodes have already had their output processed
  const processedSlicerOutputs = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const slicerNodes = nodes.filter(
      (n: any) => n.type === 'slicerNode' && n.data?.kind === 'slicer',
    );
    for (const node of slicerNodes) {
      const data = node.data as unknown as SlicerNodeData;
      const items = data.storyboardItems;
      if (!items || items.length === 0) continue;

      // Check if we already processed this exact output (by item count)
      const prevCount = processedSlicerOutputs.current.get(node.id);
      if (prevCount === items.length) continue;

      // Mark as processed
      processedSlicerOutputs.current.set(node.id, items.length);

      // Create storyboard nodes below the slicer node
      const slicerPos = node.position ?? { x: 0, y: 0 };
      const result = createStoryboardNodesFromSlicerOutput(
        node.id,
        items,
        { x: slicerPos.x, y: slicerPos.y + 200 },
      );

      if (result.nodes.length > 0) {
        setNodes((ns) => ns.concat(result.nodes as any));
        if (result.edges.length > 0) {
          setEdges((es) => es.concat(result.edges as any));
        }
      }
    }
  }, [nodes, setNodes, setEdges]);

  const handleRunAll = useCallback(() => {
    const allNodeIds = nodes.map((n) => n.id);
    enqueue(allNodeIds, nodes, edges);
    start();
  }, [nodes, edges, enqueue, start]);

  const handleRunSelected = useCallback(() => {
    enqueue(selectedNodeIds, nodes, edges);
    start();
  }, [selectedNodeIds, nodes, edges, enqueue, start]);

  const handleStopAll = useCallback(() => {
    stopAll();
  }, [stopAll]);

  // --- Batch generate for storyboard nodes (Req 4.7) ---
  const hasStoryboardSelection = useMemo(() => {
    if (selectedNodeIds.length === 0) return false;
    return selectedNodeIds.some((id) => {
      const node = nodes.find((n) => n.id === id);
      return node?.type === 'storyboardNode';
    });
  }, [selectedNodeIds, nodes]);

  const handleBatchGenerateImage = useCallback(() => {
    // For each selected storyboard node, find or create a connected generator node and enqueue it
    const storyboardIds = selectedNodeIds.filter((id) => {
      const node = nodes.find((n) => n.id === id);
      return node?.type === 'storyboardNode';
    });
    // Find generator nodes connected downstream from selected storyboard nodes
    const generatorNodeIds: string[] = [];
    for (const sbId of storyboardIds) {
      const downstreamEdges = edges.filter((e: any) => e.source === sbId);
      for (const edge of downstreamEdges) {
        const targetNode = nodes.find((n) => n.id === (edge as any).target);
        if (targetNode?.type === 'generatorNode' && !generatorNodeIds.includes(targetNode.id)) {
          generatorNodeIds.push(targetNode.id);
        }
      }
    }
    if (generatorNodeIds.length > 0) {
      enqueue(generatorNodeIds, nodes, edges);
      start();
    }
  }, [selectedNodeIds, nodes, edges, enqueue, start]);

  const handleBatchGenerateVideo = useCallback(() => {
    // Similar to image but for video — find downstream generator nodes from selected storyboard nodes
    const storyboardIds = selectedNodeIds.filter((id) => {
      const node = nodes.find((n) => n.id === id);
      return node?.type === 'storyboardNode';
    });
    const generatorNodeIds: string[] = [];
    for (const sbId of storyboardIds) {
      const downstreamEdges = edges.filter((e: any) => e.source === sbId);
      for (const edge of downstreamEdges) {
        const targetNode = nodes.find((n) => n.id === (edge as any).target);
        if (targetNode?.type === 'generatorNode' && !generatorNodeIds.includes(targetNode.id)) {
          generatorNodeIds.push(targetNode.id);
        }
      }
    }
    if (generatorNodeIds.length > 0) {
      enqueue(generatorNodeIds, nodes, edges);
      start();
    }
  }, [selectedNodeIds, nodes, edges, enqueue, start]);

  // --- Layout mode change handler (Req 4.8) ---
  const handleLayoutModeChange = useCallback((mode: 'card' | 'timeline') => {
    setLayoutMode(mode);
    // Rearrange storyboard nodes based on the selected layout mode
    const storyboardNodes = nodes.filter((n: any) => n.type === 'storyboardNode');
    if (storyboardNodes.length === 0) return;

    // Sort storyboard nodes by shotNumber
    const sorted = [...storyboardNodes].sort((a: any, b: any) => {
      const aNum = (a.data as any)?.shotNumber ?? 0;
      const bNum = (b.data as any)?.shotNumber ?? 0;
      return aNum - bNum;
    });

    // Use the first storyboard node's position as the anchor
    const anchor = sorted[0]?.position ?? { x: 0, y: 0 };

    pushUndo({ nodes: nodes as any, edges: edges as any });

    if (mode === 'timeline') {
      // Timeline: single horizontal row, sorted by shotNumber
      const spacing = 300;
      const idToPos = new Map<string, { x: number; y: number }>();
      sorted.forEach((n, i) => {
        idToPos.set(n.id, { x: anchor.x + i * spacing, y: anchor.y });
      });
      setNodes((ns) =>
        ns.map((n: any) => {
          const pos = idToPos.get(n.id);
          return pos ? { ...n, position: pos } : n;
        }) as any,
      );
    } else {
      // Card: grid layout (4 columns, 250px spacing)
      const cols = 4;
      const hSpacing = 250;
      const vSpacing = 200;
      const idToPos = new Map<string, { x: number; y: number }>();
      sorted.forEach((n, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        idToPos.set(n.id, { x: anchor.x + col * hSpacing, y: anchor.y + row * vSpacing });
      });
      setNodes((ns) =>
        ns.map((n: any) => {
          const pos = idToPos.get(n.id);
          return pos ? { ...n, position: pos } : n;
        }) as any,
      );
    }
  }, [nodes, setNodes, pushUndo, edges]);

  // --- Import / Export handlers (task 10.3) ---
  const handleExportWorkflow = useCallback(() => {
    const snapshot = serializeCanvas(canvasId, nodes as any, edges as any, viewport);
    exportToFile(snapshot);
  }, [canvasId, nodes, edges, viewport]);

  const handleExportSelected = useCallback(() => {
    const snapshot = exportSelectedNodes(selectedNodeIds, nodes as any, edges as any, canvasId);
    exportToFile(snapshot);
  }, [selectedNodeIds, nodes, edges, canvasId]);

  const handleImportWorkflow = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const result = await importFromFile(file);
      if (result.success) {
        const imported = result.snapshot;
        // Add imported nodes/edges to the canvas (offset to avoid overlap)
        const offsetX = viewport.x + 100;
        const offsetY = viewport.y + 100;
        const idMap = new Map<string, string>();
        const newNodes = imported.reactflow.nodes.map((n) => {
          const newId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          idMap.set(n.id, newId);
          return {
            id: newId,
            type: n.type,
            position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
            data: n.data,
          };
        });
        const newEdges = imported.reactflow.edges
          .filter((e) => idMap.has(e.source) && idMap.has(e.target))
          .map((e) => ({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            source: idMap.get(e.source)!,
            target: idMap.get(e.target)!,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: TYPED_EDGE_TYPE,
            data: e.data,
          }));
        setNodes((ns) => ns.concat(newNodes as any));
        setEdges((es) => es.concat(newEdges as any));
      } else {
        // Show error to user
        alert(`导入失败：${result.errors.join(", ")}`);
      }
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }, [viewport, setNodes, setEdges]);

  // Right-click context menu for running generator nodes
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      // Only show context menu for running generator nodes
      if (node.type !== "generatorNode") return;
      const queueItem = queueState.items.find((i) => i.nodeId === node.id);
      if (!queueItem || queueItem.status !== "running") return;
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    [queueState.items],
  );

  // Close context menu on click anywhere
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // --- Keyboard shortcuts: Ctrl+A, Ctrl+C, Ctrl+V, Delete/Backspace ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // Ctrl+A: Select all nodes
      if (isCtrlOrMeta && (e.key === "a" || e.key === "A") && !e.shiftKey) {
        e.preventDefault();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })) as any);
        return;
      }

      // Ctrl+C: Copy selected nodes
      if (isCtrlOrMeta && (e.key === "c" || e.key === "C") && !e.shiftKey) {
        e.preventDefault();
        const selected = nodes.filter((n: any) => n.selected);
        if (selected.length === 0) return;
        const selectedIds = new Set(selected.map((n) => n.id));
        const selectedEdges = edges.filter((ed: any) => selectedIds.has(ed.source) && selectedIds.has(ed.target));
        clipboardRef.current = { nodes: selected as any, edges: selectedEdges as any };
        return;
      }

      // Ctrl+V: Paste copied nodes (offset position)
      if (isCtrlOrMeta && (e.key === "v" || e.key === "V") && !e.shiftKey) {
        e.preventDefault();
        if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return;
        pushUndo({ nodes: nodes as any, edges: edges as any });
        const idMap = new Map<string, string>();
        const offset = 50;
        const newNodes = clipboardRef.current.nodes.map((n: any) => {
          const newId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          idMap.set(n.id, newId);
          return { ...n, id: newId, position: { x: n.position.x + offset, y: n.position.y + offset }, selected: false };
        });
        const newEdges = clipboardRef.current.edges
          .filter((ed: any) => idMap.has(ed.source) && idMap.has(ed.target))
          .map((ed: any) => ({
            ...ed,
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            source: idMap.get(ed.source)!,
            target: idMap.get(ed.target)!,
            selected: false,
          }));
        setNodes((ns) => ns.concat(newNodes as any));
        setEdges((es) => es.concat(newEdges as any));
        return;
      }

      // Delete / Backspace: Delete selected nodes and their edges
      // Note: Ctrl+Z / Ctrl+Shift+Z are handled by useUndoRedo hook
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isCtrlOrMeta) return; // Don't interfere with browser shortcuts
        e.preventDefault();
        const selectedIds = new Set(nodes.filter((n: any) => n.selected).map((n) => n.id));
        if (selectedIds.size === 0) return;
        pushUndo({ nodes: nodes as any, edges: edges as any });
        setNodes((ns) => ns.filter((n) => !selectedIds.has(n.id)) as any);
        setEdges((es) => es.filter((ed: any) => !selectedIds.has(ed.source) && !selectedIds.has(ed.target)) as any);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, setNodes, setEdges, pushUndo]);

  // --- Batch collapse/expand for selected nodes ---
  const toggleCollapseSelected = useCallback(() => {
    const selected = nodes.filter((n: any) => n.selected);
    if (selected.length === 0) return;
    // If any selected node is expanded, collapse all; otherwise expand all
    const anyExpanded = selected.some((n: any) => !n.data?.collapsed);
    pushUndo({ nodes: nodes as any, edges: edges as any });
    setNodes((ns) =>
      ns.map((n: any) => {
        if (!n.selected) return n;
        return { ...n, data: { ...n.data, collapsed: anyExpanded } };
      }) as any,
    );
  }, [nodes, edges, setNodes, pushUndo]);

  // --- Alignment guides: onNodeDrag / onNodeDragStop ---
  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, dragNode: any) => {
      const width = dragNode.measured?.width ?? dragNode.width ?? 200;
      const height = dragNode.measured?.height ?? dragNode.height ?? 100;
      setDraggingNodeBounds({
        x: dragNode.position.x,
        y: dragNode.position.y,
        width,
        height,
      });
    },
    [],
  );

  const onNodeDragStop = useCallback(() => {
    setDraggingNodeBounds(null);
  }, []);

  // Compute other nodes' bounds for alignment guides
  const otherNodeBounds = useMemo<NodeBounds[]>(() => {
    if (!draggingNodeBounds) return [];
    return nodes
      .filter((n: any) => !n.dragging)
      .map((n: any) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width: n.measured?.width ?? n.width ?? 200,
        height: n.measured?.height ?? n.height ?? 100,
      }));
  }, [nodes, draggingNodeBounds]);

  const onConnect = useCallback(
    (connection: any) => {
      if (!validateConnect(connection)) return;
      pushUndo({ nodes: nodes as any, edges: edges as any });
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: TYPED_EDGE_TYPE,
            data: { relation: "reference" },
          },
          eds as any,
        ) as any,
      );

      // --- AssetBinding creation (task 11.1) ---
      // When an asset node connects to a storyboard node's in-asset port, create an AssetBinding
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (
        sourceNode?.type === "assetNode" &&
        targetNode?.type === "storyboardNode" &&
        connection.targetHandle === "in-asset"
      ) {
        const assetData = sourceNode.data as unknown as AssetNodeData;
        const storyboardData = targetNode.data as unknown as StoryboardNodeData;
        if (assetData.assetId && storyboardData.sourceStoryboardId) {
          // Fire-and-forget API call to create AssetBinding
          fetch("/api/asset-bindings", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              asset_id: assetData.assetId,
              storyboard_id: storyboardData.sourceStoryboardId,
              episode_id: storyboardData.episodeId || undefined,
            }),
          }).catch((err) => {
            console.error("[AssetBinding] Failed to create asset binding:", err);
          });
        }
      }
    },
    [setEdges, validateConnect, pushUndo, nodes, edges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const beginDrag = useCallback((event: React.DragEvent, payload: unknown) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      // --- Handle NodeLibrary drag (application/reactflow-node-type) ---
      const nodeTypeStr = event.dataTransfer.getData("application/reactflow-node-type");
      if (nodeTypeStr) {
        const reg = getNodeType(nodeTypeStr);
        if (!reg) return;
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        pushUndo({ nodes: nodes as any, edges: edges as any });
        setNodes((ns) =>
          ns.concat({
            id,
            type: reg.type,
            position: pos,
            data: reg.defaultData(),
          } as any),
        );
        return;
      }

      // --- Handle legacy right-panel drag (application/reactflow) ---
      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw) return;
      let payload: any;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
      if (!payload || typeof payload !== "object") return;

      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      if (payload.kind === "reference") {
        const data: ReferenceNodeData = {
          kind: "reference",
          title: String(payload.title || "参考"),
          description: payload.description ? String(payload.description) : undefined,
          dialogue: payload.dialogue ? String(payload.dialogue) : undefined,
          sourceInfo: payload.sourceInfo,
        };
        pushUndo({ nodes: nodes as any, edges: edges as any });
        setNodes((ns) => ns.concat({ id, type: "referenceNode", position: pos, data } as any));
        return;
      }

      if (payload.kind === "storyboard") {
        // Extract shot number from shot_code (e.g. "SC01-SH03" → 3, or fallback to 1)
        const shotCodeStr = String(payload.shotCode || "");
        const shotNumMatch = shotCodeStr.match(/(\d+)\s*$/);
        const shotNumber = shotNumMatch ? parseInt(shotNumMatch[1], 10) : 1;

        const data: StoryboardNodeData = {
          kind: "storyboard",
          shotNumber,
          sceneDescription: payload.description ? String(payload.description) : "",
          dialogue: payload.dialogue ? String(payload.dialogue) : undefined,
          referenceImageUrl: undefined,
          sourceStoryboardId: payload.storyboardId ? String(payload.storyboardId) : undefined,
          episodeId: payload.episodeId ? String(payload.episodeId) : undefined,
        };
        pushUndo({ nodes: nodes as any, edges: edges as any });
        setNodes((ns) => ns.concat({ id, type: "storyboardNode", position: pos, data } as any));
        return;
      }

      if (payload.kind === "asset") {
        const data: AssetNodeData = {
          kind: "asset",
          assetId: String(payload.assetId || ""),
          name: String(payload.name || "资产"),
          assetType: String(payload.assetType || ""),
        };
        pushUndo({ nodes: nodes as any, edges: edges as any });
        setNodes((ns) => ns.concat({ id, type: "assetNode", position: pos, data } as any));
        return;
      }
    },
    [screenToFlowPosition, setNodes, pushUndo, nodes, edges],
  );

  const nodeTypes = useMemo(() => buildReactFlowNodeTypes(), []);
  const edgeTypes = useMemo(() => ({ [TYPED_EDGE_TYPE]: TypedEdge }), []);

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-2xl border border-border bg-background overflow-hidden shadow-2xl">
      <div className="flex-1 relative" ref={wrapperRef}>
        <div className="h-12 border-b border-border bg-background/70 backdrop-blur flex items-center justify-between px-4 relative z-10">
          <div className="text-sm font-medium text-textMain">创作工坊</div>
          <div className="text-xs text-textMuted">
            {saveStatus === "saving" ? "保存中…" : null}
            {saveStatus === "saved" ? "已保存" : null}
            {saveStatus === "error" ? "保存失败（已本地兜底）" : null}
          </div>
        </div>

        <div
          className="absolute inset-x-0 bottom-0 top-12"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(160,160,160,0.15) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        <div className="absolute inset-x-0 bottom-0 top-12">
          <ReactFlow
            nodes={nodes as any}
            edges={edges as any}
            onNodesChange={onNodesChange as any}
            onEdgesChange={onEdgesChange as any}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onMove={(_evt: any, viewport: any) => {
              if (viewport && typeof viewport.zoom === "number") setViewport(viewport);
            }}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={closeContextMenu}
            nodeTypes={nodeTypes as any}
            edgeTypes={edgeTypes as any}
            fitView
          >
            <Controls />
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

        {/* Right-click context menu for stopping running tasks */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-50" onClick={closeContextMenu} />
            <div
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
              style={{ top: contextMenu.y, left: contextMenu.x }}
            >
              <button
                type="button"
                onClick={() => {
                  cancelTask(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                停止此任务
              </button>
            </div>
          </>
        )}

        {focusedLlmNodeId ? <LlmPromptPanel nodeId={focusedLlmNodeId} viewport={viewport} /> : null}
      </div>

      <RightPanel
        collapsed={collapsedRight}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onToggleCollapsed={() => setCollapsedRight((v) => !v)}
      >
        {activeTab === "storyboard" ? (
          <div className="p-4 space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-textMuted">剧本</div>
              <select
                value={activeScriptId}
                onChange={(e) => setActiveScriptId(e.target.value)}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm text-textMain"
              >
                <option value="">{scriptsLoading ? "加载中…" : "选择剧本"}</option>
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              {scriptsError ? <div className="text-xs text-red-500">{scriptsError}</div> : null}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-textMuted">分集</div>
              <select
                value={activeEpisodeId}
                onChange={(e) => setActiveEpisodeId(e.target.value)}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm text-textMain"
                disabled={!activeScriptId || episodesLoading}
              >
                <option value="">{episodesLoading ? "加载中…" : "选择分集"}</option>
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.episode_code} {ep.title ? `· ${ep.title}` : ""}
                  </option>
                ))}
              </select>
              {episodesError ? <div className="text-xs text-red-500">{episodesError}</div> : null}
            </div>

            {/* "一键生成工作流" button — visible when an episode is selected */}
            {activeEpisode && activeEpisode.storyboards && activeEpisode.storyboards.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const episodeData = {
                    episodeId: activeEpisodeId,
                    scriptText: '',
                    storyboards: (activeEpisode.storyboards ?? []).map((sb) => ({
                      id: sb.id,
                      shot_code: sb.shot_code,
                      scene_code: sb.scene_code ?? undefined,
                      description: sb.description ?? undefined,
                      dialogue: sb.dialogue ?? undefined,
                    })),
                  };
                  // Place workflow at a reasonable offset from origin
                  const result = generateFullWorkflow(episodeData, { x: 100, y: 100 });
                  pushUndo({ nodes: nodes as any, edges: edges as any });
                  setNodes((ns) => ns.concat(result.nodes as any));
                  setEdges((es) => es.concat(result.edges as any));
                }}
                className="w-full h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                生成工作流
              </button>
            )}

            <div className="space-y-2">
              <div className="text-xs text-textMuted">镜头</div>
              <div className="space-y-2">
                {(activeEpisode?.storyboards || []).map((sb) => (
                  <div
                    key={sb.id}
                    draggable
                    onDragStart={(e) =>
                      beginDrag(e, {
                        kind: "storyboard",
                        shotCode: sb.shot_code,
                        sceneCode: sb.scene_code || undefined,
                        description: sb.description || undefined,
                        dialogue: sb.dialogue || undefined,
                        storyboardId: sb.id,
                        episodeId: activeEpisodeId,
                      })
                    }
                    onClick={() => {
                      setSelectedInspectorItem({
                        kind: "storyboard",
                        shotCode: sb.shot_code,
                        description: sb.description || undefined,
                        dialogue: sb.dialogue || undefined,
                      });
                      setActiveTab("inspector");
                    }}
                    className="p-3 rounded-xl border border-border bg-surfaceHighlight hover:bg-surface cursor-grab active:cursor-grabbing"
                  >
                    <div className="text-sm text-textMain font-medium">{sb.shot_code}</div>
                    <div className="text-xs text-textMuted line-clamp-2">{sb.description || sb.dialogue || ""}</div>
                  </div>
                ))}
                {!activeEpisode?.storyboards?.length ? (
                  <div className="text-xs text-textMuted">{activeScriptId ? "暂无镜头" : "请选择剧本"}</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "assets" ? (
          <div className="p-4 space-y-2">
            <div className="text-xs text-textMuted">项目资产（来自当前分集）</div>
            <div className="space-y-2">
              {(activeEpisode?.assets || []).map((a) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={(e) =>
                    beginDrag(e, {
                      kind: "asset",
                      assetId: a.id,
                      name: a.name,
                      assetType: a.type,
                    })
                  }
                  onClick={() => {
                    setSelectedInspectorItem({ kind: "asset", name: a.name, assetType: a.type });
                    setActiveTab("inspector");
                  }}
                  className="p-3 rounded-xl border border-border bg-surfaceHighlight hover:bg-surface cursor-grab active:cursor-grabbing"
                >
                  <div className="text-sm text-textMain font-medium">{a.name}</div>
                  <div className="text-xs text-textMuted">{a.type}</div>
                </div>
              ))}
              {!activeEpisode?.assets?.length ? (
                <div className="text-xs text-textMuted">{activeScriptId ? "暂无资产" : "请先在故事板选择剧本与分集"}</div>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "inspector" ? (
          <div className="p-4 space-y-3">
            <div className="text-xs text-textMuted">画布</div>
            <div className="text-xs text-textMuted">canvas_id: {canvasId}</div>
            {saveStatus === "error" && saveError ? <div className="text-xs text-red-500">{saveError}</div> : null}
            <div className="h-px bg-border" />
            <div className="text-xs text-textMuted">选中节点</div>
            {selectedNode ? (
              <div className="space-y-1">
                <div className="text-sm text-textMain font-medium">{selectedNode.data.kind}</div>
                <div className="text-xs text-textMuted break-all">{selectedNode.id}</div>
              </div>
            ) : (
              <div className="text-xs text-textMuted">未选中</div>
            )}
            <div className="h-px bg-border" />
            <div className="text-xs text-textMuted">条目详情</div>
            {selectedInspectorItem ? (
              selectedInspectorItem.kind === "storyboard" ? (
                <div className="space-y-1">
                  <div className="text-sm text-textMain font-medium">{selectedInspectorItem.shotCode}</div>
                  <div className="text-xs text-textMuted whitespace-pre-wrap">
                    {selectedInspectorItem.description || selectedInspectorItem.dialogue || ""}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm text-textMain font-medium">{selectedInspectorItem.name}</div>
                  <div className="text-xs text-textMuted">{selectedInspectorItem.assetType}</div>
                </div>
              )
            ) : (
              <div className="text-xs text-textMuted">未选择</div>
            )}
          </div>
        ) : null}
      </RightPanel>
    </div>
  );
}

function LlmPromptPanel({ nodeId, viewport }: { nodeId: string; viewport: { x: number; y: number; zoom: number } }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const update = useCallback(() => {
    const el =
      (document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null) ||
      (document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement | null);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left });
  }, [nodeId]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => update());
    return () => window.cancelAnimationFrame(id);
  }, [update, viewport.x, viewport.y, viewport.zoom]);

  useEffect(() => {
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [update]);

  return pos ? (
    <div
      className="fixed z-[60] w-[360px] rounded-2xl border border-border bg-background shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-textMain">提示词</div>
      <div className="p-3 space-y-2">
        <div className="text-[11px] text-textMuted">参考来源（连线收集）</div>
        <div className="flex gap-2 overflow-auto pb-1">
          <div className="h-8 px-2 rounded-lg border border-border bg-surface flex items-center text-xs text-textMuted">+ 添加</div>
        </div>
        <textarea
          placeholder="提示词"
          className="w-full h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          placeholder="负面提示词"
          className="w-full h-16 rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center gap-2">
          <select className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-sm text-textMain">
            <option>kling-v1</option>
          </select>
          <select className="w-28 h-9 rounded-xl border border-border bg-background px-3 text-sm text-textMain">
            <option>16:9</option>
            <option>9:16</option>
            <option>1:1</option>
          </select>
        </div>
        <button className="w-full h-9 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white text-sm font-medium">
          生成
        </button>
      </div>
    </div>
  ) : null;
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <StudioCanvasInner />
    </ReactFlowProvider>
  );
}
