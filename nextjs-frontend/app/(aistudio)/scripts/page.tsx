"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clapperboard, Code, Edit3, Eye, FileText, Film, Image as ImageIcon, Loader2, Music, Package, Plus, Save, Settings, Sparkles, Trash2, Users, Video as VideoIcon, Wand2, X, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AssetCreateDialog } from "@/components/scripts/AssetCreateDialog";
import { AgentPickerDialog } from "@/components/agents/AgentPickerDialog";
import { StatCard } from "@/components/aistudio/StatCard";
import { ScriptAIAssistantChatboxPane } from "@/components/scripts/ScriptAIAssistantChatboxPane";
import { ScriptAIAssistantSessionPane } from "@/components/scripts/ScriptAIAssistantSessionPane";
import { AssetDocumentViewer } from "@/components/scripts/AssetDocumentViewer";

type ScriptItem = {
  id: string;
  title: string;
  description?: string | null;
  aspect_ratio?: string | null;
  animation_style?: string | null;
  panorama_original_filename?: string | null;
  panorama_content_type?: string | null;
  panorama_size_bytes?: number;
  created_at: string;
  original_filename: string;
};

type EpisodeRow = {
  id: string;
  episode_code: string;
  episode_number: number;
  title?: string | null;
  script_full_text?: string | null;
  storyboard_root_node_id?: string | null;
  asset_root_node_id?: string | null;
};

type ScriptStats = {
  script_id: string;
  word_count: number;
  episodes_count: number;
  scene_count: number;
  character_count: number;
  prop_count: number;
  vfx_count: number;
  image_count: number;
  video_count: number;
};

type AgentRow = {
  id: string;
  name: string;
  category: string;
  purpose?: string;
  capabilities: string[];
  credits_per_call: number;
  enabled: boolean;
};

type PickerMode = "storyboard" | "scene" | "character" | "prop" | "vfx" | null;

type VfsNode = {
  id: string;
  parent_id?: string | null;
  project_id?: string | null;
  name: string;
  is_folder: boolean;
  content_type?: string | null;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};

async function createTask(payload: { type: string; entity_type: string; entity_id: string; input_json: Record<string, unknown> }): Promise<{ id: string; status: string }> {
  const res = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: { id: string; status: string } };
  if (!json.data?.id) throw new Error("任务创建失败");
  return json.data;
}

async function fetchTask(taskId: string): Promise<{ status: string; error?: string | null }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { data?: { status: string; error?: string | null } };
  return { status: json.data?.status || "unknown", error: json.data?.error };
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

