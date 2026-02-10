"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Box,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Eye,
  FileJson,
  FilePlus,
  FileStack,
  FileText,
  FolderInput,
  Image as ImageIcon,
  Layout,
  Link,
  Loader2,
  Mic,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Settings,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Upload,
  User,
  Workflow,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAiTaskDraft } from "@/components/tasks/useAiTaskDraft";
import { TASK_ENTITY_TYPES, TASK_TYPES } from "@/lib/tasks/constants";

interface Keyframe {
  id: string;
  imageUrl: string;
  status: "GENERATING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

interface AssetReference {
  id: string;
  type: "CHARACTER" | "SCENE" | "PROP" | "VFX";
  name: string;
  category?: string;
  thumbnail?: string;
  tags?: string[];
}

interface Shot {
  id: string;
  number: number;
  visual: string;
  dialogue: string;
  camera: string;
  duration: string;
  keyframes: Keyframe[];
  selectedKeyframeId?: string;
  assets?: AssetReference[];
}

interface Scene {
  id: string;
  number: number;
  title: string;
  location: string;
  time: string;
  content: string;
  shots: Shot[];
  status: "DRAFT" | "BREAKDOWN" | "DONE";
  assets: { type: "CHARACTER" | "PROP"; name: string; thumbnail?: string }[];
}

interface Episode {
  id: string;
  number: number;
  title: string;
  logline: string;
  scriptFullText?: string;
  scenes: Scene[];
  assets?: AssetReference[];
}

interface ScriptSeries {
  id: string;
  title: string;
  logline?: string;
  status: "Draft" | "Finalized" | "In Production";
  updatedAt: string;
  author: string;
  rawContent: string;
  episodes: Episode[];
  originalFilename?: string;
}

interface AIModelOption {
  provider: string;
  model: string;
}

interface AIPromptPreset {
  id: string;
  tool_key: string;
  name: string;
  provider?: string | null;
  model?: string | null;
  prompt_template: string;
  is_default: boolean;
}

type ApiAssetVariantRead = {
  id: string;
  asset_entity_id: string;
  variant_code: string;
  stage_tag?: string | null;
  age_range?: string | null;
  attributes?: Record<string, unknown>;
  prompt_template?: string | null;
  is_default: boolean;
};

type ApiAssetRead = {
  id: string;
  project_id?: string | null;
  asset_id: string;
  name: string;
  type: string;
  category?: string | null;
  lifecycle_status: string;
  tags: string[];
  variants: ApiAssetVariantRead[];
};

type ApiAssetBindingBrief = {
  id: string;
  asset_entity_id: string;
  asset_variant_id?: string | null;
  name: string;
  type: string;
  category?: string | null;
  variant_code?: string | null;
  stage_tag?: string | null;
  age_range?: string | null;
};

interface AISceneDraft {
  scene_number?: number | null;
  title?: string | null;
  content?: string | null;
  location?: string | null;
  time_of_day?: string | null;
  location_type?: "内" | "外" | "内外" | null;
}

interface AIShotDraft {
  shot_type?: string | null;
  camera_angle?: string | null;
  camera_move?: string | null;
  filter_style?: string | null;
  narrative_function?: string | null;
  pov_character?: string | null;
  description?: string | null;
  dialogue?: string | null;
  dialogue_speaker?: string | null;
  sound_effect?: string | null;
  active_assets?: string[] | null;
  duration_estimate?: number | null;
}

interface AIWorldUnityDraft {
  production_title?: string | null;
  era_setting?: string | null;
  unified_emblem?: string | null;
  base_costume?: string | null;
  color_system?: string | null;
  material_style?: string | null;
  lighting_style?: string | null;
  art_style?: string | null;
  notes?: string | null;
}

interface AIAssetVariantDraft {
  variant_code?: string | null;
  stage_tag?: string | null;
  attributes?: Record<string, unknown> | null;
  prompt_en?: string | null;
}

interface AIAssetDraft {
  type: "character" | "scene" | "prop" | "vfx";
  name: string;
  category_path?: string[] | null;
  tags?: string[] | null;
  importance?: "main" | "support" | "minor" | null;
  concept?: string | null;
  visual_details?: Record<string, unknown> | null;
  prompt_en?: string | null;
  variants?: AIAssetVariantDraft[] | null;
  children?: AIAssetDraft[] | null;
}

const useMockApi = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false" && process.env.USE_MOCK_API !== "false";

const RAW_SCRIPT_CONTENT = `## EPISODE 1: 陨落的天才

### SCENE 1
**EXT. 斩仙台 - DAY**

天空阴沉，雷声隐隐。宏大的斩仙台悬浮于云海之上，四周锁链横空。
萧炎（20岁）浑身是血，跪在台中央。他的眼神虽显疲惫，却依然透着一股倔强。

周围围满了各大家族的长老和弟子，指指点点，神情冷漠。
纳兰嫣然（18岁）身着云岚宗华服，居高临下地看着他。

### SCENE 2
**INT. 萧家大厅 - NIGHT**

萧家大厅灯火通明，气氛压抑。族长萧战来回踱步，脸色铁青。
长老们分坐两侧，窃窃私语。

萧战停下脚步，猛地一拍桌子。
`;

const MOCK_ASSETS_POOL: AssetReference[] = [
  { id: "a1", type: "CHARACTER", name: "萧炎", thumbnail: "https://picsum.photos/id/1005/100/100", tags: ["主角", "男性", "战损"] },
  { id: "a2", type: "CHARACTER", name: "纳兰嫣然", thumbnail: "https://picsum.photos/id/1011/100/100", tags: ["女配", "宗门", "高冷"] },
  { id: "a3", type: "PROP", name: "玄重尺", thumbnail: "https://picsum.photos/id/1016/100/100", tags: ["武器", "重剑"] },
  { id: "a4", type: "SCENE", name: "云岚宗广场", thumbnail: "https://picsum.photos/id/1015/100/100", tags: ["场景", "室外", "恢弘"] },
  { id: "a5", type: "PROP", name: "纳戒", thumbnail: "https://picsum.photos/id/1020/100/100", tags: ["饰品", "戒指"] },
  { id: "a6", type: "CHARACTER", name: "药老", thumbnail: "https://picsum.photos/id/1025/100/100", tags: ["灵魂体", "老者"] },
  { id: "a7", type: "SCENE", name: "斩仙台", thumbnail: "https://picsum.photos/id/1024/100/100", tags: ["场景", "悬崖"] },
];

const MOCK_SERIES: ScriptSeries[] = [
  {
    id: "1",
    title: "斩仙台-真人AI版",
    logline: "东方玄幻巨制，讲述凡人修仙逆天改命的故事。",
    status: "In Production",
    updatedAt: "2024-05-20 14:30",
    author: "李策划",
    rawContent: RAW_SCRIPT_CONTENT,
    episodes: [
      {
        id: "ep1",
        number: 1,
        title: "陨落的天才",
        logline: "昔日天才萧炎在斩仙台受尽屈辱，立誓复仇。",
        scenes: [
          {
            id: "sc1",
            number: 1,
            title: "EXT. 斩仙台 - DAY",
            location: "斩仙台",
            time: "DAY",
            status: "BREAKDOWN",
            content: "天空阴沉，雷声隐隐。宏大的斩仙台悬浮于云海之上...",
            assets: [{ type: "CHARACTER", name: "萧炎" }, { type: "CHARACTER", name: "纳兰嫣然" }],
            shots: [
              {
                id: "sh1",
                number: 1,
                visual: "特写：萧炎满是血污的脸，眼神坚毅。",
                dialogue: "（喘息）",
                camera: "Close Up",
                duration: "3s",
                keyframes: [],
                assets: [{ id: "a1", type: "CHARACTER", name: "萧炎", thumbnail: "https://picsum.photos/id/1005/100/100" }],
              },
              {
                id: "sh2",
                number: 2,
                visual: "全景：云雾缭绕的斩仙台，萧炎跪在中央。",
                dialogue: "萧炎：三十年河东！",
                camera: "Wide Shot",
                duration: "5s",
                keyframes: [],
                assets: [
                  { id: "a1", type: "CHARACTER", name: "萧炎", thumbnail: "https://picsum.photos/id/1005/100/100" },
                  { id: "a4", type: "SCENE", name: "云岚宗广场", thumbnail: "https://picsum.photos/id/1015/100/100" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "2",
    title: "新项目-待拆解示例",
    logline: "一个全新的创意项目。",
    status: "Draft",
    updatedAt: "2024-06-01 09:00",
    author: "王编剧",
    rawContent: RAW_SCRIPT_CONTENT,
    episodes: [],
  },
];

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "list";
  const seriesId = searchParams.get("seriesId");
  const episodeIdFromQuery = searchParams.get("episodeId");
  const sceneIdFromQuery = searchParams.get("sceneId");
  const toolFromQuery = searchParams.get("tool");
  const taskIdFromQuery = searchParams.get("taskId");

  const setQuery = (next: Record<string, string | null | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    });
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const [seriesList, setSeriesList] = useState<ScriptSeries[]>(useMockApi ? MOCK_SERIES : []);
  const [activeSeries, setActiveSeries] = useState<ScriptSeries | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const [workbenchMode, setWorkbenchMode] = useState<"EDITOR" | "DIRECTOR">("EDITOR");
  const [editorMode, setEditorMode] = useState<"WRITE" | "PREVIEW">("WRITE");
  const [scriptContent, setScriptContent] = useState("");
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  const [seriesModal, setSeriesModal] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    data?: Partial<ScriptSeries>;
  }>({ isOpen: false, mode: "create" });
  const [episodeModal, setEpisodeModal] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    data?: Partial<Episode>;
  }>({ isOpen: false, mode: "create" });
  const [sceneModal, setSceneModal] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    episodeId?: string;
    data?: Partial<Scene>;
  }>({ isOpen: false, mode: "create" });

  const [assetBindModal, setAssetBindModal] = useState<{ isOpen: boolean; shotId: string | null }>({
    isOpen: false,
    shotId: null,
  });
  const [tempSelectedAssetIds, setTempSelectedAssetIds] = useState<Set<string>>(new Set());
  const [assetSearchQuery, setAssetSearchQuery] = useState("");

  const [seriesFormData, setSeriesFormData] = useState({ title: "", logline: "", author: "Current User" });
  const [episodeFormData, setEpisodeFormData] = useState({ title: "", logline: "", number: 1 });
  const [sceneFormData, setSceneFormData] = useState({ intExt: "EXT.", location: "", time: "DAY", content: "" });
  const [uploadedScriptFile, setUploadedScriptFile] = useState<File | null>(null);
  const [aiToolOpen, setAiToolOpen] = useState(false);
  const [aiModels, setAiModels] = useState<AIModelOption[]>([]);
  const [aiProvider, setAiProvider] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiPromptTemplate, setAiPromptTemplate] = useState("请根据剧集剧本正文生成结构化分场信息。");
  const [aiPresets, setAiPresets] = useState<AIPromptPreset[]>([]);
  const [aiPresetId, setAiPresetId] = useState<string>("");
  const [aiPresetName, setAiPresetName] = useState("");
  const [aiPresetIsDefault, setAiPresetIsDefault] = useState(false);
  const [aiPromptInjected, setAiPromptInjected] = useState("");
  const [aiApplyMode, setAiApplyMode] = useState<"replace" | "append">("replace");
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [aiIsApplying, setAiIsApplying] = useState(false);
  const [episodeActionsOpen, setEpisodeActionsOpen] = useState(false);
  const [sceneActionsOpen, setSceneActionsOpen] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  const [sceneAssetBindings, setSceneAssetBindings] = useState<ApiAssetBindingBrief[]>([]);
  const [shotAssetBindingsMap, setShotAssetBindingsMap] = useState<Record<string, ApiAssetBindingBrief[]>>({});

  const [assetEditorOpen, setAssetEditorOpen] = useState(false);
  const [assetEditorAssetId, setAssetEditorAssetId] = useState<string | null>(null);
  const [assetEditorData, setAssetEditorData] = useState<ApiAssetRead | null>(null);
  const [assetEditorSelectedVariantId, setAssetEditorSelectedVariantId] = useState<string | null>(null);
  const [assetEditorIsLoading, setAssetEditorIsLoading] = useState(false);
  const [assetEditorIsSaving, setAssetEditorIsSaving] = useState(false);

  const [assetToolOpen, setAssetToolOpen] = useState(false);
  const [assetModels, setAssetModels] = useState<AIModelOption[]>([]);
  const [assetProvider, setAssetProvider] = useState("");
  const [assetModel, setAssetModel] = useState("");
  const [assetPromptTemplate, setAssetPromptTemplate] = useState(
    "请基于剧集剧本正文进行资产提取并补全：先抽取世界观统一要素，再抽取角色/场景/道具/特效；输出可落库的 JSON。",
  );
  const [assetPresets, setAssetPresets] = useState<AIPromptPreset[]>([]);
  const [assetPresetId, setAssetPresetId] = useState<string>("");
  const [assetPresetName, setAssetPresetName] = useState("");
  const [assetPresetIsDefault, setAssetPresetIsDefault] = useState(false);
  const [assetPromptInjected, setAssetPromptInjected] = useState("");
  const [assetApplyMode, setAssetApplyMode] = useState<"replace" | "append">("append");
  const [assetIsLoading, setAssetIsLoading] = useState(false);
  const [assetIsApplying, setAssetIsApplying] = useState(false);

  const [sbToolOpen, setSbToolOpen] = useState(false);
  const [sbModels, setSbModels] = useState<AIModelOption[]>([]);
  const [sbProvider, setSbProvider] = useState("");
  const [sbModel, setSbModel] = useState("");
  const [sbPromptTemplate, setSbPromptTemplate] = useState("请将分场剧本拆解为分镜列表，输出镜头信息。");
  const [sbPresets, setSbPresets] = useState<AIPromptPreset[]>([]);
  const [sbPresetId, setSbPresetId] = useState<string>("");
  const [sbPresetName, setSbPresetName] = useState("");
  const [sbPresetIsDefault, setSbPresetIsDefault] = useState(false);
  const [sbPromptInjected, setSbPromptInjected] = useState("");
  const [sbApplyMode, setSbApplyMode] = useState<"replace" | "append">("replace");
  const [sbIsLoading, setSbIsLoading] = useState(false);
  const [sbIsApplying, setSbIsApplying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultImportInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (useMockApi) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/scripts?page=1&size=100", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data?: { items?: Array<{ id: string; title: string; description?: string | null; created_at: string; original_filename: string }> };
      };
      const items = json.data?.items || [];
      if (cancelled) return;
      setSeriesList(
        items.map((s) => ({
          id: s.id,
          title: s.title,
          logline: s.description ?? "",
          status: "Draft",
          updatedAt: new Date(s.created_at).toLocaleString(),
          author: "Current User",
          rawContent: "",
          episodes: [],
          originalFilename: s.original_filename,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!seriesId) {
      setActiveSeries(null);
      setActiveEpisodeId(null);
      setActiveSceneId(null);
      return;
    }
    const target = seriesList.find((s) => s.id === seriesId);
    if (target) {
      setActiveSeries(target);
      setScriptContent(target.rawContent);
      if (target.episodes.length > 0) {
        setActiveEpisodeId((prev) => prev ?? target.episodes[0].id);
        const firstScene = target.episodes[0].scenes[0];
        if (firstScene) setActiveSceneId((prev) => prev ?? firstScene.id);
      }
    }
  }, [seriesId, seriesList]);

  const mapApiEpisodes = (
    apiEpisodes: Array<{
      id: string;
      episode_number: number;
      title?: string | null;
      script_full_text?: string | null;
      scenes?: Array<{ id: string; scene_number: number; title?: string | null; content?: string | null; location?: string | null; time_of_day?: string | null }>;
      assets?: Array<{ id: string; asset_id: string; name: string; type: string; category?: string | null }>;
    }>,
  ): Episode[] => {
    return apiEpisodes.map((ep) => {
      const assets: AssetReference[] = (ep.assets || []).map((a) => ({
        id: a.id,
        type: a.type === "character" ? "CHARACTER" : a.type === "scene" ? "SCENE" : a.type === "vfx" ? "VFX" : "PROP",
        name: a.name,
        category: a.category || undefined,
      }));
      const scenes: Scene[] = (ep.scenes || []).map((sc) => ({
        id: sc.id,
        number: sc.scene_number,
        title: sc.title || `SCENE ${sc.scene_number}`,
        location: sc.location || "",
        time: sc.time_of_day || "",
        content: sc.content || "",
        shots: [],
        status: "BREAKDOWN",
        assets: [],
      }));
      return {
        id: ep.id,
        number: ep.episode_number,
        title: ep.title || `EP${String(ep.episode_number).padStart(2, "0")}`,
        logline: "",
        scriptFullText: ep.script_full_text || "",
        scenes,
        assets,
      };
    });
  };

  const refreshHierarchy = async (scriptIdValue: string) => {
    const res = await fetch(`/api/scripts/${encodeURIComponent(scriptIdValue)}/hierarchy`, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as {
      data?: {
        episodes?: Array<{
          id: string;
          episode_number: number;
          title?: string | null;
          script_full_text?: string | null;
          scenes?: Array<{
            id: string;
            scene_number: number;
            title?: string | null;
            content?: string | null;
            location?: string | null;
            time_of_day?: string | null;
          }>;
          assets?: Array<{ id: string; asset_id: string; name: string; type: string; category?: string | null }>;
        }>;
      };
    };
    const apiEpisodes = json.data?.episodes || [];
    const mappedEpisodes = mapApiEpisodes(apiEpisodes);
    if (!activeSeries) return;
    updateActiveSeries({ ...activeSeries, episodes: mappedEpisodes });
    if (!activeEpisodeId && mappedEpisodes[0]) setActiveEpisodeId(mappedEpisodes[0].id);
  };

  useEffect(() => {
    if (useMockApi) return;
    if (mode !== "studio") return;
    if (!activeSeries) return;
    if (activeSeries.episodes.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshHierarchy(activeSeries.id);
      } catch {
        return;
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, activeSeries?.id]);

  useEffect(() => {
    if (useMockApi) return;
    if (!seriesId) return;
    let cancelled = false;
    (async () => {
      const [scriptRes, hierarchyRes] = await Promise.all([
        fetch(`/api/scripts/${encodeURIComponent(seriesId)}/download`, { cache: "no-store" }),
        fetch(`/api/scripts/${encodeURIComponent(seriesId)}/hierarchy`, { cache: "no-store" }),
      ]);

      const scriptText = scriptRes.ok ? await scriptRes.text() : "";
      const hierarchyJson = hierarchyRes.ok ? await hierarchyRes.json() : null;
      const apiEpisodes = (hierarchyJson?.data?.episodes || []) as Array<{
        id: string;
        episode_number: number;
        title?: string | null;
        script_full_text?: string | null;
        scenes?: Array<{ id: string; scene_number: number; title?: string | null; content?: string | null; location?: string | null; time_of_day?: string | null }>;
        assets?: Array<{ id: string; asset_id: string; name: string; type: string }>;
      }>;
      const mappedEpisodes = mapApiEpisodes(apiEpisodes);

      if (cancelled) return;
      setSeriesList((prev) =>
        prev.map((s) => (s.id === seriesId ? { ...s, rawContent: scriptText, episodes: mappedEpisodes } : s)),
      );
      setScriptContent(scriptText);
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  const activeEpisode = useMemo(
    () => activeSeries?.episodes.find((e) => e.id === activeEpisodeId),
    [activeSeries, activeEpisodeId],
  );
  const activeScene = useMemo(
    () => activeEpisode?.scenes.find((s) => s.id === activeSceneId),
    [activeEpisode, activeSceneId],
  );
  const episodeAssetPool = useMemo(() => activeEpisode?.assets || [], [activeEpisode?.assets]);

  useEffect(() => {
    if (!activeSeries) return;
    if (!episodeIdFromQuery) return;
    const found = activeSeries.episodes.some((e) => e.id === episodeIdFromQuery);
    if (found) setActiveEpisodeId(episodeIdFromQuery);
  }, [activeSeries, episodeIdFromQuery]);

  useEffect(() => {
    if (!activeEpisode) return;
    if (!sceneIdFromQuery) return;
    const found = activeEpisode.scenes.some((s) => s.id === sceneIdFromQuery);
    if (found) setActiveSceneId(sceneIdFromQuery);
  }, [activeEpisode, sceneIdFromQuery]);

  useEffect(() => {
    if (!toolFromQuery) return;
    if (toolFromQuery === "scene-structure") {
      if (activeEpisode && !aiToolOpen) setAiToolOpen(true);
    }
    if (toolFromQuery === "asset-extraction") {
      if (activeEpisode && !assetToolOpen) setAssetToolOpen(true);
    }
    if (toolFromQuery === "storyboard") {
      if (activeScene && !sbToolOpen) setSbToolOpen(true);
    }
  }, [toolFromQuery, activeEpisode, activeScene, aiToolOpen, assetToolOpen, sbToolOpen]);

  const episodeSceneStructureTask = useAiTaskDraft<{ final_prompt: string; raw_text: string; scenes: AISceneDraft[] }>({
    toolKey: "episode_scene_structure",
    taskType: TASK_TYPES.episodeSceneStructurePreview,
    entityType: TASK_ENTITY_TYPES.episode,
    entityId: activeEpisode?.id ?? null,
    preferredTaskId: toolFromQuery === "scene-structure" ? taskIdFromQuery : null,
    buildInputJson: () => ({
      script_id: activeSeries?.id || null,
      episode_id: activeEpisode?.id || "",
      model: aiModel,
      prompt_template: aiPromptTemplate,
      temperature: null,
      max_tokens: null,
    }),
    mapResultToDraft: (r) => ({
      final_prompt: typeof r.final_prompt === "string" ? r.final_prompt : "",
      raw_text: typeof r.raw_text === "string" ? r.raw_text : "",
      scenes: Array.isArray(r.scenes) ? (r.scenes as AISceneDraft[]) : [],
    }),
  });
  const aiLocked = episodeSceneStructureTask.locked;
  const aiTaskProgress = episodeSceneStructureTask.progress;
  const aiFinalPrompt = episodeSceneStructureTask.draft?.final_prompt || "";
  const aiRawText = episodeSceneStructureTask.draft?.raw_text || "";
  const aiScenes = episodeSceneStructureTask.draft?.scenes || [];

  const episodeAssetExtractionTask = useAiTaskDraft<{ final_prompt: string; raw_text: string; world_unity: AIWorldUnityDraft | null; assets: AIAssetDraft[] }>({
    toolKey: "episode_asset_extraction",
    taskType: TASK_TYPES.episodeAssetExtractionPreview,
    entityType: TASK_ENTITY_TYPES.episode,
    entityId: activeEpisode?.id ?? null,
    preferredTaskId: toolFromQuery === "asset-extraction" ? taskIdFromQuery : null,
    buildInputJson: () => ({
      script_id: activeSeries?.id || null,
      episode_id: activeEpisode?.id || "",
      model: assetModel,
      prompt_template: assetPromptTemplate,
      temperature: null,
      max_tokens: null,
    }),
    mapResultToDraft: (r) => ({
      final_prompt: typeof r.final_prompt === "string" ? r.final_prompt : "",
      raw_text: typeof r.raw_text === "string" ? r.raw_text : "",
      world_unity: (r.world_unity as AIWorldUnityDraft | null) || null,
      assets: Array.isArray(r.assets) ? (r.assets as AIAssetDraft[]) : [],
    }),
  });
  const assetLocked = episodeAssetExtractionTask.locked;
  const assetTaskProgress = episodeAssetExtractionTask.progress;
  const assetFinalPrompt = episodeAssetExtractionTask.draft?.final_prompt || "";
  const assetRawText = episodeAssetExtractionTask.draft?.raw_text || "";
  const assetWorldUnity = episodeAssetExtractionTask.draft?.world_unity || null;
  const assetDraftAssets = episodeAssetExtractionTask.draft?.assets || [];

  const sceneStoryboardTask = useAiTaskDraft<{ final_prompt: string; raw_text: string; shots: AIShotDraft[] }>({
    toolKey: "scene_storyboard",
    taskType: TASK_TYPES.sceneStoryboardPreview,
    entityType: TASK_ENTITY_TYPES.scene,
    entityId: activeScene?.id ?? null,
    preferredTaskId: toolFromQuery === "storyboard" ? taskIdFromQuery : null,
    buildInputJson: () => ({
      script_id: activeSeries?.id || null,
      episode_id: activeEpisode?.id || null,
      scene_id: activeScene?.id || "",
      model: sbModel,
      prompt_template: sbPromptTemplate,
      temperature: null,
      max_tokens: null,
    }),
    mapResultToDraft: (r) => ({
      final_prompt: typeof r.final_prompt === "string" ? r.final_prompt : "",
      raw_text: typeof r.raw_text === "string" ? r.raw_text : "",
      shots: Array.isArray(r.shots) ? (r.shots as AIShotDraft[]) : [],
    }),
  });
  const sbLocked = sceneStoryboardTask.locked;
  const sbTaskProgress = sceneStoryboardTask.progress;
  const sbFinalPrompt = sceneStoryboardTask.draft?.final_prompt || "";
  const sbRawText = sceneStoryboardTask.draft?.raw_text || "";
  const sbShots = sceneStoryboardTask.draft?.shots || [];
  const setSbShots = useMemo(() => {
    return (updater: AIShotDraft[] | ((prev: AIShotDraft[]) => AIShotDraft[])) => {
      sceneStoryboardTask.setDraft((prev) => {
        const base = prev || { final_prompt: "", raw_text: "", shots: [] };
        const prevShots = Array.isArray(base.shots) ? base.shots : [];
        const nextShots = typeof updater === "function" ? (updater as (p: AIShotDraft[]) => AIShotDraft[])(prevShots) : updater;
        return { ...base, shots: nextShots };
      });
    };
  }, [sceneStoryboardTask]);

  useEffect(() => {
    if (!aiToolOpen) return;
    if (useMockApi) return;
    void episodeSceneStructureTask.resume();
  }, [aiToolOpen, activeEpisode?.id]);

  useEffect(() => {
    if (!assetToolOpen) return;
    if (useMockApi) return;
    void episodeAssetExtractionTask.resume();
  }, [assetToolOpen, activeEpisode?.id]);

  useEffect(() => {
    if (!sbToolOpen) return;
    if (useMockApi) return;
    void sceneStoryboardTask.resume();
  }, [sbToolOpen, activeScene?.id]);
  const assetBindPool = useMemo(() => {
    if (!useMockApi) return episodeAssetPool;
    const episodeKeys = new Set(episodeAssetPool.map((a) => `${a.type}:${a.name}`.toLowerCase()));
    const extra = MOCK_ASSETS_POOL.filter((a) => !episodeKeys.has(`${a.type}:${a.name}`.toLowerCase()));
    return [...episodeAssetPool, ...extra];
  }, [episodeAssetPool]);
  const episodeAssetIdSet = useMemo(() => new Set(episodeAssetPool.map((a) => a.id)), [episodeAssetPool]);

  const updateActiveSeries = (updatedSeries: ScriptSeries) => {
    setSeriesList((prev) => prev.map((s) => (s.id === updatedSeries.id ? updatedSeries : s)));
    setActiveSeries(updatedSeries);
  };

  type ApiShotRead = {
    id: string;
    scene_id: string;
    shot_code: string;
    shot_number: number;
    shot_type?: string | null;
    camera_angle?: string | null;
    camera_move?: string | null;
    filter_style?: string | null;
    narrative_function?: string | null;
    pov_character?: string | null;
    description?: string | null;
    dialogue?: string | null;
    dialogue_speaker?: string | null;
    sound_effect?: string | null;
    active_assets?: string[] | null;
    duration_estimate?: number | string | null;
  };

  const mapApiShots = (apiShots: ApiShotRead[]): Shot[] => {
    return apiShots.map((s) => {
      const camera = [s.shot_type, s.camera_angle, s.camera_move].filter(Boolean).join(" / ");
      const durationNum = s.duration_estimate === null || s.duration_estimate === undefined ? null : Number(s.duration_estimate);
      const duration = Number.isFinite(durationNum) ? `${durationNum}s` : "";
      return {
        id: s.id,
        number: s.shot_number,
        visual: s.description || "",
        dialogue: s.dialogue || "",
        camera: camera || "—",
        duration: duration || "—",
        keyframes: [],
        assets: [],
      };
    });
  };

  const patchSeriesScene = (series: ScriptSeries, sceneId: string, patch: (scene: Scene) => Scene): ScriptSeries => {
    return {
      ...series,
      episodes: series.episodes.map((ep) => ({
        ...ep,
        scenes: ep.scenes.map((sc) => (sc.id === sceneId ? patch(sc) : sc)),
      })),
    };
  };

  const refreshSceneShots = async (seriesId: string, sceneId: string) => {
    const res = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/shots`, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as { data?: ApiShotRead[] };
    const shots = mapApiShots(json.data || []);
    setSeriesList((prev) =>
      prev.map((s) => (s.id === seriesId ? patchSeriesScene(s, sceneId, (sc) => ({ ...sc, shots })) : s)),
    );
    setActiveSeries((prev) => (prev && prev.id === seriesId ? patchSeriesScene(prev, sceneId, (sc) => ({ ...sc, shots })) : prev));
  };

  const refreshSceneAssetBindings = async (sceneId: string) => {
    const res = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/asset-bindings`, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as { data?: { scene_id: string; bindings: ApiAssetBindingBrief[] } };
    setSceneAssetBindings(json.data?.bindings || []);
  };

  const refreshShotAssetBindingsMap = async (seriesId: string, sceneId: string) => {
    const res = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/shot-asset-bindings`, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as { data?: { scene_id: string; shot_bindings: Record<string, ApiAssetBindingBrief[]> } };
    const map = json.data?.shot_bindings || {};
    setShotAssetBindingsMap(map);
    const patch = (sc: Scene): Scene => {
      const nextShots = sc.shots.map((s) => {
        const bindings = map[s.id] || [];
        const assets: AssetReference[] = bindings.map((b) => ({
          id: b.asset_entity_id,
          type: b.type === "character" ? "CHARACTER" : b.type === "scene" ? "SCENE" : b.type === "vfx" ? "VFX" : "PROP",
          name: b.name,
          category: b.category || undefined,
        }));
        return { ...s, assets };
      });
      return { ...sc, shots: nextShots };
    };
    setSeriesList((prev) => prev.map((s) => (s.id === seriesId ? patchSeriesScene(s, sceneId, patch) : s)));
    setActiveSeries((prev) => (prev && prev.id === seriesId ? patchSeriesScene(prev, sceneId, patch) : prev));
  };

  useEffect(() => {
    if (useMockApi) return;
    if (!activeSeries?.id) return;
    if (!activeSceneId) return;
    const seriesId = activeSeries.id;
    let cancelled = false;
    (async () => {
      try {
        await refreshSceneShots(seriesId, activeSceneId);
        await Promise.all([refreshSceneAssetBindings(activeSceneId), refreshShotAssetBindingsMap(seriesId, activeSceneId)]);
      } catch (err) {
        if (cancelled) return;
        alert(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSeries?.id, activeSceneId]);

  const aiProviders = useMemo(() => {
    const set = new Set(aiModels.map((m) => m.provider).filter(Boolean));
    return Array.from(set).sort();
  }, [aiModels]);

  const aiModelsForProvider = useMemo(() => {
    if (!aiProvider) return aiModels;
    return aiModels.filter((m) => m.provider === aiProvider);
  }, [aiModels, aiProvider]);

  const assetProviders = useMemo(() => {
    const set = new Set(assetModels.map((m) => m.provider).filter(Boolean));
    return Array.from(set).sort();
  }, [assetModels]);

  const assetModelsForProvider = useMemo(() => {
    if (!assetProvider) return assetModels;
    return assetModels.filter((m) => m.provider === assetProvider);
  }, [assetModels, assetProvider]);

  const sbProviders = useMemo(() => {
    const set = new Set(sbModels.map((m) => m.provider).filter(Boolean));
    return Array.from(set).sort();
  }, [sbModels]);

  const sbModelsForProvider = useMemo(() => {
    if (!sbProvider) return sbModels;
    return sbModels.filter((m) => m.provider === sbProvider);
  }, [sbModels, sbProvider]);

  useEffect(() => {
    if (!aiToolOpen) return;
    if (useMockApi) return;
    if (!activeEpisode) return;
    let cancelled = false;
    (async () => {
      try {
        const [modelsRes, presetsRes] = await Promise.all([
          fetch("/api/ai/models", { cache: "no-store" }),
          fetch("/api/ai/prompt-presets?tool_key=episode_scene_structure", { cache: "no-store" }),
        ]);
        if (!modelsRes.ok) throw new Error(await modelsRes.text());
        if (!presetsRes.ok) throw new Error(await presetsRes.text());

        const modelsJson = (await modelsRes.json()) as { data?: AIModelOption[] };
        const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };

        if (cancelled) return;
        const models = modelsJson.data || [];
        const presets = presetsJson.data || [];
        setAiModels(models);
        setAiPresets(presets);

        const defaultPreset = presets.find((p) => p.is_default) || presets[0];
        if (defaultPreset) {
          setAiPresetId(defaultPreset.id);
          setAiPresetName(defaultPreset.name);
          setAiPresetIsDefault(defaultPreset.is_default);
          setAiPromptTemplate(defaultPreset.prompt_template);
          if (defaultPreset.model) setAiModel(defaultPreset.model);
          if (defaultPreset.provider) setAiProvider(defaultPreset.provider);
        }

        if (!defaultPreset && models.length > 0) {
          const providers = Array.from(new Set(models.map((m) => m.provider))).filter(Boolean).sort();
          const p0 = providers[0] || models[0].provider;
          setAiProvider(p0);
          const m0 = models.find((m) => m.provider === p0)?.model || models[0].model;
          setAiModel(m0);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiToolOpen, activeEpisode?.id]);

  useEffect(() => {
    if (!aiToolOpen) return;
    if (!aiProvider && aiProviders.length > 0) setAiProvider(aiProviders[0]);
  }, [aiToolOpen, aiProviders]);

  useEffect(() => {
    if (!aiToolOpen) return;
    if (!aiModel && aiModelsForProvider.length > 0) setAiModel(aiModelsForProvider[0].model);
  }, [aiToolOpen, aiProvider, aiModelsForProvider]);

  useEffect(() => {
    if (!assetToolOpen) return;
    if (useMockApi) return;
    if (!activeEpisode) return;
    let cancelled = false;
    (async () => {
      try {
        const [modelsRes, presetsRes] = await Promise.all([
          fetch("/api/ai/models", { cache: "no-store" }),
          fetch("/api/ai/prompt-presets?tool_key=episode_asset_extraction", { cache: "no-store" }),
        ]);
        if (!modelsRes.ok) throw new Error(await modelsRes.text());
        if (!presetsRes.ok) throw new Error(await presetsRes.text());

        const modelsJson = (await modelsRes.json()) as { data?: AIModelOption[] };
        const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };

        if (cancelled) return;
        const models = modelsJson.data || [];
        const presets = presetsJson.data || [];
        setAssetModels(models);
        setAssetPresets(presets);

        const defaultPreset = presets.find((p) => p.is_default) || presets[0];
        if (defaultPreset) {
          setAssetPresetId(defaultPreset.id);
          setAssetPresetName(defaultPreset.name);
          setAssetPresetIsDefault(defaultPreset.is_default);
          setAssetPromptTemplate(defaultPreset.prompt_template);
          if (defaultPreset.model) setAssetModel(defaultPreset.model);
          if (defaultPreset.provider) setAssetProvider(defaultPreset.provider);
        }

        if (!defaultPreset && models.length > 0) {
          const providers = Array.from(new Set(models.map((m) => m.provider))).filter(Boolean).sort();
          const p0 = providers[0] || models[0].provider;
          setAssetProvider(p0);
          const m0 = models.find((m) => m.provider === p0)?.model || models[0].model;
          setAssetModel(m0);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetToolOpen, activeEpisode?.id]);

  useEffect(() => {
    if (!assetToolOpen) return;
    if (!assetProvider && assetProviders.length > 0) setAssetProvider(assetProviders[0]);
  }, [assetToolOpen, assetProviders]);

  useEffect(() => {
    if (!assetToolOpen) return;
    if (!assetModel && assetModelsForProvider.length > 0) setAssetModel(assetModelsForProvider[0].model);
  }, [assetToolOpen, assetProvider, assetModelsForProvider]);

  useEffect(() => {
    if (!sbToolOpen) return;
    if (useMockApi) return;
    if (!activeScene) return;
    let cancelled = false;
    (async () => {
      try {
        const [modelsRes, presetsRes] = await Promise.all([
          fetch("/api/ai/models", { cache: "no-store" }),
          fetch("/api/ai/prompt-presets?tool_key=scene_storyboard", { cache: "no-store" }),
        ]);
        if (!modelsRes.ok) throw new Error(await modelsRes.text());
        if (!presetsRes.ok) throw new Error(await presetsRes.text());

        const modelsJson = (await modelsRes.json()) as { data?: AIModelOption[] };
        const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };

        if (cancelled) return;
        const models = modelsJson.data || [];
        const presets = presetsJson.data || [];
        setSbModels(models);
        setSbPresets(presets);

        const defaultPreset = presets.find((p) => p.is_default) || presets[0];
        if (defaultPreset) {
          setSbPresetId(defaultPreset.id);
          setSbPresetName(defaultPreset.name);
          setSbPresetIsDefault(defaultPreset.is_default);
          setSbPromptTemplate(defaultPreset.prompt_template);
          if (defaultPreset.model) setSbModel(defaultPreset.model);
          if (defaultPreset.provider) setSbProvider(defaultPreset.provider);
        }

        if (!defaultPreset && models.length > 0) {
          const providers = Array.from(new Set(models.map((m) => m.provider))).filter(Boolean).sort();
          const p0 = providers[0] || models[0].provider;
          setSbProvider(p0);
          const m0 = models.find((m) => m.provider === p0)?.model || models[0].model;
          setSbModel(m0);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sbToolOpen, activeScene?.id]);

  useEffect(() => {
    if (!sbToolOpen) return;
    if (!sbProvider && sbProviders.length > 0) setSbProvider(sbProviders[0]);
  }, [sbToolOpen, sbProviders]);

  useEffect(() => {
    if (!sbToolOpen) return;
    if (!sbModel && sbModelsForProvider.length > 0) setSbModel(sbModelsForProvider[0].model);
  }, [sbToolOpen, sbProvider, sbModelsForProvider]);

  const openAiTool = () => {
    if (!activeEpisode) {
      alert("请选择一个剧集");
      return;
    }
    setAiToolOpen(true);
  };

  const closeAiTool = () => {
    setAiToolOpen(false);
  };

  const openAssetTool = () => {
    if (!activeEpisode) {
      alert("请选择一个剧集");
      return;
    }
    setAssetToolOpen(true);
  };

  const closeAssetTool = () => {
    setAssetToolOpen(false);
  };

  useEffect(() => {
    if (!episodeActionsOpen) return;
    const handler = () => setEpisodeActionsOpen(false);
    window.addEventListener("click", handler);
    return () => {
      window.removeEventListener("click", handler);
    };
  }, [episodeActionsOpen]);

  useEffect(() => {
    if (!sceneActionsOpen) return;
    const handler = () => setSceneActionsOpen(false);
    window.addEventListener("click", handler);
    return () => {
      window.removeEventListener("click", handler);
    };
  }, [sceneActionsOpen]);

  useEffect(() => {
    if (!selectedShotId) return;
    const el = document.getElementById(`shot-${selectedShotId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedShotId]);

  const openSbTool = (preferredMode?: "replace" | "append") => {
    if (!activeScene) {
      alert("请选择一个分场");
      return;
    }
    if (preferredMode) setSbApplyMode(preferredMode);
    else if (activeScene.shots.length > 0) setSbApplyMode("replace");
    setSbToolOpen(true);
  };

  const closeSbTool = () => {
    setSbToolOpen(false);
  };

  const handleAiPreviewPrompt = async () => {
    if (useMockApi) return;
    if (!activeEpisode) return;
    if (!aiModel) {
      alert("请选择模型");
      return;
    }
    setAiIsLoading(true);
    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(activeEpisode.id)}/ai/scene-structure/prompt-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: aiModel, provider: aiProvider || null, prompt_template: aiPromptTemplate }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: { final_prompt?: string } };
      setAiPromptInjected(json.data?.final_prompt || "");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAiIsLoading(false);
    }
  };

  const handleAssetPreviewPrompt = async () => {
    if (useMockApi) return;
    if (!activeEpisode) return;
    if (!assetModel) {
      alert("请选择模型");
      return;
    }
    setAssetIsLoading(true);
    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(activeEpisode.id)}/ai/asset-extraction/prompt-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: assetModel, provider: assetProvider || null, prompt_template: assetPromptTemplate }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: { final_prompt?: string } };
      setAssetPromptInjected(json.data?.final_prompt || "");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetIsLoading(false);
    }
  };

  const handleAssetRunPreview = async () => {
    if (useMockApi) return;
    if (!activeEpisode) return;
    if (!assetModel) {
      alert("请选择模型");
      return;
    }
    setAssetIsLoading(true);
    try {
      episodeAssetExtractionTask.clearDraft();
      await episodeAssetExtractionTask.createTask();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetIsLoading(false);
    }
  };

  const handleAssetApply = async () => {
    if (useMockApi) return;
    if (!activeSeries || !activeEpisode) return;
    if (assetDraftAssets.length === 0) {
      alert("没有可落库的资产结果");
      return;
    }
    if (assetApplyMode === "replace" && (activeEpisode.assets || []).length > 0) {
      const ok = confirm("当前剧集已有资产绑定，确认覆盖重建吗？");
      if (!ok) return;
    }
    setAssetIsApplying(true);
    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(activeEpisode.id)}/ai/asset-extraction/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: assetApplyMode, world_unity: assetWorldUnity, assets: assetDraftAssets }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshHierarchy(activeSeries.id);
      episodeAssetExtractionTask.clearDraft();
      setAssetToolOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetIsApplying(false);
    }
  };

  const handleAiRunPreview = async () => {
    if (useMockApi) return;
    if (!activeEpisode) return;
    if (!aiModel) {
      alert("请选择模型");
      return;
    }
    setAiIsLoading(true);
    try {
      episodeSceneStructureTask.clearDraft();
      await episodeSceneStructureTask.createTask();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAiIsLoading(false);
    }
  };

  const handleAiApply = async () => {
    if (useMockApi) return;
    if (!activeSeries || !activeEpisode) return;
    if (aiScenes.length === 0) {
      alert("没有可落库的分场结果");
      return;
    }
    if (aiApplyMode === "replace" && activeEpisode.scenes.length > 0) {
      const ok = confirm("当前剧集已有场景，确认覆盖重建吗？");
      if (!ok) return;
    }
    setAiIsApplying(true);
    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(activeEpisode.id)}/ai/scene-structure/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: aiApplyMode, scenes: aiScenes }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshHierarchy(activeSeries.id);
      setActiveSceneId(null);
      episodeSceneStructureTask.clearDraft();
      setAiToolOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAiIsApplying(false);
    }
  };

  const handleSbPreviewPrompt = async () => {
    if (useMockApi) return;
    if (!activeScene) return;
    if (!sbModel) {
      alert("请选择模型");
      return;
    }
    setSbIsLoading(true);
    try {
      const res = await fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/ai/storyboard/prompt-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: sbModel, provider: sbProvider || null, prompt_template: sbPromptTemplate }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: { final_prompt?: string } };
      setSbPromptInjected(json.data?.final_prompt || "");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSbIsLoading(false);
    }
  };

  const handleSbRunPreview = async () => {
    if (useMockApi) return;
    if (!activeScene) return;
    if (!sbModel) {
      alert("请选择模型");
      return;
    }
    setSbIsLoading(true);
    try {
      sceneStoryboardTask.clearDraft();
      await sceneStoryboardTask.createTask();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSbIsLoading(false);
    }
  };

  const handleSbApply = async () => {
    if (useMockApi) return;
    if (!activeScene) return;
    if (sbShots.length === 0) {
      alert("没有可落库的分镜结果");
      return;
    }
    if (sbApplyMode === "replace" && activeScene.shots.length > 0) {
      const ok = confirm("当前分场已有分镜，确认覆盖重建吗？");
      if (!ok) return;
    }
    setSbIsApplying(true);
    try {
      const res = await fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/ai/storyboard/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: sbApplyMode, shots: sbShots }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      if (activeSeries?.id) await refreshSceneShots(activeSeries.id, activeScene.id);
      sceneStoryboardTask.clearDraft();
      setSbToolOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSbIsApplying(false);
    }
  };

  const handleSbSavePreset = async () => {
    if (useMockApi) return;
    const name = sbPresetName.trim();
    if (!name) {
      alert("请输入提示词名称");
      return;
    }
    setSbIsLoading(true);
    try {
      if (sbPresetId) {
        const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(sbPresetId)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            provider: sbProvider || null,
            model: sbModel || null,
            prompt_template: sbPromptTemplate,
            is_default: sbPresetIsDefault,
          }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/ai/prompt-presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tool_key: "scene_storyboard",
            name,
            provider: sbProvider || null,
            model: sbModel || null,
            prompt_template: sbPromptTemplate,
            is_default: sbPresetIsDefault,
          }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
      }
      const presetsRes = await fetch("/api/ai/prompt-presets?tool_key=scene_storyboard", { cache: "no-store" });
      if (!presetsRes.ok) throw new Error(await presetsRes.text());
      const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };
      const presets = presetsJson.data || [];
      setSbPresets(presets);
      const current = presets.find((p) => p.name === name) || presets.find((p) => p.is_default) || presets[0];
      if (current) {
        setSbPresetId(current.id);
        setSbPresetIsDefault(current.is_default);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSbIsLoading(false);
    }
  };

  const handleSbDeletePreset = async () => {
    if (useMockApi) return;
    if (!sbPresetId) return;
    const ok = confirm("确认删除该提示词吗？");
    if (!ok) return;
    setSbIsLoading(true);
    try {
      const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(sbPresetId)}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const presetsRes = await fetch("/api/ai/prompt-presets?tool_key=scene_storyboard", { cache: "no-store" });
      if (!presetsRes.ok) throw new Error(await presetsRes.text());
      const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };
      const presets = presetsJson.data || [];
      setSbPresets(presets);
      const next = presets.find((p) => p.is_default) || presets[0];
      setSbPresetId(next?.id || "");
      setSbPresetName(next?.name || "");
      setSbPresetIsDefault(next?.is_default || false);
      setSbPromptTemplate(next?.prompt_template || "请将分场剧本拆解为分镜列表，输出镜头信息。");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSbIsLoading(false);
    }
  };

  const handleSbSelectPreset = (presetId: string) => {
    setSbPresetId(presetId);
    const p = sbPresets.find((x) => x.id === presetId);
    if (!p) return;
    setSbPresetName(p.name);
    setSbPresetIsDefault(p.is_default);
    setSbPromptTemplate(p.prompt_template);
    if (p.provider) setSbProvider(p.provider);
    if (p.model) setSbModel(p.model);
  };

  const handleAiSavePreset = async () => {
    if (useMockApi) return;
    const name = aiPresetName.trim();
    if (!name) {
      alert("请输入提示词名称");
      return;
    }
    setAiIsLoading(true);
    try {
      if (aiPresetId) {
        const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(aiPresetId)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            provider: aiProvider || null,
            model: aiModel || null,
            prompt_template: aiPromptTemplate,
            is_default: aiPresetIsDefault,
          }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/ai/prompt-presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tool_key: "episode_scene_structure",
            name,
            provider: aiProvider || null,
            model: aiModel || null,
            prompt_template: aiPromptTemplate,
            is_default: aiPresetIsDefault,
          }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
      }
      const presetsRes = await fetch("/api/ai/prompt-presets?tool_key=episode_scene_structure", { cache: "no-store" });
      if (!presetsRes.ok) throw new Error(await presetsRes.text());
      const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };
      const presets = presetsJson.data || [];
      setAiPresets(presets);
      const current = presets.find((p) => p.name === name) || presets.find((p) => p.is_default) || presets[0];
      if (current) {
        setAiPresetId(current.id);
        setAiPresetIsDefault(current.is_default);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAiIsLoading(false);
    }
  };

  const handleAiDeletePreset = async () => {
    if (useMockApi) return;
    if (!aiPresetId) return;
    const ok = confirm("确认删除该提示词吗？");
    if (!ok) return;
    setAiIsLoading(true);
    try {
      const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(aiPresetId)}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const presetsRes = await fetch("/api/ai/prompt-presets?tool_key=episode_scene_structure", { cache: "no-store" });
      if (!presetsRes.ok) throw new Error(await presetsRes.text());
      const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };
      const presets = presetsJson.data || [];
      setAiPresets(presets);
      const next = presets.find((p) => p.is_default) || presets[0];
      setAiPresetId(next?.id || "");
      setAiPresetName(next?.name || "");
      setAiPresetIsDefault(next?.is_default || false);
      setAiPromptTemplate(next?.prompt_template || "请根据剧集剧本正文生成结构化分场信息。");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAiIsLoading(false);
    }
  };

  const handleAiSelectPreset = (presetId: string) => {
    setAiPresetId(presetId);
    const p = aiPresets.find((x) => x.id === presetId);
    if (!p) return;
    setAiPresetName(p.name);
    setAiPresetIsDefault(p.is_default);
    setAiPromptTemplate(p.prompt_template);
    if (p.provider) setAiProvider(p.provider);
    if (p.model) setAiModel(p.model);
  };

  const handleAssetSavePreset = async () => {
    if (useMockApi) return;
    const name = assetPresetName.trim();
    if (!name) {
      alert("请输入提示词名称");
      return;
    }
    setAssetIsLoading(true);
    try {
      if (assetPresetId) {
        const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(assetPresetId)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            provider: assetProvider || null,
            model: assetModel || null,
            prompt_template: assetPromptTemplate,
            is_default: assetPresetIsDefault,
          }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/ai/prompt-presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tool_key: "episode_asset_extraction",
            name,
            provider: assetProvider || null,
            model: assetModel || null,
            prompt_template: assetPromptTemplate,
            is_default: assetPresetIsDefault,
          }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
      }
      const presetsRes = await fetch("/api/ai/prompt-presets?tool_key=episode_asset_extraction", { cache: "no-store" });
      if (!presetsRes.ok) throw new Error(await presetsRes.text());
      const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };
      const presets = presetsJson.data || [];
      setAssetPresets(presets);
      const current = presets.find((p) => p.name === name) || presets.find((p) => p.is_default) || presets[0];
      if (current) {
        setAssetPresetId(current.id);
        setAssetPresetIsDefault(current.is_default);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetIsLoading(false);
    }
  };

  const handleAssetDeletePreset = async () => {
    if (useMockApi) return;
    if (!assetPresetId) return;
    const ok = confirm("确认删除该提示词吗？");
    if (!ok) return;
    setAssetIsLoading(true);
    try {
      const res = await fetch(`/api/ai/prompt-presets/${encodeURIComponent(assetPresetId)}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const presetsRes = await fetch("/api/ai/prompt-presets?tool_key=episode_asset_extraction", { cache: "no-store" });
      if (!presetsRes.ok) throw new Error(await presetsRes.text());
      const presetsJson = (await presetsRes.json()) as { data?: AIPromptPreset[] };
      const presets = presetsJson.data || [];
      setAssetPresets(presets);
      const next = presets.find((p) => p.is_default) || presets[0];
      setAssetPresetId(next?.id || "");
      setAssetPresetName(next?.name || "");
      setAssetPresetIsDefault(next?.is_default || false);
      setAssetPromptTemplate(next?.prompt_template || assetPromptTemplate);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetIsLoading(false);
    }
  };

  const handleAssetSelectPreset = (presetId: string) => {
    setAssetPresetId(presetId);
    const p = assetPresets.find((x) => x.id === presetId);
    if (!p) return;
    setAssetPresetName(p.name);
    setAssetPresetIsDefault(p.is_default);
    setAssetPromptTemplate(p.prompt_template);
    if (p.provider) setAssetProvider(p.provider);
    if (p.model) setAssetModel(p.model);
  };

  const handleOpenAssetBindModal = (shot: Shot) => {
    if (useMockApi) {
      const currentAssetIds = new Set(shot.assets?.map((a) => a.id) || []);
      setTempSelectedAssetIds(currentAssetIds);
    } else {
      const current = shotAssetBindingsMap[shot.id] || [];
      setTempSelectedAssetIds(new Set(current.map((b) => b.asset_entity_id)));
    }
    setAssetSearchQuery("");
    setAssetBindModal({ isOpen: true, shotId: shot.id });
  };

  const toggleAssetSelection = (assetId: string) => {
    const newSet = new Set(tempSelectedAssetIds);
    if (newSet.has(assetId)) newSet.delete(assetId);
    else newSet.add(assetId);
    setTempSelectedAssetIds(newSet);
  };

  const handleSaveAssetBinding = async () => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId || !assetBindModal.shotId) return;

    if (!useMockApi) {
      const shotId = assetBindModal.shotId;
      const current = shotAssetBindingsMap[shotId] || [];
      const currentIds = new Set(current.map((b) => b.asset_entity_id));
      const nextIds = new Set(tempSelectedAssetIds);

      const toAdd = Array.from(nextIds).filter((id) => !currentIds.has(id));
      const toRemove = current.filter((b) => !nextIds.has(b.asset_entity_id));

      try {
        await Promise.all([
          ...toAdd.map(async (assetEntityId) => {
            const res = await fetch(`/api/shots/${encodeURIComponent(shotId)}/asset-bindings`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ asset_entity_id: assetEntityId, asset_variant_id: null }),
              cache: "no-store",
            });
            if (!res.ok) throw new Error(await res.text());
          }),
          ...toRemove.map(async (b) => {
            const res = await fetch(`/api/asset-bindings/${encodeURIComponent(b.id)}`, { method: "DELETE", cache: "no-store" });
            if (!res.ok) throw new Error(await res.text());
          }),
        ]);
        await refreshShotAssetBindingsMap(activeSeries.id, activeSceneId);
        setAssetBindModal({ isOpen: false, shotId: null });
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    const selectedAssets = assetBindPool.filter((a) => tempSelectedAssetIds.has(a.id));
    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) => {
        if (ep.id !== activeEpisodeId) return ep;
        return {
          ...ep,
          scenes: ep.scenes.map((sc) => {
            if (sc.id !== activeSceneId) return sc;
            return {
              ...sc,
              shots: sc.shots.map((s) => (s.id === assetBindModal.shotId ? { ...s, assets: selectedAssets } : s)),
            };
          }),
        };
      }),
    };
    updateActiveSeries(updatedSeries);
    setAssetBindModal({ isOpen: false, shotId: null });
  };

  const openAssetEditor = async (assetId: string) => {
    if (useMockApi) {
      router.push(`/assets?mode=list&assetId=${encodeURIComponent(assetId)}`);
      return;
    }
    setAssetEditorAssetId(assetId);
    setAssetEditorData(null);
    setAssetEditorSelectedVariantId(null);
    setAssetEditorOpen(true);
    setAssetEditorIsLoading(true);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: ApiAssetRead };
      const data = json.data || null;
      setAssetEditorData(data);
      const defaultVariant = data?.variants.find((v) => v.is_default) || data?.variants[0];
      setAssetEditorSelectedVariantId(defaultVariant?.id || null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setAssetEditorOpen(false);
    } finally {
      setAssetEditorIsLoading(false);
    }
  };

  const closeAssetEditor = () => {
    setAssetEditorOpen(false);
    setAssetEditorAssetId(null);
    setAssetEditorData(null);
    setAssetEditorSelectedVariantId(null);
  };

  const saveAssetEditor = async () => {
    if (useMockApi) return;
    if (!assetEditorAssetId || !assetEditorData) return;
    setAssetEditorIsSaving(true);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(assetEditorAssetId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: assetEditorData.name,
          category: assetEditorData.category,
          lifecycle_status: assetEditorData.lifecycle_status,
          tags: assetEditorData.tags,
        }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: ApiAssetRead };
      setAssetEditorData(json.data || null);
      if (activeSeries) await refreshHierarchy(activeSeries.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetEditorIsSaving(false);
    }
  };

  const createAssetVariant = async () => {
    if (useMockApi) return;
    if (!assetEditorAssetId) return;
    setAssetEditorIsSaving(true);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(assetEditorAssetId)}/variants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: ApiAssetRead };
      const data = json.data || null;
      setAssetEditorData(data);
      const v = data?.variants[data.variants.length - 1];
      if (v) setAssetEditorSelectedVariantId(v.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetEditorIsSaving(false);
    }
  };

  const updateAssetVariant = async (variantId: string, patch: Partial<ApiAssetVariantRead>) => {
    if (useMockApi) return;
    setAssetEditorIsSaving(true);
    try {
      const res = await fetch(`/api/asset-variants/${encodeURIComponent(variantId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: ApiAssetRead };
      setAssetEditorData(json.data || null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetEditorIsSaving(false);
    }
  };

  const deleteAssetVariant = async (variantId: string) => {
    if (useMockApi) return;
    const ok = confirm("确认删除该变体？");
    if (!ok) return;
    setAssetEditorIsSaving(true);
    try {
      const res = await fetch(`/api/asset-variants/${encodeURIComponent(variantId)}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { data?: ApiAssetRead };
      const data = json.data || null;
      setAssetEditorData(data);
      const defaultVariant = data?.variants.find((v) => v.is_default) || data?.variants[0];
      setAssetEditorSelectedVariantId(defaultVariant?.id || null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetEditorIsSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedScriptFile(file);
    if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setScriptContent(text);
      };
      reader.readAsText(file);
    } else {
      setScriptContent(`[Imported from ${file.name}]\n\n(Content extraction simulation...)\n`);
    }
  };

  const handleResultImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsBreakingDown(true);

    const files = Array.from(e.target.files);
    const jsonFiles = files.filter((f) => f.name.toLowerCase().endsWith(".json"));
    if (jsonFiles.length === 0) {
      setIsBreakingDown(false);
      alert("请选择有效的 JSON 文件进行导入。");
      if (resultImportInputRef.current) resultImportInputRef.current.value = "";
      return;
    }
    const fileNames = jsonFiles.map((f) => f.name).join(", ");

    setTimeout(() => {
      if (activeSeries) {
        const newEpisode: Episode = {
          id: `ep-imp-${Date.now()}`,
          number: activeSeries.episodes.length + 1,
          title: "导入的数据集 (JSON)",
          logline: `从文件 [${fileNames}] 自动解析生成。`,
          scenes: [
            {
              id: `sc-imp-${Date.now()}`,
              number: 1,
              title: "EXT. 导入场景 - FILE",
              location: "文件导入位置",
              time: "DAY",
              content: "系统已解析上传的拆解数据，包括分场、分镜、资产及视频生成提示词。",
              status: "DONE",
              assets: [{ type: "CHARACTER", name: "解析角色A" }, { type: "PROP", name: "解析道具B" }],
              shots: [
                {
                  id: "sh-imp-1",
                  number: 1,
                  visual: "导入的分镜画面描述...",
                  dialogue: "...",
                  camera: "Full Shot",
                  duration: "4s",
                  keyframes: [],
                  assets: [],
                },
              ],
            },
          ],
        };
        const updatedSeries = { ...activeSeries, episodes: [...activeSeries.episodes, newEpisode] };
        updateActiveSeries(updatedSeries);
        setActiveEpisodeId(newEpisode.id);
        if (newEpisode.scenes.length > 0) setActiveSceneId(newEpisode.scenes[0].id);
      }

      setIsBreakingDown(false);
      alert(`成功导入 ${jsonFiles.length} 个 JSON 文件:\n${fileNames}\n\n数据已解析并合并至新剧集。`);
      if (resultImportInputRef.current) resultImportInputRef.current.value = "";
    }, 2000);
  };

  const openSeriesModal = (series?: ScriptSeries) => {
    if (series) {
      setSeriesModal({ isOpen: true, mode: "edit", data: series });
      setSeriesFormData({ title: series.title, logline: series.logline || "", author: series.author });
    } else {
      setSeriesModal({ isOpen: true, mode: "create" });
      setSeriesFormData({ title: "", logline: "", author: "Current User" });
      setScriptContent("");
      setUploadedScriptFile(null);
    }
  };

  const handleSaveSeries = async () => {
    if (!seriesFormData.title) return;
    if (seriesModal.mode === "create") {
      if (useMockApi) {
        const newSeries: ScriptSeries = {
          id: `series-${Date.now()}`,
          title: seriesFormData.title,
          logline: seriesFormData.logline,
          status: "Draft",
          updatedAt: new Date().toLocaleString(),
          author: seriesFormData.author,
          rawContent: scriptContent || "",
          episodes: [],
          originalFilename: uploadedScriptFile?.name || `${seriesFormData.title}.txt`,
        };
        setSeriesList((prev) => [newSeries, ...prev]);
        setQuery({ mode: "studio", seriesId: newSeries.id });
      } else {
        const form = new FormData();
        form.set("title", seriesFormData.title);
        if (seriesFormData.logline) form.set("description", seriesFormData.logline);
        if (uploadedScriptFile) form.set("file", uploadedScriptFile);
        else form.set("text", scriptContent || "");
        const res = await fetch("/api/scripts", { method: "POST", body: form, cache: "no-store" });
        if (!res.ok) {
          alert(await res.text());
          return;
        }
        const json = (await res.json()) as {
          data?: { id: string; title: string; description?: string | null; created_at: string; original_filename: string };
        };
        const s = json.data;
        if (!s) return;
        const newSeries: ScriptSeries = {
          id: s.id,
          title: s.title,
          logline: s.description ?? "",
          status: "Draft",
          updatedAt: new Date(s.created_at).toLocaleString(),
          author: seriesFormData.author,
          rawContent: scriptContent || "",
          episodes: [],
          originalFilename: s.original_filename,
        };
        setSeriesList((prev) => [newSeries, ...prev]);
        setQuery({ mode: "studio", seriesId: newSeries.id });
      }
    } else if (seriesModal.mode === "edit" && seriesModal.data && activeSeries) {
      const updatedSeries = {
        ...activeSeries,
        ...seriesModal.data,
        title: seriesFormData.title,
        logline: seriesFormData.logline,
        author: seriesFormData.author,
      };
      updateActiveSeries(updatedSeries);
    }
    setSeriesModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleDeleteSeries = async (series: ScriptSeries) => {
    const ok = window.confirm(`确认删除「${series.title}」？（可在后台恢复前暂不支持恢复）`);
    if (!ok) return;

    if (useMockApi) {
      setSeriesList((prev) => prev.filter((s) => s.id !== series.id));
      if (seriesId === series.id) setQuery({ mode: "list", seriesId: null });
      return;
    }

    const res = await fetch(`/api/scripts/${series.id}`, { method: "DELETE", cache: "no-store" });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    setSeriesList((prev) => prev.filter((s) => s.id !== series.id));
    if (seriesId === series.id) setQuery({ mode: "list", seriesId: null });
  };

  const openEpisodeModal = (episode?: Episode) => {
    if (episode) {
      setEpisodeModal({ isOpen: true, mode: "edit", data: episode });
      setEpisodeFormData({ title: episode.title, logline: episode.logline, number: episode.number });
    } else {
      setEpisodeModal({ isOpen: true, mode: "create" });
      const nextNum = activeSeries ? activeSeries.episodes.length + 1 : 1;
      setEpisodeFormData({ title: `Episode ${nextNum}`, logline: "", number: nextNum });
    }
  };

  const handleSaveEpisode = () => {
    if (!activeSeries) return;
    if (episodeModal.mode === "create") {
      const newEp: Episode = { id: `ep-${Date.now()}`, number: episodeFormData.number, title: episodeFormData.title, logline: episodeFormData.logline, scenes: [] };
      const updatedSeries = { ...activeSeries, episodes: [...activeSeries.episodes, newEp] };
      updateActiveSeries(updatedSeries);
      setActiveEpisodeId(newEp.id);
    } else if (episodeModal.mode === "edit" && episodeModal.data) {
      const updatedSeries = {
        ...activeSeries,
        episodes: activeSeries.episodes.map((ep) =>
          ep.id === episodeModal.data!.id
            ? { ...ep, title: episodeFormData.title, logline: episodeFormData.logline, number: episodeFormData.number }
            : ep,
        ),
      };
      updateActiveSeries(updatedSeries);
    }
    setEpisodeModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleDeleteEpisode = (epId: string, e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!activeSeries) return;
    if (!confirm("确定删除此集吗？")) return;
    const updatedSeries = { ...activeSeries, episodes: activeSeries.episodes.filter((ep) => ep.id !== epId) };
    updateActiveSeries(updatedSeries);
    if (activeEpisodeId === epId) setActiveEpisodeId(null);
  };

  const openSceneModal = (episodeId: string, scene?: Scene) => {
    if (scene) {
      setSceneModal({ isOpen: true, mode: "edit", episodeId, data: scene });
      setSceneFormData({ intExt: "EXT.", location: scene.location || scene.title, time: scene.time || "DAY", content: scene.content });
    } else {
      setSceneModal({ isOpen: true, mode: "create", episodeId });
      setSceneFormData({ intExt: "EXT.", location: "", time: "DAY", content: "" });
    }
  };

  const handleSaveScene = async () => {
    if (!activeSeries || !sceneModal.episodeId) return;
    const fullTitle = `${sceneFormData.intExt} ${sceneFormData.location} - ${sceneFormData.time}`;
    const targetEpId = sceneModal.episodeId;

    if (!useMockApi) {
      try {
        if (sceneModal.mode === "create") {
          const res = await fetch(`/api/episodes/${encodeURIComponent(targetEpId)}/scenes`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: fullTitle, content: sceneFormData.content, location: sceneFormData.location, time_of_day: sceneFormData.time }),
            cache: "no-store",
          });
          if (!res.ok) throw new Error(await res.text());
        } else if (sceneModal.mode === "edit" && sceneModal.data) {
          const res = await fetch(`/api/scenes/${encodeURIComponent(sceneModal.data.id!)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: fullTitle, content: sceneFormData.content, location: sceneFormData.location, time_of_day: sceneFormData.time }),
            cache: "no-store",
          });
          if (!res.ok) throw new Error(await res.text());
        }
        await refreshHierarchy(activeSeries.id);
        setSceneModal((prev) => ({ ...prev, isOpen: false }));
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) => {
        if (ep.id !== targetEpId) return ep;
        if (sceneModal.mode === "create") {
          return {
            ...ep,
            scenes: [
              ...ep.scenes,
              {
                id: `sc-${Date.now()}`,
                number: ep.scenes.length + 1,
                title: fullTitle,
                location: sceneFormData.location,
                time: sceneFormData.time,
                content: sceneFormData.content,
                status: "DRAFT",
                assets: [],
                shots: [],
              } as Scene,
            ],
          };
        }
        if (sceneModal.data) {
          return {
            ...ep,
            scenes: ep.scenes.map((sc) =>
              sc.id === sceneModal.data!.id
                ? { ...sc, title: fullTitle, location: sceneFormData.location, time: sceneFormData.time, content: sceneFormData.content }
                : sc,
            ),
          };
        }
        return ep;
      }),
    };

    updateActiveSeries(updatedSeries);
    setSceneModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleDeleteScene = async (epId: string, scId: string, e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!activeSeries) return;
    if (!confirm("确定删除此场次吗？")) return;

    if (!useMockApi) {
      try {
        const res = await fetch(`/api/scenes/${encodeURIComponent(scId)}`, { method: "DELETE", cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        await refreshHierarchy(activeSeries.id);
        if (activeSceneId === scId) setActiveSceneId(null);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) => {
        if (ep.id !== epId) return ep;
        const kept = ep.scenes.filter((sc) => sc.id !== scId);
        const reindexed = kept.map((sc, idx) => ({ ...sc, number: idx + 1 }));
        return { ...ep, scenes: reindexed };
      }),
    };
    updateActiveSeries(updatedSeries);
    if (activeSceneId === scId) setActiveSceneId(null);
  };

  const handleAddShot = () => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId) return;
    if (!useMockApi) {
      alert("当前版本暂不支持手动新增分镜，请使用 AI 工具生成。");
      return;
    }
    const newShot: Shot = { id: `shot-${Date.now()}`, number: (activeScene?.shots.length || 0) + 1, visual: "画面描述...", dialogue: "", camera: "Wide Shot", duration: "3s", keyframes: [], assets: [] };
    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) =>
        ep.id === activeEpisodeId
          ? { ...ep, scenes: ep.scenes.map((sc) => (sc.id === activeSceneId ? { ...sc, shots: [...sc.shots, newShot] } : sc)) }
          : ep,
      ),
    };
    updateActiveSeries(updatedSeries);
  };

  const handleDeleteShot = async (shotId: string) => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId) return;
    if (!confirm("确认删除该分镜？")) return;

    if (!useMockApi) {
      try {
        const res = await fetch(`/api/shots/${encodeURIComponent(shotId)}`, { method: "DELETE", cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        if (activeSeries?.id) await refreshSceneShots(activeSeries.id, activeSceneId);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) =>
        ep.id === activeEpisodeId
          ? {
              ...ep,
              scenes: ep.scenes.map((sc) => {
                if (sc.id !== activeSceneId) return sc;
                const kept = sc.shots.filter((s) => s.id !== shotId);
                const reindexed = kept.map((s, idx) => ({ ...s, number: idx + 1 }));
                return { ...sc, shots: reindexed };
              }),
            }
          : ep,
      ),
    };
    updateActiveSeries(updatedSeries);
  };

  const handleUpdateShot = <K extends keyof Shot>(shotId: string, field: K, value: Shot[K]) => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId) return;
    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) =>
        ep.id === activeEpisodeId
          ? {
              ...ep,
              scenes: ep.scenes.map((sc) =>
                sc.id === activeSceneId ? { ...sc, shots: sc.shots.map((s) => (s.id === shotId ? { ...s, [field]: value } : s)) } : sc,
              ),
            }
          : ep,
      ),
    };
    updateActiveSeries(updatedSeries);
  };

  const handleUnbindAsset = async (shotId: string, assetId: string) => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId) return;
    if (!useMockApi) {
      const binding = (shotAssetBindingsMap[shotId] || []).find((b) => b.asset_entity_id === assetId);
      if (!binding) return;
      try {
        const res = await fetch(`/api/asset-bindings/${encodeURIComponent(binding.id)}`, { method: "DELETE", cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        await refreshShotAssetBindingsMap(activeSeries.id, activeSceneId);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) =>
        ep.id === activeEpisodeId
          ? {
              ...ep,
              scenes: ep.scenes.map((sc) =>
                sc.id === activeSceneId
                  ? { ...sc, shots: sc.shots.map((s) => (s.id === shotId ? { ...s, assets: (s.assets || []).filter((a) => a.id !== assetId) } : s)) }
                  : sc,
              ),
            }
          : ep,
      ),
    };
    updateActiveSeries(updatedSeries);
  };

  const handleBreakdown = async () => {
    if (!activeSeries) return;
    setIsBreakingDown(true);
    try {
      if (useMockApi) {
        await new Promise((r) => setTimeout(r, 1500));
        alert("结构化处理完成 (模拟)");
        return;
      }

      const res = await fetch(`/api/scripts/${encodeURIComponent(activeSeries.id)}/structure`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const json = (await res.json()) as {
        data?: {
          episodes?: Array<{
            id: string;
            episode_number: number;
            title?: string | null;
            script_full_text?: string | null;
            scenes?: Array<{
              id: string;
              scene_number: number;
              title?: string | null;
              content?: string | null;
              location?: string | null;
              time_of_day?: string | null;
            }>;
            assets?: Array<{ id: string; asset_id: string; name: string; type: string; category?: string | null }>;
          }>;
        };
      };
      const apiEpisodes = json.data?.episodes || [];

      const mappedEpisodes = mapApiEpisodes(apiEpisodes);

      const updatedSeries: ScriptSeries = { ...activeSeries, episodes: mappedEpisodes };
      updateActiveSeries(updatedSeries);
      setActiveEpisodeId(mappedEpisodes[0]?.id || null);
      setActiveSceneId(null);
      setWorkbenchMode("DIRECTOR");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBreakingDown(false);
    }
  };

  const handleSaveScript = () => {
    if (activeSeries) updateActiveSeries({ ...activeSeries, rawContent: scriptContent });
  };

  const navigateToExtraction = () => {
    try {
      sessionStorage.setItem("aistudio.scriptContent", scriptContent);
    } catch {
      return;
    }
    router.push("/extraction");
  };

  const navigateToDirectorFlow = (shotIdValue: string) => {
    const sid = activeSeries?.id;
    const qs = new URLSearchParams();
    qs.set("shotId", shotIdValue);
    if (sid) qs.set("scriptId", sid);
    router.push(`/storyboard?${qs.toString()}`);
  };

  const SidebarTree = () => {
    const isEmpty = !activeSeries?.episodes || activeSeries.episodes.length === 0;
    return (
      <div className="w-64 bg-surface border-r border-border flex flex-col h-full flex-shrink-0 relative">
        <div className="h-14 flex items-center px-4 border-b border-border gap-2">
          <button
            onClick={() => setQuery({ mode: "list", seriesId: null })}
            className="p-1.5 hover:bg-surfaceHighlight rounded-lg text-textMuted hover:text-textMain transition-colors"
            type="button"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="font-bold text-sm truncate flex-1">{activeSeries?.title}</span>
        </div>

        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-surfaceHighlight rounded-full flex items-center justify-center">
              <Bot size={32} className="text-textMuted" />
            </div>
            <p className="text-xs text-textMuted">
              暂无剧集数据。<br />您可以手动添加或使用剧本结构化处理。
            </p>
            <button
              onClick={handleBreakdown}
              disabled={isBreakingDown}
              className="w-full py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              type="button"
            >
              {isBreakingDown ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 剧本结构化处理
            </button>
            <button
              onClick={() => openEpisodeModal()}
              className="w-full py-2 bg-surface border border-border hover:border-primary/40 text-textMuted hover:text-primary rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all"
              type="button"
            >
              <Plus size={14} /> 新增剧集
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {activeSeries.episodes.map((ep, idx) => (
              <div key={ep.id} className="mb-1">
                <div className="flex items-center group relative">
                  <button
                    onClick={() => {
                      const nextEpisodeId = ep.id === activeEpisodeId ? null : ep.id;
                      setActiveEpisodeId(nextEpisodeId);
                      setActiveSceneId(null);
                      setWorkbenchMode("DIRECTOR");
                    }}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeEpisodeId === ep.id ? "bg-surfaceHighlight text-textMain" : "text-textMuted hover:text-textMain"
                    }`}
                    type="button"
                  >
                    {activeEpisodeId === ep.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="w-5 h-5 rounded-md bg-surfaceHighlight border border-border text-[10px] font-bold flex items-center justify-center text-textMuted flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="truncate flex-1 text-left">EP{ep.number}: {ep.title}</span>
                  </button>
                </div>
                {activeEpisodeId === ep.id && (
                  <div className="ml-3 pl-2 border-l border-border mt-1 space-y-0.5 animate-fade-in">
                    {ep.scenes.map((sc) => (
                      <div key={sc.id} className="relative group">
                        <button
                          onClick={() => {
                            setActiveSceneId(sc.id);
                            setWorkbenchMode("DIRECTOR");
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors truncate flex items-center gap-2 ${
                            activeSceneId === sc.id
                              ? "bg-primary/10 text-primary border-l-2 border-primary"
                              : "text-textMuted hover:bg-surfaceHighlight/50 hover:text-textMain"
                          }`}
                          type="button"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
                              sc.status === "DONE" ? "bg-green-500" : "bg-gray-500"
                            }`}
                          />
                          <span className="truncate flex-1">{sc.title}</span>
                        </button>
                        {activeSceneId === sc.id && sc.shots.length > 0 && (
                          <div className="ml-4 mt-1 space-y-0.5">
                            {sc.shots.map((shot) => (
                              <button
                                key={shot.id}
                                onClick={() => setSelectedShotId(shot.id)}
                                className="w-full text-left px-3 py-2 rounded-lg text-xs text-textMuted hover:bg-surfaceHighlight/50 hover:text-textMain transition-colors flex items-center gap-2"
                                type="button"
                              >
                                <span className="w-5 text-right font-mono">{shot.number}</span>
                                <span className="truncate flex-1">{shot.visual || "（无描述）"}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {activeSceneId === sc.id && sc.shots.length === 0 && (
                          <div className="ml-7 mt-1 text-xs text-textMuted/60">暂无分镜</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-8rem)] relative">
      {mode === "studio" && activeSeries ? (
        <div className="flex flex-col h-full rounded-2xl overflow-hidden border border-border shadow-2xl bg-background">
          <div className="h-12 border-b border-border bg-surfaceHighlight/50 flex items-center justify-center relative">
            <div className="flex p-1 bg-surface border border-border rounded-lg">
              <button
                onClick={() => setWorkbenchMode("EDITOR")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                  workbenchMode === "EDITOR" ? "bg-primary text-white shadow-lg" : "text-textMuted hover:text-textMain"
                }`}
                type="button"
              >
                <FileText size={14} /> 剧本创作
              </button>
              <button
                onClick={() => setWorkbenchMode("DIRECTOR")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                  workbenchMode === "DIRECTOR" ? "bg-primary text-white shadow-lg" : "text-textMuted hover:text-textMain"
                }`}
                type="button"
              >
                <Camera size={14} /> 导演分镜
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <SidebarTree />

            {workbenchMode === "EDITOR" ? (
              <>
                <div className="flex-1 bg-background flex flex-col min-w-0 border-r border-border h-full relative group">
                  <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <button
                      onClick={() => setEditorMode(editorMode === "WRITE" ? "PREVIEW" : "WRITE")}
                      className="bg-surface/80 backdrop-blur rounded-lg border border-border px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-2 text-textMuted hover:text-textMain"
                      type="button"
                    >
                      {editorMode === "WRITE" ? <Eye size={12} /> : <Edit3 size={12} />} {editorMode === "WRITE" ? "预览" : "编辑"}
                    </button>
                    <button
                      onClick={handleSaveScript}
                      className="bg-surface/80 backdrop-blur hover:bg-surface text-textMuted hover:text-primary px-3 py-1.5 rounded-lg text-xs font-medium border border-border transition-all flex items-center gap-2"
                      type="button"
                    >
                      <Save size={14} /> 保存
                    </button>
                    <button
                      onClick={navigateToExtraction}
                      className="bg-surface/80 backdrop-blur hover:bg-primary hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium text-textMain border border-border transition-all flex items-center gap-2"
                      type="button"
                    >
                      <SplitSquareHorizontal size={14} /> 提取资产
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                    <div className="max-w-3xl mx-auto h-full flex flex-col">
                      {editorMode === "WRITE" ? (
                        <textarea
                          value={scriptContent}
                          onChange={(e) => setScriptContent(e.target.value)}
                          className="w-full h-full bg-transparent text-textMain font-mono text-sm leading-relaxed outline-none resize-none placeholder-textMuted"
                          placeholder="# 输入剧本内容..."
                          spellCheck={false}
                        />
                      ) : (
                        <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{scriptContent}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-80 bg-surface border-l border-border flex flex-col h-full flex-shrink-0">
                  <div className="h-12 border-b border-border flex items-center px-4 font-bold text-sm justify-between">
                    <span>拆解助手</span>
                    <Bot size={14} className="text-primary" />
                  </div>
                  <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                    <div className="bg-surfaceHighlight p-4 rounded-xl space-y-3">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <FolderInput size={14} className="text-yellow-400" /> 结果导入 (Result Import)
                      </h4>
                      <p className="text-xs text-textMuted leading-relaxed">
                        支持导入分集、分场、分镜、资产及视频生成提示词等标准 JSON 格式的数据文件。
                      </p>
                      <input
                        type="file"
                        multiple
                        ref={resultImportInputRef}
                        className="hidden"
                        onChange={handleResultImportChange}
                        accept=".json"
                      />
                      <button
                        onClick={() => resultImportInputRef.current?.click()}
                        disabled={isBreakingDown}
                        className="w-full py-3 bg-surface border-2 border-dashed border-border hover:border-primary/50 text-textMuted hover:text-primary rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all disabled:opacity-50"
                        type="button"
                      >
                        {isBreakingDown ? (
                          <div className="flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin" /> 正在解析...
                          </div>
                        ) : (
                          <>
                            <FileStack size={20} />
                            <span>选择多个文件导入</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-3 border-t border-border/50">
                      <div className="flex items-center gap-2 text-xs text-textMuted mb-2 font-bold">
                        <Sparkles size={12} /> 支持的文件类型
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] text-textMuted/70">
                        <span className="bg-surfaceHighlight px-2 py-1 rounded flex items-center gap-1">
                          <FileJson size={10} /> 标准数据 (.json)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 bg-background flex flex-col min-w-0 h-full">
                {!activeEpisode ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-sm text-textMuted gap-3">
                    <div>请选择一个剧集</div>
                    <button
                      onClick={() => openEpisodeModal()}
                      className="px-4 py-2 bg-surface border border-border hover:border-primary/40 text-textMuted hover:text-primary rounded-lg text-xs font-bold flex items-center gap-2 transition-all"
                      type="button"
                    >
                      <Plus size={14} /> 新增剧集
                    </button>
                  </div>
                ) : !activeSceneId ? (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="h-12 border-b border-border bg-surface/50 backdrop-blur flex items-center justify-between px-4">
                      <span className="font-bold text-sm">
                        EP{activeEpisode.number}: {activeEpisode.title}
                      </span>
                      <span className="text-xs text-textMuted font-mono">{activeEpisode.scenes.length} SCENES</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                      <div className="max-w-4xl mx-auto space-y-6">
                        <div className="rounded-xl border border-border bg-surface overflow-hidden">
                          <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm flex items-center justify-between">
                            <span>剧集剧本</span>
                            <div className="relative flex items-center gap-2">
                              <button
                                onClick={openAiTool}
                                disabled={useMockApi}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                                type="button"
                                title="分场拆解（结构化分场）"
                              >
                                <Sparkles size={14} /> 分场拆解
                              </button>
                              <button
                                onClick={openAssetTool}
                                disabled={useMockApi}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                                type="button"
                                title="资产提取（按资产架构落库并绑定）"
                              >
                                <Sparkles size={14} /> 资产提取
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEpisodeActionsOpen((v) => !v);
                                }}
                                className="p-1.5 rounded-lg border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                                type="button"
                                title="剧集操作"
                              >
                                <Settings size={14} />
                              </button>
                              {episodeActionsOpen && (
                                <div
                                  className="absolute right-0 top-9 w-44 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setEpisodeActionsOpen(false);
                                      openEpisodeModal();
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
                                    type="button"
                                  >
                                    新增剧集
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEpisodeActionsOpen(false);
                                      openEpisodeModal(activeEpisode);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
                                    type="button"
                                  >
                                    编辑剧集
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEpisodeActionsOpen(false);
                                      openSceneModal(activeEpisode.id);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
                                    type="button"
                                  >
                                    新增场次
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEpisodeActionsOpen(false);
                                      if (!useMockApi) {
                                        alert("当前版本暂不支持删除剧集（将由后端能力补齐）。");
                                        return;
                                      }
                                      handleDeleteEpisode(activeEpisode.id, { stopPropagation: () => undefined });
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-red-400 transition-colors"
                                    type="button"
                                  >
                                    删除剧集
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="p-4 max-h-80 overflow-y-auto">
                            <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeEpisode.scriptFullText || ""}</ReactMarkdown>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface overflow-hidden">
                          <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm flex items-center justify-between">
                            <span>场景</span>
                          </div>
                          <div className="p-4">
                            {activeEpisode.scenes.length === 0 ? (
                              <div className="text-sm text-textMuted">暂无场景</div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {activeEpisode.scenes.map((sc) => (
                                  <button
                                    key={sc.id}
                                    onClick={() => {
                                      setActiveSceneId(sc.id);
                                      setWorkbenchMode("DIRECTOR");
                                    }}
                                    className="text-left p-4 rounded-xl border border-border bg-surfaceHighlight/20 hover:bg-surfaceHighlight/40 hover:border-primary/30 transition-all"
                                    type="button"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="font-bold text-textMain truncate">
                                        SCENE {sc.number}: {sc.title}
                                      </div>
                                      <span className="text-[10px] text-textMuted font-mono">{sc.shots.length} SH</span>
                                    </div>
                                    <div className="mt-2 text-xs text-textMuted line-clamp-3">{sc.content}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface overflow-hidden">
                          <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">关联资产</div>
                          <div className="p-4">
                            {!activeEpisode.assets || activeEpisode.assets.length === 0 ? (
                              <div className="text-sm text-textMuted">暂无关联资产</div>
                            ) : (
                              (() => {
                                const byCat = episodeAssetPool.reduce(
                                  (acc, asset) => {
                                    const cat = (asset.category || "未分类").trim() || "未分类";
                                    (acc[cat] ||= []).push(asset);
                                    return acc;
                                  },
                                  {} as Record<string, AssetReference[]>,
                                );

                                const typeLabel = (t: AssetReference["type"]) => {
                                  if (t === "CHARACTER") return "角色";
                                  if (t === "SCENE") return "场景";
                                  if (t === "PROP") return "道具";
                                  return "特效";
                                };

                                return (
                                  <div className="space-y-5">
                                    {Object.entries(byCat)
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([cat, assets]) => (
                                        <div key={cat} className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <div className="text-[10px] text-textMuted uppercase tracking-wider">{cat}</div>
                                            <span className="text-[10px] text-textMuted/60 bg-surfaceHighlight px-2 py-0.5 rounded border border-border">
                                              {assets.length}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {assets
                                              .slice()
                                              .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`))
                                              .map((asset) => (
                                                <button
                                                  key={asset.id}
                                                  onClick={() => openAssetEditor(asset.id)}
                                                  className="flex items-start gap-3 bg-surfaceHighlight/20 border border-border/60 rounded-lg p-3 hover:border-primary/50 hover:bg-surfaceHighlight/40 transition-all text-left"
                                                  type="button"
                                                >
                                                  <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-black/50 border border-border flex items-center justify-center text-textMuted">
                                                    {asset.type === "CHARACTER" && <User size={16} />}
                                                    {asset.type === "SCENE" && <ImageIcon size={16} />}
                                                    {asset.type === "PROP" && <Box size={16} />}
                                                    {asset.type === "VFX" && <Sparkles size={16} />}
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-textMain truncate">{asset.name}</div>
                                                    <div className="mt-1 text-[10px] text-textMuted uppercase tracking-wider">
                                                      {typeLabel(asset.type)}
                                                    </div>
                                                  </div>
                                                </button>
                                              ))}
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-12 border-b border-border bg-surface/50 backdrop-blur flex items-center justify-between px-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => setActiveSceneId(null)}
                          className="p-1.5 hover:bg-surfaceHighlight rounded-lg text-textMuted hover:text-textMain transition-colors"
                          type="button"
                          title="返回剧集概览"
                        >
                          <ArrowLeft size={16} />
                        </button>
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">{activeScene ? `SCENE ${activeScene.number}: ${activeScene.title}` : "分场"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeScene && (
                          <span className="text-xs text-textMuted font-mono">
                            {activeScene.shots.length} SHOTS
                          </span>
                        )}
                        <button
                          onClick={() => openSbTool(activeScene?.shots.length ? "replace" : undefined)}
                          disabled={useMockApi || !activeScene}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                          type="button"
                          title={activeScene?.shots.length ? "重新生成分镜（覆盖）" : "生成分镜"}
                        >
                          <Sparkles size={14} /> {activeScene?.shots.length ? "重新生成分镜" : "生成分镜"}
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSceneActionsOpen((v) => !v);
                            }}
                            className="p-1.5 rounded-lg border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                            type="button"
                            title="分场操作"
                          >
                            <Settings size={14} />
                          </button>
                          {sceneActionsOpen && activeScene && activeEpisode && (
                            <div
                              className="absolute right-0 top-9 w-44 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => {
                                  setSceneActionsOpen(false);
                                  openSbTool("replace");
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
                                type="button"
                              >
                                重新生成分镜（覆盖）
                              </button>
                              <button
                                onClick={() => {
                                  setSceneActionsOpen(false);
                                  openSbTool("append");
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
                                type="button"
                              >
                                追加生成分镜
                              </button>
                              <button
                                onClick={() => {
                                  setSceneActionsOpen(false);
                                  openSceneModal(activeEpisode.id, activeScene);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
                                type="button"
                              >
                                编辑场次
                              </button>
                              <button
                                onClick={() => {
                                  setSceneActionsOpen(false);
                                  handleDeleteScene(activeEpisode.id, activeScene.id, { stopPropagation: () => undefined });
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-textMuted hover:bg-surfaceHighlight hover:text-red-400 transition-colors"
                                type="button"
                              >
                                删除场次
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                      <div className="max-w-4xl mx-auto space-y-4">
                        {activeScene && (
                          <div className="rounded-xl border border-border bg-surface overflow-hidden">
                            <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="font-bold text-sm truncate">分场剧本</div>
                                <div className="mt-1 flex items-center gap-2 text-[10px] text-textMuted">
                                  <span className="bg-surface px-2 py-0.5 rounded border border-border">{activeScene.time || "—"}</span>
                                  <span className="truncate">{activeScene.location || "—"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="p-4 max-h-72 overflow-y-auto">
                              <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeScene.content || ""}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
                        {!useMockApi && sceneAssetBindings.length > 0 && (
                          <div className="rounded-xl border border-border bg-surface overflow-hidden">
                            <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">分场资产</div>
                            <div className="p-4 space-y-4">
                              {(["character", "scene", "prop", "vfx"] as const)
                                .filter((t) => sceneAssetBindings.some((b) => b.type === t))
                                .map((t) => {
                                  const label = t === "character" ? "角色" : t === "scene" ? "场景" : t === "prop" ? "道具" : "特效";
                                  const icon =
                                    t === "character" ? <User size={14} className="text-primary" /> : t === "scene" ? <ImageIcon size={14} className="text-primary" /> : t === "prop" ? <Box size={14} className="text-primary" /> : <Sparkles size={14} className="text-primary" />;
                                  const typed = sceneAssetBindings.filter((b) => b.type === t);
                                  const byCat = typed.reduce((acc, b) => {
                                    const key = (b.category || "未分类").trim() || "未分类";
                                    (acc[key] ||= []).push(b);
                                    return acc;
                                  }, {} as Record<string, ApiAssetBindingBrief[]>);
                                  return (
                                    <div key={t} className="space-y-2">
                                      <div className="flex items-center gap-2 text-xs font-bold text-textMain">
                                        {icon}
                                        <span>{label}</span>
                                        <span className="text-[10px] text-textMuted/60 bg-surfaceHighlight px-2 py-0.5 rounded border border-border">{typed.length}</span>
                                      </div>
                                      <div className="space-y-3">
                                        {Object.entries(byCat)
                                          .sort(([a], [b]) => a.localeCompare(b))
                                          .map(([cat, items]) => (
                                            <div key={cat} className="space-y-2">
                                              <div className="text-[10px] text-textMuted uppercase tracking-wider">{cat}</div>
                                              <div className="flex flex-wrap gap-2">
                                                {items.map((b) => (
                                                  <button
                                                    key={b.id}
                                                    onClick={() => openAssetEditor(b.asset_entity_id)}
                                                    className="px-3 py-1.5 rounded-lg border border-border bg-surfaceHighlight/20 hover:bg-surfaceHighlight/40 hover:border-primary/40 text-xs text-textMain flex items-center gap-2"
                                                    type="button"
                                                  >
                                                    <span className="font-bold truncate max-w-[160px]">{b.name}</span>
                                                    {b.variant_code && (
                                                      <span className="text-[10px] text-textMuted bg-surface px-2 py-0.5 rounded border border-border">
                                                        {b.variant_code}
                                                      </span>
                                                    )}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                        {activeScene && activeScene.shots.length === 0 && (
                          <div className="rounded-xl border border-border bg-surface p-6 text-sm text-textMuted flex items-center justify-between">
                            <div>暂无分镜，可使用 AI 分镜生成。</div>
                            <button
                              onClick={() => openSbTool("replace")}
                              disabled={useMockApi}
                              className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                              type="button"
                            >
                              <Sparkles size={14} className="inline-block mr-2" />
                              生成分镜
                            </button>
                          </div>
                        )}
                        {activeScene?.shots.map((shot) => (
                          <div
                            key={shot.id}
                            id={`shot-${shot.id}`}
                            className={`flex gap-4 p-5 rounded-xl border bg-surface transition-all group relative ${
                              selectedShotId === shot.id ? "border-primary/50" : "border-border hover:border-primary/30"
                            }`}
                          >
                            <div className="w-10 flex-shrink-0 flex flex-col items-center">
                              <span className="text-xl font-bold text-textMain font-mono">{shot.number}</span>
                              <div className="h-full w-px bg-border/50 my-2"></div>
                            </div>
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-sm font-bold border border-purple-500/30">{shot.camera}</span>
                              <span className="px-2 py-0.5 rounded bg-surfaceHighlight text-textMuted text-sm border border-border">{shot.duration}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleDeleteShot(shot.id)}
                                    className="p-1.5 text-textMuted hover:text-red-400 hover:bg-surfaceHighlight rounded transition-colors"
                                    type="button"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => navigateToDirectorFlow(shot.id)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-lg text-xs font-bold transition-all"
                                    type="button"
                                  >
                                    <Workflow size={14} /> 进入导演创作
                                  </button>
                                </div>
                              </div>
                              <textarea
                                value={shot.visual}
                                onChange={(e) => handleUpdateShot(shot.id, "visual", e.target.value)}
                                className="w-full bg-transparent text-lg text-textMain leading-relaxed font-medium outline-none resize-none border-b border-transparent focus:border-primary/50 transition-colors"
                                rows={2}
                              />
                              <div className="flex items-center gap-3 bg-surfaceHighlight/30 p-2 rounded-lg border border-border/50">
                                <Mic size={16} className="text-textMuted flex-shrink-0" />
                                <input
                                  value={shot.dialogue}
                                  onChange={(e) => handleUpdateShot(shot.id, "dialogue", e.target.value)}
                                  className="w-full bg-transparent text-base text-textMuted outline-none"
                                  placeholder="输入对白..."
                                />
                              </div>

                              <div className="pt-3 border-t border-border/30 mt-3">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider">关联资产</span>
                                    <span className="text-[10px] text-textMuted/50 bg-surfaceHighlight px-1.5 rounded">{shot.assets?.length || 0}</span>
                                  </div>
                                  <button
                                    onClick={() => handleOpenAssetBindModal(shot)}
                                    className="text-[10px] flex items-center gap-1 bg-surfaceHighlight hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 px-2 py-1 rounded transition-colors"
                                    type="button"
                                  >
                                    <Plus size={10} /> 管理资产
                                  </button>
                                </div>

                                {!shot.assets || shot.assets.length === 0 ? (
                                  <div
                                    onClick={() => handleOpenAssetBindModal(shot)}
                                    className="border border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-textMuted/40 hover:text-primary hover:border-primary/30 hover:bg-surfaceHighlight/30 cursor-pointer transition-all group/empty"
                                  >
                                    <Link size={16} className="group-hover/empty:scale-110 transition-transform" />
                                    <span className="text-xs">暂无绑定资产，点击添加</span>
                                  </div>
                                ) : (
                                  <div className="space-y-5">
                                    {Object.entries(
                                      (shot.assets || []).reduce((acc, a) => {
                                        const key = (a.category || "未分类").trim() || "未分类";
                                        (acc[key] ||= []).push(a);
                                        return acc;
                                      }, {} as Record<string, AssetReference[]>),
                                    )
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([cat, assets]) => (
                                        <div key={cat} className="space-y-3">
                                          <div className="text-[10px] text-textMuted uppercase tracking-wider">{cat}</div>
                                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {assets.map((asset) => (
                                              <div
                                                key={asset.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => openAssetEditor(asset.id)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter" || e.key === " ") openAssetEditor(asset.id);
                                                }}
                                                className="group/card relative flex items-start gap-3 bg-surfaceHighlight/20 border border-border/60 rounded-lg p-3 hover:border-primary/50 hover:bg-surfaceHighlight/50 transition-all cursor-pointer"
                                              >
                                                <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-black/50 border border-border relative">
                                                  {asset.thumbnail ? (
                                                    <img src={asset.thumbnail} className="w-full h-full object-cover" alt={asset.name} />
                                                  ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white/70">
                                                      {asset.type === "CHARACTER" && <User size={16} />}
                                                      {asset.type === "SCENE" && <ImageIcon size={16} />}
                                                      {asset.type === "PROP" && <Box size={16} />}
                                                      {asset.type !== "CHARACTER" && asset.type !== "SCENE" && asset.type !== "PROP" && (
                                                        <Sparkles size={16} />
                                                      )}
                                                    </div>
                                                  )}
                                                  <div className="absolute inset-0 ring-1 ring-inset ring-border/30 rounded-md pointer-events-none"></div>
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col pt-0.5 gap-1">
                                                  <div className="text-sm font-bold text-textMain truncate leading-snug" title={asset.name}>
                                                    {asset.name}
                                                  </div>
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] text-textMuted uppercase tracking-wider bg-surface px-1.5 py-0.5 rounded border border-border flex items-center gap-1">
                                                      {asset.type === "CHARACTER" && <User size={8} />}
                                                      {asset.type === "SCENE" && <ImageIcon size={8} />}
                                                      {asset.type === "PROP" && <Box size={8} />}
                                                      {asset.type}
                                                    </span>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleUnbindAsset(shot.id, asset.id);
                                                  }}
                                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-surface border border-border text-textMuted hover:text-red-400 hover:border-red-400/50 rounded-full opacity-100 transition-colors shadow-sm z-10"
                                                  title="解除绑定"
                                                  type="button"
                                                >
                                                  <X size={10} />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    <button
                                      onClick={() => handleOpenAssetBindModal(shot)}
                                      className="flex flex-col items-center justify-center gap-1 border border-dashed border-border rounded-lg text-textMuted/30 hover:text-primary hover:border-primary/30 hover:bg-surfaceHighlight/30 transition-all w-full min-h-[60px]"
                                      type="button"
                                    >
                                      <Plus size={14} />
                                      <span className="text-[10px]">Add</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {activeScene && useMockApi && (
                          <button
                            onClick={handleAddShot}
                            className="w-full py-4 border-2 border-dashed border-border rounded-xl text-textMuted hover:text-primary hover:border-primary/50 transition-all flex items-center justify-center gap-2 font-medium bg-surface/30 hover:bg-surface/50"
                            type="button"
                          >
                            <Plus size={20} /> 添加新分镜
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {assetBindModal.isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-surface border border-border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50 flex-shrink-0">
                  <h3 className="font-bold text-textMain flex items-center gap-2">
                    <Link size={20} className="text-primary" /> 绑定资产 (Bind Assets)
                  </h3>
                  <button
                    onClick={() => setAssetBindModal((prev) => ({ ...prev, isOpen: false }))}
                    className="text-textMuted hover:text-textMain"
                    type="button"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-4 border-b border-border bg-surfaceHighlight/20 flex gap-4 items-center flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
                    <input
                      type="text"
                      placeholder="搜索资产名称或标签..."
                      value={assetSearchQuery}
                      onChange={(e) => setAssetSearchQuery(e.target.value)}
                      className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary text-textMain"
                    />
                  </div>
                  <div className="flex items-center text-xs text-textMuted gap-2">
                    <span>
                      已选: <span className="text-primary font-bold">{tempSelectedAssetIds.size}</span> 个
                    </span>
                  </div>
                </div>
                <div className="p-6 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {assetBindPool.filter((a) => {
                    if (!assetSearchQuery) return true;
                    const q = assetSearchQuery.toLowerCase();
                    return a.name.toLowerCase().includes(q) || a.tags?.some((t) => t.toLowerCase().includes(q));
                  }).map((asset) => {
                    const isSelected = tempSelectedAssetIds.has(asset.id);
                    const isEpisodeAsset = episodeAssetIdSet.has(asset.id);
                    return (
                      <div
                        key={asset.id}
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                          isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                        }`}
                      >
                        {asset.thumbnail ? (
                          <img src={asset.thumbnail} className="w-full h-full object-cover bg-black/50" alt={asset.name} />
                        ) : (
                          <div className="w-full h-full bg-black/50 flex items-center justify-center border border-border/40">
                            {asset.type === "CHARACTER" && <User size={22} className="text-white/70" />}
                            {asset.type === "SCENE" && <ImageIcon size={22} className="text-white/70" />}
                            {asset.type === "PROP" && <Box size={22} className="text-white/70" />}
                            {asset.type !== "CHARACTER" && asset.type !== "SCENE" && asset.type !== "PROP" && (
                              <Sparkles size={22} className="text-white/70" />
                            )}
                          </div>
                        )}
                        <div
                          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent flex flex-col justify-end p-3 opacity-100"
                        >
                          <div className="font-bold text-sm text-white truncate leading-snug">{asset.name}</div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            <span className="text-[9px] bg-white/20 px-1 rounded text-white/90">{asset.type}</span>
                            {isEpisodeAsset && <span className="text-[9px] bg-emerald-400/20 px-1 rounded text-emerald-200 border border-emerald-300/30">本集</span>}
                            {asset.tags?.slice(0, 2).map((t) => (
                              <span key={t} className="text-[9px] bg-primary/20 px-1 rounded text-primary border border-primary/30">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                            <Check size={14} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="p-6 border-t border-border bg-surfaceHighlight/20 flex justify-end gap-3 flex-shrink-0">
                  <button
                    onClick={() => setAssetBindModal((prev) => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 text-sm text-textMuted hover:text-textMain font-medium"
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveAssetBinding}
                    className="px-6 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all"
                    type="button"
                  >
                    确认绑定 ({tempSelectedAssetIds.size})
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full bg-surface border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-in">
          <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/30">
            <div>
              <h2 className="text-2xl font-bold text-textMain flex items-center gap-2">
                <FileText className="text-primary" size={24} /> 剧本管理
              </h2>
              <p className="text-sm text-textMuted mt-1">管理您的剧集项目，进行分场拆解与分镜细化。</p>
            </div>
            <button
              onClick={() => openSeriesModal()}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all"
              type="button"
            >
              <Plus size={16} /> 新建剧集
            </button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
            {seriesList.map((series, idx) => (
              <div
                key={series.id}
                onClick={() => setQuery({ mode: "studio", seriesId: series.id })}
                className="group bg-surface border border-border rounded-2xl p-6 hover:border-primary/50 hover:bg-surfaceHighlight/20 transition-all cursor-pointer shadow-sm hover:shadow-xl flex flex-col relative"
              >
                <div className="absolute top-4 left-4 px-2 py-1 rounded-md text-[10px] font-bold border bg-surface/50 backdrop-blur text-textMuted">
                  {idx + 1}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openSeriesModal(series);
                  }}
                  className="absolute top-4 right-4 p-1.5 text-textMuted hover:text-primary bg-surface/50 rounded-lg backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit Series"
                  type="button"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (useMockApi) {
                      const blob = new Blob([series.rawContent || ""], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = series.originalFilename || `${series.title}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      return;
                    }
                    window.location.href = `/api/scripts/${series.id}/download`;
                  }}
                  className="absolute top-4 right-12 p-1.5 text-textMuted hover:text-primary bg-surface/50 rounded-lg backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
                  title="下载原始剧本"
                  type="button"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteSeries(series);
                  }}
                  className="absolute top-4 right-20 p-1.5 text-textMuted hover:text-red-500 bg-surface/50 rounded-lg backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除剧本"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Layout size={24} />
                  </div>
                  <span
                    className={`px-2 py-1 rounded-md text-[10px] font-medium border ${
                      series.status === "In Production"
                        ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        : "bg-gray-500/10 border-gray-500/20 text-gray-400"
                    }`}
                  >
                    {series.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-textMain mb-2 group-hover:text-primary transition-colors">{series.title}</h3>
                <p className="text-xs text-textMuted mb-6 line-clamp-2">{series.logline || "暂无简介"}</p>
                <div className="mt-auto space-y-2">
                  <div className="flex items-center text-xs text-textMuted gap-2">
                    <Layout size={12} />
                    <span>
                      {series.episodes.length} 集 / {series.episodes.reduce((acc, ep) => acc + ep.scenes.length, 0)} 场
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-textMuted gap-2">
                    <Clock size={12} /> <span>更新于 {series.updatedAt}</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs font-medium text-textMuted mt-4">
                  <span>作者: {series.author}</span>
                  <span className="flex items-center gap-1 group-hover:text-primary transition-colors">
                    进入工作台 <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            ))}
            <button
              onClick={() => openSeriesModal()}
              className="group bg-surface/30 border-2 border-dashed border-border rounded-2xl p-6 hover:border-primary/50 hover:bg-surfaceHighlight/20 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 text-textMuted hover:text-primary min-h-[300px]"
              type="button"
            >
              <div className="w-16 h-16 rounded-full bg-surfaceHighlight group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                <Plus size={32} />
              </div>
              <span className="font-medium">创建新项目</span>
            </button>
          </div>
        </div>
      )}

      {episodeModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50">
              <h3 className="font-bold text-textMain">{episodeModal.mode === "create" ? "新建剧集" : "编辑剧集"}</h3>
              <button onClick={() => setEpisodeModal((prev) => ({ ...prev, isOpen: false }))} type="button">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-textMuted uppercase">集数</label>
                <input
                  type="number"
                  value={episodeFormData.number}
                  onChange={(e) => setEpisodeFormData({ ...episodeFormData, number: parseInt(e.target.value) })}
                  className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-textMuted uppercase">标题</label>
                <input
                  type="text"
                  value={episodeFormData.title}
                  onChange={(e) => setEpisodeFormData({ ...episodeFormData, title: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  placeholder="例如：陨落的天才"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-textMuted uppercase">梗概</label>
                <textarea
                  value={episodeFormData.logline}
                  onChange={(e) => setEpisodeFormData({ ...episodeFormData, logline: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary h-24 resize-none text-textMain"
                />
              </div>
              <button onClick={handleSaveEpisode} className="w-full py-2 bg-primary hover:bg-blue-600 text-white rounded font-bold" type="button">
                {episodeModal.mode === "create" ? "创建" : "保存更改"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sceneModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50">
              <h3 className="font-bold text-textMain">{sceneModal.mode === "create" ? "新建场次" : "编辑场次"}</h3>
              <button onClick={() => setSceneModal((prev) => ({ ...prev, isOpen: false }))} type="button">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">内/外</label>
                  <select
                    value={sceneFormData.intExt}
                    onChange={(e) => setSceneFormData({ ...sceneFormData, intExt: e.target.value })}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    <option value="EXT.">EXT. (外)</option>
                    <option value="INT.">INT. (内)</option>
                    <option value="I/E.">I/E. (混)</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">地点</label>
                  <input
                    type="text"
                    value={sceneFormData.location}
                    onChange={(e) => setSceneFormData({ ...sceneFormData, location: e.target.value })}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                    placeholder="例如：斩仙台"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-textMuted uppercase">时间</label>
                <select
                  value={sceneFormData.time}
                  onChange={(e) => setSceneFormData({ ...sceneFormData, time: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                >
                  <option value="DAY">DAY (日)</option>
                  <option value="NIGHT">NIGHT (夜)</option>
                  <option value="DAWN">DAWN (晨)</option>
                  <option value="DUSK">DUSK (昏)</option>
                  <option value="CONTINUOUS">CONTINUOUS (续)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-textMuted uppercase">内容</label>
                <textarea
                  value={sceneFormData.content}
                  onChange={(e) => setSceneFormData({ ...sceneFormData, content: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary h-32 resize-none text-textMain"
                  placeholder="描述本场发生的剧情..."
                />
              </div>
              <button onClick={handleSaveScene} className="w-full py-2 bg-primary hover:bg-blue-600 text-white rounded font-bold" type="button">
                {sceneModal.mode === "create" ? "创建" : "保存更改"}
              </button>
            </div>
          </div>
        </div>
      )}

      {aiToolOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50">
              <h3 className="font-bold text-textMain flex items-center gap-2">
                <Sparkles size={18} className="text-primary" /> 分场拆解
              </h3>
              <button onClick={closeAiTool} type="button">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {aiLocked && (
                <div className="rounded-xl border border-border bg-surfaceHighlight/30 px-4 py-3 text-sm text-textMain flex items-center justify-between">
                  <div className="font-semibold">任务执行中，编辑区域已锁定</div>
                  <div className="text-xs text-textMuted tabular-nums">{aiTaskProgress}%</div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">供应商</label>
                  <select
                    value={aiProvider}
                    onChange={(e) => {
                      setAiProvider(e.target.value);
                      setAiModel("");
                    }}
                    disabled={aiLocked || aiIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    {aiProviders.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase">模型</label>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    disabled={aiLocked || aiIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    {aiModelsForProvider.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">落库策略</label>
                  <select
                    value={aiApplyMode}
                    onChange={(e) => setAiApplyMode(e.target.value as "replace" | "append")}
                    disabled={aiLocked || aiIsLoading || aiIsApplying}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    <option value="replace">覆盖重建</option>
                    <option value="append">追加场景</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase">提示词</label>
                  <textarea
                    value={aiPromptTemplate}
                    onChange={(e) => setAiPromptTemplate(e.target.value)}
                    disabled={aiLocked || aiIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-3 text-sm outline-none focus:border-primary h-40 resize-none text-textMain"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">提示词预设</label>
                  <select
                    value={aiPresetId}
                    onChange={(e) => handleAiSelectPreset(e.target.value)}
                    disabled={aiLocked || aiIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    <option value="">(新建预设)</option>
                    {aiPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.is_default ? `⭐ ${p.name}` : p.name}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={aiPresetName}
                      onChange={(e) => setAiPresetName(e.target.value)}
                      disabled={aiLocked || aiIsLoading}
                      className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                      placeholder="预设名称"
                    />
                    <label className="flex items-center gap-2 text-xs text-textMuted select-none">
                      <input
                        type="checkbox"
                        checked={aiPresetIsDefault}
                        disabled={aiLocked || aiIsLoading}
                        onChange={(e) => setAiPresetIsDefault(e.target.checked)}
                      />
                      设为默认
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAiSavePreset}
                        disabled={aiLocked || aiIsLoading}
                        className="flex-1 py-2 bg-surface border border-border rounded text-xs font-bold text-textMuted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
                        type="button"
                      >
                        保存提示词
                      </button>
                      <button
                        onClick={handleAiDeletePreset}
                        disabled={aiLocked || aiIsLoading || !aiPresetId}
                        className="px-3 py-2 bg-surface border border-border rounded text-xs font-bold text-textMuted hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-50"
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAiPreviewPrompt}
                  disabled={aiLocked || aiIsLoading || useMockApi}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-xs font-bold text-textMuted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
                  type="button"
                >
                  预览提示词
                </button>
                <button
                  onClick={handleAiRunPreview}
                  disabled={aiLocked || aiIsLoading || useMockApi}
                  className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {aiLocked ? `处理中...${aiTaskProgress ? ` ${aiTaskProgress}%` : ""}` : aiIsLoading ? "处理中..." : "调用 AI 预览"}
                </button>
                <button
                  onClick={handleAiApply}
                  disabled={aiLocked || aiIsApplying || useMockApi}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {aiIsApplying ? "落库中..." : "确认落库"}
                </button>
              </div>

              {(aiFinalPrompt || aiPromptInjected) && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">最终提示词（已注入）</div>
                  <pre className="p-4 text-xs text-textMain whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{aiFinalPrompt || aiPromptInjected}</pre>
                </div>
              )}

              {aiRawText && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">返回结果预览</div>
                  <pre className="p-4 text-xs text-textMain whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{aiRawText}</pre>
                </div>
              )}

              {aiScenes.length > 0 && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">分场效果预览</div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiScenes.map((sc, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-border bg-surfaceHighlight/20">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-bold text-textMain truncate">
                            SCENE {sc.scene_number ?? idx + 1}: {sc.title || "(无标题)"}
                          </div>
                          <span className="text-[10px] text-textMuted font-mono">{sc.time_of_day || ""}</span>
                        </div>
                        <div className="mt-2 text-xs text-textMuted line-clamp-4">{sc.content || ""}</div>
                        {(sc.location || sc.location_type) && (
                          <div className="mt-3 flex items-center gap-2 text-[10px] text-textMuted">
                            <span className="px-2 py-0.5 rounded bg-surface border border-border">{sc.location_type || "未标注"}</span>
                            <span className="truncate">{sc.location || ""}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {assetToolOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50">
              <h3 className="font-bold text-textMain flex items-center gap-2">
                <Sparkles size={18} className="text-primary" /> 资产提取
              </h3>
              <button onClick={closeAssetTool} type="button">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {assetLocked && (
                <div className="rounded-xl border border-border bg-surfaceHighlight/30 px-4 py-3 text-sm text-textMain flex items-center justify-between">
                  <div className="font-semibold">任务执行中，编辑区域已锁定</div>
                  <div className="text-xs text-textMuted tabular-nums">{assetTaskProgress}%</div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">供应商</label>
                  <select
                    value={assetProvider}
                    onChange={(e) => {
                      setAssetProvider(e.target.value);
                      setAssetModel("");
                    }}
                    disabled={assetLocked || assetIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    {assetProviders.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase">模型</label>
                  <select
                    value={assetModel}
                    onChange={(e) => setAssetModel(e.target.value)}
                    disabled={assetLocked || assetIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    {assetModelsForProvider.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">落库策略</label>
                  <select
                    value={assetApplyMode}
                    onChange={(e) => setAssetApplyMode(e.target.value as "replace" | "append")}
                    disabled={assetLocked || assetIsLoading || assetIsApplying}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    <option value="append">追加绑定</option>
                    <option value="replace">覆盖重建</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase">提示词</label>
                  <textarea
                    value={assetPromptTemplate}
                    onChange={(e) => setAssetPromptTemplate(e.target.value)}
                    disabled={assetLocked || assetIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-3 text-sm outline-none focus:border-primary h-40 resize-none text-textMain"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">提示词预设</label>
                  <select
                    value={assetPresetId}
                    onChange={(e) => handleAssetSelectPreset(e.target.value)}
                    disabled={assetLocked || assetIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    <option value="">(新建预设)</option>
                    {assetPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.is_default ? `⭐ ${p.name}` : p.name}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={assetPresetName}
                      onChange={(e) => setAssetPresetName(e.target.value)}
                      disabled={assetLocked || assetIsLoading}
                      className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                      placeholder="预设名称"
                    />
                    <label className="flex items-center gap-2 text-xs text-textMuted select-none">
                      <input
                        type="checkbox"
                        checked={assetPresetIsDefault}
                        disabled={assetLocked || assetIsLoading}
                        onChange={(e) => setAssetPresetIsDefault(e.target.checked)}
                      />
                      设为默认
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAssetSavePreset}
                        disabled={assetLocked || assetIsLoading}
                        className="flex-1 py-2 bg-surface border border-border rounded text-xs font-bold text-textMuted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
                        type="button"
                      >
                        保存提示词
                      </button>
                      <button
                        onClick={handleAssetDeletePreset}
                        disabled={assetLocked || assetIsLoading || !assetPresetId}
                        className="px-3 py-2 bg-surface border border-border rounded text-xs font-bold text-textMuted hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-50"
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAssetPreviewPrompt}
                  disabled={assetLocked || assetIsLoading || useMockApi}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-xs font-bold text-textMuted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
                  type="button"
                >
                  预览提示词
                </button>
                <button
                  onClick={handleAssetRunPreview}
                  disabled={assetLocked || assetIsLoading || useMockApi}
                  className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {assetLocked ? `处理中...${assetTaskProgress ? ` ${assetTaskProgress}%` : ""}` : assetIsLoading ? "处理中..." : "调用 AI 预览"}
                </button>
                <button
                  onClick={handleAssetApply}
                  disabled={assetLocked || assetIsApplying || useMockApi}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {assetIsApplying ? "落库中..." : "确认落库"}
                </button>
              </div>

              {(assetFinalPrompt || assetPromptInjected) && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">最终提示词（已注入）</div>
                  <pre className="p-4 text-xs text-textMain whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{assetFinalPrompt || assetPromptInjected}</pre>
                </div>
              )}

              {assetRawText && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">返回结果预览</div>
                  <pre className="p-4 text-xs text-textMain whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{assetRawText}</pre>
                </div>
              )}

              {(assetWorldUnity || assetDraftAssets.length > 0) && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm flex items-center justify-between">
                    <span>资产效果预览</span>
                    <span className="text-xs text-textMuted font-mono">{assetDraftAssets.length} ASSETS</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {assetWorldUnity && (
                      <div className="rounded-xl border border-border bg-surfaceHighlight/20 p-4">
                        <div className="font-bold text-textMain text-sm">世界观统一要素</div>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-textMuted">
                          <div className="truncate">时代：{assetWorldUnity.era_setting || "—"}</div>
                          <div className="truncate">艺术风格：{assetWorldUnity.art_style || "—"}</div>
                          <div className="truncate">配色体系：{assetWorldUnity.color_system || "—"}</div>
                          <div className="truncate">材质风格：{assetWorldUnity.material_style || "—"}</div>
                        </div>
                        {assetWorldUnity.notes && <div className="mt-2 text-xs text-textMuted line-clamp-2">{assetWorldUnity.notes}</div>}
                      </div>
                    )}

                    {assetDraftAssets.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {assetDraftAssets.map((a, idx) => (
                          <div key={`${a.type}-${a.name}-${idx}`} className="p-4 rounded-xl border border-border bg-surfaceHighlight/20">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-bold text-textMain truncate">{a.name}</div>
                              <span className="text-[10px] text-textMuted font-mono">{a.type}</span>
                            </div>
                            <div className="mt-2 text-xs text-textMuted line-clamp-3">{a.concept || ""}</div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-textMuted">
                              {a.importance && <span className="px-2 py-0.5 rounded bg-surface border border-border">{a.importance}</span>}
                              {(a.category_path || []).slice(0, 3).map((c) => (
                                <span key={c} className="px-2 py-0.5 rounded bg-surface border border-border">
                                  {c}
                                </span>
                              ))}
                              {(a.tags || []).slice(0, 3).map((t) => (
                                <span key={t} className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                  {t}
                                </span>
                              ))}
                              {(a.variants || []).length > 0 && (
                                <span className="px-2 py-0.5 rounded bg-surface border border-border">{(a.variants || []).length} variants</span>
                              )}
                              {(a.children || []).length > 0 && (
                                <span className="px-2 py-0.5 rounded bg-surface border border-border">{(a.children || []).length} children</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {assetEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50">
              <div className="min-w-0">
                <div className="font-bold text-textMain flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-primary" /> 资产编辑
                </div>
                <div className="mt-1 text-[10px] text-textMuted font-mono truncate">{assetEditorAssetId || ""}</div>
              </div>
              <button onClick={closeAssetEditor} type="button">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {assetEditorIsLoading || !assetEditorData ? (
                <div className="flex items-center justify-center py-16 text-textMuted">
                  <Loader2 size={18} className="animate-spin mr-2" /> 正在加载资产...
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-4 space-y-4">
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                      <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">资产</div>
                      <div className="p-4 space-y-3">
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-textMuted uppercase">名称</div>
                          <input
                            value={assetEditorData.name}
                            onChange={(e) => setAssetEditorData({ ...assetEditorData, name: e.target.value })}
                            className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-textMuted uppercase">类别路径</div>
                          <input
                            value={assetEditorData.category || ""}
                            onChange={(e) => setAssetEditorData({ ...assetEditorData, category: e.target.value })}
                            placeholder="例如：角色/主角团/核心"
                            className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-textMuted uppercase">类型</div>
                            <div className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm text-textMain">
                              {assetEditorData.type}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-textMuted uppercase">状态</div>
                            <select
                              value={assetEditorData.lifecycle_status}
                              onChange={(e) => setAssetEditorData({ ...assetEditorData, lifecycle_status: e.target.value })}
                              className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                            >
                              <option value="draft">draft</option>
                              <option value="published">published</option>
                              <option value="archived">archived</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-textMuted uppercase">标签</div>
                          <input
                            value={(assetEditorData.tags || []).join(", ")}
                            onChange={(e) =>
                              setAssetEditorData({
                                ...assetEditorData,
                                tags: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="用逗号分隔，例如：主角, 男性, 现代"
                            className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                          />
                        </div>
                        <button
                          onClick={saveAssetEditor}
                          disabled={assetEditorIsSaving}
                          className="w-full py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          type="button"
                        >
                          {assetEditorIsSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          保存资产
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4 space-y-4">
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                      <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
                        <div className="font-bold text-sm">变体</div>
                        <button
                          onClick={createAssetVariant}
                          disabled={assetEditorIsSaving}
                          className="text-[10px] flex items-center gap-1 bg-surfaceHighlight hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          type="button"
                        >
                          <Plus size={10} /> 新增
                        </button>
                      </div>
                      <div className="p-3 space-y-2">
                        {assetEditorData.variants.length === 0 ? (
                          <div className="text-sm text-textMuted p-2">暂无变体</div>
                        ) : (
                          assetEditorData.variants.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => setAssetEditorSelectedVariantId(v.id)}
                              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                                assetEditorSelectedVariantId === v.id
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-surfaceHighlight/20 hover:bg-surfaceHighlight/40 text-textMain"
                              }`}
                              type="button"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-bold text-sm">{v.variant_code}</div>
                                {v.is_default && <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 border border-primary/30">默认</span>}
                              </div>
                              <div className="mt-1 text-[10px] text-textMuted truncate">
                                {[v.stage_tag, v.age_range].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4 space-y-4">
                    {(() => {
                      const v = assetEditorData.variants.find((x) => x.id === assetEditorSelectedVariantId) || assetEditorData.variants[0];
                      if (!v) return <div className="text-sm text-textMuted">请选择一个变体</div>;
                      return (
                        <div className="rounded-xl border border-border bg-surface overflow-hidden">
                          <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
                            <div className="font-bold text-sm">变体详情</div>
                            <button
                              onClick={() => deleteAssetVariant(v.id)}
                              disabled={assetEditorIsSaving}
                              className="text-[10px] flex items-center gap-1 bg-surfaceHighlight hover:bg-red-500/10 hover:text-red-400 border border-border hover:border-red-400/30 px-2 py-1 rounded transition-colors disabled:opacity-50"
                              type="button"
                            >
                              <Trash2 size={10} /> 删除
                            </button>
                          </div>
                          <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="text-xs font-bold text-textMuted uppercase">阶段</div>
                                <input
                                  value={v.stage_tag || ""}
                                  onChange={(e) =>
                                    setAssetEditorData({
                                      ...assetEditorData,
                                      variants: assetEditorData.variants.map((x) => (x.id === v.id ? { ...x, stage_tag: e.target.value } : x)),
                                    })
                                  }
                                  className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-bold text-textMuted uppercase">年龄段</div>
                                <input
                                  value={v.age_range || ""}
                                  onChange={(e) =>
                                    setAssetEditorData({
                                      ...assetEditorData,
                                      variants: assetEditorData.variants.map((x) => (x.id === v.id ? { ...x, age_range: e.target.value } : x)),
                                    })
                                  }
                                  className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-bold text-textMuted uppercase">Prompt Template</div>
                              <textarea
                                value={v.prompt_template || ""}
                                onChange={(e) =>
                                  setAssetEditorData({
                                    ...assetEditorData,
                                    variants: assetEditorData.variants.map((x) => (x.id === v.id ? { ...x, prompt_template: e.target.value } : x)),
                                  })
                                }
                                className="w-full bg-surfaceHighlight border border-border rounded p-3 text-sm outline-none focus:border-primary h-40 resize-none text-textMain"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-bold text-textMuted uppercase">Attributes (JSON)</div>
                              <textarea
                                value={JSON.stringify(v.attributes || {}, null, 2)}
                                onChange={(e) => {
                                  try {
                                    const parsed = JSON.parse(e.target.value || "{}");
                                    setAssetEditorData({
                                      ...assetEditorData,
                                      variants: assetEditorData.variants.map((x) => (x.id === v.id ? { ...x, attributes: parsed } : x)),
                                    });
                                  } catch {
                                    return;
                                  }
                                }}
                                className="w-full bg-surfaceHighlight border border-border rounded p-3 text-xs outline-none focus:border-primary h-40 resize-none text-textMain font-mono"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  updateAssetVariant(v.id, {
                                    stage_tag: v.stage_tag ?? null,
                                    age_range: v.age_range ?? null,
                                    attributes: v.attributes || {},
                                    prompt_template: v.prompt_template ?? null,
                                  })
                                }
                                disabled={assetEditorIsSaving}
                                className="flex-1 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                type="button"
                              >
                                {assetEditorIsSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                保存变体
                              </button>
                              <button
                                onClick={() => updateAssetVariant(v.id, { is_default: true })}
                                disabled={assetEditorIsSaving}
                                className="py-2 px-3 bg-surfaceHighlight hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                type="button"
                              >
                                设为默认
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sbToolOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50">
              <h3 className="font-bold text-textMain flex items-center gap-2">
                <Sparkles size={18} className="text-primary" /> AI 工具：生成分镜
              </h3>
              <button onClick={closeSbTool} type="button">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {sbLocked && (
                <div className="rounded-xl border border-border bg-surfaceHighlight/30 px-4 py-3 text-sm text-textMain flex items-center justify-between">
                  <div className="font-semibold">任务执行中，编辑区域已锁定</div>
                  <div className="text-xs text-textMuted tabular-nums">{sbTaskProgress}%</div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">供应商</label>
                  <select
                    value={sbProvider}
                    onChange={(e) => {
                      setSbProvider(e.target.value);
                      setSbModel("");
                    }}
                    disabled={sbLocked || sbIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    {sbProviders.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase">模型</label>
                  <select
                    value={sbModel}
                    onChange={(e) => setSbModel(e.target.value)}
                    disabled={sbLocked || sbIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    {sbModelsForProvider.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">落库策略</label>
                  <select
                    value={sbApplyMode}
                    onChange={(e) => setSbApplyMode(e.target.value as "replace" | "append")}
                    disabled={sbLocked || sbIsLoading || sbIsApplying}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    <option value="replace">覆盖重建</option>
                    <option value="append">追加分镜</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase">提示词</label>
                  <textarea
                    value={sbPromptTemplate}
                    onChange={(e) => setSbPromptTemplate(e.target.value)}
                    disabled={sbLocked || sbIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-3 text-sm outline-none focus:border-primary h-40 resize-none text-textMain"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase">提示词预设</label>
                  <select
                    value={sbPresetId}
                    onChange={(e) => handleSbSelectPreset(e.target.value)}
                    disabled={sbLocked || sbIsLoading}
                    className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                  >
                    <option value="">(新建预设)</option>
                    {sbPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.is_default ? `⭐ ${p.name}` : p.name}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={sbPresetName}
                      onChange={(e) => setSbPresetName(e.target.value)}
                      disabled={sbLocked || sbIsLoading}
                      className="w-full bg-surfaceHighlight border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                      placeholder="预设名称"
                    />
                    <label className="flex items-center gap-2 text-xs text-textMuted select-none">
                      <input
                        type="checkbox"
                        checked={sbPresetIsDefault}
                        disabled={sbLocked || sbIsLoading}
                        onChange={(e) => setSbPresetIsDefault(e.target.checked)}
                      />
                      设为默认
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSbSavePreset}
                        disabled={sbLocked || sbIsLoading}
                        className="flex-1 py-2 bg-surface border border-border rounded text-xs font-bold text-textMuted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
                        type="button"
                      >
                        保存提示词
                      </button>
                      <button
                        onClick={handleSbDeletePreset}
                        disabled={sbLocked || sbIsLoading || !sbPresetId}
                        className="px-3 py-2 bg-surface border border-border rounded text-xs font-bold text-textMuted hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-50"
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSbPreviewPrompt}
                  disabled={sbLocked || sbIsLoading || useMockApi}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-xs font-bold text-textMuted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
                  type="button"
                >
                  预览提示词
                </button>
                <button
                  onClick={handleSbRunPreview}
                  disabled={sbLocked || sbIsLoading || useMockApi}
                  className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {sbLocked ? `处理中...${sbTaskProgress ? ` ${sbTaskProgress}%` : ""}` : sbIsLoading ? "处理中..." : "调用 AI 预览"}
                </button>
                <button
                  onClick={handleSbApply}
                  disabled={sbLocked || sbIsApplying || useMockApi}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {sbIsApplying ? "落库中..." : "确认落库"}
                </button>
              </div>

              {(sbFinalPrompt || sbPromptInjected) && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">最终提示词（已注入）</div>
                  <pre className="p-4 text-xs text-textMain whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{sbFinalPrompt || sbPromptInjected}</pre>
                </div>
              )}

              {sbRawText && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">返回结果预览</div>
                  <pre className="p-4 text-xs text-textMain whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{sbRawText}</pre>
                </div>
              )}

              {sbShots.length > 0 && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">分镜效果预览（可编辑后落库）</div>
                  <div className="p-4 space-y-4">
                    {sbShots.map((shot, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-border bg-surfaceHighlight/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-textMain">SHOT {idx + 1}</div>
                          <button
                            onClick={() => setSbShots((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-textMuted hover:text-red-400"
                            type="button"
                            title="移除"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            value={shot.shot_type || ""}
                            onChange={(e) => setSbShots((prev) => prev.map((s, i) => (i === idx ? { ...s, shot_type: e.target.value } : s)))}
                            className="bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                            placeholder="shot_type"
                          />
                          <input
                            value={shot.camera_angle || ""}
                            onChange={(e) => setSbShots((prev) => prev.map((s, i) => (i === idx ? { ...s, camera_angle: e.target.value } : s)))}
                            className="bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                            placeholder="camera_angle"
                          />
                          <input
                            value={shot.camera_move || ""}
                            onChange={(e) => setSbShots((prev) => prev.map((s, i) => (i === idx ? { ...s, camera_move: e.target.value } : s)))}
                            className="bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                            placeholder="camera_move"
                          />
                        </div>
                        <textarea
                          value={shot.description || ""}
                          onChange={(e) => setSbShots((prev) => prev.map((s, i) => (i === idx ? { ...s, description: e.target.value } : s)))}
                          className="w-full bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain h-20 resize-none"
                          placeholder="description（画面描述）"
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <input
                            value={shot.dialogue_speaker || ""}
                            onChange={(e) => setSbShots((prev) => prev.map((s, i) => (i === idx ? { ...s, dialogue_speaker: e.target.value } : s)))}
                            className="bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                            placeholder="dialogue_speaker"
                          />
                          <input
                            value={shot.sound_effect || ""}
                            onChange={(e) => setSbShots((prev) => prev.map((s, i) => (i === idx ? { ...s, sound_effect: e.target.value } : s)))}
                            className="bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                            placeholder="sound_effect"
                          />
                        </div>
                        <textarea
                          value={shot.dialogue || ""}
                          onChange={(e) => setSbShots((prev) => prev.map((s, i) => (i === idx ? { ...s, dialogue: e.target.value } : s)))}
                          className="w-full bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain h-16 resize-none"
                          placeholder="dialogue（对白）"
                        />
                        <input
                          value={(shot.active_assets || []).join(",")}
                          onChange={(e) =>
                            setSbShots((prev) =>
                              prev.map((s, i) =>
                                i === idx
                                  ? { ...s, active_assets: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }
                                  : s,
                              ),
                            )
                          }
                          className="bg-surface border border-border rounded p-2 text-sm outline-none focus:border-primary text-textMain"
                          placeholder="active_assets（用英文逗号分隔）"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {seriesModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center bg-surfaceHighlight/50">
              <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
                <FilePlus size={20} className="text-primary" /> {seriesModal.mode === "create" ? "新建剧集项目" : "编辑剧集信息"}
              </h2>
              <button onClick={() => setSeriesModal((prev) => ({ ...prev, isOpen: false }))} className="text-textMuted hover:text-white" type="button">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-textMuted">
                  剧集标题 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={seriesFormData.title}
                  onChange={(e) => setSeriesFormData({ ...seriesFormData, title: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm focus:border-primary outline-none text-textMain"
                  placeholder="例如：星际穿越第一季"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-textMuted">一句话梗概</label>
                <textarea
                  value={seriesFormData.logline}
                  onChange={(e) => setSeriesFormData({ ...seriesFormData, logline: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm focus:border-primary outline-none resize-none h-20 text-textMain"
                  placeholder="简要描述故事核心..."
                />
              </div>
              {seriesModal.mode === "create" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMuted">导入剧本 (可选)</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-textMuted hover:border-primary/50 hover:bg-surfaceHighlight/20 cursor-pointer transition-colors"
                  >
                    <Upload size={24} className="mb-2" />
                    <span className="text-xs">点击上传 .txt, .md, .pdf, .docx</span>
                    {uploadedScriptFile && (
                      <span className="text-[10px] text-green-400 mt-2 flex items-center gap-1">
                        <CheckCircle size={10} /> 已选择：{uploadedScriptFile.name}
                      </span>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf,.doc,.docx" onChange={handleFileUpload} />
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border bg-surfaceHighlight/20 flex justify-end gap-3">
              <button onClick={() => setSeriesModal((prev) => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-sm text-textMuted hover:text-textMain font-medium" type="button">
                取消
              </button>
              <button
                onClick={handleSaveSeries}
                disabled={!seriesFormData.title}
                className="px-6 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all"
                type="button"
              >
                {seriesModal.mode === "create" ? "立即创建" : "保存更改"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
