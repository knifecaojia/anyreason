"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useOnSelectionChange,
  useReactFlow,
  type Connection,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Box,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cpu,
  Eye,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Play,
  Scissors,
  Settings2,
  Type,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ASSETS } from "@/lib/aistudio/constants";

type StoryboardNodeData = {
  label?: string;
  collapsed?: boolean;

  assetName?: string;
  assetType?: string;
  thumbnail?: string;

  model?: string;
  prompt?: string;
  negPrompt?: string;
  aspectRatio?: string;
  isProcessing?: boolean;
  lastImage?: string;
  isExtraction?: boolean;

  image?: string;
  candidates?: AssetCandidate[];
};

type StoryboardNodeType =
  | "assetNode"
  | "scriptNode"
  | "imageOutputNode"
  | "previewNode"
  | "slicerNode"
  | "candidateNode";

type AssetCandidate = {
  name: string;
  description?: string;
  tags?: string[];
};

type StoryboardNode = Node<StoryboardNodeData, StoryboardNodeType>;

const NODE_WIDTH = 260;
const NODE_BASE_CLASSES =
  "bg-surfaceHighlight border border-border rounded-lg shadow-2xl text-xs text-textMain transition-all duration-200 hover:ring-1 hover:ring-primary/20";

function NodeHeader({
  label,
  icon: Icon,
  colorClass,
  collapsed,
  onToggle,
}: {
  label: string;
  icon: LucideIcon;
  colorClass: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`px-3 py-2 font-bold flex items-center justify-between ${collapsed ? "" : "border-b border-border"} ${colorClass}`}
      onDoubleClick={onToggle}
    >
      <span className="flex items-center gap-2 truncate pr-2 text-white">
        <Icon size={14} className="opacity-80 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="p-0.5 hover:bg-black/20 rounded text-white/50 hover:text-white transition-colors flex-shrink-0"
        type="button"
      >
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  );
}