function stripMarkdownMetadata(raw: string): string {
  const text = String(raw || "");
  if (!text.trim()) return "";
  let lines = text.replace(/\r\n/g, "\n").split("\n");
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

function buildAssetCreateHref(sourceNodeId: string, seriesId: string, assetId?: string): string {
  let href = `/assets?mode=create&sourceNodeId=${encodeURIComponent(sourceNodeId)}&seriesId=${encodeURIComponent(seriesId)}`;
  if (assetId) href += `&assetId=${encodeURIComponent(assetId)}`;
  return href;
}

import { AssetCard } from "@/components/chat/AssetCard";

function AssetPreviewOverlay({ open, asset, onClose }: { open: boolean; asset: AssetEntity; onClose: () => void }) {
  const [md, setMd] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (asset.doc_node_id) {
          const res = await fetch(`/api/vfs/nodes/${asset.doc_node_id}/download`, { cache: "no-store" });
          if (res.ok) {
            const text = await res.text();
            if (!cancelled) setMd(stripMarkdownMetadata(text));
          }
        } else {
          if (!cancelled) setMd("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, asset.doc_node_id]);
  if (!open) return null;
  const thumbs = asset.resources || [];
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/85 p-4 flex items-center justify-center" role="dialog" aria-modal="true" onClick={onClose}>
        <div className="w-full max-w-5xl max-h-[85vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="font-bold text-sm text-textMain truncate">{asset.name}</div>
            <button className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors" onClick={onClose} type="button">
              关闭
            </button>
          </div>

          {/* Document area — capped at ~35vh */}
          <div className="overflow-auto flex-shrink-0" style={{ maxHeight: "35vh" }}>
            <div className="px-4 py-3">
              {loading ? (
                <div className="text-sm text-textMuted flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> 加载文档...
                </div>
              ) : md ? (
                <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-xs text-textMuted">无文档内容</div>
              )}
            </div>
          </div>

          {/* Image gallery */}
          <div className="border-t border-border flex-1 min-h-0 overflow-auto bg-background/20">
            {thumbs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-textMuted text-xs py-8">无图片资源</div>
            ) : (
              <div className="p-3 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {thumbs.map((r) => (
                  <div
                    key={r.id}
                    className="group/img relative aspect-square rounded-lg overflow-hidden border border-border bg-black/20 cursor-pointer hover:border-primary/60 transition-all"
                    onClick={() => setLightboxUrl(r.url)}
                  >
                    <img
                      src={r.url}
                      alt={r.filename || ""}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover/img:scale-110"
                    />
                    <a
                      href={r.url}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      下载
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={lightboxUrl}
            alt="放大预览"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

const ASSET_TYPE_ORDER = ["scene", "character", "prop", "vfx"];
const ASSET_TYPE_LABELS: Record<string, string> = {
  scene: "场景",
  character: "角色",
  prop: "道具",
  vfx: "特效",
};

type AssetEntity = {
  id: string;
  name: string;
  type: string;
  thumbnail: string;
  tags: string[];
  doc_node_id?: string;
  resources?: { id: string; url: string; filename?: string }[];
};

async function listScriptAssets(scriptId: string): Promise<AssetEntity[]> {
  const res = await fetch(`/api/assets?project_id=${encodeURIComponent(scriptId)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map((a: any) => {
    let thumbnail = "";
    const r0 = a.resources?.[0];
    if (r0?.meta_data?.file_node_id) {
      thumbnail = `/api/vfs/nodes/${r0.meta_data.file_node_id}/thumbnail`;
    } else if (r0?.minio_key) {
      thumbnail = `/api/assets/${a.id}/resources/${r0.id}/thumbnail`;
    }

    return {
      id: a.id,
      name: a.name,
      type: a.type?.toLowerCase() || "character",
      thumbnail,
      tags: Array.isArray(a.tags) ? a.tags : [],
      doc_node_id: a.doc_node_id,
      resources: Array.isArray(a.resources)
        ? a.resources.map((r: any) => ({
            id: r.id,
            url: `/api/assets/${a.id}/resources/${r.id}/download`,
            filename: r.filename || r.name || ""
          }))
        : []
    };
  });
}

async function fetchEpisodeAssetBindings(episodeIds: string[]): Promise<Set<string>> {
  const boundIds = new Set<string>();
  await Promise.all(
    episodeIds.map(async (epId) => {
      try {
        const res = await fetch(`/api/episodes/${epId}/asset-bindings`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          const bindings = Array.isArray(json.data) ? json.data : [];
          bindings.forEach((b: any) => {
            if (b.asset_entity_id) boundIds.add(b.asset_entity_id);
          });
        }
      } catch (e) {
        console.error(`Failed to fetch bindings for episode ${epId}`, e);
      }
    })
  );
  return boundIds;
}

function AssetEntityCard({ asset, onClick, onOpenDoc, onDelete, onGenerate }: { asset: AssetEntity; onClick: () => void; onOpenDoc: () => void; onDelete?: () => void; onGenerate?: () => void }) {
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!asset.doc_node_id) {
      setDocPreview(null);
      setDocLoading(false);
      return;
    }
    let cancelled = false;
    setDocLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/vfs/nodes/${asset.doc_node_id}/download`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setDocPreview(null);
        } else {
          const text = await res.text();
          if (!cancelled) setDocPreview(stripMarkdownMetadata(text));
        }
      } catch {
        if (!cancelled) setDocPreview(null);
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.doc_node_id]);

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-gradient-to-br from-surface/80 to-surface/40 overflow-hidden hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer h-80">
      <div className="h-32 relative bg-black/20 flex-shrink-0" onClick={onClick}>
        {asset.thumbnail && !imgError ? (
          <img 
            src={asset.thumbnail} 
            alt={asset.name} 
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              const fallback = asset.resources?.[0]?.url;
              if (fallback && !target.src.endsWith("/download") && target.src !== fallback) {
                target.src = fallback;
              } else {
                setImgError(true);
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-textMuted opacity-50 bg-surface/50">
            <ImageIcon size={24} />
            <span className="text-[10px] mt-1">无预览图</span>
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
           <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white uppercase backdrop-blur-sm">
             {asset.type}
           </span>
        </div>
      </div>
      
      <div className="flex-1 p-3 border-t border-border/50 bg-surface/30 overflow-hidden relative" onClick={onClick}>
         {docLoading ? (
            <div className="flex items-center gap-2 text-textMuted text-[10px]">
              <Loader2 size={12} className="animate-spin" /> 加载文档...
            </div>
         ) : docPreview ? (
            <div className="markdown-body prose prose-invert prose-xs max-w-none text-[10px] leading-relaxed opacity-80 pointer-events-none select-none line-clamp-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{docPreview}</ReactMarkdown>
            </div>
         ) : (
            <div className="text-[10px] text-textMuted opacity-50">无文档内容</div>
         )}
         <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface/30 to-transparent pointer-events-none" />
      </div>

      <div className="p-3 border-t border-border/50 bg-surface/60 backdrop-blur-sm flex flex-col gap-1.5 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-sm text-textMain truncate" title={asset.name}>
            【{ASSET_TYPE_LABELS[asset.type] || asset.type}】{asset.name}
          </div>
          <div className="flex items-center gap-1">
            {onGenerate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate();
                }}
                className="p-1 rounded hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors"
                title="生成图片"
              >
                <ImageIcon size={14} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDoc();
              }}
              className="p-1 rounded hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors"
              title="查看文档与资源"
            >
              <FileText size={14} />
            </button>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 rounded hover:bg-surfaceHighlight text-textMuted hover:text-red-400 transition-colors"
                title="删除资产"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 h-5 overflow-hidden">
          {asset.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-surfaceHighlight text-textMuted truncate max-w-[60px]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
function MarkdownCard({ node, onClick, onDelete }: { node: VfsNode; onClick: () => void; onDelete?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`/api/vfs/nodes/${node.id}/download`);
        if (!res.ok) throw new Error("Failed");
        const text = await res.text();
        if (mounted) setContent(stripMarkdownMetadata(text));
      } catch (e) {
        if (mounted) setContent("");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [node.id]);

  const handleGenerateImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const seriesId = searchParams.get("seriesId");
    if (!seriesId) return;
    router.push(buildAssetCreateHref(node.id, seriesId));
  };

  return (
    <div 
      className="group relative flex flex-col gap-2 rounded-xl border border-border bg-gradient-to-br from-surface/80 to-surface/40 p-3 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer h-48 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2 mb-1 z-10">
         <button onClick={onClick} className="text-xs font-bold text-textMain truncate flex-1 hover:text-primary text-left" title={node.name}>
           {node.name.replace(".md", "")}
         </button>
         <div className="flex items-center gap-1">
           <button 
             onClick={handleGenerateImage}
             className="text-textMuted hover:text-primary p-0.5 rounded transition-colors"
             title="生成资产图片"
           >
             <ImageIcon size={12} />
           </button>
           {onDelete && (
             <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-textMuted hover:text-red-400 p-0.5 rounded transition-colors">
               <Trash2 size={12} />
             </button>
           )}
         </div>
      </div>
      <div className="flex-1 overflow-hidden relative" onClick={onClick}>
        {loading ? (
           <div className="absolute inset-0 flex items-center justify-center text-textMuted">
             <Loader2 size={14} className="animate-spin" />
           </div>
        ) : (
           <div className="markdown-body prose prose-invert prose-xs max-w-none text-[10px] leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
             <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "*无内容*"}</ReactMarkdown>
           </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

function AssetMarkdownCard({ group, onDelete, onOpen }: { group: { name: string; mdNode?: VfsNode; jsonNode?: VfsNode }; onDelete: (n: VfsNode) => void; onOpen: (n: VfsNode) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!group.mdNode) return;
    let mounted = true;
    setLoading(true);
    async function load() {
      try {
        const res = await fetch(`/api/vfs/nodes/${group.mdNode!.id}/download`);
        if (!res.ok) throw new Error("Failed");
        const text = await res.text();
        if (mounted) setContent(stripMarkdownMetadata(text));
      } catch (e) {
        if (mounted) setContent("");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [group.mdNode]);

  const handleGenerateImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const seriesId = searchParams.get("seriesId");
    if (!seriesId || !group.mdNode) return;
    router.push(buildAssetCreateHref(group.mdNode.id, seriesId));
  };

  const displayName = group.name.replace(/^(character|prop|location|vfx)_/i, "");
  const typeLabel = group.name.startsWith("character") ? "Character" : group.name.startsWith("prop") ? "Prop" : group.name.startsWith("location") ? "Location" : "Asset";

  return (
    <div className="flex flex-col rounded-xl border border-border bg-gradient-to-br from-surface/80 to-surface/40 p-3 hover:border-primary/50 transition-colors h-56 group">
      <div className="flex items-start justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-medium text-textMain truncate" title={displayName}>{displayName}</div>
            <div className="text-[10px] text-textMuted">{typeLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {group.mdNode && (
             <button 
               onClick={handleGenerateImage}
               className="p-1.5 rounded hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors"
               title="生成资产图片"
               type="button"
             >
               <ImageIcon size={12} />
             </button>
          )}
          <button
            onClick={() => onDelete(group.mdNode || group.jsonNode!)}
            className="p-1.5 rounded hover:bg-red-500/20 text-textMuted hover:text-red-400 transition-colors"
            type="button"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      
      <div 
        className="flex-1 min-h-0 bg-background/20 rounded-lg p-2 mb-2 overflow-hidden relative cursor-pointer border border-transparent hover:border-primary/20 transition-colors"
        onClick={() => group.mdNode && onOpen(group.mdNode)}
      >
        {group.mdNode ? (
           loading ? (
             <div className="flex items-center justify-center h-full text-textMuted"><Loader2 size={14} className="animate-spin" /></div>
           ) : (
             <>
               <div className="markdown-body prose prose-invert prose-xs max-w-none text-[10px] leading-relaxed opacity-80 pointer-events-none select-none">
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ""}</ReactMarkdown>
               </div>
               <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
             </>
           )
        ) : (
           <div className="text-xs text-textMuted flex items-center justify-center h-full italic">无文档预览</div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
         {group.mdNode && (
            <button
              onClick={() => onOpen(group.mdNode!)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1"
            >
              <FileText size={12} /> 文档
            </button>
         )}
         {group.jsonNode && (
            <button
              onClick={() => onOpen(group.jsonNode!)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-surface/60 text-textMuted hover:bg-surfaceHighlight transition-colors flex items-center justify-center gap-1"
            >
              <Code size={12} /> JSON
            </button>
         )}
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "list";
  const isWriteMode = mode === "write";
  const scriptId = searchParams.get("seriesId") || "";
  const initialPane = (() => {
    if (!isWriteMode) return "dashboard";
    const p = searchParams.get("pane");
    if (p === "episodes" || p === "assets" || p === "editor" || p === "ai" || p === "dashboard") return p;
    return "dashboard";
  })();

  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState<string | null>(null);

  const [createScriptOpen, setCreateScriptOpen] = useState(false);
  const [createScriptTitle, setCreateScriptTitle] = useState("");
  const [createScriptDescription, setCreateScriptDescription] = useState("");
  const [createScriptAspectRatio, setCreateScriptAspectRatio] = useState<string>("");
  const [createScriptAnimationStyle, setCreateScriptAnimationStyle] = useState<string>("");
  const [createScriptText, setCreateScriptText] = useState("");
  const [createScriptFile, setCreateScriptFile] = useState<File | null>(null);
  const [createScriptPanoramaImage, setCreateScriptPanoramaImage] = useState<File | null>(null);
  const [createScriptPanoramaPreviewUrl, setCreateScriptPanoramaPreviewUrl] = useState<string | null>(null);
  const [createScriptSubmitting, setCreateScriptSubmitting] = useState(false);
  const [createScriptError, setCreateScriptError] = useState<string | null>(null);

  const [deleteScriptOpen, setDeleteScriptOpen] = useState(false);
  const [deleteScriptTarget, setDeleteScriptTarget] = useState<ScriptItem | null>(null);
  const [deleteScriptSubmitting, setDeleteScriptSubmitting] = useState(false);
  const [deleteScriptError, setDeleteScriptError] = useState<string | null>(null);

  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderSubmitting, setNewFolderSubmitting] = useState(false);

  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [hierarchyLoadedScriptId, setHierarchyLoadedScriptId] = useState<string | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [writePane, setWritePane] = useState<"dashboard" | "episodes" | "assets" | "editor" | "ai">(initialPane);
  const [scriptStats, setScriptStats] = useState<ScriptStats | null>(null);
  const [scriptStatsLoading, setScriptStatsLoading] = useState(false);
  const [scriptStatsError, setScriptStatsError] = useState<string | null>(null);
  const [episodeMenuOpen, setEpisodeMenuOpen] = useState(false);
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const UNASSIGNED_ID = "__UNASSIGNED__";

  const activeEpisode = useMemo(() => episodes.find((e) => e.id === activeEpisodeId) || null, [episodes, activeEpisodeId]);
  const activeScript = useMemo(() => scripts.find((s) => s.id === scriptId) || null, [scripts, scriptId]);
  const fullScriptText = useMemo(() => {
    const sorted = [...episodes].sort((a, b) => a.episode_number - b.episode_number);
    return sorted
      .map((e) => (e.script_full_text || "").trim())
      .filter((x) => x.length > 0)
      .join("\n\n");
  }, [episodes]);

  const [fullScriptFallback, setFullScriptFallback] = useState<string>("");
  const [fullScriptFallbackLoading, setFullScriptFallbackLoading] = useState(false);

  useEffect(() => {
    if (!isWriteMode) return;
    const p = searchParams.get("pane");
    const nextPane = p === "episodes" || p === "assets" || p === "editor" || p === "ai" || p === "dashboard" ? p : "dashboard";
    setWritePane((prev) => (prev === nextPane ? prev : nextPane));
  }, [isWriteMode, searchParams]);

  useEffect(() => {
    if (!isWriteMode || !scriptId) {
      setFullScriptFallback("");
      setFullScriptFallbackLoading(false);
      return;
    }
    if (fullScriptText) {
      setFullScriptFallback("");
      setFullScriptFallbackLoading(false);
      return;
    }
    let cancelled = false;
    setFullScriptFallbackLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/download`, { cache: "no-store" });
        if (!res.ok) {
          if (cancelled) return;
          setFullScriptFallbackLoading(false);
          return;
        }
        const txt = await res.text();
        if (cancelled) return;
        setFullScriptFallback(txt || "");
        setFullScriptFallbackLoading(false);
      } catch {
        if (cancelled) return;
        setFullScriptFallbackLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWriteMode, scriptId, fullScriptText]);

  const setWritePaneAndSync = (pane: "dashboard" | "episodes" | "assets" | "editor" | "ai") => {
    setWritePane(pane);
    const sp = new URLSearchParams(searchParams.toString());
    if (pane === "dashboard") {
      sp.delete("pane");
    } else {
      sp.set("pane", pane);
    }
    router.replace(`/scripts?${sp.toString()}`);
  };

  const [episodeActionsOpen, setEpisodeActionsOpen] = useState(false);
  const [episodeEditMode, setEpisodeEditMode] = useState<"PREVIEW" | "EDIT">("PREVIEW");
  const [editorScope, setEditorScope] = useState<"FULL" | "EPISODE">("FULL");
  const [episodeScriptDraft, setEpisodeScriptDraft] = useState("");
  const [episodeSaving, setEpisodeSaving] = useState(false);
  const [contextPreview, setContextPreview] = useState<{ counts: Record<string, number> } | null>(null);
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState<string | null>(null);
  const [contextPreviewRefreshKey, setContextPreviewRefreshKey] = useState(0);

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetAgents, setAssetAgents] = useState<{
    scene: AgentRow | null;
    character: AgentRow | null;
    prop: AgentRow | null;
    vfx: AgentRow | null;
  }>({ scene: null, character: null, prop: null, vfx: null });
  const [tasksRunning, setTasksRunning] = useState<Array<{ id: string; label: string }>>([]);
  const [taskError, setTaskError] = useState<string | null>(null);

  const [storyboardNodes, setStoryboardNodes] = useState<VfsNode[]>([]);
  const [storyboardLoading, setStoryboardLoading] = useState(false);

  const [assetRootNodes, setAssetRootNodes] = useState<VfsNode[]>([]);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetEntities, setAssetEntities] = useState<AssetEntity[]>([]);
  const [assetExpanded, setAssetExpanded] = useState<Record<string, boolean>>({});
  const [assetChildren, setAssetChildren] = useState<Record<string, VfsNode[]>>({});
  const [boundAssetIds, setBoundAssetIds] = useState<Set<string>>(new Set());
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [unassignedExpanded, setUnassignedExpanded] = useState(true);

  const unassignedAssets = useMemo(() => {
    return assetEntities.filter((a) => !boundAssetIds.has(a.id));
  }, [assetEntities, boundAssetIds]);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerContent, setViewerContent] = useState("");
  const [viewerNode, setViewerNode] = useState<VfsNode | null>(null);
  const [assetPreviewOpen, setAssetPreviewOpen] = useState(false);
  const [assetPreviewTarget, setAssetPreviewTarget] = useState<AssetEntity | null>(null);

  const [manualAssetCreateOpen, setManualAssetCreateOpen] = useState(false);

  const handleCreateAssetSubmit = async (data: { name: string; type: string; category?: string; content_md?: string }) => {
    if (!scriptId) return;
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, script_id: scriptId, project_id: scriptId, source: "manual" }),
    });
    if (!res.ok) throw new Error(await res.text());
    await refreshAssetRoot();
  };

  const handleDeleteAssetEntity = async (asset: AssetEntity) => {
    if (!window.confirm(`确认删除资产“${asset.name}”？`)) return;
    await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lifecycle_status: "archived" })
    });
    await refreshAssetRoot();
  };

  const refreshHierarchy = async (targetScriptId: string) => {
    setEpisodesLoading(true);
    setEpisodesError(null);
    const res = await fetch(`/api/scripts/${encodeURIComponent(targetScriptId)}/hierarchy`, { cache: "no-store" });
    if (!res.ok) {
      setEpisodesLoading(false);
      setEpisodesError(await res.text());
      return;
    }
    const json = (await res.json()) as { data?: { episodes?: EpisodeRow[] } };
    const list = Array.isArray(json.data?.episodes) ? json.data?.episodes : [];
    setEpisodes(list);
    setEpisodesLoading(false);
    setHierarchyLoadedScriptId(targetScriptId);
    if (list.length > 0) setActiveEpisodeId((prev) => prev ?? list[0].id);
  };

  const refreshScriptStats = async (targetScriptId: string) => {
    setScriptStatsLoading(true);
    setScriptStatsError(null);
    const res = await fetch(`/api/scripts/${encodeURIComponent(targetScriptId)}/stats`, { cache: "no-store" });
    if (!res.ok) {
      setScriptStatsLoading(false);
      setScriptStatsError(await res.text());
      return;
    }
    const json = (await res.json()) as { data?: ScriptStats };
    setScriptStats(json.data || null);
    setScriptStatsLoading(false);
  };

  const autoStructuredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setScriptsLoading(true);
    setScriptsError(null);
    (async () => {
      const res = await fetch("/api/scripts?page=1&size=100", { cache: "no-store" });
      if (!res.ok) {
        if (cancelled) return;
        setScriptsError(await res.text());
        setScriptsLoading(false);
        return;
      }
      const json = (await res.json()) as { data?: { items?: ScriptItem[] } };
      if (cancelled) return;
      setScripts(Array.isArray(json.data?.items) ? json.data?.items : []);
      setScriptsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isWriteMode || !scriptId) {
      setEpisodes([]);
      setActiveEpisodeId(null);
      setHierarchyLoadedScriptId(null);
      return;
    }
    setHierarchyLoadedScriptId(null);
    void refreshHierarchy(scriptId);
  }, [isWriteMode, scriptId]);

  useEffect(() => {
    if (!isWriteMode || !scriptId) {
      setScriptStats(null);
      setScriptStatsError(null);
      setScriptStatsLoading(false);
      return;
    }
    void refreshScriptStats(scriptId);
  }, [isWriteMode, scriptId]);

  useEffect(() => {
    if (!isWriteMode || !scriptId) return;
    if (episodesLoading) return;
    if (hierarchyLoadedScriptId !== scriptId) return;
    if (episodes.length > 0) return;
    if (autoStructuredRef.current.has(scriptId)) return;
    autoStructuredRef.current.add(scriptId);

    setTaskError(null);
    setTasksRunning((prev) => (prev.some((t) => t.id === "structure") ? prev : [...prev, { id: "structure", label: "结构化剧本" }]));
    void (async () => {
      const res = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/structure`, { method: "POST" });
      if (!res.ok) {
        setTaskError(await res.text());
        return;
      }
      await refreshHierarchy(scriptId);
      await refreshScriptStats(scriptId);
    })().finally(() => {
      setTasksRunning((prev) => prev.filter((t) => t.id !== "structure"));
    });
  }, [isWriteMode, scriptId, episodesLoading, episodes.length, hierarchyLoadedScriptId]);

  useEffect(() => {
    if (!activeEpisode) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/episodes/${encodeURIComponent(activeEpisode.id)}/doc`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { data?: { content_md?: string } };
          const md = json.data?.content_md;
          const fallback = activeEpisode.script_full_text || "";
          if (!cancelled) setEpisodeScriptDraft(md ?? fallback);
          return;
        }
      } catch {}
      if (!cancelled) setEpisodeScriptDraft(activeEpisode.script_full_text || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [activeEpisode?.id]);

  useEffect(() => {
    if (!isWriteMode || !scriptId) {
      setContextPreview(null);
      setContextPreviewLoading(false);
      setContextPreviewError(null);
      return;
    }
    let cancelled = false;
    setContextPreviewLoading(true);
    setContextPreviewError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(scriptId)}/context/preview`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setContextPreviewError(await res.text());
          if (!cancelled) setContextPreviewLoading(false);
          return;
        }
        const json = (await res.json()) as { data?: { counts?: Record<string, number> } };
        const counts = json.data?.counts && typeof json.data.counts === "object" ? json.data.counts : {};
        if (!cancelled) setContextPreview({ counts });
        if (!cancelled) setContextPreviewLoading(false);
      } catch (e) {
        if (!cancelled) setContextPreviewError(e instanceof Error ? e.message : String(e));
        if (!cancelled) setContextPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWriteMode, scriptId, contextPreviewRefreshKey]);

  const resetCreateScript = () => {
    setCreateScriptTitle("");
    setCreateScriptDescription("");
    setCreateScriptAspectRatio("");
    setCreateScriptAnimationStyle("");
    setCreateScriptText("");
    setCreateScriptFile(null);
    setCreateScriptPanoramaImage(null);
    setCreateScriptPanoramaPreviewUrl(null);
    setCreateScriptError(null);
    setCreateScriptSubmitting(false);
  };

  const openDeleteScriptDialog = (script: ScriptItem) => {
    setDeleteScriptError(null);
    setDeleteScriptSubmitting(false);
    setDeleteScriptTarget(script);
    setDeleteScriptOpen(true);
  };

  const closeDeleteScriptDialog = () => {
    if (deleteScriptSubmitting) return;
    setDeleteScriptOpen(false);
    setDeleteScriptTarget(null);
    setDeleteScriptError(null);
    setDeleteScriptSubmitting(false);
  };

  const confirmDeleteScript = async () => {
    if (!deleteScriptTarget?.id) return;
    setDeleteScriptSubmitting(true);
    setDeleteScriptError(null);
    try {
      const res = await fetch(`/api/scripts/${encodeURIComponent(deleteScriptTarget.id)}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) {
        setDeleteScriptSubmitting(false);
        setDeleteScriptError(await res.text());
        return;
      }
      setScripts((prev) => prev.filter((x) => x.id !== deleteScriptTarget.id));
      setDeleteScriptSubmitting(false);
      setDeleteScriptOpen(false);
      setDeleteScriptTarget(null);
    } catch (e) {
      setDeleteScriptSubmitting(false);
      setDeleteScriptError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!createScriptPanoramaImage) {
      setCreateScriptPanoramaPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(createScriptPanoramaImage);
    setCreateScriptPanoramaPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [createScriptPanoramaImage]);

  useEffect(() => {
    if (!activeEpisode) {
      setStoryboardNodes([]);
      setAssetRootNodes([]);
      setAssetExpanded({});
      setAssetChildren({});
      return;
    }

    (async () => {
      if (activeEpisode.storyboard_root_node_id) {
        setStoryboardLoading(true);
        try {
          const nodes = await vfsListNodes({ parent_id: activeEpisode.storyboard_root_node_id, project_id: scriptId || null });
          setStoryboardNodes(nodes.filter((n) => !n.is_folder).sort((a, b) => a.name.localeCompare(b.name)));
        } finally {
          setStoryboardLoading(false);
        }
      } else {
        setStoryboardNodes([]);
      }
    })();

    (async () => {
      if (!scriptId) {
        setAssetRootNodes([]);
        setAssetEntities([]);
        setAssetExpanded({});
        setAssetChildren({});
        return;
      }
      setAssetLoading(true);
      try {
        const [allNodes, entities] = await Promise.all([
          vfsListNodes({ parent_id: null, project_id: scriptId }),
          listScriptAssets(scriptId)
        ]);
        
        setAssetEntities(entities);

        const assetsRoot = allNodes.find((n) => n.name === "资产" && n.is_folder);
        if (assetsRoot) {
          const nodes = await vfsListNodes({ parent_id: assetsRoot.id, project_id: scriptId });
          setAssetRootNodes(nodes.sort((a, b) => a.name.localeCompare(b.name)));
          setProjectAssetsRootId(assetsRoot.id);
        } else {
          setAssetRootNodes([]);
          setProjectAssetsRootId(null);
        }
      } finally {
        setAssetLoading(false);
      }
    })();
  }, [activeEpisode?.id, scriptId]);

  useEffect(() => {
    if (!isWriteMode || !scriptId || episodes.length === 0) {
      setBoundAssetIds(new Set());
      return;
    }
    let cancelled = false;
    setBindingsLoading(true);
    void (async () => {
      const ids = await fetchEpisodeAssetBindings(episodes.map((e) => e.id));
      if (!cancelled) {
        setBoundAssetIds(ids);
        setBindingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWriteMode, scriptId, episodes]);

  const pickScript = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("mode", "write");
    sp.set("seriesId", id);
    router.push(`/scripts?${sp.toString()}`);
  };

  const openScript = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("mode", "write");
    sp.set("seriesId", id);
    router.push(`/scripts?${sp.toString()}`);
  };

  const submitCreateScript = async () => {
    const title = createScriptTitle.trim();
    const description = createScriptDescription.trim();
    const text = createScriptText.trim();
    const aspectRatio = createScriptAspectRatio.trim();
    const animationStyle = createScriptAnimationStyle.trim();
    if (!title) {
      setCreateScriptError("请填写剧本标题");
      return;
    }
    if (!createScriptFile && !text) {
      setCreateScriptError("请上传文件或填写剧本文本");
      return;
    }

    setCreateScriptSubmitting(true);
    setCreateScriptError(null);
    try {
      const form = new FormData();
      form.append("title", title);
      if (description) form.append("description", description);
      if (aspectRatio) form.append("aspect_ratio", aspectRatio);
      if (animationStyle) form.append("animation_style", animationStyle);
      if (createScriptFile) {
        form.append("file", createScriptFile);
      } else {
        form.append("text", text);
      }
      if (createScriptPanoramaImage) {
        form.append("panorama_image", createScriptPanoramaImage);
      }
      const res = await fetch("/api/scripts", { method: "POST", body: form });
      if (!res.ok) {
        setCreateScriptSubmitting(false);
        setCreateScriptError(await res.text());
        return;
      }
      const json = (await res.json()) as { data?: ScriptItem };
      const created = json.data;
      if (!created?.id) {
        setCreateScriptSubmitting(false);
        setCreateScriptError("创建失败：返回数据异常");
        return;
      }
      setScripts((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
      setCreateScriptSubmitting(false);
      setCreateScriptOpen(false);
      resetCreateScript();
      openScript(created.id);
    } catch (e) {
      setCreateScriptSubmitting(false);
      setCreateScriptError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveEpisodeScript = async () => {
    if (!activeEpisode) return;
    setEpisodeSaving(true);
    setTaskError(null);
    const res = await fetch(`/api/episodes/${encodeURIComponent(activeEpisode.id)}/doc`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content_md: episodeScriptDraft }),
    });
    if (!res.ok) {
      setEpisodeSaving(false);
      setTaskError(await res.text());
      return;
    }
    setEpisodeSaving(false);
    await refreshHierarchy(scriptId);
    await refreshScriptStats(scriptId);
    setEpisodeEditMode("PREVIEW");
  };

  const createEpisodeAfterCurrent = async () => {
    if (!scriptId) return;
    const afterId = activeEpisode?.id || null;
    const res = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/episodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ after_episode_id: afterId }),
    });
    if (!res.ok) {
      setTaskError(await res.text());
      return;
    }
    await refreshHierarchy(scriptId);
  };

  const deleteCurrentEpisode = async () => {
    if (!activeEpisode) return;
    const res = await fetch(`/api/episodes/${encodeURIComponent(activeEpisode.id)}`, { method: "DELETE" });
    if (!res.ok) {
      setTaskError(await res.text());
      return;
    }
    await refreshHierarchy(scriptId);
  };

  const autoSplitEpisodes = async () => {
    if (!scriptId) return;
    if (!window.confirm("将根据“第X集/EPISODE X”自动拆分剧本，并覆盖现有剧集与故事板结果，确认继续？")) return;
    setTaskError(null);
    setTasksRunning((prev) => (prev.some((t) => t.id === "structure") ? prev : [...prev, { id: "structure", label: "自动化分集" }]));
    try {
      const res = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/structure?force=1`, { method: "POST" });
      if (!res.ok) {
        setTaskError(await res.text());
        return;
      }
      await refreshHierarchy(scriptId);
      await refreshScriptStats(scriptId);
    } finally {
      setTasksRunning((prev) => prev.filter((t) => t.id !== "structure"));
    }
  };

  const runStoryboardTask = async (agent: AgentRow) => {
    if (!activeEpisode) return;
    setPickerMode(null);
    setTaskError(null);
    const created = await createTask({
      type: "episode_storyboard_agent_apply",
      entity_type: "episode",
      entity_id: activeEpisode.id,
      input_json: { episode_id: activeEpisode.id, agent_id: agent.id },
    });
    setTasksRunning([{ id: created.id, label: "故事板拆解" }]);
  };

  useEffect(() => {
    if (tasksRunning.length === 0) return;
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        const statuses = await Promise.all(tasksRunning.map(async (x) => ({ meta: x, state: await fetchTask(x.id) })));
        const failed = statuses.find((s) => s.state.status === "failed" || s.state.status === "canceled");
        if (failed) {
          setTasksRunning([]);
          setTaskError(`${failed.meta.label}失败：${failed.state.error || "任务失败"}`);
          await refreshHierarchy(scriptId);
          return;
        }
        const allDone = statuses.every((s) => s.state.status === "succeeded");
        if (allDone) {
          setTasksRunning([]);
          await refreshHierarchy(scriptId);
          await refreshScriptStats(scriptId);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tasksRunning.map((t) => t.id).join(",")]);

  const startAssetExtraction = async () => {
    if (!activeEpisode) return;
    setTaskError(null);
    const sceneAgent = assetAgents.scene;
    const characterAgent = assetAgents.character;
    const propAgent = assetAgents.prop;
    const vfxAgent = assetAgents.vfx;
    if (!sceneAgent || !characterAgent || !propAgent || !vfxAgent) {
      setTaskError("请先分别选择场景/角色/道具/特效的 Agent");
      return;
    }
    setAssetDialogOpen(false);

    const plan = [
      { label: "场景提取", type: "episode_scene_agent_apply", agent_id: sceneAgent.id },
      { label: "角色提取", type: "episode_character_agent_apply", agent_id: characterAgent.id },
      { label: "道具提取", type: "episode_prop_agent_apply", agent_id: propAgent.id },
      { label: "特效提取", type: "episode_vfx_agent_apply", agent_id: vfxAgent.id },
    ];

    const created: Array<{ id: string; label: string }> = [];
    for (const p of plan) {
      const t = await createTask({
        type: p.type,
        entity_type: "episode",
        entity_id: activeEpisode.id,
        input_json: { episode_id: activeEpisode.id, agent_id: p.agent_id },
      });
      created.push({ id: t.id, label: p.label });
    }
    setTasksRunning(created);
  };

  const openNode = async (node: VfsNode) => {
    setViewerOpen(true);
    setViewerNode(node);
    setViewerTitle(node.name);
    setViewerContent("");
    setViewerLoading(true);
    try {
      const content = await vfsDownloadText(node.id);
      setViewerContent(stripMarkdownMetadata(content));
    } finally {
      setViewerLoading(false);
    }
  };

  const refreshStoryboardNodes = async () => {
    if (!activeEpisode?.storyboard_root_node_id) return;
    setStoryboardLoading(true);
    try {
      const nodes = await vfsListNodes({ parent_id: activeEpisode.storyboard_root_node_id, project_id: scriptId || null });
      setStoryboardNodes(nodes.filter((n) => !n.is_folder).sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setStoryboardLoading(false);
    }
  };

  const createStoryboardDoc = async () => {
    if (!activeEpisode?.storyboard_root_node_id) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await vfsCreateFile({
      name: `new_${stamp}.md`,
      content: "# 新建故事板\n\n",
      parent_id: activeEpisode.storyboard_root_node_id,
      project_id: scriptId || null,
    });
    await refreshStoryboardNodes();
  };

  const deleteStoryboardDoc = async (node: VfsNode) => {
    await vfsDeleteNode(node.id);
    await refreshStoryboardNodes();
  };

  const refreshAssetRoot = async () => {
    if (!scriptId) return;
    setAssetLoading(true);
    try {
      const [allNodes, entities] = await Promise.all([
        vfsListNodes({ parent_id: null, project_id: scriptId }),
        listScriptAssets(scriptId)
      ]);
      
      setAssetEntities(entities);

      const assetsRoot = allNodes.find((n) => n.name === "资产" && n.is_folder);
      if (assetsRoot) {
        const nodes = await vfsListNodes({ parent_id: assetsRoot.id, project_id: scriptId });
        setAssetRootNodes(nodes.sort((a, b) => a.name.localeCompare(b.name)));
        setProjectAssetsRootId(assetsRoot.id);
      } else {
        setAssetRootNodes([]);
        setProjectAssetsRootId(null);
      }
    } finally {
      setAssetLoading(false);
    }
  };

  const [projectAssetsRootId, setProjectAssetsRootId] = useState<string | null>(null);

  const toggleAssetFolder = async (folder: VfsNode) => {
    if (!folder.is_folder) return;
    const open = !assetExpanded[folder.id];
    setAssetExpanded((prev) => ({ ...prev, [folder.id]: open }));
    if (open && !assetChildren[folder.id]) {
      const nodes = await vfsListNodes({ parent_id: folder.id, project_id: scriptId || null });
      setAssetChildren((prev) => ({ ...prev, [folder.id]: nodes.sort((a, b) => a.name.localeCompare(b.name)) }));
    }
  };

  const groupAssetsByName = (nodes: VfsNode[]): { name: string; mdNode?: VfsNode; jsonNode?: VfsNode }[] => {
    const groups: Map<string, { mdNode?: VfsNode; jsonNode?: VfsNode }> = new Map();
    for (const node of nodes) {
      const baseName = node.name.replace(/\.(md|json)$/i, "");
      if (!groups.has(baseName)) {
        groups.set(baseName, {});
      }
      const group = groups.get(baseName)!;
      if (node.name.endsWith(".md")) {
        group.mdNode = node;
      } else if (node.name.endsWith(".json")) {
        group.jsonNode = node;
      }
    }
    return Array.from(groups.entries())
      .map(([name, nodes]) => ({ name, ...nodes }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const openNewFolderDialog = () => {
    setNewFolderName("");
    setNewFolderDialogOpen(true);
  };

  const createAssetFolder = async () => {
    const name = newFolderName.trim();
    if (!projectAssetsRootId || !name) return;
    setNewFolderSubmitting(true);
    try {
      await vfsCreateFolder({ name, parent_id: projectAssetsRootId, project_id: scriptId || null });
      await refreshAssetRoot();
      setNewFolderDialogOpen(false);
      setNewFolderName("");
    } finally {
      setNewFolderSubmitting(false);
    }
  };

  const createAssetDocInFolder = async (folderId: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await vfsCreateFile({ name: `new_${stamp}.md`, content: "# 未分类/新资产\n\n", parent_id: folderId, project_id: scriptId || null });
    const nodes = await vfsListNodes({ parent_id: folderId, project_id: scriptId || null });
    setAssetChildren((prev) => ({ ...prev, [folderId]: nodes.sort((a, b) => a.name.localeCompare(b.name)) }));
  };

  const deleteAssetNode = async (node: VfsNode) => {
    await vfsDeleteNode(node.id, { recursive: node.is_folder });
    await refreshAssetRoot();
    if (node.parent_id) {
      const nodes = await vfsListNodes({ parent_id: node.parent_id, project_id: scriptId || null });
      setAssetChildren((prev) => ({ ...prev, [node.parent_id as string]: nodes.sort((a, b) => a.name.localeCompare(b.name)) }));
    }
  };

  const [storyboardExpanded, setStoryboardExpanded] = useState(true);

  if (!isWriteMode) {
    return (
      <div className="h-[calc(100vh-8rem)] rounded-2xl overflow-hidden border border-border shadow-2xl bg-background flex flex-col">
        <div className="h-14 px-6 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
          <div className="font-bold text-sm">剧本清单</div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
            type="button"
          >
            刷新
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {scriptsLoading ? (
            <div className="text-sm text-textMuted flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> 加载剧本...
            </div>
          ) : scriptsError ? (
            <div className="text-sm text-red-400 whitespace-pre-wrap">{scriptsError}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <button
                onClick={() => setCreateScriptOpen(true)}
                className="rounded-2xl border border-dashed border-border bg-surface p-5 text-left hover:bg-surfaceHighlight/30 transition-colors flex items-center justify-center min-h-[132px]"
                type="button"
              >
                <div className="text-center">
                  <div className="mx-auto w-10 h-10 rounded-xl border border-border bg-surfaceHighlight/40 flex items-center justify-center text-textMuted">
                    <Plus size={18} />
                  </div>
                  <div className="mt-3 font-bold text-sm text-textMain">添加剧本</div>
                  <div className="mt-1 text-xs text-textMuted">上传文件 / 粘贴文本</div>
                </div>
              </button>
              {scripts.map((s) => (
                <div
                  key={s.id}
                  onClick={() => openScript(s.id)}
                  className="rounded-2xl border border-border bg-surface p-5 text-left hover:bg-surfaceHighlight/30 transition-colors cursor-pointer relative"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openScript(s.id);
                  }}
                >
                  <button
                    type="button"
                    className="absolute top-3 right-3 p-2 rounded-lg border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-red-400 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteScriptDialog(s);
                    }}
                    aria-label="删除剧本"
                  >
                    <Trash2 size={14} />
                  </button>
                  {(s.panorama_size_bytes || 0) > 0 && (
                    <div className="mb-4 rounded-xl border border-border bg-background overflow-hidden">
                      <img
                        src={`/api/scripts/${encodeURIComponent(s.id)}/panorama/thumbnail`}
                        alt={s.title || "剧本参考图"}
                        className="w-full h-28 object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-base text-textMain truncate">{s.title || "未命名剧本"}</div>
                      <div className="mt-1 text-xs text-textMuted leading-relaxed max-h-10 overflow-hidden">{s.description || "暂无描述"}</div>
                    </div>
                    <div className="shrink-0 text-[10px] font-mono text-textMuted/70">
                      {s.created_at ? String(s.created_at).slice(0, 10) : ""}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-[11px] text-textMuted font-mono truncate">{s.original_filename || ""}</div>
                    <div className="text-xs font-bold text-primary">进入</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {deleteScriptOpen && deleteScriptTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDeleteScriptDialog();
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
              <div className="h-12 px-4 border-b border-border flex items-center justify-between">
                <div className="font-bold text-sm">删除剧本</div>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
                  onClick={closeDeleteScriptDialog}
                  disabled={deleteScriptSubmitting}
                >
                  关闭
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="text-sm text-textMain">
                  确认删除剧本「{deleteScriptTarget.title || "未命名剧本"}」？
                </div>
                <div className="text-xs text-textMuted">该操作不可撤销。</div>
                {deleteScriptError && <div className="text-xs text-red-400 whitespace-pre-wrap">{deleteScriptError}</div>}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                    onClick={closeDeleteScriptDialog}
                    disabled={deleteScriptSubmitting}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2"
                    onClick={() => void confirmDeleteScript()}
                    disabled={deleteScriptSubmitting}
                  >
                    {deleteScriptSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} 确认删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {createScriptOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !createScriptSubmitting) {
                setCreateScriptOpen(false);
                resetCreateScript();
              }
            }}
          >
            <div className="w-full max-w-lg rounded-xl bg-surface border border-border shadow-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-textMain">添加剧本</div>
                  <div className="text-xs text-textMuted mt-1">上传文件或直接粘贴文本创建新剧本。</div>
                </div>
                <button
                  type="button"
                  className="text-textMuted hover:text-textMain"
                  onClick={() => {
                    if (createScriptSubmitting) return;
                    setCreateScriptOpen(false);
                    resetCreateScript();
                  }}
                  disabled={createScriptSubmitting}
                >
                  <X size={18} />
                </button>
              </div>

              {createScriptError && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm whitespace-pre-wrap">{createScriptError}</div>
              )}

              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMain">标题</label>
                  <input
                    value={createScriptTitle}
                    onChange={(e) => setCreateScriptTitle(e.target.value)}
                    className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                    placeholder="例如：第一季总剧本"
                    disabled={createScriptSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMain">描述（可选）</label>
                  <input
                    value={createScriptDescription}
                    onChange={(e) => setCreateScriptDescription(e.target.value)}
                    className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                    placeholder="例如：改编自 XX，v1"
                    disabled={createScriptSubmitting}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-textMain">画面比例（可选）</label>
                    <select
                      value={createScriptAspectRatio}
                      onChange={(e) => setCreateScriptAspectRatio(e.target.value)}
                      className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                      disabled={createScriptSubmitting}
                    >
                      <option value="">不指定</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                      <option value="4:3">4:3</option>
                      <option value="3:4">3:4</option>
                      <option value="1:1">1:1</option>
                      <option value="21:9">21:9</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-textMain">动画风格（可选）</label>
                    <input
                      value={createScriptAnimationStyle}
                      onChange={(e) => setCreateScriptAnimationStyle(e.target.value)}
                      list="animation-style-suggestions"
                      className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                      placeholder="例如：2D动画 / 新海诚 / 自定义"
                      disabled={createScriptSubmitting}
                    />
                    <datalist id="animation-style-suggestions">
                      <option value="2D动画" />
                      <option value="3D玄幻" />
                      <option value="真人电影" />
                      <option value="新海诚" />
                      <option value="宫崎骏" />
                      <option value="赛博朋克" />
                      <option value="水墨风" />
                      <option value="像素风" />
                    </datalist>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-surfaceHighlight/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-textMain">文件上传（可选）</div>
                    <label className="text-xs font-medium text-textMain cursor-pointer">
                      <input
                        type="file"
                        accept=".txt,.md,.doc,.docx"
                        className="hidden"
                        disabled={createScriptSubmitting}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (file) {
                            const ext = (file.name.split(".").pop() || "").toLowerCase();
                            const allowed = new Set(["txt", "md", "doc", "docx"]);
                            if (!allowed.has(ext)) {
                              setCreateScriptFile(null);
                              setCreateScriptError("仅支持上传 txt / md / doc / docx 文件");
                              return;
                            }
                          }
                          setCreateScriptFile(file);
                          if (file && !createScriptTitle.trim()) {
                            const name = file.name.replace(/\.[^.]+$/, "");
                            setCreateScriptTitle(name);
                          }
                        }}
                      />
                      <span className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-xs font-medium transition-all inline-block">
                        选择文件
                      </span>
                    </label>
                  </div>
                  {createScriptFile ? (
                    <div className="text-xs text-textMuted font-mono truncate">{createScriptFile.name}</div>
                  ) : (
                    <div className="text-xs text-textMuted">未选择文件</div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-surfaceHighlight/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-textMain">全景参考风格图（可选）</div>
                    <label className="text-xs font-medium text-textMain cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={createScriptSubmitting}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setCreateScriptPanoramaImage(file);
                        }}
                      />
                      <span className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-xs font-medium transition-all inline-block">
                        上传图片
                      </span>
                    </label>
                  </div>
                  {createScriptPanoramaImage ? (
                    <div className="space-y-3">
                      <div className="text-xs text-textMuted font-mono truncate">{createScriptPanoramaImage.name}</div>
                      {createScriptPanoramaPreviewUrl && (
                        <img
                          src={createScriptPanoramaPreviewUrl}
                          alt="panorama preview"
                          className="w-full max-h-40 rounded-lg border border-border object-cover bg-background"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-textMuted">未上传</div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMain">文本内容（可选，未上传文件时使用）</label>
                  <textarea
                    value={createScriptText}
                    onChange={(e) => setCreateScriptText(e.target.value)}
                    className="w-full min-h-32 bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                    placeholder="粘贴剧本文本..."
                    disabled={createScriptSubmitting || !!createScriptFile}
                  />
                  {createScriptFile && <div className="text-xs text-textMuted">已选择文件时，将忽略文本内容。</div>}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                  onClick={() => {
                    if (createScriptSubmitting) return;
                    setCreateScriptOpen(false);
                    resetCreateScript();
                  }}
                  disabled={createScriptSubmitting}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                  onClick={() => void submitCreateScript()}
                  disabled={createScriptSubmitting}
                >
                  {createScriptSubmitting ? "创建中..." : "创建并进入"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] rounded-2xl overflow-hidden border border-border shadow-2xl bg-background flex flex-col">
      <div className="h-14 px-6 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{activeScript?.title || "剧本创作"}</div>
          <div className="text-[11px] text-textMuted truncate">
            {(activeScript?.aspect_ratio || "") && <span>{activeScript?.aspect_ratio}</span>}
            {(activeScript?.aspect_ratio || "") && (activeScript?.animation_style || "") && <span className="mx-2">·</span>}
            {(activeScript?.animation_style || "") && <span>{activeScript?.animation_style}</span>}
          </div>
        </div>
        <button
          onClick={() => {
            const sp = new URLSearchParams(searchParams.toString());
            sp.delete("mode");
            sp.delete("seriesId");
            router.push(`/scripts?${sp.toString()}`);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
          type="button"
        >
          返回清单
        </button>
      </div>

      <div
        className={`flex-1 ${writePane === "ai" ? "p-3 lg:p-4 overflow-hidden min-h-0 flex flex-col" : "p-4 lg:p-8 overflow-y-auto"}`}
      >
        <div className={writePane === "ai" ? "flex-1 min-h-0 flex flex-col gap-3" : "w-full space-y-6"}>
          {writePane !== "ai" && (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="p-5 flex flex-col lg:flex-row gap-5">
              {(activeScript?.panorama_size_bytes || 0) > 0 ? (
                <div className="w-full lg:w-80 shrink-0 rounded-xl border border-border bg-background overflow-hidden">
                  <img
                    src={`/api/scripts/${encodeURIComponent(activeScript?.id || "")}/panorama/thumbnail`}
                    alt={activeScript?.title || "参考图"}
                    className="w-full h-44 object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="w-full lg:w-80 shrink-0 rounded-xl border border-dashed border-border bg-background/40 flex items-center justify-center h-44">
                  <div className="text-xs text-textMuted">暂无参考图</div>
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-textMain truncate">{activeScript?.title || "未选择剧本"}</div>
                    <div className="mt-1 text-xs text-textMuted leading-relaxed max-h-12 overflow-hidden">{activeScript?.description || "暂无描述"}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {scriptsLoading ? (
                      <div className="text-xs text-textMuted flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> 加载剧本...
                      </div>
                    ) : scriptsError ? (
                      <div className="text-xs text-red-400 whitespace-pre-wrap">{scriptsError}</div>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border bg-background/30 p-3">
                    <div className="text-[11px] text-textMuted">字数</div>
                    <div className="mt-1 text-lg font-bold text-textMain">
                      {scriptStatsLoading ? "…" : scriptStats?.word_count?.toLocaleString?.() || "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/30 p-3">
                    <div className="text-[11px] text-textMuted">创建时间</div>
                    <div className="mt-1 text-sm font-bold text-textMain">{activeScript?.created_at ? String(activeScript.created_at).slice(0, 10) : "—"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/30 p-3">
                    <div className="text-[11px] text-textMuted">画面比例</div>
                    <div className="mt-1 text-sm font-bold text-textMain">{activeScript?.aspect_ratio || "—"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/30 p-3">
                    <div className="text-[11px] text-textMuted">动画风格</div>
                    <div className="mt-1 text-sm font-bold text-textMain truncate">{activeScript?.animation_style || "—"}</div>
                  </div>
                </div>
                {scriptStatsError && <div className="text-xs text-red-400 whitespace-pre-wrap">{scriptStatsError}</div>}
              </div>
            </div>
            </div>
          )}

          {writePane === "ai" && (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setWritePaneAndSync("dashboard")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    概览
                  </button>
                  <button
                    type="button"
                    onClick={() => setWritePaneAndSync("episodes")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    剧集
                  </button>
                  <button
                    type="button"
                    onClick={() => setWritePaneAndSync("assets")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    资产
                  </button>
                  <button
                    type="button"
                    onClick={() => setWritePaneAndSync("editor")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    编辑器
                  </button>
                  <div className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/15 text-primary border border-primary/25">
                    AI 助手
                  </div>
                </div>
              </div>
            </div>
          )}

          {writePane === "dashboard" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: "scene_count", label: "场景数", value: scriptStats?.scene_count, icon: Clapperboard, color: "bg-blue-500", pane: "assets" as const },
                  { key: "character_count", label: "角色数", value: scriptStats?.character_count, icon: Users, color: "bg-green-500", pane: "assets" as const },
                  { key: "prop_count", label: "道具数", value: scriptStats?.prop_count, icon: Package, color: "bg-orange-500", pane: "assets" as const },
                  { key: "vfx_count", label: "特效数", value: scriptStats?.vfx_count, icon: Wand2, color: "bg-purple-500", pane: "assets" as const },
                  { key: "episodes_count", label: "剧集数", value: scriptStats?.episodes_count, icon: Film, color: "bg-cyan-500", pane: "episodes" as const },
                  { key: "image_count", label: "图片数", value: scriptStats?.image_count, icon: ImageIcon, color: "bg-pink-500", pane: "assets" as const },
                  { key: "video_count", label: "视频数", value: scriptStats?.video_count, icon: VideoIcon, color: "bg-red-500", pane: "assets" as const },
                  { key: "audio_count", label: "音频数", value: undefined, icon: Music, color: "bg-yellow-500", pane: "assets" as const },
                ].map((x) => (
                  <StatCard
                    key={x.key}
                    label={x.label}
                    value={scriptStatsLoading ? "…" : scriptStatsError || !scriptStats ? "—" : typeof x.value === "number" ? x.value.toLocaleString() : "—"}
                    icon={x.icon}
                    color={x.color}
                    variant="compact"
                    onClick={() => setWritePaneAndSync(x.pane)}
                  />
                ))}
              </div>

              {/* 导演清单已隐藏
              <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between gap-3">
                  <div className="font-bold text-sm">导演清单</div>
                  <button
                    onClick={() => setWritePaneAndSync("assets")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                    type="button"
                    disabled={!scriptId}
                  >
                    打开资产面板
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-textMain">1) 结构化分集</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${episodes.length > 0 ? "text-green-400" : "text-textMuted"}`}>
                        {episodes.length > 0 ? "已完成" : "未完成"}
                      </span>
                      <button
                        onClick={() => void autoSplitEpisodes()}
                        disabled={!scriptId || tasksRunning.length > 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors disabled:opacity-50"
                        type="button"
                      >
                        自动化分集
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-textMain">2) 选择当前剧集</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${activeEpisode ? "text-green-400" : "text-textMuted"}`}>
                        {activeEpisode ? activeEpisode.episode_code : "未选择"}
                      </span>
                      <button
                        onClick={() => setWritePaneAndSync("episodes")}
                        disabled={!scriptId}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
                        type="button"
                      >
                        去选择
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-textMain">3) 故事板拆解</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${activeEpisode?.storyboard_root_node_id ? "text-green-400" : "text-textMuted"}`}>
                        {activeEpisode?.storyboard_root_node_id ? "已完成" : "未完成"}
                      </span>
                      <button
                        onClick={() => setWritePaneAndSync("assets")}
                        disabled={!activeEpisode}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
                        type="button"
                      >
                        去拆解
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-textMain">4) 资产提取与审片</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${projectAssetsRootId ? "text-green-400" : "text-textMuted"}`}>
                        {projectAssetsRootId ? "已完成" : "未完成"}
                      </span>
                      <button
                        onClick={() => {
                          setWritePaneAndSync("assets");
                          if (activeEpisode) setAssetDialogOpen(true);
                        }}
                        disabled={!activeEpisode || tasksRunning.length > 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors disabled:opacity-50"
                        type="button"
                      >
                        提取资产
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-textMain">5) 生成一致性图片素材</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${(scriptStats?.image_count || 0) > 0 ? "text-green-400" : "text-textMuted"}`}>
                        {(scriptStats?.image_count || 0) > 0 ? `已生成 ${scriptStats?.image_count}` : "未生成"}
                      </span>
                      <button
                        onClick={() => setWritePaneAndSync("assets")}
                        disabled={!activeEpisode}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
                        type="button"
                      >
                        去生成
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              */}
            </>
          )}

          {writePane !== "ai" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => setWritePaneAndSync("episodes")}
              className={`rounded-2xl border border-border bg-surface p-5 text-left hover:bg-surfaceHighlight/30 transition-colors ${writePane === "episodes" ? "ring-1 ring-primary/50" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-border bg-surfaceHighlight/40 flex items-center justify-center text-textMuted">
                  <Settings size={18} />
                </div>
                <div>
                  <div className="font-bold text-base text-textMain">剧集管理</div>
                  <div className="text-xs text-textMuted mt-1">新增/删除剧集，选择当前剧集</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setWritePaneAndSync("assets")}
              className={`rounded-2xl border border-border bg-surface p-5 text-left hover:bg-surfaceHighlight/30 transition-colors ${writePane === "assets" ? "ring-1 ring-primary/50" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-border bg-surfaceHighlight/40 flex items-center justify-center text-textMuted">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="font-bold text-base text-textMain">资产管理</div>
                  <div className="text-xs text-textMuted mt-1">故事板拆解与资产结果管理</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setWritePaneAndSync("editor")}
              className={`rounded-2xl border border-border bg-surface p-5 text-left hover:bg-surfaceHighlight/30 transition-colors ${writePane === "editor" ? "ring-1 ring-primary/50" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-border bg-surfaceHighlight/40 flex items-center justify-center text-textMuted">
                  <Edit3 size={18} />
                </div>
                <div>
                  <div className="font-bold text-base text-textMain">剧本编辑</div>
                  <div className="text-xs text-textMuted mt-1">Markdown 编辑器（按剧集）</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setWritePaneAndSync("ai")}
              className="rounded-2xl border border-border bg-surface p-5 text-left hover:bg-surfaceHighlight/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-border bg-surfaceHighlight/40 flex items-center justify-center text-textMuted">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="font-bold text-base text-textMain">AI 助手</div>
                  <div className="text-xs text-textMuted mt-1">对话式引导与可控落库</div>
                </div>
              </div>
            </button>
          </div>
          )}

          {(tasksRunning.length > 0 || taskError) && (
            <div className="rounded-xl border border-border bg-surface p-4">
              {tasksRunning.length > 0 && (
                <div className="text-sm text-textMuted flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> 正在执行：{tasksRunning.map((t) => t.label).join("、")}
                </div>
              )}
              {taskError && <div className="mt-2 text-xs text-red-400 whitespace-pre-wrap">{taskError}</div>}
            </div>
          )}

          {writePane === "ai" && (
            <ScriptAIAssistantSessionPane
              projectId={scriptId}
              episodes={episodes.map((ep) => ({
                id: ep.id,
                episode_number: ep.episode_number,
                title: ep.title || "",
              }))}
              initialSceneCode="asset_extract"
            />
          )}

          {writePane === "episodes" && (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between gap-3">
                <div className="font-bold text-sm">剧集管理</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void autoSplitEpisodes()}
                    disabled={!scriptId || tasksRunning.length > 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-2"
                    type="button"
                  >
                    <Sparkles size={14} /> 自动化分集
                  </button>
                  <button
                    onClick={() => void createEpisodeAfterCurrent()}
                    disabled={!scriptId}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-2"
                    type="button"
                  >
                    <Plus size={14} /> 新增剧集
                  </button>
                  <button
                    onClick={() => void deleteCurrentEpisode()}
                    disabled={!activeEpisode}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-red-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                    type="button"
                  >
                    <Trash2 size={14} /> 删除当前
                  </button>
                </div>
              </div>
              <div className="p-4">
                {episodesLoading ? (
                  <div className="text-sm text-textMuted flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> 加载剧集...
                  </div>
                ) : episodesError ? (
                  <div className="text-sm text-red-400 whitespace-pre-wrap">{episodesError}</div>
                ) : episodes.length === 0 ? (
                  <div className="text-sm text-textMuted">暂无剧集</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {episodes.map((ep) => (
                      <button
                        key={ep.id}
                        type="button"
                        onClick={() => setActiveEpisodeId(ep.id)}
                        className={`rounded-xl border border-border bg-background/30 p-4 text-left hover:bg-surfaceHighlight/30 transition-colors ${ep.id === activeEpisodeId ? "ring-1 ring-primary/50" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-textMain truncate">
                              EP{String(ep.episode_number).padStart(3, "0")} {ep.title || ""}
                            </div>
                            <div className="mt-1 text-[11px] text-textMuted font-mono truncate">{ep.episode_code}</div>
                          </div>
                          <div className="text-xs font-bold text-primary">选择</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {writePane === "assets" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between gap-3">
                  <div className="font-bold text-sm truncate">剧集选择</div>
                  <div className="relative">
                    <button
                      onClick={() => setEpisodeMenuOpen((v) => !v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                      type="button"
                    >
                      选择剧集
                    </button>
                    {episodeMenuOpen && (
                      <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-surface shadow-2xl p-2 z-10">
                        <div className="flex items-center justify-between px-2 py-1">
                          <div className="text-xs font-bold text-textMain">已选 {selectedEpisodeIds.length} 个</div>
                          <button
                            type="button"
                            className="text-[11px] text-primary"
                            onClick={() => {
                              if (selectedEpisodeIds.length === episodes.length + 1) {
                                setSelectedEpisodeIds([]);
                              } else {
                                setSelectedEpisodeIds([...episodes.map((e) => e.id), UNASSIGNED_ID]);
                              }
                            }}
                          >
                            全选/清空
                          </button>
                        </div>
                        <div className="max-h-64 overflow-auto space-y-1">
                          <label className="flex items-center gap-2 px-2 py-1 text-xs">
                            <input
                              type="checkbox"
                              checked={selectedEpisodeIds.includes(UNASSIGNED_ID)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedEpisodeIds((prev) => {
                                  const set = new Set(prev);
                                  if (checked) set.add(UNASSIGNED_ID);
                                  else set.delete(UNASSIGNED_ID);
                                  return Array.from(set);
                                });
                              }}
                            />
                            <span>未分集</span>
                          </label>
                          {episodes.map((ep) => (
                            <label key={ep.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                              <input
                                type="checkbox"
                                checked={selectedEpisodeIds.includes(ep.id)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSelectedEpisodeIds((prev) => {
                                    const set = new Set(prev);
                                    if (checked) set.add(ep.id);
                                    else set.delete(ep.id);
                                    return Array.from(set);
                                  });
                                }}
                              />
                              <span className="truncate">EP{String(ep.episode_number).padStart(3, "0")} {ep.title || ""}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  {!activeEpisode ? (
                    <div className="text-sm text-textMuted">请先在“剧集管理”选择一个剧集。</div>
                  ) : (
                    <div className="space-y-6">
                      <div className="rounded-xl border border-border bg-background/20 overflow-hidden">
                        <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/20 flex items-center justify-between">
                          <button
                            onClick={() => setStoryboardExpanded(!storyboardExpanded)}
                            className="font-bold text-sm flex items-center gap-2 hover:text-primary transition-colors"
                            type="button"
                          >
                            {storyboardExpanded ? "▼" : "▶"} 故事板结果
                          </button>
                        </div>
                        {storyboardExpanded && (
                        <div className="p-4">
                          {!activeEpisode.storyboard_root_node_id ? (
                            <div className="text-sm text-textMuted">暂无故事板结果</div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-textMuted font-mono truncate">root: {activeEpisode.storyboard_root_node_id}</div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => void refreshStoryboardNodes()}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                                    type="button"
                                    disabled={storyboardLoading}
                                  >
                                    刷新
                                  </button>
                                  <button
                                    onClick={() => void createStoryboardDoc()}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors"
                                    type="button"
                                    disabled={storyboardLoading}
                                  >
                                    新建
                                  </button>
                                </div>
                              </div>

                              {storyboardLoading ? (
                                <div className="text-xs text-textMuted flex items-center gap-2">
                                  <Loader2 size={14} className="animate-spin" /> 加载中...
                                </div>
                              ) : storyboardNodes.length === 0 ? (
                                <div className="text-sm text-textMuted">暂无文档</div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {storyboardNodes.map((n) => (
                                  <MarkdownCard
                                    key={n.id}
                                    node={n}
                                    onClick={() => void openNode(n)}
                                    onDelete={() => void deleteStoryboardDoc(n)}
                                  />
                                ))}
                              </div>
                              )}
                            </div>
                          )}
                        </div>
                        )}
                      </div>

                      {unassignedAssets.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setUnassignedExpanded(!unassignedExpanded)}
                            className="w-full px-4 py-3 border-b border-border bg-surfaceHighlight/20 flex items-center justify-between hover:bg-surfaceHighlight/30 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {unassignedExpanded ? <ChevronDown size={16} className="text-textMuted" /> : <ChevronRight size={16} className="text-textMuted" />}
                              <span className="font-bold text-sm text-textMain">未指定剧集的资产</span>
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-xs text-amber-500 font-mono">
                                {unassignedAssets.length}
                              </span>
                            </div>
                            <span className="text-xs text-textMuted">这些资产尚未绑定到任何剧集</span>
                          </button>
                          {unassignedExpanded && (
                            <div className="p-4">
                              {bindingsLoading ? (
                                <div className="text-xs text-textMuted flex items-center gap-2">
                                  <Loader2 size={14} className="animate-spin" /> 加载绑定信息...
                                </div>
                              ) : (
                                <div className="space-y-8">
                                  {Object.entries(
                                    unassignedAssets.reduce((acc, entity) => {
                                      const type = entity.type || "其他";
                                      if (!acc[type]) acc[type] = [];
                                      acc[type].push(entity);
                                      return acc;
                                    }, {} as Record<string, AssetEntity[]>)
                                  )
                                  .sort((a, b) => {
                                    const ia = ASSET_TYPE_ORDER.indexOf(a[0]);
                                    const ib = ASSET_TYPE_ORDER.indexOf(b[0]);
                                    if (ia !== -1 && ib !== -1) return ia - ib;
                                    if (ia !== -1) return -1;
                                    if (ib !== -1) return 1;
                                    return a[0].localeCompare(b[0]);
                                  })
                                  .map(([type, entities]) => (
                                    <div key={type} className="space-y-4">
                                      <div className="flex items-center gap-3 px-1">
                                        <div className="h-5 w-1.5 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                                        <h3 className="font-bold text-base text-textMain capitalize tracking-wide">{ASSET_TYPE_LABELS[type] || type}</h3>
                                        <span className="px-2 py-0.5 rounded-full bg-surfaceHighlight text-xs font-mono text-textMuted">{entities.length}</span>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                        {entities.map((entity) => (
                                          <AssetEntityCard
                                            key={entity.id}
                                            asset={entity}
                                            onClick={() => {
                                              setAssetPreviewTarget(entity);
                                              setAssetPreviewOpen(true);
                                            }}
                                            onOpenDoc={() => {
                                              setAssetPreviewTarget(entity);
                                              setAssetPreviewOpen(true);
                                            }}
                                            onDelete={() => void handleDeleteAssetEntity(entity)}
                                            onGenerate={() => entity.doc_node_id && router.push(buildAssetCreateHref(entity.doc_node_id, scriptId, entity.id))}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="rounded-xl border border-border bg-background/20 overflow-hidden">
                        <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/20 font-bold text-sm">资产结果</div>
                        <div className="p-4">
                          {!projectAssetsRootId ? (
                            <div className="text-sm text-textMuted">暂无资产结果</div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-textMuted font-mono truncate">项目资产目录</div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setManualAssetCreateOpen(true)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors"
                                    type="button"
                                  >
                                    新建资产
                                  </button>
                                  <button
                                    onClick={() => void refreshAssetRoot()}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                                    type="button"
                                    disabled={assetLoading}
                                  >
                                    刷新
                                  </button>
                                </div>
                              </div>

                              {assetLoading ? (
                                <div className="text-xs text-textMuted flex items-center gap-2">
                                  <Loader2 size={14} className="animate-spin" /> 加载中...
                                </div>
                              ) : assetEntities.length === 0 ? (
                                <div className="text-sm text-textMuted py-8 text-center">暂无资产数据，请通过 AI 提取或手动新建。</div>
                              ) : (
                                <div className="space-y-8">
                                  {Object.entries(
                                    assetEntities.reduce((acc, entity) => {
                                      const type = entity.type || "其他";
                                      if (!acc[type]) acc[type] = [];
                                      acc[type].push(entity);
                                      return acc;
                                    }, {} as Record<string, AssetEntity[]>)
                                  )
                                  .sort((a, b) => {
                                    const ia = ASSET_TYPE_ORDER.indexOf(a[0]);
                                    const ib = ASSET_TYPE_ORDER.indexOf(b[0]);
                                    if (ia !== -1 && ib !== -1) return ia - ib;
                                    if (ia !== -1) return -1;
                                    if (ib !== -1) return 1;
                                    return a[0].localeCompare(b[0]);
                                  })
                                  .map(([type, entities]) => (
                                    <div key={type} className="space-y-4">
                                      <div className="flex items-center gap-3 px-1">
                                        <div className="h-5 w-1.5 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
                                        <h3 className="font-bold text-base text-textMain capitalize tracking-wide">{ASSET_TYPE_LABELS[type] || type}</h3>
                                        <span className="px-2 py-0.5 rounded-full bg-surfaceHighlight text-xs font-mono text-textMuted">{entities.length}</span>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                        {entities.map((entity) => (
                                          <AssetEntityCard
                                            key={entity.id}
                                            asset={entity}
                                            onClick={() => {
                                              setAssetPreviewTarget(entity);
                                              setAssetPreviewOpen(true);
                                            }}
                                            onOpenDoc={() => {
                                              setAssetPreviewTarget(entity);
                                              setAssetPreviewOpen(true);
                                            }}
                                            onDelete={() => void handleDeleteAssetEntity(entity)}
                                            onGenerate={() => entity.doc_node_id && router.push(buildAssetCreateHref(entity.doc_node_id, scriptId, entity.id))}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {writePane === "editor" && (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-surfaceHighlight/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-sm">剧本编辑</div>
                  <div className="flex items-center gap-2 text-[11px] text-textMuted flex-wrap">
                    <div className="px-2 py-0.5 rounded-full border border-border bg-background/30">
                      上下文：角色 {contextPreview?.counts?.character ?? 0} · 道具 {contextPreview?.counts?.prop ?? 0} · 地点 {contextPreview?.counts?.location ?? 0} · 特效 {contextPreview?.counts?.vfx ?? 0}
                    </div>
                    <button
                      type="button"
                      onClick={() => setContextPreviewRefreshKey((x) => x + 1)}
                      className="px-2 py-0.5 rounded-full border border-border bg-background/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
                      disabled={contextPreviewLoading || !scriptId}
                      title={contextPreviewError || ""}
                    >
                      {contextPreviewLoading ? "刷新中..." : "刷新上下文"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center rounded-lg border border-border overflow-hidden bg-surface/60">
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${editorScope === "FULL" ? "bg-surfaceHighlight text-textMain" : "text-textMuted hover:text-textMain"}`}
                      onClick={() => setEditorScope("FULL")}
                    >
                      全文
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${editorScope === "EPISODE" ? "bg-surfaceHighlight text-textMain" : "text-textMuted hover:text-textMain"}`}
                      onClick={() => setEditorScope("EPISODE")}
                    >
                      按剧集
                    </button>
                  </div>

                  {editorScope === "EPISODE" && (
                    <>
                      <select
                        value={activeEpisodeId || ""}
                        onChange={(e) => setActiveEpisodeId(e.target.value || null)}
                        className="bg-background border border-border rounded-lg px-3 py-2 text-xs"
                        disabled={episodesLoading || episodes.length === 0}
                      >
                        <option value="">选择剧集</option>
                        {episodes.map((ep) => (
                          <option key={ep.id} value={ep.id}>
                            EP{String(ep.episode_number).padStart(3, "0")} {ep.title || ""}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEpisodeEditMode((m) => (m === "EDIT" ? "PREVIEW" : "EDIT"))}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors flex items-center gap-2"
                        type="button"
                        disabled={!activeEpisode}
                      >
                        {episodeEditMode === "EDIT" ? <Eye size={14} /> : <Edit3 size={14} />} 编辑/预览
                      </button>
                      <button
                        onClick={saveEpisodeScript}
                        disabled={episodeSaving || episodeEditMode !== "EDIT" || !activeEpisode}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                        type="button"
                      >
                        {episodeSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="p-4">
                {episodesLoading ? (
                  <div className="text-sm text-textMuted flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> 加载剧集...
                  </div>
                ) : editorScope === "FULL" ? (
                  fullScriptText || fullScriptFallback ? (
                    <textarea
                      value={fullScriptText || fullScriptFallback}
                      readOnly
                      className="w-full min-h-[420px] bg-transparent text-textMain font-mono text-sm leading-relaxed outline-none resize-y placeholder-textMuted"
                      placeholder="暂无内容"
                      spellCheck={false}
                    />
                  ) : (
                    <div className="text-sm text-textMuted flex items-center gap-2">
                      {fullScriptFallbackLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                      暂无可展示的剧本文本。
                    </div>
                  )
                ) : !activeEpisode ? (
                  <div className="text-sm text-textMuted">请选择一个剧集开始编辑。</div>
                ) : episodeEditMode === "EDIT" ? (
                  <textarea
                    value={episodeScriptDraft}
                    onChange={(e) => setEpisodeScriptDraft(e.target.value)}
                    className="w-full min-h-[420px] bg-transparent text-textMain font-mono text-sm leading-relaxed outline-none resize-y placeholder-textMuted"
                    placeholder="# 输入剧集内容..."
                    spellCheck={false}
                  />
                ) : (
                  <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{episodeScriptDraft}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AssetDocumentViewer
        open={viewerOpen}
        title={viewerTitle}
        content={viewerContent}
        loading={viewerLoading}
        generateHref={viewerNode && scriptId ? buildAssetCreateHref(viewerNode.id, scriptId) : null}
        onClose={() => setViewerOpen(false)}
      />

      {assetPreviewTarget && (
        <AssetPreviewOverlay
          open={assetPreviewOpen}
          asset={assetPreviewTarget}
          onClose={() => setAssetPreviewOpen(false)}
        />
      )}

      {assetDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
            <div className="h-12 px-4 border-b border-border flex items-center justify-between">
              <div className="font-bold text-sm">选择资产提取 Agent</div>
              <button
                onClick={() => setAssetDialogOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                type="button"
              >
                关闭
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-textMuted">场景提取</div>
                  <button
                    type="button"
                    onClick={() => setPickerMode("scene")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    选择
                  </button>
                </div>
                <div className="text-sm text-textMain truncate">{assetAgents.scene?.name || "未选择"}</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-textMuted">角色提取</div>
                  <button
                    type="button"
                    onClick={() => setPickerMode("character")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    选择
                  </button>
                </div>
                <div className="text-sm text-textMain truncate">{assetAgents.character?.name || "未选择"}</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-textMuted">道具提取</div>
                  <button
                    type="button"
                    onClick={() => setPickerMode("prop")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    选择
                  </button>
                </div>
                <div className="text-sm text-textMain truncate">{assetAgents.prop?.name || "未选择"}</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-textMuted">特效提取</div>
                  <button
                    type="button"
                    onClick={() => setPickerMode("vfx")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surfaceHighlight/30 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                  >
                    选择
                  </button>
                </div>
                <div className="text-sm text-textMain truncate">{assetAgents.vfx?.name || "未选择"}</div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssetDialogOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void startAssetExtraction()}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  开始提取
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AgentPickerDialog
        open={pickerMode === "storyboard"}
        title="选择用于故事板拆解的 Agent"
        purpose="storyboard_extraction"
        onClose={() => setPickerMode(null)}
        onPick={(a) => void runStoryboardTask(a as AgentRow)}
      />
      <AgentPickerDialog
        open={pickerMode === "scene"}
        title="选择用于场景提取的 Agent"
        purpose="scene_extraction"
        onClose={() => setPickerMode(null)}
        onPick={(a) => {
          setAssetAgents((prev) => ({ ...prev, scene: a as AgentRow }));
          setPickerMode(null);
        }}
      />
      <AgentPickerDialog
        open={pickerMode === "character"}
        title="选择用于角色提取的 Agent"
        purpose="character_extraction"
        onClose={() => setPickerMode(null)}
        onPick={(a) => {
          setAssetAgents((prev) => ({ ...prev, character: a as AgentRow }));
          setPickerMode(null);
        }}
      />
      <AgentPickerDialog
        open={pickerMode === "prop"}
        title="选择用于道具提取的 Agent"
        purpose="prop_extraction"
        onClose={() => setPickerMode(null)}
        onPick={(a) => {
          setAssetAgents((prev) => ({ ...prev, prop: a as AgentRow }));
          setPickerMode(null);
        }}
      />
      <AgentPickerDialog
        open={pickerMode === "vfx"}
        title="选择用于特效提取的 Agent"
        purpose="vfx_extraction"
        onClose={() => setPickerMode(null)}
        onPick={(a) => {
          setAssetAgents((prev) => ({ ...prev, vfx: a as AgentRow }));
          setPickerMode(null);
        }}
      />

      {newFolderDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
            <div className="h-12 px-4 border-b border-border flex items-center justify-between">
              <div className="font-bold text-sm">新建文件夹</div>
              <button
                onClick={() => setNewFolderDialogOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-textMuted">文件夹名称</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="输入文件夹名称..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-textMain placeholder:text-textMuted/50 focus:outline-none focus:border-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolderName.trim()) {
                      e.preventDefault();
                      void createAssetFolder();
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewFolderDialogOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void createAssetFolder()}
                  disabled={!newFolderName.trim() || newFolderSubmitting}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {newFolderSubmitting ? "创建中..." : "创建"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AssetCreateDialog
        open={manualAssetCreateOpen}
        onClose={() => setManualAssetCreateOpen(false)}
        onSubmit={handleCreateAssetSubmit}
      />
    </div>
  );
}
