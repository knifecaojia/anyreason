"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Filter, MessageSquare, Plus, RefreshCw, Search, Settings as SettingsIcon, X, Trash2, Edit, Download, Upload } from "lucide-react";
import type { AICategory, AIModelConfig, AIModelBinding, AIModelKeyInfo } from "@/components/actions/ai-model-actions";

import { ModelTestModal } from "./ModelTestModal";

export function ModelsSection(props: {
  activeModelTab: AICategory;
  setActiveModelTab: (value: AICategory) => void;
  setModelForm: (updater: any) => void;
  aiConfigError: string | null;
  aiConfigSubmitting: boolean;
  aiConfigLoading: boolean;
  aiModelConfigs: AIModelConfig[];
  deleteModelConfig: (id: string) => Promise<void>;
  batchDeleteModelConfigs: (ids: string[]) => Promise<void>;
  bindingForm: any;
  setBindingForm: (updater: any) => void;
  submitUpsertBinding: () => Promise<void>;
  aiBindings: AIModelBinding[];
  deleteBinding: (id: string) => Promise<void>;
  openModelTestChat: () => void;
  modelTestChatOpen: boolean;
  closeModelTestChat: () => void;
  resetModelTestChat: () => void;
  modelTestModelConfigId: string;
  setModelTestModelConfigId: (value: string) => void;
  modelTestSubmitting: boolean;
  modelTestError: string | null;
  modelTestMessages: any[];
  modelTestSessionsLoading: boolean;
  modelTestSessions: any[];
  modelTestSessionId: string;
  setModelTestSessionId: (value: string) => void;
  createModelTestSession: (opts: { category: AICategory; aiModelConfigId?: string }) => Promise<unknown>;
  modelTestImageRuns: any[];
  modelTestVideoRuns: any[];
  modelTestLastRaw: unknown;
  modelTestInput: string;
  setModelTestInput: (value: string) => void;
  submitModelTestChat: () => Promise<void>;
  modelTestSessionImageAttachmentNodeIds: string[];
  parseMentionIndices: (text: string) => number[];
  insertModelTestImageMention: (n: number) => void;
  removeModelTestSessionImageAttachment: (nodeId: string) => void;
  addModelTestImages: (files: FileList | null) => void;
  modelTestImagePromptRef: any;
  modelTestImagePrompt: string;
  handlePromptChange: any;
  mentionPopupOpen: boolean;
  mentionPosition: { top: number; left: number } | null;
  handleMentionSelect: (idx: number) => void;
  setMentionPopupOpen: (open: boolean) => void;
  submitModelTestImage: () => Promise<void>;
  modelTestImageResolution: string;
  setModelTestImageResolution: (value: string) => void;
  capParams: Record<string, any>;
  onCapParamsChange: (params: Record<string, any>) => void;
  addModelOpen: boolean;
  setAddModelOpen: (open: boolean) => void;
  catalogSearch: string;
  setCatalogSearch: (value: string) => void;
  catalogManufacturer: string;
  setCatalogManufacturer: (value: string) => void;
  catalogManufacturers: any[];
  vendorColor: (manufacturer: string) => string;
  filteredCatalogItems: any[];
  catalogLoading: boolean;
  configByKey: Map<string, any>;
  openCatalogConfig: (item: any) => void;
  catalogConfigOpen: boolean;
  catalogSelected: any | null;
  closeCatalogConfig: () => void;
  catalogConfigSubmitting: boolean;
  catalogDraft: any;
  setCatalogDraft: (updater: any) => void;
  catalogApiKeyVisible: boolean;
  setCatalogApiKeyVisible: (updater: any) => void;
  getApiKeyUrl: (manufacturer: string) => string;
  catalogConfigError: string | null;
  saveCatalogConfig: () => Promise<void>;
}) {
  const {
    activeModelTab,
    setActiveModelTab,
    setModelForm,
    aiConfigError,
    aiConfigSubmitting,
    aiConfigLoading,
    aiModelConfigs,
    deleteModelConfig,
    batchDeleteModelConfigs,
    bindingForm,
    setBindingForm,
    submitUpsertBinding,
    aiBindings,
    deleteBinding,
    openModelTestChat,
    modelTestChatOpen,
    closeModelTestChat,
    resetModelTestChat,
    modelTestModelConfigId,
    setModelTestModelConfigId,
    modelTestSubmitting,
    modelTestError,
    modelTestMessages,
    modelTestSessionsLoading,
    modelTestSessions,
    modelTestSessionId,
    setModelTestSessionId,
    createModelTestSession,
    modelTestImageRuns,
    modelTestVideoRuns,
    modelTestLastRaw,
    modelTestInput,
    setModelTestInput,
    submitModelTestChat,
    modelTestSessionImageAttachmentNodeIds,
    parseMentionIndices,
    insertModelTestImageMention,
    removeModelTestSessionImageAttachment,
    addModelTestImages,
    modelTestImagePromptRef,
    modelTestImagePrompt,
    handlePromptChange,
    mentionPopupOpen,
    mentionPosition,
    handleMentionSelect,
    setMentionPopupOpen,
    submitModelTestImage,
    modelTestImageResolution,
    setModelTestImageResolution,
    capParams,
    onCapParamsChange,
    addModelOpen,
    setAddModelOpen,
    catalogSearch,
    setCatalogSearch,
    catalogManufacturer,
    setCatalogManufacturer,
    catalogManufacturers,
    vendorColor,
    filteredCatalogItems,
    catalogLoading,
    configByKey,
    openCatalogConfig,
    catalogConfigOpen,
    catalogSelected,
    closeCatalogConfig,
    catalogConfigSubmitting,
    catalogDraft,
    setCatalogDraft,
    catalogApiKeyVisible,
    setCatalogApiKeyVisible,
    getApiKeyUrl,
    catalogConfigError,
    saveCatalogConfig,
  } = props;

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      const res = await fetch("/api/ai/models/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai_models_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      alert("导出失败: " + String(e));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("导入将覆盖现有的同名配置，且 API Key 会重新加密。确定要继续吗？")) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/models/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const json = await res.json();
      const stats = json.data;
      alert(
        `导入成功！\n` +
          `厂商: +${stats.manufacturers.created} / ↻${stats.manufacturers.updated}\n` +
          `模型: +${stats.models.created} / ↻${stats.models.updated}\n` +
          `配置: +${stats.configs.created} / ↻${stats.configs.updated}\n` +
          `绑定: +${stats.bindings.created} / ↻${stats.bindings.updated}`
      );
      window.location.reload();
    } catch (e) {
      alert("导入失败: " + String(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === aiModelConfigs.length && aiModelConfigs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(aiModelConfigs.map((c) => c.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    // window.confirm is handled in batchDeleteModelConfigs
    await batchDeleteModelConfigs(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleEdit = (config: any) => {
    // Try to find original catalog item to get metadata like default_base_url
    const originalItem = filteredCatalogItems.find(
      (i) => i.manufacturer_code === config.manufacturer && i.model_code === config.model,
    );

    // Construct a catalog item compatible object to reuse the modal
    const item = {
      category: config.category,
      manufacturer_code: config.manufacturer,
      manufacturer_name: originalItem?.manufacturer_name || config.manufacturer,
      model_code: config.model,
      model_name: originalItem?.model_name || config.model,
      default_base_url: originalItem?.default_base_url || "",
      is_image_generation: config.category === "image",
      is_video_generation: config.category === "video",
    };
    openCatalogConfig(item);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">AI 模型配置</h2>
          <p className="text-textMuted text-sm">平台级共享：按文本/图片/视频分类维护模型配置与用途绑定。</p>
        </div>
        <div className="flex items-center gap-1 bg-surfaceHighlight p-1 rounded-lg border border-border">
          {(["text", "image", "video"] as AICategory[]).map((c) => (
            <button
              key={c}
              onClick={() => {
                setActiveModelTab(c);
                setModelForm((prev: any) => ({ ...prev, category: c }));
              }}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeModelTab === c ? "bg-surface text-textMain shadow-sm border border-border/50" : "text-textMuted hover:text-textMain"
              }`}
              type="button"
            >
              {c === "text" ? "文本" : c === "image" ? "图片" : "视频"}
            </button>
          ))}
        </div>
      </div>

      {aiConfigError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{aiConfigError}</div>}

      <div className="bg-gradient-to-r from-primary/10 to-blue-500/5 border border-primary/20 rounded-xl p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-textMain">厂商与模型管理</h3>
            <p className="text-sm text-textMuted mt-1">管理 AI 厂商和模型定义，新增厂商或模型后可在下方配置中使用。</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".json"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImport}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm font-bold bg-surfaceHighlight border border-border hover:bg-surfaceHighlight/80 text-textMain px-4 py-2 rounded-lg transition-all"
              type="button"
              disabled={importing}
            >
              {importing ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />} 导入
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 text-sm font-bold bg-surfaceHighlight border border-border hover:bg-surfaceHighlight/80 text-textMain px-4 py-2 rounded-lg transition-all"
              type="button"
            >
              <Download size={16} /> 导出
            </button>
            <Link
              href="/settings/catalog"
              className="flex items-center gap-2 text-sm font-bold bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-all"
            >
              <SettingsIcon size={16} /> 进入管理
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-textMain">新增模型配置</h3>
            <p className="text-sm text-textMuted mt-1">从模型清单点选，进入配置弹窗填写 Base URL / API Key。</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 text-sm font-bold bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-lg transition-all"
                type="button"
              >
                <Trash2 size={16} /> 批量删除 ({selectedIds.size})
              </button>
            )}
            <button
              onClick={openModelTestChat}
              className="flex items-center gap-2 text-sm font-bold bg-surfaceHighlight border border-border hover:border-primary/40 text-textMain px-4 py-2 rounded-lg transition-all disabled:opacity-60"
              type="button"
              disabled={aiConfigSubmitting}
            >
              <MessageSquare size={16} /> 模型测试
            </button>
            <button
              onClick={() => {
                setCatalogSearch("");
                setCatalogManufacturer("all");
                setAddModelOpen(true);
              }}
              className="flex items-center gap-2 text-sm font-bold bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-all"
              type="button"
            >
              <Plus size={16} /> 新增配置
            </button>
          </div>
        </div>
        <div className="text-xs text-textMuted">提示：API Key 会加密保存，不会以明文返回。</div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-textMain">模型配置列表</h3>
        <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={aiModelConfigs.length > 0 && selectedIds.size === aiModelConfigs.length}
                    onChange={toggleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3">厂商</th>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3">Base URL</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">启用</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {aiConfigLoading && (
                <tr>
                  <td className="px-4 py-6 text-textMuted" colSpan={7}>
                    加载中...
                  </td>
                </tr>
              )}
              {!aiConfigLoading && aiModelConfigs.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-textMuted" colSpan={7}>
                    暂无配置。
                  </td>
                </tr>
              )}
              {!aiConfigLoading &&
                aiModelConfigs.map((c) => (
                  <tr key={c.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-textMain">{c.manufacturer}</td>
                    <td className="px-4 py-3 text-xs text-textMain font-mono">{c.model}</td>
                    <td className="px-4 py-3 text-xs text-textMuted font-mono truncate max-w-[18rem]">{c.base_url || "-"}</td>
                    <td className="px-4 py-3 text-xs text-textMuted">
                      {c.api_keys_info && c.api_keys_info.length > 0 
                        ? `多 Key (${c.api_keys_info.length})` 
                        : (c.plaintext_api_key ? "已配置" : "未配置")}
                    </td>
                    <td className="px-4 py-3 text-xs text-textMain">{c.enabled ? "是" : "否"}</td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                      <button
                        className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-primary/50 rounded-lg text-xs font-medium transition-all text-textMain hover:text-primary flex items-center gap-1"
                        type="button"
                        onClick={() => handleEdit(c)}
                      >
                        <Edit size={12} /> 编辑
                      </button>
                      <button
                        className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200 flex items-center gap-1"
                        type="button"
                        onClick={() => void deleteModelConfig(c.id)}
                      >
                        <Trash2 size={12} /> 删除
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-textMain">用途绑定</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-textMuted font-bold">用途 key</label>
            <input
              value={bindingForm.key}
              onChange={(e) => setBindingForm((p: any) => ({ ...p, key: e.target.value }))}
              className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
              placeholder="chatbox / image / video ..."
              disabled={aiConfigSubmitting}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs text-textMuted font-bold">绑定到模型配置</label>
            <select
              value={bindingForm.ai_model_config_id}
              onChange={(e) => setBindingForm((p: any) => ({ ...p, ai_model_config_id: e.target.value }))}
              className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
              disabled={aiConfigSubmitting}
            >
              <option value="">不绑定</option>
              {aiModelConfigs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.manufacturer} · {c.model}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              onClick={() => void submitUpsertBinding()}
              className="bg-primary hover:bg-blue-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
              type="button"
              disabled={aiConfigSubmitting}
            >
              保存绑定
            </button>
          </div>
        </div>

        <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
              <tr>
                <th className="px-4 py-3">key</th>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {aiBindings.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-textMuted" colSpan={3}>
                    暂无绑定。
                  </td>
                </tr>
              )}
              {aiBindings.map((b) => {
                const cfg = aiModelConfigs.find((c) => c.id === b.ai_model_config_id);
                return (
                  <tr key={b.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-textMain font-mono">{b.key}</td>
                    <td className="px-4 py-3 text-xs text-textMuted">{cfg ? `${cfg.manufacturer} · ${cfg.model}` : "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200"
                        type="button"
                        onClick={() => void deleteBinding(b.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ModelTestModal
        open={modelTestChatOpen}
        onClose={closeModelTestChat}
        activeModelTab={activeModelTab}
        aiModelConfigs={aiModelConfigs}
        modelTestModelConfigId={modelTestModelConfigId}
        setModelTestModelConfigId={setModelTestModelConfigId}
        modelTestSubmitting={modelTestSubmitting}
        resetModelTestChat={resetModelTestChat}
        modelTestError={modelTestError}
        modelTestMessages={modelTestMessages}
        modelTestSessionsLoading={modelTestSessionsLoading}
        modelTestSessions={modelTestSessions}
        modelTestSessionId={modelTestSessionId}
        setModelTestSessionId={setModelTestSessionId}
        createModelTestSession={createModelTestSession}
        modelTestImageRuns={modelTestImageRuns}
        modelTestVideoRuns={modelTestVideoRuns}
        modelTestLastRaw={modelTestLastRaw}
        modelTestInput={modelTestInput}
        setModelTestInput={setModelTestInput}
        submitModelTestChat={submitModelTestChat}
        modelTestSessionImageAttachmentNodeIds={modelTestSessionImageAttachmentNodeIds}
        parseMentionIndices={parseMentionIndices}
        insertModelTestImageMention={insertModelTestImageMention}
        removeModelTestSessionImageAttachment={removeModelTestSessionImageAttachment}
        addModelTestImages={addModelTestImages}
        modelTestImagePromptRef={modelTestImagePromptRef}
        modelTestImagePrompt={modelTestImagePrompt}
        handlePromptChange={handlePromptChange}
        mentionPopupOpen={mentionPopupOpen}
        mentionPosition={mentionPosition}
        handleMentionSelect={handleMentionSelect}
        setMentionPopupOpen={setMentionPopupOpen}
        submitModelTestImage={submitModelTestImage}
        modelTestImageResolution={modelTestImageResolution}
        setModelTestImageResolution={setModelTestImageResolution}
        capParams={capParams}
        onCapParamsChange={onCapParamsChange}
      />

      {addModelOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setAddModelOpen(false);
          }}
        >
          <div className="h-full w-full p-4 flex items-center justify-center">
            <div className="w-full max-w-6xl h-[86vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col">
              <div className="h-14 px-6 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
                <div className="font-bold text-base text-textMain">新增模型</div>
                <button
                  type="button"
                  onClick={() => setAddModelOpen(false)}
                  className="p-2 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="px-6 pt-4 pb-6 space-y-4">
                  <div className="flex items-center gap-1">
                    {(["text", "image", "video"] as AICategory[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setActiveModelTab(c)}
                        className={`px-3 py-2 text-sm font-bold border-b-2 transition-colors ${
                          activeModelTab === c ? "border-primary text-primary" : "border-transparent text-textMuted hover:text-textMain"
                        }`}
                      >
                        {c === "text" ? "文本" : c === "image" ? "图像" : "视频"}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                      <input
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm outline-none focus:border-primary text-textMain"
                        placeholder="搜索模型名称或厂商…"
                      />
                    </div>
                    <button
                      type="button"
                      className="w-10 h-10 rounded-lg border border-border bg-background hover:bg-surfaceHighlight transition-colors flex items-center justify-center text-textMuted hover:text-textMain"
                      onClick={() => setCatalogSearch(catalogSearch.trim())}
                    >
                      <Search size={16} />
                    </button>
                  </div>

                  <div className="rounded-xl border border-border bg-background/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-textMain">
                        <Filter size={16} className="text-textMuted" />
                        厂商筛选
                      </div>
                      <button
                        type="button"
                        className="text-xs font-bold text-primary hover:underline"
                        onClick={() => {
                          setCatalogManufacturer("all");
                          setCatalogSearch("");
                        }}
                      >
                        清空筛选
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {catalogManufacturers.map((m) => {
                        const active = catalogManufacturer === m.key;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => setCatalogManufacturer(m.key)}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-colors border ${
                              active ? "bg-primary text-white border-primary" : "bg-background border-border text-textMain hover:bg-surfaceHighlight"
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${m.key === "all" ? "bg-textMuted" : vendorColor(m.key)}`} />
                              {m.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-textMain">
                    找到 {filteredCatalogItems.length} 个模型
                  </div>

                  {aiConfigLoading || catalogLoading ? (
                    <div className="text-sm text-textMuted flex items-center gap-2">
                      <RefreshCw size={16} className="animate-spin" /> 加载模型配置...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {filteredCatalogItems
                        .slice()
                        .sort((a, b) => {
                          const am = a.manufacturer_code.localeCompare(b.manufacturer_code);
                          if (am !== 0) return am;
                          return a.model_code.localeCompare(b.model_code);
                        })
                        .map((item) => {
                          const k = `${item.category}::${item.manufacturer_code}::${item.model_code}`;
                          const cfg = configByKey.get(k);
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => openCatalogConfig(item)}
                              className="rounded-2xl border border-border bg-background hover:bg-surfaceHighlight/40 transition-colors p-4 text-left"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="w-8 h-8 rounded-lg border border-border bg-surfaceHighlight/40 flex items-center justify-center text-primary font-bold">
                                  T
                                </div>
                                <div className="px-2 py-1 rounded-md text-[11px] font-bold border border-border bg-surfaceHighlight/30 text-textMain">
                                  {item.manufacturer_name}
                                </div>
                              </div>
                              <div className="mt-3 font-bold text-sm text-textMain truncate">{item.model_name}</div>
                              <div className="mt-1 text-xs text-textMuted truncate">{cfg?.base_url || item.default_base_url || "默认 Base URL"}</div>
                              <div className="mt-3 flex items-center justify-between text-xs">
                                <div className="text-textMuted">{cfg?.has_api_key ? "已配置 API Key" : "未配置 API Key"}</div>
                                <div className={`font-bold ${cfg?.enabled ? "text-green-300" : "text-textMuted"}`}>{cfg?.enabled ? "启用" : "未启用"}</div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {catalogConfigOpen && catalogSelected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            closeCatalogConfig();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
            <div className="h-12 px-4 border-b border-border flex items-center justify-between">
              <div className="font-bold text-sm truncate">
                配置 {catalogSelected.manufacturer_name} · {catalogSelected.model_name}
              </div>
              <button
                onClick={closeCatalogConfig}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
                type="button"
                disabled={catalogConfigSubmitting}
              >
                关闭
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-textMuted font-bold">模型名称</label>
                <input
                  value={catalogSelected.model_name}
                  readOnly
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none text-textMain font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-textMuted font-bold">Base URL（可选）</label>
                <input
                  value={catalogDraft.base_url}
                  onChange={(e) => setCatalogDraft((p: any) => ({ ...p, base_url: e.target.value }))}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain font-mono"
                  placeholder="留空使用默认"
                  disabled={catalogConfigSubmitting}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-textMuted font-bold">API Key（留空则不改）</label>
                <div className="relative">
                  <input
                    value={catalogDraft.api_key}
                    onChange={(e) => setCatalogDraft((p: any) => ({ ...p, api_key: e.target.value }))}
                    className="w-full bg-surfaceHighlight border border-border rounded-lg pl-3 pr-10 py-3 text-sm outline-none focus:border-primary text-textMain font-mono"
                    placeholder="请输入 API Key"
                    disabled={catalogConfigSubmitting}
                    type={catalogApiKeyVisible ? "text" : "password"}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setCatalogApiKeyVisible((v: boolean) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-background/40 text-textMuted hover:text-textMain transition-colors"
                    disabled={catalogConfigSubmitting}
                  >
                    {catalogApiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-textMuted font-bold">多 API Key 配置（错峰/并发控制）</label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...(catalogDraft.api_keys_info || [])];
                        next.push({ id: Math.random().toString(36).substring(2), api_key: "", concurrency_limit: 1, enabled: true });
                        setCatalogDraft((p: any) => ({ ...p, api_keys_info: next }));
                      }}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                      disabled={catalogConfigSubmitting}
                    >
                      <Plus size={12} /> 添加 Key
                    </button>
                  </div>
                  
                  {(catalogDraft.api_keys_info || []).length > 0 && (
                    <div className="space-y-3 border border-border rounded-xl p-3 bg-background/20 max-h-[200px] overflow-y-auto">
                      {(catalogDraft.api_keys_info as AIModelKeyInfo[]).map((keyInfo, idx) => (
                        <div key={keyInfo.id || idx} className="space-y-2 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <input
                              value={keyInfo.api_key}
                              onChange={(e) => {
                                const next = [...catalogDraft.api_keys_info];
                                next[idx] = { ...keyInfo, api_key: e.target.value };
                                setCatalogDraft((p: any) => ({ ...p, api_keys_info: next }));
                              }}
                              className="flex-1 bg-surfaceHighlight border border-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-primary text-textMain font-mono"
                              placeholder="API Key"
                              disabled={catalogConfigSubmitting}
                              autoComplete="off"
                            />
                            <div className="flex items-center gap-1 bg-surfaceHighlight border border-border rounded-md px-2 py-1">
                              <span className="text-[10px] text-textMuted">并发</span>
                              <input
                                type="number"
                                value={keyInfo.concurrency_limit}
                                onChange={(e) => {
                                  const next = [...catalogDraft.api_keys_info];
                                  next[idx] = { ...keyInfo, concurrency_limit: Number(e.target.value || 1) };
                                  setCatalogDraft((p: any) => ({ ...p, api_keys_info: next }));
                                }}
                                className="w-8 bg-transparent text-xs outline-none text-textMain text-center"
                                min={1}
                                disabled={catalogConfigSubmitting}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = (catalogDraft.api_keys_info as AIModelKeyInfo[]).filter((_: AIModelKeyInfo, i: number) => i !== idx);
                                setCatalogDraft((p: any) => ({ ...p, api_keys_info: next }));
                              }}
                              className="p-1.5 text-textMuted hover:text-red-400"
                              disabled={catalogConfigSubmitting}
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-4 px-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={keyInfo.enabled}
                                onChange={(e) => {
                                  const next = [...catalogDraft.api_keys_info];
                                  next[idx] = { ...keyInfo, enabled: e.target.checked };
                                  setCatalogDraft((p: any) => ({ ...p, api_keys_info: next }));
                                }}
                                disabled={catalogConfigSubmitting}
                                className="rounded-sm border-border"
                              />
                              <span className="text-[10px] text-textMuted">启用</span>
                            </label>
                            <input
                              value={keyInfo.note || ""}
                              onChange={(e) => {
                                const next = [...catalogDraft.api_keys_info];
                                next[idx] = { ...keyInfo, note: e.target.value };
                                setCatalogDraft((p: any) => ({ ...p, api_keys_info: next }));
                              }}
                              className="flex-1 bg-transparent border-0 border-b border-transparent focus:border-border text-[10px] outline-none text-textMuted"
                              placeholder="备注（如：主账号 / 备用）"
                              disabled={catalogConfigSubmitting}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {getApiKeyUrl(catalogSelected.manufacturer_code) ? (
                  <a
                    href={getApiKeyUrl(catalogSelected.manufacturer_code)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-primary hover:underline inline-block"
                  >
                    点击获取 {catalogSelected.manufacturer_name} API Key
                  </a>
                ) : null}
              </div>

              <details className="rounded-xl border border-border bg-background/20 p-3">
                <summary className="cursor-pointer text-sm font-bold text-textMain">高级设置</summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-textMuted font-bold">排序（sort_order）</label>
                    <input
                      value={String(catalogDraft.sort_order)}
                      onChange={(e) => setCatalogDraft((p: any) => ({ ...p, sort_order: Number(e.target.value || 0) }))}
                      className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                      type="number"
                      disabled={catalogConfigSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-textMuted font-bold">启用</label>
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        checked={catalogDraft.enabled}
                        onChange={(e) => setCatalogDraft((p: any) => ({ ...p, enabled: e.target.checked }))}
                        disabled={catalogConfigSubmitting}
                      />
                      <span className="text-sm text-textMain">enabled</span>
                    </div>
                  </div>
                </div>
              </details>

              {catalogConfigError && <div className="text-xs text-red-400 whitespace-pre-wrap">{catalogConfigError}</div>}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                  onClick={closeCatalogConfig}
                  disabled={catalogConfigSubmitting}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2"
                  onClick={() => void saveCatalogConfig()}
                  disabled={catalogConfigSubmitting}
                >
                  {catalogConfigSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} 保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