function AssetCandidateNode({ data, selected }: NodeProps<StoryboardNodeData>) {
  const [collapsed, setCollapsed] = useState(data.collapsed || false);
  const candidates = data.candidates || [];

  const handleApprove = () => {
    alert("资产已批准并添加至资产库！");
  };

  return (
    <div
      className={`${NODE_BASE_CLASSES} ${selected ? "ring-2 ring-orange-500 border-transparent" : ""}`}
      style={{ width: 300 }}
    >
      <NodeHeader
        label="资产候选清单"
        icon={Users}
        colorClass="bg-orange-900/80"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {!collapsed && (
        <div className="p-3 bg-surfaceHighlight animate-fade-in max-h-64 overflow-y-auto">
          {candidates.length > 0 ? (
            <div className="space-y-2">
              {candidates.map((c, idx) => (
                <div
                  key={`${c?.name || "candidate"}-${idx}`}
                  className="bg-background/50 p-2 rounded border border-border flex justify-between items-start gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-orange-200 truncate">{c.name}</div>
                    <div className="text-[10px] text-textMuted line-clamp-2">{c.description}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.tags?.map((t: string) => (
                        <span
                          key={t}
                          className="text-[9px] bg-white/5 px-1 rounded text-textMuted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleApprove}
                    className="p-1.5 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white rounded transition-colors"
                    title="Approve to Asset Library"
                    type="button"
                  >
                    <CheckCircle size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-textMuted py-4 italic">等待提取结果...</div>
          )}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="in-data"
        className="!bg-blue-400 !w-3 !h-3 !-left-1.5 !border-2 !border-surfaceHighlight"
      />
    </div>
  );
}

function AssetNode({ data, selected }: NodeProps<StoryboardNodeData>) {
  const [collapsed, setCollapsed] = useState(data.collapsed || false);
  const isSet = !!data.thumbnail;

  return (
    <div
      className={`${NODE_BASE_CLASSES} ${selected ? "ring-2 ring-primary border-transparent" : ""}`}
      style={{ width: NODE_WIDTH }}
    >
      <NodeHeader
        label={data.assetName || data.label || "资产节点"}
        icon={Box}
        colorClass="bg-surface/80 border-b border-border text-textMain"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {!collapsed && (
        <div className="p-2 relative group animate-fade-in bg-surfaceHighlight">
          {isSet ? (
            <>
              <img
                src={data.thumbnail}
                className="w-full h-24 object-cover rounded bg-black/50"
                alt={data.assetName}
              />
              <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] truncate text-white">
                {data.assetType}: {data.assetName}
              </div>
            </>
          ) : (
            <div className="h-24 bg-background border border-dashed border-border rounded flex flex-col items-center justify-center text-textMuted gap-1 group-hover:border-primary/50 transition-colors">
              <span className="text-[10px] font-bold">空 {data.assetType || "资产"} 节点</span>
              <span className="text-[9px] text-primary flex items-center gap-1">
                <Settings2 size={8} /> 请在右侧属性面板选择资源
              </span>
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="ref"
        className="!bg-orange-400 !w-3 !h-3 !-right-1.5 !border-2 !border-surfaceHighlight"
      />
    </div>
  );
}

function ScriptNode({ data, selected }: NodeProps<StoryboardNodeData>) {
  const [collapsed, setCollapsed] = useState(data.collapsed || false);
  return (
    <div
      className={`${NODE_BASE_CLASSES} ${selected ? "ring-2 ring-blue-500 border-transparent" : ""}`}
      style={{ width: NODE_WIDTH }}
    >
      <NodeHeader
        label="剧本节点"
        icon={Type}
        colorClass="bg-blue-900/80"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {!collapsed && (
        <div className="p-3 bg-surfaceHighlight animate-fade-in">
          <p className="text-xs text-textMain line-clamp-3 font-serif leading-relaxed italic">
            "{data.label || "空剧本..."}"
          </p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!bg-blue-400 !w-3 !h-3 !-right-1.5 !border-2 !border-surfaceHighlight"
      />
    </div>
  );
}

function ImageOutputNodeLegacy({ data, selected }: NodeProps<StoryboardNodeData>) {
  const [collapsed, setCollapsed] = useState(data.collapsed || false);
  return (
    <div
      className={`${NODE_BASE_CLASSES} ${selected ? "ring-2 ring-purple-500 border-transparent" : ""}`}
      style={{ width: 300 }}
    >
      <div className="absolute -left-3 top-10 flex flex-col gap-6 z-10">
        <Handle
          type="target"
          position={Position.Left}
          id="in-script"
          className="!bg-blue-400 !w-3 !h-3 !relative !left-0 !transform-none !border-2 !border-surfaceHighlight"
          title="Script Input"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="in-ref"
          className="!bg-orange-400 !w-3 !h-3 !relative !left-0 !transform-none !border-2 !border-surfaceHighlight"
          title="Reference Input"
        />
      </div>

      <div
        className={`px-3 py-2 font-bold flex items-center justify-between ${collapsed ? "" : "border-b border-border"} bg-purple-900/80 cursor-pointer`}
        onDoubleClick={() => setCollapsed(!collapsed)}
      >
        <span className="flex items-center gap-2 text-white">
          <Cpu size={14} /> {collapsed ? "Sampler" : "图像输出"}
        </span>
        <div className="flex items-center gap-2">
          {data.isProcessing && <Loader2 size={12} className="animate-spin text-purple-200" />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="p-0.5 hover:bg-black/20 rounded text-white/50 hover:text-white transition-colors"
            type="button"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3 animate-fade-in bg-surfaceHighlight">
          <div className="flex items-center justify-between text-[10px] text-textMuted">
            <span>模型配置</span>
            <span className="text-purple-400 font-mono truncate max-w-[120px]">
              {data.model || "Gemini 2.5"}
            </span>
          </div>
          {data.lastImage ? (
            <div className="aspect-video bg-black rounded border border-border overflow-hidden relative group">
              <img src={data.lastImage} className="w-full h-full object-cover" alt="Generated" />
            </div>
          ) : (
            <div className="aspect-video bg-background/50 rounded border border-border border-dashed flex items-center justify-center text-textMuted text-xs">
              {data.isProcessing ? "生成中..." : "准备就绪"}
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="!bg-purple-400 !w-3 !h-3 !-right-1.5 !border-2 !border-surfaceHighlight"
      />
    </div>
  );
}

function PreviewNode({ data, selected }: NodeProps<StoryboardNodeData>) {
  const [collapsed, setCollapsed] = useState(data.collapsed || false);
  return (
    <div
      className={`${NODE_BASE_CLASSES} ${selected ? "ring-2 ring-green-500 border-transparent" : ""}`}
      style={{ width: collapsed ? 150 : 320 }}
    >
      <NodeHeader
        label="预览节点"
        icon={Eye}
        colorClass="bg-green-900/80"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {!collapsed && (
        <div className="bg-black aspect-video relative flex items-center justify-center animate-fade-in group">
          {data.image ? (
            <img src={data.image} className="w-full h-full object-contain" alt="Preview" />
          ) : (
            <div className="flex flex-col items-center gap-1 opacity-30 text-gray-500">
              <ImageIcon size={24} />
              <span className="text-[10px]">无信号</span>
            </div>
          )}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="in-image"
        className="!bg-purple-400 !w-3 !h-3 !-left-1.5 !border-2 !border-surfaceHighlight"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-image"
        className="!bg-green-400 !w-3 !h-3 !-right-1.5 !border-2 !border-surfaceHighlight"
      />
    </div>
  );
}

function SlicerNode({ data, selected }: NodeProps<StoryboardNodeData>) {
  const [collapsed, setCollapsed] = useState(data.collapsed || false);
  return (
    <div
      className={`${NODE_BASE_CLASSES} ${selected ? "ring-2 ring-red-500 border-transparent" : ""}`}
      style={{ width: 240 }}
    >
      <NodeHeader
        label="切分节点"
        icon={Scissors}
        colorClass="bg-red-900/80"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {!collapsed && (
        <div className="p-3 min-h-[100px] flex items-center justify-center bg-surfaceHighlight animate-fade-in">
          {data.image ? (
            <div className="grid grid-cols-2 gap-1 w-full">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-square bg-black/50 rounded border border-gray-700/50 overflow-hidden relative group"
                >
                  <img
                    src={data.image}
                    className="w-full h-full object-cover opacity-80"
                    alt={`Slice ${i}`}
                  />
                  <div className="absolute inset-0 border border-white/10" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-textMuted text-[10px]">等待输入</div>
          )}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="in-slice"
        className="!bg-green-400 !w-3 !h-3 !-left-1.5 !border-2 !border-surfaceHighlight"
      />
    </div>
  );
}

const nodeTypes = {
  assetNode: AssetNode,
  scriptNode: ScriptNode,
  imageOutputNode: ImageOutputNodeLegacy,
  previewNode: PreviewNode,
  slicerNode: SlicerNode,
  candidateNode: AssetCandidateNode,
} satisfies Record<StoryboardNodeType, React.ComponentType<NodeProps<StoryboardNodeData>>>;

const TEMPLATES = {
  STORYBOARD: {
    label: "分镜创作工作流",
    nodes: [
      {
        id: "script-1",
        type: "scriptNode",
        position: { x: 50, y: 250 },
        data: { label: "主角萧炎站在悬崖边..." },
      },
      {
        id: "gen-1",
        type: "imageOutputNode",
        position: { x: 400, y: 200 },
        data: { model: "gemini-2.5-flash-image", prompt: "Cinematic shot...", aspectRatio: "16:9" },
      },
      {
        id: "prev-1",
        type: "previewNode",
        position: { x: 780, y: 200 },
        data: { image: undefined },
      },
    ] as StoryboardNode[],
    edges: [
      {
        id: "e1",
        source: "script-1",
        target: "gen-1",
        targetHandle: "in-script",
        sourceHandle: "text",
        animated: true,
        style: { stroke: "#3b82f6", strokeWidth: 2 },
      },
      {
        id: "e2",
        source: "gen-1",
        target: "prev-1",
        targetHandle: "in-image",
        sourceHandle: "image",
        animated: true,
        style: { stroke: "#9f7aea", strokeWidth: 2 },
      },
    ],
  },
  EXTRACTION: {
    label: "角色提取工作流",
    nodes: [
      {
        id: "script-ex-1",
        type: "scriptNode",
        position: { x: 50, y: 200 },
        data: { label: "粘贴剧本以提取角色..." },
      },
      {
        id: "extractor-1",
        type: "imageOutputNode",
        position: { x: 400, y: 200 },
        data: {
          model: "gemini-3-flash-preview",
          prompt: "Analyze and extract characters...",
          aspectRatio: "1:1",
          isExtraction: true,
        },
      },
      {
        id: "candidate-1",
        type: "candidateNode",
        position: { x: 780, y: 200 },
        data: { candidates: [] },
      },
    ] as StoryboardNode[],
    edges: [
      {
        id: "ex-1",
        source: "script-ex-1",
        target: "extractor-1",
        targetHandle: "in-script",
        sourceHandle: "text",
        animated: true,
        style: { stroke: "#f97316", strokeWidth: 2, strokeDasharray: "5,5" },
      },
      {
        id: "ex-2",
        source: "extractor-1",
        target: "candidate-1",
        targetHandle: "in-data",
        sourceHandle: "image",
        animated: true,
        style: { stroke: "#f97316", strokeWidth: 2 },
      },
    ],
  },
};

function StoryboardContent() {
  const searchParams = useSearchParams();
  const shotId = searchParams.get("shotId");

  const [activeTemplate, setActiveTemplate] = useState<keyof typeof TEMPLATES>("STORYBOARD");
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryboardNode>(TEMPLATES.STORYBOARD.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(TEMPLATES.STORYBOARD.edges);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isGlobalProcessing, setIsGlobalProcessing] = useState(false);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    if (!shotId) return;

    const initialNodes: StoryboardNode[] = [
      {
        id: "script-root",
        type: "scriptNode",
        position: { x: 50, y: 250 },
        data: { label: `[SHOT ${shotId}] 特写：萧炎满是血污的脸，眼神坚毅...` },
      },
      {
        id: "asset-ref-1",
        type: "assetNode",
        position: { x: 50, y: 100 },
        data: {
          assetName: "萧炎",
          assetType: "CHARACTER",
          thumbnail: "https://picsum.photos/id/1005/200/200",
        },
      },
      {
        id: "gen-main",
        type: "imageOutputNode",
        position: { x: 450, y: 200 },
        data: {
          model: "gemini-2.5-flash-image",
          prompt:
            "Cinematic close up shot of Xiao Yan, determined look, bloody face, ancient chinese fantasy style, high detail",
          aspectRatio: "16:9",
        },
      },
      {
        id: "prev-main",
        type: "previewNode",
        position: { x: 850, y: 200 },
        data: { image: undefined },
      },
    ];

    const initialEdges = [
      {
        id: "e-1",
        source: "script-root",
        target: "gen-main",
        targetHandle: "in-script",
        sourceHandle: "text",
        animated: true,
        style: { stroke: "#3b82f6", strokeWidth: 2 },
      },
      {
        id: "e-2",
        source: "asset-ref-1",
        target: "gen-main",
        targetHandle: "in-ref",
        sourceHandle: "ref",
        animated: true,
        style: { stroke: "#f97316", strokeWidth: 2 },
      },
      {
        id: "e-3",
        source: "gen-main",
        target: "prev-main",
        targetHandle: "in-image",
        sourceHandle: "image",
        animated: true,
        style: { stroke: "#9f7aea", strokeWidth: 2 },
      },
    ];

    setNodes(initialNodes);
    setEdges(initialEdges);
    setTimeout(() => fitView(), 100);
  }, [shotId, fitView, setNodes, setEdges]);

  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      setSelectedNodeId(selectedNodes[0]?.id || null);
    },
  });

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);

  const handleTemplateChange = (key: keyof typeof TEMPLATES) => {
    setActiveTemplate(key);
    const tmpl = TEMPLATES[key];
    setNodes(tmpl.nodes);
    setEdges(tmpl.edges);
    setTimeout(() => fitView(), 100);
  };

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: "#b1b1b7", strokeWidth: 2 } }, eds),
      ),
    [setEdges],
  );

  const updateNodeData = (id: string, newData: Partial<StoryboardNodeData>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) return { ...n, data: { ...n.data, ...newData } };
        return n;
      }),
    );
  };

  type DragNodeTemplate = {
    type: StoryboardNodeType;
    data: StoryboardNodeData;
  };

  const isDragNodeTemplate = (value: unknown): value is DragNodeTemplate => {
    if (!value || typeof value !== "object") return false;
    const rec = value as Record<string, unknown>;
    if (typeof rec.type !== "string") return false;
    if (!rec.data || typeof rec.data !== "object") return false;
    const type = rec.type as StoryboardNodeType;
    return (
      type === "assetNode" ||
      type === "scriptNode" ||
      type === "imageOutputNode" ||
      type === "previewNode" ||
      type === "slicerNode" ||
      type === "candidateNode"
    );
  };

  const onDragStart = (event: React.DragEvent, nodeTemplate: DragNodeTemplate) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(nodeTemplate));
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeDataStr = event.dataTransfer.getData("application/reactflow");
      if (!nodeDataStr) return;

      const parsed = JSON.parse(nodeDataStr) as unknown;
      if (!isDragNodeTemplate(parsed)) return;
      const nodeTemplate = parsed;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const newNode: StoryboardNode = {
        id: `${nodeTemplate.type}-${Date.now()}`,
        type: nodeTemplate.type,
        position,
        data: { ...nodeTemplate.data },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const runWorkflow = async () => {
    const generators = nodes.filter((n) => n.type === "imageOutputNode");
    if (generators.length === 0) return;

    setIsGlobalProcessing(true);

    try {
      for (const node of generators) {
        updateNodeData(node.id, { isProcessing: true });

        if (node.data.isExtraction) {
          await new Promise((r) => setTimeout(r, 1500));
          const extractedCandidates = [
            {
              name: "萧炎",
              description: "身穿黑色长袍的青年，背负重尺，神情坚毅。",
              tags: ["主角", "男性", "玄幻"],
            },
            {
              name: "药老",
              description: "半透明的灵魂体老者，白发苍苍，仙风道骨。",
              tags: ["配角", "灵魂体", "老者"],
            },
          ];

          updateNodeData(node.id, { isProcessing: false });

          const connectedEdges = edges.filter((e) => e.source === node.id);
          const targetIds = connectedEdges.map((e) => e.target);
          setNodes((nds) =>
            nds.map((n) => {
              if (targetIds.includes(n.id) && n.type === "candidateNode") {
                return { ...n, data: { ...n.data, candidates: extractedCandidates } };
              }
              return n;
            }),
          );

          continue;
        }

        try {
          const config = node.data;
          const fullPrompt = `${config.prompt || "High quality scene"}${config.negPrompt ? `\nNegative: ${config.negPrompt}` : ""}`;
          const res = await fetch("/api/ai/image/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              binding_key: "image",
              model_config_id: null,
              prompt: fullPrompt,
              resolution: null,
              images: [],
            }),
          });
          if (!res.ok) throw new Error(await res.text());
          const json = (await res.json()) as { data?: { url?: string } };
          const imageUrl = (json.data?.url || "").trim();

          if (imageUrl) {
            updateNodeData(node.id, { lastImage: imageUrl, isProcessing: false });
            const connectedEdges = edges.filter((e) => e.source === node.id);
            const targetIds = connectedEdges.map((e) => e.target);
            setNodes((nds) =>
              nds.map((n) => {
                if (targetIds.includes(n.id) && (n.type === "previewNode" || n.type === "slicerNode")) {
                  return { ...n, data: { ...n.data, image: imageUrl } };
                }
                return n;
              }),
            );
          } else {
            updateNodeData(node.id, { isProcessing: false });
          }
        } catch {
          updateNodeData(node.id, { isProcessing: false });
        }
      }
    } finally {
      setIsGlobalProcessing(false);
    }
  };

  const renderProperties = () => {
    if (!selectedNode) {
      return (
        <div className="text-textMuted text-center mt-20 text-sm flex flex-col items-center gap-2">
          <Cpu size={32} className="opacity-20" />
          <span>选择节点以编辑属性</span>
        </div>
      );
    }

    const data = selectedNode.data;
    if (selectedNode.type === "assetNode") {
      const relevantAssets = ASSETS.filter((a) => a.type === data.assetType || !data.assetType);
      return (
        <div className="space-y-4">
          <h3 className="font-bold text-sm border-b border-border pb-2 text-textMain">资源选择</h3>
          <div className="grid grid-cols-2 gap-2">
            {relevantAssets.map((a) => (
              <button
                key={a.id}
                onClick={() =>
                  updateNodeData(selectedNode.id, {
                    thumbnail: a.thumbnail,
                    assetName: a.name,
                    assetType: a.type,
                  })
                }
                className="relative aspect-square rounded overflow-hidden border border-border hover:border-primary"
                type="button"
              >
                <img src={a.thumbnail || ""} className="w-full h-full object-cover" alt={a.name} />
                {!a.thumbnail && (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] bg-surface">
                    无预览
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <h3 className="font-bold text-sm border-b border-border pb-2 text-textMain">节点属性</h3>
        <div className="space-y-2">
          <label className="text-xs text-textMuted">标签 (Label)</label>
          <input
            className="w-full bg-background border border-border rounded p-2 text-xs text-textMain"
            value={data.label || ""}
            onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
          />
        </div>
        {selectedNode.type === "imageOutputNode" && (
          <div className="space-y-2">
            <label className="text-xs text-textMuted">提示词 (Prompt)</label>
            <textarea
              className="w-full h-24 bg-background border border-border rounded p-2 text-xs text-textMain"
              value={data.prompt || ""}
              onChange={(e) => updateNodeData(selectedNode.id, { prompt: e.target.value })}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full bg-background overflow-hidden relative transition-colors duration-300">
      <div
        className={`${isSidebarOpen ? "w-64" : "w-0"} bg-surfaceHighlight border-r border-border transition-all duration-300 flex flex-col z-20 relative shadow-2xl`}
      >
        <div className="p-3 border-b border-border bg-surface flex items-center justify-between h-10 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <LayoutTemplate size={16} className="text-primary flex-shrink-0" />
            <span className="font-bold text-sm text-textMain truncate">节点库</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-textMuted hover:text-textMain"
            type="button"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <div className="p-3 border-b border-border bg-surfaceHighlight/50">
          <div className="flex gap-2">
            {(
              Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]
            ).map((k) => (
              <button
                key={k}
                onClick={() => handleTemplateChange(k)}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                  activeTemplate === k
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-background border-border text-textMuted hover:text-textMain"
                }`}
                type="button"
              >
                {TEMPLATES[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div
            className="bg-background p-2 rounded cursor-grab border border-transparent hover:border-textMuted text-textMuted text-xs hover:text-textMain"
            draggable
            onDragStart={(e) => onDragStart(e, { type: "scriptNode", data: { label: "新剧本片段" } })}
          >
            剧本节点 (Script)
          </div>
          <div
            className="bg-background p-2 rounded cursor-grab border border-transparent hover:border-textMuted text-textMuted text-xs hover:text-textMain"
            draggable
            onDragStart={(e) =>
              onDragStart(e, { type: "imageOutputNode", data: { model: "gemini-2.5-flash-image" } })
            }
          >
            图像输出 (Image Output)
          </div>
          <div
            className="bg-background p-2 rounded cursor-grab border border-transparent hover:border-textMuted text-textMuted text-xs hover:text-textMain"
            draggable
            onDragStart={(e) => onDragStart(e, { type: "previewNode", data: {} })}
          >
            预览节点 (Preview)
          </div>
          <div
            className="bg-background p-2 rounded cursor-grab border border-transparent hover:border-textMuted text-textMuted text-xs hover:text-textMain"
            draggable
            onDragStart={(e) => onDragStart(e, { type: "assetNode", data: { assetType: "CHARACTER" } })}
          >
            资产节点 (Asset)
          </div>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col min-w-0 h-full">
        <div className="h-12 bg-surfaceHighlight border-b border-border flex items-center justify-between px-4 z-10 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-1 hover:bg-surface rounded text-textMuted"
                type="button"
              >
                <ChevronRight size={16} />
              </button>
            )}
            <Workflow size={16} className="text-primary" />
            <div className="text-textMain text-sm font-bold">
              {shotId ? `导演工作台 - SHOT ${shotId}` : "自由创作"}
            </div>
          </div>

          <button
            onClick={runWorkflow}
            disabled={isGlobalProcessing}
            className="bg-primary hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            type="button"
          >
            {isGlobalProcessing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
            运行工作流
          </button>
        </div>

        <div className="flex-1 relative bg-background" ref={reactFlowWrapper}>
          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              fitView
              className="bg-background"
              minZoom={0.2}
              snapToGrid
            >
              <Background color="var(--color-border)" gap={20} size={1} />
              <Controls className="!bg-surface !border-border !fill-textMuted" />
            </ReactFlow>
          </div>
        </div>
      </div>

      <div
        className={`w-80 bg-surfaceHighlight border-l border-border flex flex-col z-20 ${
          !selectedNode ? "hidden" : ""
        }`}
      >
        <div className="h-10 border-b border-border flex items-center justify-between px-3">
          <span className="font-bold text-sm text-textMain">属性编辑</span>
          <button
            onClick={() => setSelectedNodeId(null)}
            className="text-textMuted hover:text-textMain"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">{renderProperties()}</div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <StoryboardContent />
    </ReactFlowProvider>
  );
}
