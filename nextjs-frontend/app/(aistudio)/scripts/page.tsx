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
  Pencil,
  Plus,
  Save,
  Search,
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

interface Keyframe {
  id: string;
  imageUrl: string;
  status: "GENERATING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

interface AssetReference {
  id: string;
  type: "CHARACTER" | "SCENE" | "PROP";
  name: string;
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
      assets?: Array<{ id: string; asset_id: string; name: string; type: string }>;
    }>,
  ): Episode[] => {
    return apiEpisodes.map((ep) => {
      const assets: AssetReference[] = (ep.assets || []).map((a) => ({
        id: a.id,
        type: a.type === "character" ? "CHARACTER" : a.type === "scene" ? "SCENE" : "PROP",
        name: a.name,
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
    const json = (await res.json()) as any;
    const apiEpisodes = (json?.data?.episodes || []) as Array<{
      id: string;
      episode_number: number;
      title?: string | null;
      script_full_text?: string | null;
      scenes?: Array<{ id: string; scene_number: number; title?: string | null; content?: string | null; location?: string | null; time_of_day?: string | null }>;
      assets?: Array<{ id: string; asset_id: string; name: string; type: string }>;
    }>;
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
        scenes?: Array<{ id: string; scene_number: number; title?: string | null; content?: string | null }>;
        assets?: Array<{ id: string; asset_id: string; name: string; type: string }>;
      }>;

      const mappedEpisodes: Episode[] = apiEpisodes.map((ep) => {
        const assets: AssetReference[] = (ep.assets || []).map((a) => ({
          id: a.id,
          type: a.type === "character" ? "CHARACTER" : a.type === "scene" ? "SCENE" : "PROP",
          name: a.name,
        }));
        const scenes: Scene[] = (ep.scenes || []).map((sc) => ({
          id: sc.id,
          number: sc.scene_number,
          title: sc.title || `SCENE ${sc.scene_number}`,
          location: "",
          time: "",
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

  const updateActiveSeries = (updatedSeries: ScriptSeries) => {
    setSeriesList((prev) => prev.map((s) => (s.id === updatedSeries.id ? updatedSeries : s)));
    setActiveSeries(updatedSeries);
  };

  const handleOpenAssetBindModal = (shot: Shot) => {
    const currentAssetIds = new Set(shot.assets?.map((a) => a.id) || []);
    setTempSelectedAssetIds(currentAssetIds);
    setAssetSearchQuery("");
    setAssetBindModal({ isOpen: true, shotId: shot.id });
  };

  const toggleAssetSelection = (assetId: string) => {
    const newSet = new Set(tempSelectedAssetIds);
    if (newSet.has(assetId)) newSet.delete(assetId);
    else newSet.add(assetId);
    setTempSelectedAssetIds(newSet);
  };

  const handleSaveAssetBinding = () => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId || !assetBindModal.shotId) return;

    const selectedAssets = MOCK_ASSETS_POOL.filter((a) => tempSelectedAssetIds.has(a.id));
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

  const handleDeleteEpisode = (epId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleDeleteScene = async (epId: string, scId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
      episodes: activeSeries.episodes.map((ep) => (ep.id === epId ? { ...ep, scenes: ep.scenes.filter((sc) => sc.id !== scId) } : ep)),
    };
    updateActiveSeries(updatedSeries);
    if (activeSceneId === scId) setActiveSceneId(null);
  };

  const handleAddShot = () => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId) return;
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

  const handleDeleteShot = (shotId: string) => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId) return;
    const updatedSeries = {
      ...activeSeries,
      episodes: activeSeries.episodes.map((ep) =>
        ep.id === activeEpisodeId
          ? { ...ep, scenes: ep.scenes.map((sc) => (sc.id === activeSceneId ? { ...sc, shots: sc.shots.filter((s) => s.id !== shotId) } : sc)) }
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

  const handleUnbindAsset = (shotId: string, assetId: string) => {
    if (!activeSeries || !activeEpisodeId || !activeSceneId) return;
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
      const json = (await res.json()) as any;
      const apiEpisodes = (json?.data?.episodes || []) as Array<{
        id: string;
        episode_number: number;
        title?: string | null;
        script_full_text?: string | null;
        scenes?: Array<{ id: string; scene_number: number; title?: string | null; content?: string | null; location?: string | null; time_of_day?: string | null }>;
        assets?: Array<{ id: string; asset_id: string; name: string; type: string }>;
      }>;

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
          <button
            onClick={() => openEpisodeModal()}
            className="p-1.5 hover:bg-surfaceHighlight rounded-lg text-primary transition-colors"
            title="Add Episode"
            type="button"
          >
            <Plus size={16} />
          </button>
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
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {activeSeries.episodes.map((ep) => (
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
                    <span className="truncate flex-1 text-left">EP{ep.number}: {ep.title}</span>
                  </button>
                  <div className="absolute right-2 hidden group-hover:flex items-center bg-surfaceHighlight rounded-md shadow-sm border border-border">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSceneModal(ep.id);
                      }}
                      className="p-1 hover:text-primary transition-colors"
                      type="button"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEpisodeModal(ep);
                      }}
                      className="p-1 hover:text-blue-400 transition-colors"
                      type="button"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteEpisode(ep.id, e)}
                      className="p-1 hover:text-red-400 transition-colors"
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
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
                        <div className="absolute right-2 top-1.5 hidden group-hover:flex items-center bg-surface rounded-md shadow-sm border border-border">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openSceneModal(ep.id, sc);
                            }}
                            className="p-1 hover:text-blue-400 transition-colors"
                            type="button"
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteScene(ep.id, sc.id, e)}
                            className="p-1 hover:text-red-400 transition-colors"
                            type="button"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => openSceneModal(ep.id)}
                      className="w-full text-left px-3 py-2 text-[10px] text-textMuted/50 hover:text-primary transition-colors flex items-center gap-1"
                      type="button"
                    >
                      <Plus size={10} /> 添加场次
                    </button>
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
                  <div className="flex-1 flex items-center justify-center text-sm text-textMuted">请选择一个剧集</div>
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
                          <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm">剧集剧本</div>
                          <div className="p-4 max-h-80 overflow-y-auto">
                            <div className="markdown-body prose prose-invert max-w-none text-sm leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeEpisode.scriptFullText || ""}</ReactMarkdown>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface overflow-hidden">
                          <div className="px-4 py-3 border-b border-border bg-surfaceHighlight/30 font-bold text-sm flex items-center justify-between">
                            <span>场景</span>
                            <button
                              onClick={() => openSceneModal(activeEpisode.id)}
                              className="p-1.5 rounded-md text-textMuted hover:text-primary hover:bg-surfaceHighlight/50 transition-colors"
                              type="button"
                              title="新增场景"
                            >
                              <Plus size={14} />
                            </button>
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
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {activeEpisode.assets.map((asset) => (
                                  <div
                                    key={asset.id}
                                    className="flex items-start gap-3 bg-surfaceHighlight/20 border border-border/60 rounded-lg p-3"
                                  >
                                    <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-black/50 border border-border flex items-center justify-center text-textMuted">
                                      {asset.type === "CHARACTER" && <User size={16} />}
                                      {asset.type === "SCENE" && <ImageIcon size={16} />}
                                      {asset.type === "PROP" && <Box size={16} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-bold text-textMain truncate">{asset.name}</div>
                                      <div className="mt-1 text-[10px] text-textMuted uppercase tracking-wider">{asset.type}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-12 border-b border-border bg-surface/50 backdrop-blur flex items-center justify-between px-4">
                      <span className="font-bold text-sm">分镜表 (Shot List)</span>
                      {activeScene && (
                        <span className="text-xs text-textMuted font-mono">
                          SCENE {activeScene.number} - {activeScene.shots.length} SHOTS
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                      <div className="max-w-4xl mx-auto space-y-4">
                        {activeScene?.shots.map((shot) => (
                          <div key={shot.id} className="flex gap-4 p-5 rounded-xl border border-border bg-surface hover:border-primary/30 transition-all group relative">
                            <div className="w-10 flex-shrink-0 flex flex-col items-center">
                              <span className="text-xl font-bold text-textMain font-mono">{shot.number}</span>
                              <div className="h-full w-px bg-border/50 my-2"></div>
                            </div>
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-500/30">{shot.camera}</span>
                                  <span className="px-2 py-0.5 rounded bg-surfaceHighlight text-textMuted text-xs border border-border">{shot.duration}</span>
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
                                className="w-full bg-transparent text-base text-textMain leading-relaxed font-medium outline-none resize-none border-b border-transparent focus:border-primary/50 transition-colors"
                                rows={2}
                              />
                              <div className="flex items-center gap-3 bg-surfaceHighlight/30 p-2 rounded-lg border border-border/50">
                                <Mic size={16} className="text-textMuted flex-shrink-0" />
                                <input
                                  value={shot.dialogue}
                                  onChange={(e) => handleUpdateShot(shot.id, "dialogue", e.target.value)}
                                  className="w-full bg-transparent text-sm text-textMuted outline-none"
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
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {shot.assets.map((asset) => (
                                      <div
                                        key={asset.id}
                                        className="group/card relative flex items-start gap-3 bg-surfaceHighlight/20 border border-border/60 rounded-lg p-2 hover:border-primary/50 hover:bg-surfaceHighlight/50 transition-all cursor-default"
                                      >
                                        <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-black/50 border border-border relative">
                                          <img src={asset.thumbnail} className="w-full h-full object-cover" alt={asset.name} />
                                          <div className="absolute inset-0 ring-1 ring-inset ring-border/30 rounded-md pointer-events-none"></div>
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col pt-0.5">
                                          <div className="text-sm font-bold text-textMain truncate leading-tight" title={asset.name}>
                                            {asset.name}
                                          </div>
                                          <div className="flex items-center gap-1.5 mt-1.5">
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
                                          className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-surface border border-border text-textMuted hover:text-red-400 hover:border-red-400/50 rounded-full opacity-0 group-hover/card:opacity-100 transition-all shadow-sm z-10"
                                          title="解除绑定"
                                          type="button"
                                        >
                                          <X size={10} />
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      onClick={() => handleOpenAssetBindModal(shot)}
                                      className="flex flex-col items-center justify-center gap-1 border border-dashed border-border rounded-lg text-textMuted/30 hover:text-primary hover:border-primary/30 hover:bg-surfaceHighlight/30 transition-all h-full min-h-[60px]"
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

                        {activeScene && (
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
                <div className="p-6 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {MOCK_ASSETS_POOL.filter((a) => {
                    if (!assetSearchQuery) return true;
                    const q = assetSearchQuery.toLowerCase();
                    return a.name.toLowerCase().includes(q) || a.tags?.some((t) => t.toLowerCase().includes(q));
                  }).map((asset) => {
                    const isSelected = tempSelectedAssetIds.has(asset.id);
                    return (
                      <div
                        key={asset.id}
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                          isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                        }`}
                      >
                        <img src={asset.thumbnail} className="w-full h-full object-cover bg-black/50" alt={asset.name} />
                        <div
                          className={`absolute inset-0 bg-black/40 flex flex-col justify-end p-3 transition-opacity ${
                            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <div className="font-bold text-sm text-white truncate">{asset.name}</div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            <span className="text-[9px] bg-white/20 px-1 rounded text-white/90">{asset.type}</span>
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
            {seriesList.map((series) => (
              <div
                key={series.id}
                onClick={() => setQuery({ mode: "studio", seriesId: series.id })}
                className="group bg-surface border border-border rounded-2xl p-6 hover:border-primary/50 hover:bg-surfaceHighlight/20 transition-all cursor-pointer shadow-sm hover:shadow-xl flex flex-col relative"
              >
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
