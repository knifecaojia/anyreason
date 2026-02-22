"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, HelpCircle, Plus, Settings2, SlidersHorizontal } from "lucide-react";
import { addEdge, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useOnSelectionChange, useReactFlow } from "@xyflow/react";

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

function LeftFloatingMenu({
  onAddText,
  onAddMedia,
}: {
  onAddText: () => void;
  onAddMedia: () => void;
}) {
  const [open, setOpen] = useState<null | "add">(null);

  return (
    <div className="w-14 shrink-0 border-r border-border bg-background/70 backdrop-blur flex flex-col items-center py-3 gap-2">
      <button className="group w-10 h-10 rounded-lg hover:bg-surface flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
        <FileText size={18} />
        <span className="sr-only">文件</span>
      </button>

      <div className="relative">
        <button
          onClick={() => setOpen((v) => (v === "add" ? null : "add"))}
          className="group w-10 h-10 rounded-lg hover:bg-surface flex items-center justify-center text-textMuted hover:text-textMain transition-colors"
        >
          <Plus size={18} />
          <span className="sr-only">添加</span>
        </button>
        {open === "add" ? (
          <div className="absolute left-12 top-0 z-50 w-44 rounded-xl border border-border bg-background shadow-xl p-2">
            <button
              onClick={() => {
                setOpen(null);
                onAddText();
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface text-sm text-textMain"
            >
              文本笔记
            </button>
            <button
              onClick={() => {
                setOpen(null);
                onAddMedia();
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface text-sm text-textMain"
            >
              媒体节点
            </button>
          </div>
        ) : null}
      </div>

      <button className="group w-10 h-10 rounded-lg hover:bg-surface flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
        <SlidersHorizontal size={18} />
        <span className="sr-only">生成设置</span>
      </button>

      <button className="group w-10 h-10 rounded-lg hover:bg-surface flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
        <Settings2 size={18} />
        <span className="sr-only">设置</span>
      </button>

      <div className="flex-1" />

      <button className="group w-10 h-10 rounded-lg hover:bg-surface flex items-center justify-center text-textMuted hover:text-textMain transition-colors">
        <HelpCircle size={18} />
        <span className="sr-only">帮助</span>
      </button>
    </div>
  );
}

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

  useOnSelectionChange({
    onChange: ({ nodes: selected }) => {
      setSelectedNodeId(selected[0]?.id ?? null);
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

  const serializeCanvas = useCallback(() => {
    return JSON.stringify(
      {
        version: 1,
        canvasId,
        reactflow: {
          nodes,
          edges,
          viewport,
        },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
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
      await vfsCreateFile({ name: filename, content: serializeCanvas(), parent_id: folderId });
      localStorage.removeItem(`studio_canvas_draft_${canvasId}`);
      setSaveStatus("saved");
    } catch (e: any) {
      localStorage.setItem(`studio_canvas_draft_${canvasId}`, serializeCanvas());
      setSaveStatus("error");
      setSaveError(String(e?.message || e));
    }
  }, [canvasId, ensureCanvasFolder, serializeCanvas]);

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

  const onConnect = useCallback(
    (connection: any) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            data: { relation: "reference" },
          },
          eds as any,
        ) as any,
      );
    },
    [setEdges],
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
        setNodes((ns) => ns.concat({ id, type: "referenceNode", position: pos, data } as any));
        return;
      }

      if (payload.kind === "asset") {
        const data: AssetNodeData = {
          kind: "asset",
          assetId: String(payload.assetId || ""),
          name: String(payload.name || "资产"),
          assetType: String(payload.assetType || ""),
        };
        setNodes((ns) => ns.concat({ id, type: "assetNode", position: pos, data } as any));
        return;
      }
    },
    [screenToFlowPosition, setNodes],
  );

  const addTextNote = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const pos = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const data: TextNoteNodeData = { kind: "text-note", title: "笔记", content: "" };
    setNodes((ns) => ns.concat({ id, type: "textNoteNode", position: pos, data } as any));
  }, [screenToFlowPosition, setNodes]);

  const addMediaNode = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const pos = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const data: MediaNodeData = { kind: "media", title: "媒体生成", mediaType: "video" };
    setNodes((ns) => ns.concat({ id, type: "mediaNode", position: pos, data } as any));
  }, [screenToFlowPosition, setNodes]);

  const nodeTypes = useMemo(
    () => ({
      textNoteNode: TextNoteNode,
      mediaNode: MediaNode,
      assetNode: AssetNode,
      referenceNode: ReferenceNode,
    }),
    [],
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-2xl border border-border bg-background overflow-hidden shadow-2xl">
      <LeftFloatingMenu onAddText={addTextNote} onAddMedia={addMediaNode} />

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
            backgroundImage: "radial-gradient(circle, rgba(160,160,160,0.35) 1px, transparent 1px)",
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
            nodeTypes={nodeTypes as any}
            fitView
          >
            <Controls />
          </ReactFlow>
        </div>

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

            <div className="space-y-2">
              <div className="text-xs text-textMuted">镜头</div>
              <div className="space-y-2">
                {(activeEpisode?.storyboards || []).map((sb) => (
                  <div
                    key={sb.id}
                    draggable
                    onDragStart={(e) =>
                      beginDrag(e, {
                        kind: "reference",
                        title: sb.shot_code,
                        description: sb.description || undefined,
                        dialogue: sb.dialogue || undefined,
                        sourceInfo: { scriptId: activeScriptId, episodeId: activeEpisodeId, shotCode: sb.shot_code },
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

function NodeShell({
  nodeId,
  title,
  children,
}: {
  nodeId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/90 backdrop-blur shadow-lg min-w-[220px] relative">
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, borderRadius: 9999 }} />
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, borderRadius: 9999 }} />
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-textMain flex items-center justify-between">
        <span className="truncate">{title}</span>
        <span className="text-[10px] text-textMuted">●</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function TextNoteNode(props: any) {
  const data = props.data as TextNoteNodeData;
  const selected = Boolean(props.selected);
  return (
    <NodeShell nodeId={props.id} title={data.title || "笔记"}>
      <div className={selected ? "text-sm text-textMain" : "text-xs text-textMuted line-clamp-3"}>
        {data.content ? data.content : "双击编辑内容"}
      </div>
    </NodeShell>
  );
}

function MediaNode(props: any) {
  const data = props.data as MediaNodeData;
  return (
    <NodeShell nodeId={props.id} title={data.title || "媒体"}>
      <div className="h-24 rounded-xl bg-surfaceHighlight border border-border flex items-center justify-center text-xs text-textMuted">
        {data.mediaType === "video" ? "视频预览" : "图片预览"}
      </div>
      <div className="mt-2 text-xs text-textMuted">Focus 时显示提示词面板</div>
    </NodeShell>
  );
}

function AssetNode(props: any) {
  const data = props.data as AssetNodeData;
  return (
    <NodeShell nodeId={props.id} title={data.name || "资产"}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surfaceHighlight border border-border flex items-center justify-center text-sm text-textMain">
          {(data.name || "A").slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-textMain truncate">{data.name}</div>
          <div className="text-xs text-textMuted truncate">{data.assetType}</div>
        </div>
      </div>
    </NodeShell>
  );
}

function ReferenceNode(props: any) {
  const data = props.data as ReferenceNodeData;
  return (
    <NodeShell nodeId={props.id} title={data.title || "参考"}>
      <div className="text-xs text-textMuted line-clamp-4">{data.description || data.dialogue || "来自故事板"}</div>
    </NodeShell>
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
