"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useAIModelList } from "@/hooks/useAIModelList";
import { BatchVideoJob, BatchVideoAsset, BatchVideoHistory, GridMode, UploadedSource, ExcelCellMapping, BatchVideoPendingImage } from "./types";
import { JobList } from "./components/JobList";
import { AssetGrid } from "./components/AssetGrid";
import { UploadPanel } from "./components/UploadPanel";
import { UploadedSourcePanel } from "./components/UploadedSourcePanel";
import { VideoPreviewCards } from "./components/VideoPreviewCards";
import type { ModelCapabilities } from "@/lib/aistudio/types";
import type { BatchVideoPreviewCard, BatchVideoPreviewCardsResponse } from "./types";
import AIPolishWizard from "./components/AIPolishWizard";

type TabKey = "script-prep" | "storyboard-prep" | "video-gen" | "video-preview";

export default function BatchVideoPage() {
  const [currentJob, setCurrentJob] = useState<BatchVideoJob | null>(null);
  const [jobs, setJobs] = useState<BatchVideoJob[]>([]);
  const [assets, setAssets] = useState<BatchVideoAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("script-prep");
  const [uploadedSources, setUploadedSources] = useState<UploadedSource[]>([]);
  const [historyItems, setHistoryItems] = useState<BatchVideoHistory[]>([]);
  const [previewCards, setPreviewCards] = useState<BatchVideoPreviewCard[]>([]);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<Record<string, string>[]>([]);
  const [selectedExcelColumn, setSelectedExcelColumn] = useState<string>("");
  const [excelMappings, setExcelMappings] = useState<ExcelCellMapping[]>([]);
  const [pendingSplitSourceId, setPendingSplitSourceId] = useState<string | null>(null);
  const [showExcelColumnContent, setShowExcelColumnContent] = useState(false);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [filteredSourceId, setFilteredSourceId] = useState<string | null>(null);
  const [showPolishWizard, setShowPolishWizard] = useState(false);

  // Video generation config state
  const [selectedVideoModelId, setSelectedVideoModelId] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [videoResolution, setVideoResolution] = useState<string>("1280x720");
  const [offPeak, setOffPeak] = useState(false);

  const { models: videoModels } = useAIModelList("video");
  const selectedVideoModel = videoModels.find((m) => m.configId === selectedVideoModelId);
  const videoCaps: ModelCapabilities | undefined = selectedVideoModel?.capabilities;

  // Derive available options from video model capabilities
  const availableDurations = videoCaps?.duration_options ?? 
    (videoCaps?.duration_range ? 
      Array.from({ length: videoCaps.duration_range.max - videoCaps.duration_range.min + 1 }, 
        (_, i) => videoCaps.duration_range!.min + i) : 
      [3, 5, 10]);
  
  const availableResolutions = videoCaps?.resolutions ?? 
    (videoCaps?.resolution_tiers ? 
      (Array.isArray(videoCaps.resolution_tiers) ? videoCaps.resolution_tiers : 
        Object.values(videoCaps.resolution_tiers).flat()) : 
      ["1280x720", "1920x1080", "720x1280", "1080x1920"]);
  
  const supportsOffPeak = videoCaps?.supports_off_peak ?? true;

  const loadJobResources = async (job: BatchVideoJob) => {
    const [assetsResponse, pendingImagesResponse] = await Promise.all([
      fetch(`/api/batch-video/jobs/${job.id}/assets`),
      fetch(`/api/batch-video/jobs/${job.id}/pending-images`),
    ]);

    const [assetsResult, pendingImagesResult] = await Promise.all([
      assetsResponse.json(),
      pendingImagesResponse.json(),
    ]);

    if (assetsResult.code === 200) {
      setAssets(assetsResult.data);
    } else {
      setAssets([]);
    }

    if (pendingImagesResult.code === 200) {
      const restoredSources: UploadedSource[] = (pendingImagesResult.data as BatchVideoPendingImage[]).map((item) => ({
        id: item.id,
        sourceUrl: item.source_url,
        preview: item.thumbnail_url || item.source_url,
        mode: item.mode,
        processed: item.processed,
        originalFilename: item.original_filename,
        contentType: item.content_type,
        linkedCellKey: item.linked_cell_key,
        linkedCellLabel: item.linked_cell_label,
      }));
      setUploadedSources(restoredSources);
    } else {
      setUploadedSources([]);
    }

    setFilteredSourceId(null);

    // Restore video generation config from job
    if (job.config) {
      if (job.config.model_config_id) {
        setSelectedVideoModelId(job.config.model_config_id);
      }
      if (job.config.duration) {
        setVideoDuration(job.config.duration);
      }
      if (job.config.resolution) {
        setVideoResolution(job.config.resolution);
      }
      if (typeof job.config.off_peak === "boolean") {
        setOffPeak(job.config.off_peak);
      }
    }
  };

  const loadPreviewCards = async (jobId: string) => {
    try {
      const response = await fetch(`/api/batch-video/jobs/${jobId}/preview-cards`);
      const result = await response.json();
      if (result.code === 200) {
        const data = result.data as BatchVideoPreviewCardsResponse;
        setPreviewCards(data.cards || []);
        return;
      }
    } catch (error) {
      console.error("Failed to load preview cards:", error);
    }
    setPreviewCards([]);
  };

  const visibleAssets = filteredSourceId
    ? assets.filter((asset) => asset.source_image_id === filteredSourceId)
    : assets;

  const filteredSource = filteredSourceId
    ? uploadedSources.find((source) => source.id === filteredSourceId) ?? null
    : null;

  const hasActivePreviewTasks = previewCards.some((card) => {
    const status = card.latest_task?.status;
    return status === "queued" || status === "running" || status === "waiting_external";
  });

  useEffect(() => {
    const loadJobs = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/batch-video/jobs");
        const result = await response.json();
        if (result.code === 200 && result.data.items.length > 0) {
          setJobs(result.data.items);
          setCurrentJob(result.data.items[0]);
          await loadJobResources(result.data.items[0]);
          await loadPreviewCards(result.data.items[0].id);
        }
      } catch (error) {
        console.error("Failed to load jobs:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadJobs();
  }, []);

  useEffect(() => {
    if (activeTab !== "video-preview" || !currentJob?.id || !hasActivePreviewTasks) {
      return;
    }

    const interval = setInterval(() => {
      void loadPreviewCards(currentJob.id);
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTab, currentJob?.id, hasActivePreviewTasks]);

  const handleCreateJob = async (title: string, config: BatchVideoJob["config"]) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/batch-video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, config }),
      });
      const result = await response.json();
      if (result.code === 200) {
        const newJob = result.data;
        setJobs([newJob, ...jobs]);
        setCurrentJob(newJob);
        setAssets([]);
        setUploadedSources([]);
        setPreviewCards([]);
      }
    } catch (error) {
      console.error("Failed to create job:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectJob = async (job: BatchVideoJob) => {
    setCurrentJob(job);
    setIsLoading(true);
    try {
      await loadJobResources(job);
      await loadPreviewCards(job.id);
    } catch (error) {
      console.error("Failed to load job resources:", error);
      setAssets([]);
      setUploadedSources([]);
      setPreviewCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    setIsLoading(true);
    try {
      await fetch(`/api/batch-video/jobs/${jobId}`, { method: "DELETE" });
      const newJobs = jobs.filter((j) => j.id !== jobId);
      setJobs(newJobs);
      if (currentJob?.id === jobId) {
        setCurrentJob(newJobs[0] || null);
        if (newJobs[0]) {
          handleSelectJob(newJobs[0]);
        } else {
          setAssets([]);
          setPreviewCards([]);
        }
      }
    } catch (error) {
      console.error("Failed to delete job:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadAssets = async (files: File[]) => {
    if (!currentJob) {
      toast.error("请先创建或选择任务");
      return;
    }

    setIsLoading(true);
    try {
      const uploaded: UploadedSource[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadResp = await fetch("/api/vfs/files/upload", { method: "POST", body: formData });
        const uploadResult = await uploadResp.json();
        const fileNodeId = uploadResult?.data?.id;
        if (!fileNodeId) {
          throw new Error("VFS upload failed");
        }

        const sourceUrl = `/api/vfs/nodes/${fileNodeId}/download`;
        const thumbnailUrl = `/api/vfs/nodes/${fileNodeId}/thumbnail`;
        const pendingResp = await fetch(`/api/batch-video/jobs/${currentJob.id}/pending-images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            {
              source_url: sourceUrl,
              thumbnail_url: thumbnailUrl,
              original_filename: file.name,
              content_type: file.type,
              mode: "16:9",
              processed: false,
            },
          ]),
        });
        const pendingResult = await pendingResp.json();
        const item = pendingResult?.data?.[0] as BatchVideoPendingImage | undefined;
        if (!item) {
          throw new Error("Create pending image failed");
        }

        uploaded.push({
          id: item.id,
          file,
          sourceUrl: item.source_url,
          preview: item.thumbnail_url || item.source_url,
          mode: item.mode,
          processed: item.processed,
          originalFilename: item.original_filename,
          contentType: item.content_type,
          linkedCellKey: item.linked_cell_key,
          linkedCellLabel: item.linked_cell_label,
        });
      }

      setUploadedSources((prev) => [...prev, ...uploaded]);
    } catch (error) {
      console.error("Failed to upload assets:", error);
      toast.error("上传待处理图片失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSourceMode = async (id: string, mode: GridMode) => {
    setUploadedSources((prev) => prev.map((s) => (s.id === id ? { ...s, mode } : s)));
    try {
      await fetch(`/api/batch-video/pending-images/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
    } catch (error) {
      console.error("Failed to update source mode:", error);
    }
  };

  const handleRemoveSource = async (id: string) => {
    setUploadedSources((prev) => {
      const source = prev.find((s) => s.id === id);
      if (source) URL.revokeObjectURL(source.preview);
      return prev.filter((s) => s.id !== id);
    });

    try {
      await fetch(`/api/batch-video/pending-images/${id}`, { method: "DELETE" });
    } catch (error) {
      console.error("Failed to remove pending image:", error);
    }
  };

  const splitSourceToCards = async (source: UploadedSource) => {
    if (!currentJob) return;
    if (!selectedExcelColumn || excelMappings.length === 0) {
      toast.error("请先上传 Excel 并选择要处理的列");
      setActiveTab("script-prep");
      return;
    }
    if (!source.linkedCellKey) {
      setPendingSplitSourceId(source.id);
      setActiveTab("script-prep");
      toast.info("请先在 Excel 预览中点击一个单元格，再执行拆分");
      return;
    }

    const blobToDataUrl = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    const readFile = async () => {
      if (source.file) {
        return blobToDataUrl(source.file);
      }

      if (source.sourceUrl) {
        const response = await fetch(source.sourceUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch persisted source image");
        }
        const blob = await response.blob();
        return blobToDataUrl(blob);
      }

      throw new Error("Source file is unavailable after refresh");
    };

    const splitDataUrls = (dataUrl: string) =>
      new Promise<string[]>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const cols = source.mode === "16:9" ? 3 : 2;
          const rows = source.mode === "16:9" ? 3 : 2;
          const cellWidth = img.width / cols;
          const cellHeight = img.height / rows;
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve([]);
          canvas.width = cellWidth;
          canvas.height = cellHeight;
          const results: string[] = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              ctx.clearRect(0, 0, cellWidth, cellHeight);
              ctx.drawImage(img, c * cellWidth, r * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
              results.push(canvas.toDataURL("image/jpeg", 0.92));
            }
          }
          resolve(results);
        };
        img.src = dataUrl;
      });

    setIsLoading(true);
    try {
      const dataUrl = await readFile();
      const images = await splitDataUrls(dataUrl);
      const mapping = excelMappings.find((item) => item.id === source.linkedCellKey);
      const response = await fetch(`/api/batch-video/jobs/${currentJob.id}/assets/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: images.map((item, index) => ({ dataUrl: item, source_image_id: source.id, slice_index: index })) }),
      });
      const result = await response.json();
      if (result.code === 200) {
        const mappedAssets = (result.data as BatchVideoAsset[]).map((asset, index) => ({
          ...asset,
          prompt: mapping?.lines[index] ?? asset.prompt,
          source_image_id: source.id,
          slice_index: index,
        }));
        setAssets((prev) => [...prev, ...mappedAssets]);
        setUploadedSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, processed: true } : s)));

        // Persist prompts to database
        const promptUpdates = mappedAssets
          .filter((a) => a.prompt)
          .map((a) => ({ asset_id: a.id, prompt: a.prompt! }));
        if (promptUpdates.length > 0) {
          await fetch("/api/batch-video/cards/batch-update-prompts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates: promptUpdates }),
          });
        }

        await fetch(`/api/batch-video/pending-images/${source.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processed: true }),
        });
      } else {
        console.error("Split upload failed:", result);
        toast.error(result.msg || "拆分上传失败");
      }
    } catch (error) {
      console.error("Failed to split source into cards:", error);
      toast.error("拆分为卡片失败，请检查登录状态或稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateAssetPrompt = async (assetId: string, prompt: string) => {
    try {
      await fetch(`/api/batch-video/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      setAssets(assets.map((a) => (a.id === assetId ? { ...a, prompt } : a)));
    } catch (error) {
      console.error("Failed to update prompt:", error);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      await fetch(`/api/batch-video/assets/${assetId}`, { method: "DELETE" });
      setAssets(assets.filter((a) => a.id !== assetId));
      setSelectedAssets((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    } catch (error) {
      console.error("Failed to delete asset:", error);
    }
  };

  const handleDeleteSelectedAssets = async () => {
    const ids = Array.from(selectedAssets);
    if (ids.length === 0) return;

    try {
      await Promise.all(ids.map((id) => fetch(`/api/batch-video/assets/${id}`, { method: "DELETE" })));
      setAssets((prev) => prev.filter((asset) => !selectedAssets.has(asset.id)));
      setSelectedAssets(new Set());
      toast.success(`已删除 ${ids.length} 个 cards`);
    } catch (error) {
      console.error("Failed to delete selected assets:", error);
      toast.error("批量删除 cards 失败");
    }
  };

  const handleGenerate = async () => {
    if (!currentJob || selectedAssets.size === 0 || !selectedVideoModelId) return;
    setIsLoading(true);
    try {
      // Update job config with current video generation settings
      const config = {
        model_config_id: selectedVideoModelId,
        duration: videoDuration,
        resolution: videoResolution,
        off_peak: offPeak,
      };
      
      await fetch(`/api/batch-video/jobs/${currentJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      const response = await fetch("/api/batch-video/assets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_ids: Array.from(selectedAssets) }),
      });
      const result = await response.json();
      if (result.code === 200) {
        // Asset status is independent of tasks - one asset can have multiple generation tasks
        // We only update history to track the new tasks
        const createdTasks = Array.isArray(result.data) ? result.data : [];
        const nextHistory: BatchVideoHistory[] = createdTasks.map((item: { asset_id: string; task_id: string }) => ({
          id: item.task_id,
          asset_id: item.asset_id,
          task_id: item.task_id,
          status: "pending",
          progress: 0,
          created_at: new Date().toISOString(),
        }));
        setHistoryItems((prev) => [...nextHistory, ...prev]);
        if (currentJob) {
          await loadPreviewCards(currentJob.id);
        }
        toast.success(`已提交 ${selectedAssets.size} 个视频生成任务`);
      } else {
        console.error("Generate failed:", result);
        toast.error(result.msg || "视频生成任务提交失败");
      }
    } catch (error) {
      console.error("Failed to generate:", error);
      toast.error("视频生成任务提交失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAIPolish = () => {
    if (selectedAssets.size === 0) {
      toast.error("请先选择要润色的分镜");
      return;
    }
    setShowPolishWizard(true);
  };

  const handlePolishComplete = async (updates: Array<{ asset_id: string; prompt: string }>) => {
    try {
      await fetch("/api/batch-video/cards/batch-update-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      setAssets((prev) => prev.map((asset) => {
        const next = updates.find((item) => item.asset_id === asset.id);
        return next ? { ...asset, prompt: next.prompt } : asset;
      }));

      toast.success(`已润色 ${updates.length} 个分镜`);
    } catch (error) {
      console.error("Failed to apply polish results:", error);
      toast.error("应用润色结果失败");
    }
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "script-prep", label: "剧本准备" },
    { key: "storyboard-prep", label: "分镜准备" },
    { key: "video-gen", label: "视频生成" },
    { key: "video-preview", label: "视频预览" },
  ];

  const handleImportExcel = async (file: File) => {
    setIsLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
      const columns = Object.keys(rows[0] || {});
      setExcelRows(rows);
      setExcelColumns(columns);
      setSelectedExcelColumn(columns[0] || "");
      if (columns[0]) {
        const mappings: ExcelCellMapping[] = rows
          .map((row, idx) => {
            const rawText = String(row[columns[0]] ?? "").trim();
            const lines = rawText
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
            return {
              id: `${columns[0]}-${idx + 1}`,
              rowIndex: idx + 1,
              columnKey: columns[0],
              rawText,
              lines,
              edited: false,
            } satisfies ExcelCellMapping;
          })
          .filter((item) => item.rawText.length > 0);
        setExcelMappings(mappings);
      } else {
        setExcelMappings([]);
      }
    } catch (error) {
      console.error("Failed to import excel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const rebuildExcelMappings = (columnKey: string) => {
    if (!columnKey || excelRows.length === 0) {
      setExcelMappings([]);
      return;
    }

    const mappings: ExcelCellMapping[] = excelRows
      .map((row, idx) => {
        const rawText = String(row[columnKey] ?? "").trim();
        const lines = rawText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        return {
          id: `${columnKey}-${idx + 1}`,
          rowIndex: idx + 1,
          columnKey,
          rawText,
          lines,
          edited: false,
        } satisfies ExcelCellMapping;
      })
      .filter((item) => item.rawText.length > 0);

    setExcelMappings(mappings);
  };

  const handleSelectExcelCell = async (cell: ExcelCellMapping) => {
    if (cell.lines.length !== 9) {
      toast.error("所选单元格需要正好包含 9 行内容，才能映射九宫格 cards");
      return;
    }

    if (!pendingSplitSourceId) {
      return;
    }

    setUploadedSources((prev) =>
      prev.map((source) =>
        source.id === pendingSplitSourceId
          ? {
              ...source,
              linkedCellKey: cell.id,
              linkedCellLabel: `${cell.columnKey}${cell.rowIndex}`,
            }
          : source
      )
    );

    fetch(`/api/batch-video/pending-images/${pendingSplitSourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linked_cell_key: cell.id,
        linked_cell_label: `${cell.columnKey}${cell.rowIndex}`,
      }),
    }).catch((error) => {
      console.error("Failed to persist pending image binding:", error);
    });

    // 更新与当前 pending image 关联的 assets 的 prompt
    const relatedAssets = assets.filter(
      (asset) => asset.source_image_id === pendingSplitSourceId
    );
    if (relatedAssets.length > 0) {
      const updates = relatedAssets.slice(0, cell.lines.length).map((asset, index) => ({
        asset_id: asset.id,
        prompt: cell.lines[index] ?? asset.prompt ?? "",
      }));

      setAssets((prev) =>
        prev.map((asset) => {
          if (asset.source_image_id !== pendingSplitSourceId) return asset;
          const idx = relatedAssets.findIndex((a) => a.id === asset.id);
          return idx >= 0 && idx < cell.lines.length
            ? { ...asset, prompt: cell.lines[idx] }
            : asset;
        })
      );

      fetch("/api/batch-video/cards/batch-update-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      }).catch((error) => {
        console.error("Failed to persist excel binding prompts:", error);
      });
    }

    setPendingSplitSourceId(null);
    toast.success(`已绑定单元格 ${cell.columnKey}${cell.rowIndex}`);
  };

  const handleEditExcelCell = (cellId: string, rawText: string) => {
    setExcelMappings((prev) =>
      prev.map((cell) => {
        if (cell.id !== cellId) return cell;
        const lines = rawText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        return {
          ...cell,
          rawText,
          lines,
          edited: true,
        };
      })
    );
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border">
        <div className="flex items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold">批量视频</h1>
          <div className="text-sm text-textMuted">当前任务内分为四个阶段处理</div>
        </div>
        <div className="flex items-center gap-2 px-6 pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm rounded-full transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-white"
                  : "bg-secondary/50 text-textMuted hover:text-textMain hover:bg-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-border p-4 overflow-y-auto shrink-0 bg-background/60">
          <JobList
            jobs={jobs}
            currentJob={currentJob}
            onSelectJob={handleSelectJob}
            onCreateJob={handleCreateJob}
            onDeleteJob={handleDeleteJob}
            isLoading={isLoading}
          />
        </div>

        {!currentJob ? (
          <div className="flex-1 flex items-center justify-center text-textMuted text-sm">
            请先在左侧创建或选择一个任务，然后进入对应阶段继续处理。
          </div>
        ) : (
          <>
            {activeTab === "storyboard-prep" && (
              <>
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4">
                    {filteredSource && (
                      <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                        <span>已按待处理图片过滤</span>
                        <button
                          type="button"
                          onClick={() => setFilteredSourceId(null)}
                          className="text-sm hover:opacity-80"
                        >
                          显示全部
                        </button>
                      </div>
                    )}
                    <AssetGrid
                      assets={visibleAssets}
                      selectedAssets={selectedAssets}
                      onSelectAsset={(id) => {
                        setSelectedAssets((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) {
                            next.delete(id);
                          } else {
                            next.add(id);
                          }
                          return next;
                        });
                      }}
                      onSelectAll={(ids) => setSelectedAssets(new Set(ids))}
                      onUpdatePrompt={handleUpdateAssetPrompt}
                      onDeleteAsset={handleDeleteAsset}
                      onDeleteSelected={handleDeleteSelectedAssets}
                      onOpenAIPolish={handleOpenAIPolish}
                    />
                  </div>
                </div>

                <div className="w-80 border-l border-border p-4 overflow-y-auto space-y-4 shrink-0">
                  <UploadPanel onUpload={handleUploadAssets} isLoading={isLoading} />
                  <UploadedSourcePanel
                    sources={uploadedSources}
                    onModeChange={handleUpdateSourceMode}
                    onRemove={handleRemoveSource}
                    filteredSourceId={filteredSourceId}
                    onToggleFilter={(id) => setFilteredSourceId((prev) => (prev === id ? null : id))}
                    onClearFilter={() => setFilteredSourceId(null)}
                    onProcess={async (id) => {
                      const source = uploadedSources.find((item) => item.id === id);
                      if (source) await splitSourceToCards(source);
                    }}
                  />
                </div>
              </>
            )}

            {activeTab === "script-prep" && (
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-textMain">剧本准备</h2>
                    <p className="text-sm text-textMuted mt-1">先上传 Excel 并指定目标列，后续每张图片切图前需要在这里交互式选择对应单元格。</p>
                  </div>

                  <div className="rounded-xl border border-border p-6 bg-background space-y-4">
                    <label className="inline-flex px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md cursor-pointer transition-colors">
                      上传 Excel
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleImportExcel(e.target.files[0])}
                      />
                    </label>

                    {excelColumns.length > 0 && (
                      <div className="space-y-3">
                        <label className="block text-xs text-textMuted mb-1">目标列</label>
                        <select
                          value={selectedExcelColumn}
                          onChange={(e) => {
                            setSelectedExcelColumn(e.target.value);
                            rebuildExcelMappings(e.target.value);
                            setShowExcelColumnContent(false);
                          }}
                          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                        >
                          {excelColumns.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => setShowExcelColumnContent((prev) => !prev)}
                          className="px-3 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90"
                        >
                          {showExcelColumnContent ? "隐藏所选列内容" : "显示所选列内容"}
                        </button>
                      </div>
                    )}
                  </div>

                  {showExcelColumnContent && (
                    <div className="rounded-xl border border-border p-6 bg-secondary/20 text-sm text-textMuted space-y-3">
                      <h3 className="text-sm font-semibold text-textMain">所选列内容</h3>
                      {excelMappings.length === 0 ? (
                        <p>请先上传 Excel 并选择目标列。</p>
                      ) : (
                      <div className="space-y-2">
                        {pendingSplitSourceId && (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                            请点击一个包含 9 行内容的单元格，将它绑定给当前待处理图片后再执行拆分。
                          </div>
                        )}
                        {excelMappings.map((cell) => (
                          <div
                            key={cell.id}
                            className="w-full text-left rounded-lg border border-border bg-background p-3 hover:border-primary/40 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-textMuted">第 {cell.rowIndex} 行</span>
                              <div className="flex items-center gap-2">
                                {cell.edited && <span className="text-[11px] text-amber-600">已编辑</span>}
                                <span className={`text-xs ${cell.lines.length === 9 ? "text-green-600" : "text-red-500"}`}>{cell.lines.length} / 9 行</span>
                              </div>
                            </div>
                            {editingCellId === cell.id ? (
                              <textarea
                                value={cell.rawText}
                                onChange={(e) => handleEditExcelCell(cell.id, e.target.value)}
                                className="mt-2 w-full min-h-[140px] rounded-md border border-border bg-background px-3 py-2 text-xs text-textMain whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            ) : (
                              <pre className="mt-2 whitespace-pre-wrap text-xs text-textMain">{cell.rawText}</pre>
                            )}
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSelectExcelCell(cell)}
                                className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90"
                              >
                                绑定到当前图片
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCellId((prev) => (prev === cell.id ? null : cell.id))}
                                className="px-3 py-1.5 text-xs rounded-md bg-secondary hover:bg-secondary/80 text-textMain"
                              >
                                {editingCellId === cell.id ? "完成编辑" : "编辑内容"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "video-gen" && (
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-textMain">视频生成</h2>
                    <p className="text-sm text-textMuted mt-1">选择视频模型和参数，批量生成视频。</p>
                  </div>

                  {/* Video Model Selection */}
                  <div className="rounded-xl border border-border bg-background p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-textMain">视频模型</h3>
                    
                    {videoModels.length === 0 ? (
                      <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                        暂无可用的视频模型，请先在 AI 模型管理中配置视频模型。
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {videoModels.map((model) => (
                          <button
                            key={model.configId}
                            type="button"
                            onClick={() => setSelectedVideoModelId(model.configId)}
                            className={`p-3 rounded-lg border text-left transition-colors ${
                              selectedVideoModelId === model.configId
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="text-sm font-medium text-textMain">{model.displayName}</div>
                            {model.capabilities && (
                              <div className="text-xs text-textMuted mt-1">
                                {model.capabilities.duration_range 
                                  ? `${model.capabilities.duration_range.min}-${model.capabilities.duration_range.max}s`
                                  : "视频生成"}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Duration Selection */}
                    {selectedVideoModel && (
                      <div className="mt-4">
                        <label className="block text-xs text-textMuted mb-2">时长</label>
                        <div className="flex flex-wrap gap-2">
                          {availableDurations.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setVideoDuration(d)}
                              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                                videoDuration === d
                                  ? "bg-primary text-white"
                                  : "bg-secondary hover:bg-secondary/80"
                              }`}
                            >
                              {d}秒
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resolution Selection */}
                    {selectedVideoModel && availableResolutions.length > 0 && (
                      <div className="mt-4">
                        <label className="block text-xs text-textMuted mb-2">分辨率</label>
                        <select
                          value={videoResolution}
                          onChange={(e) => setVideoResolution(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                        >
                          {availableResolutions.map((res) => (
                            <option key={res} value={res}>{res}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Off-Peak Toggle */}
                    {selectedVideoModel && supportsOffPeak && (
                      <div className="mt-4 flex items-center justify-between rounded-lg border border-border px-4 py-3">
                        <div>
                          <p className="text-sm text-textMain">错峰模式</p>
                          <p className="text-xs text-textMuted">降低 API 调用成本</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOffPeak(!offPeak)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            offPeak ? "bg-primary" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                              offPeak ? "translate-x-5" : ""
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Selected Cards Summary & Generate Button */}
                  <div className="rounded-xl border border-border bg-background p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-textMain">
                          已选择 <span className="font-semibold text-primary">{selectedAssets.size}</span> 个分镜
                        </p>
                        {selectedAssets.size > 0 && (
                          <p className="text-xs text-textMuted mt-1">
                            预计生成 {selectedAssets.size} 个视频，每个约 {videoDuration} 秒
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleGenerate}
                        disabled={selectedAssets.size === 0 || !selectedVideoModelId || isLoading}
                        className="px-6 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {isLoading ? "提交中..." : "开始生成视频"}
                      </button>
                    </div>

                    {selectedAssets.size === 0 && (
                      <div className="text-xs text-textMuted bg-secondary/50 p-3 rounded-lg">
                        请先在「分镜准备」页面选择要生成视频的分镜卡片。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "video-preview" && (
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-textMain">视频预览</h2>
                    <p className="text-sm text-textMuted mt-1">查看生成历史、任务状态与结果视频。</p>
                  </div>

                  <div className="rounded-xl border border-border bg-background overflow-hidden">
                    <div className="px-4 py-3 border-b border-border text-sm font-semibold text-textMain">任务卡片</div>
                    <div className="p-4">
                      <VideoPreviewCards
                        cards={previewCards}
                        onReload={async () => {
                          if (currentJob) {
                            await loadPreviewCards(currentJob.id);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AIPolishWizard
        open={showPolishWizard}
        selectedAssets={assets.filter((asset) => selectedAssets.has(asset.id))}
        onClose={() => setShowPolishWizard(false)}
        onComplete={handlePolishComplete}
        onCancel={() => setShowPolishWizard(false)}
      />
    </div>
  );
}
