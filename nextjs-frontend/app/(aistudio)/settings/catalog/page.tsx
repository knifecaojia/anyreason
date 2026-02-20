"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  aiAdminCreateManufacturer,
  aiAdminCreateModel,
  aiAdminDeleteManufacturer,
  aiAdminDeleteModel,
  aiAdminListManufacturers,
  aiAdminListModels,
  aiAdminUpdateManufacturer,
  aiAdminUpdateModel,
  AIManufacturer,
  AIModel,
} from "@/components/actions/ai-catalog-actions";

type Category = "text" | "image" | "video";

const CATEGORY_LABELS: Record<Category, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
};

const CATEGORY_PROVIDER_HINTS: Record<Category, string[]> = {
  text: ["OpenAITextProvider"],
  image: ["KlingImageProvider", "GeminiImageProvider", "OpenAIImageProvider"],
  video: ["KlingVideoProvider"],
};

export default function AICatalogSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = (searchParams.get("category") as Category) || "text";

  const [activeCategory, setActiveCategory] = useState<Category>(initialCategory);
  const [manufacturers, setManufacturers] = useState<AIManufacturer[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [manufacturerSearch, setManufacturerSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<string | null>(null);

  const [editManufacturerOpen, setEditManufacturerOpen] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState<AIManufacturer | null>(null);
  const [manufacturerForm, setManufacturerForm] = useState({
    code: "",
    name: "",
    provider_class: "",
    default_base_url: "",
    logo_url: "",
    description: "",
    enabled: true,
    sort_order: 0,
  });
  const [manufacturerSubmitting, setManufacturerSubmitting] = useState(false);
  const [manufacturerError, setManufacturerError] = useState<string | null>(null);

  const [editModelOpen, setEditModelOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [modelForm, setModelForm] = useState({
    code: "",
    name: "",
    response_format: "schema" as "schema" | "object",
    supports_image: false,
    supports_think: false,
    supports_tool: true,
    context_window: "",
    enabled: true,
    sort_order: 0,
  });
  const [modelSubmitting, setModelSubmitting] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mfrRes, mdlRes] = await Promise.all([
        aiAdminListManufacturers(activeCategory),
        aiAdminListModels(undefined, activeCategory),
      ]);
      if (mfrRes.code !== 200) throw new Error(mfrRes.msg);
      if (mdlRes.code !== 200) throw new Error(mdlRes.msg);
      setManufacturers(mfrRes.data || []);
      setModels(mdlRes.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    void refreshData();
    setSelectedManufacturerId(null);
  }, [activeCategory, refreshData]);

  const filteredManufacturers = useMemo(() => {
    if (!manufacturerSearch) return manufacturers;
    const q = manufacturerSearch.toLowerCase();
    return manufacturers.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.provider_class || "").toLowerCase().includes(q),
    );
  }, [manufacturers, manufacturerSearch]);

  const filteredModels = useMemo(() => {
    let list = models;
    if (selectedManufacturerId) {
      list = list.filter((m) => m.manufacturer_id === selectedManufacturerId);
    }
    if (!modelSearch) return list;
    const q = modelSearch.toLowerCase();
    return list.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.manufacturer?.name || "").toLowerCase().includes(q),
    );
  }, [models, selectedManufacturerId, modelSearch]);

  const openCreateManufacturer = () => {
    setEditingManufacturer(null);
    setManufacturerForm({
      code: "",
      name: "",
      provider_class: CATEGORY_PROVIDER_HINTS[activeCategory][0] || "",
      default_base_url: "",
      logo_url: "",
      description: "",
      enabled: true,
      sort_order: 0,
    });
    setManufacturerError(null);
    setEditManufacturerOpen(true);
  };

  const openEditManufacturer = (mfr: AIManufacturer) => {
    setEditingManufacturer(mfr);
    setManufacturerForm({
      code: mfr.code,
      name: mfr.name,
      provider_class: mfr.provider_class || "",
      default_base_url: mfr.default_base_url || "",
      logo_url: mfr.logo_url || "",
      description: mfr.description || "",
      enabled: mfr.enabled,
      sort_order: mfr.sort_order,
    });
    setManufacturerError(null);
    setEditManufacturerOpen(true);
  };

  const saveManufacturer = async () => {
    setManufacturerSubmitting(true);
    setManufacturerError(null);
    try {
      if (editingManufacturer) {
        const res = await aiAdminUpdateManufacturer(editingManufacturer.id, {
          code: manufacturerForm.code || undefined,
          name: manufacturerForm.name || undefined,
          provider_class: manufacturerForm.provider_class || null,
          default_base_url: manufacturerForm.default_base_url || null,
          logo_url: manufacturerForm.logo_url || null,
          description: manufacturerForm.description || null,
          enabled: manufacturerForm.enabled,
          sort_order: manufacturerForm.sort_order,
        });
        if (res.code !== 200) throw new Error(res.msg);
      } else {
        if (!manufacturerForm.code || !manufacturerForm.name) {
          throw new Error("厂商标识和名称为必填项");
        }
        const res = await aiAdminCreateManufacturer({
          code: manufacturerForm.code,
          name: manufacturerForm.name,
          category: activeCategory,
          provider_class: manufacturerForm.provider_class || undefined,
          default_base_url: manufacturerForm.default_base_url || undefined,
          logo_url: manufacturerForm.logo_url || undefined,
          description: manufacturerForm.description || undefined,
          enabled: manufacturerForm.enabled,
          sort_order: manufacturerForm.sort_order,
        });
        if (res.code !== 200) throw new Error(res.msg);
      }
      setEditManufacturerOpen(false);
      await refreshData();
    } catch (err) {
      setManufacturerError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setManufacturerSubmitting(false);
    }
  };

  const deleteManufacturer = async (mfr: AIManufacturer) => {
    if (!confirm(`确定删除厂商「${mfr.name}」？关联的模型也会被删除。`)) return;
    try {
      const res = await aiAdminDeleteManufacturer(mfr.id);
      if (res.code !== 200) throw new Error(res.msg);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const openCreateModel = (preselectManufacturerId?: string) => {
    setEditingModel(null);
    setModelForm({
      code: "",
      name: "",
      response_format: "schema",
      supports_image: false,
      supports_think: false,
      supports_tool: true,
      context_window: "",
      enabled: true,
      sort_order: 0,
    });
    setModelError(null);
    if (preselectManufacturerId) {
      setSelectedManufacturerId(preselectManufacturerId);
    }
    setEditModelOpen(true);
  };

  const openEditModel = (mdl: AIModel) => {
    setEditingModel(mdl);
    setModelForm({
      code: mdl.code,
      name: mdl.name,
      response_format: mdl.response_format as "schema" | "object",
      supports_image: mdl.supports_image,
      supports_think: mdl.supports_think,
      supports_tool: mdl.supports_tool,
      context_window: mdl.context_window?.toString() || "",
      enabled: mdl.enabled,
      sort_order: mdl.sort_order,
    });
    setModelError(null);
    setEditModelOpen(true);
  };

  const saveModel = async () => {
    setModelSubmitting(true);
    setModelError(null);
    try {
      const manufacturerId = selectedManufacturerId || models.find((m) => m.id === editingModel?.id)?.manufacturer_id;
      if (!editingModel && !manufacturerId) {
        throw new Error("请先选择一个厂商");
      }
      if (!modelForm.code || !modelForm.name) {
        throw new Error("模型标识和名称为必填项");
      }
      if (editingModel) {
        const res = await aiAdminUpdateModel(editingModel.id, {
          code: modelForm.code || undefined,
          name: modelForm.name || undefined,
          response_format: modelForm.response_format,
          supports_image: modelForm.supports_image,
          supports_think: modelForm.supports_think,
          supports_tool: modelForm.supports_tool,
          context_window: modelForm.context_window ? parseInt(modelForm.context_window, 10) : null,
          enabled: modelForm.enabled,
          sort_order: modelForm.sort_order,
        });
        if (res.code !== 200) throw new Error(res.msg);
      } else {
        const res = await aiAdminCreateModel({
          manufacturer_id: manufacturerId!,
          code: modelForm.code,
          name: modelForm.name,
          response_format: modelForm.response_format,
          supports_image: modelForm.supports_image,
          supports_think: modelForm.supports_think,
          supports_tool: modelForm.supports_tool,
          context_window: modelForm.context_window ? parseInt(modelForm.context_window, 10) : undefined,
          enabled: modelForm.enabled,
          sort_order: modelForm.sort_order,
        });
        if (res.code !== 200) throw new Error(res.msg);
      }
      setEditModelOpen(false);
      await refreshData();
    } catch (err) {
      setModelError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setModelSubmitting(false);
    }
  };

  const deleteModel = async (mdl: AIModel) => {
    if (!confirm(`确定删除模型「${mdl.name}」？`)) return;
    try {
      const res = await aiAdminDeleteModel(mdl.id);
      if (res.code !== 200) throw new Error(res.msg);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const selectedManufacturer = selectedManufacturerId
    ? manufacturers.find((m) => m.id === selectedManufacturerId)
    : null;

  return (
    <div className="min-h-screen bg-background text-textMain">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/settings?tab=models"
            className="inline-flex items-center gap-2 text-textMuted hover:text-textMain text-sm mb-4 transition-colors"
          >
            <ArrowLeft size={16} /> 返回设置
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-textMain">厂商与模型管理</h1>
              <p className="text-textMuted text-sm mt-1">
                管理 AI 厂商和模型定义，新增或编辑后可在「模型配置」中使用。
              </p>
            </div>
            <button
              onClick={() => void refreshData()}
              disabled={loading}
              className="flex items-center gap-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {(["text", "image", "video"] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                router.replace(`/settings/catalog?category=${cat}`, { scroll: false });
              }}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeCategory === cat
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "bg-surface border border-border text-textMuted hover:text-textMain hover:border-primary/40"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 text-textMuted">
            <Loader2 size={24} className="animate-spin mr-2" /> 加载中...
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-textMain">厂商列表</h2>
                  <p className="text-xs text-textMuted mt-0.5">
                    共 {filteredManufacturers.length} 个厂商
                  </p>
                </div>
                <button
                  onClick={openCreateManufacturer}
                  className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-all"
                >
                  <Plus size={14} /> 新增
                </button>
              </div>

              <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={14} />
                  <input
                    type="text"
                    placeholder="搜索厂商..."
                    value={manufacturerSearch}
                    onChange={(e) => setManufacturerSearch(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                  />
                </div>
              </div>

              <div className="max-h-[480px] overflow-y-auto">
                {filteredManufacturers.length === 0 ? (
                  <div className="px-5 py-8 text-center text-textMuted text-sm">暂无厂商</div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredManufacturers.map((mfr) => (
                      <div
                        key={mfr.id}
                        onClick={() => setSelectedManufacturerId(mfr.id)}
                        className={`px-5 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                          selectedManufacturerId === mfr.id
                            ? "bg-primary/10 border-l-2 border-l-primary"
                            : "hover:bg-surfaceHighlight/50 border-l-2 border-l-transparent"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-textMain truncate">{mfr.name}</span>
                            {!mfr.enabled && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">禁用</span>
                            )}
                          </div>
                          <div className="text-xs text-textMuted font-mono mt-0.5">
                            {mfr.code}
                            {mfr.provider_class && ` · ${mfr.provider_class}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditManufacturer(mfr);
                            }}
                            className="p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteManufacturer(mfr);
                            }}
                            className="p-1.5 rounded-lg text-textMuted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-textMain">
                    模型列表
                    {selectedManufacturer && (
                      <span className="text-textMuted font-normal text-sm ml-2">
                        · {selectedManufacturer.name}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-textMuted mt-0.5">
                    共 {filteredModels.length} 个模型
                    {selectedManufacturer && (
                      <button
                        onClick={() => setSelectedManufacturerId(null)}
                        className="ml-2 text-primary hover:underline"
                      >
                        显示全部
                      </button>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => openCreateModel()}
                  disabled={!selectedManufacturerId && !selectedManufacturer}
                  className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} /> 新增
                </button>
              </div>

              <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={14} />
                  <input
                    type="text"
                    placeholder="搜索模型..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                  />
                </div>
              </div>

              <div className="max-h-[480px] overflow-y-auto">
                {filteredModels.length === 0 ? (
                  <div className="px-5 py-8 text-center text-textMuted text-sm">
                    {selectedManufacturerId ? "该厂商暂无模型" : "暂无模型"}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredModels.map((mdl) => (
                      <div key={mdl.id} className="px-5 py-3 flex items-center justify-between hover:bg-surfaceHighlight/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-textMain">{mdl.name}</span>
                            {!mdl.enabled && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">禁用</span>
                            )}
                            {mdl.supports_image && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">图像</span>
                            )}
                            {mdl.supports_think && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">思考</span>
                            )}
                            {mdl.supports_tool && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">工具</span>
                            )}
                          </div>
                          <div className="text-xs text-textMuted font-mono mt-0.5">
                            {mdl.code}
                            {!selectedManufacturerId && mdl.manufacturer && (
                              <span className="ml-2 text-textMuted">· {mdl.manufacturer.name}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => openEditModel(mdl)}
                            className="p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => void deleteModel(mdl)}
                            className="p-1.5 rounded-lg text-textMuted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {editManufacturerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-textMain">
                {editingManufacturer ? "编辑厂商" : "新增厂商"}
              </h3>
              <button
                onClick={() => setEditManufacturerOpen(false)}
                className="p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {manufacturerError && (
              <div className="mx-6 mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg p-3 text-sm">
                {manufacturerError}
              </div>
            )}

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">
                  厂商标识 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={manufacturerForm.code}
                  onChange={(e) => setManufacturerForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="如 openai, deepseek"
                  disabled={!!editingManufacturer}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">
                  显示名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={manufacturerForm.name}
                  onChange={(e) => setManufacturerForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="如 OpenAI, DeepSeek"
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">Provider 类</label>
                <div className="relative">
                  <input
                    type="text"
                    value={manufacturerForm.provider_class}
                    onChange={(e) => setManufacturerForm((p) => ({ ...p, provider_class: e.target.value }))}
                    placeholder="如 OpenAITextProvider"
                    list={`provider-options-${activeCategory}`}
                    className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                  />
                  <datalist id={`provider-options-${activeCategory}`}>
                    {CATEGORY_PROVIDER_HINTS[activeCategory].map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">默认 Base URL</label>
                <input
                  type="text"
                  value={manufacturerForm.default_base_url}
                  onChange={(e) => setManufacturerForm((p) => ({ ...p, default_base_url: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">Logo URL</label>
                <input
                  type="text"
                  value={manufacturerForm.logo_url}
                  onChange={(e) => setManufacturerForm((p) => ({ ...p, logo_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">描述</label>
                <textarea
                  value={manufacturerForm.description}
                  onChange={(e) => setManufacturerForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="厂商描述..."
                  rows={2}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain resize-none"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manufacturerForm.enabled}
                    onChange={(e) => setManufacturerForm((p) => ({ ...p, enabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-border bg-surfaceHighlight accent-primary"
                  />
                  <span className="text-sm text-textMain">启用</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-textMain">排序</label>
                  <input
                    type="number"
                    value={manufacturerForm.sort_order}
                    onChange={(e) => setManufacturerForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))}
                    className="w-20 bg-surfaceHighlight border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary text-textMain"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setEditManufacturerOpen(false)}
                className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void saveManufacturer()}
                disabled={manufacturerSubmitting}
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {manufacturerSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {editModelOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-textMain">
                {editingModel ? "编辑模型" : "新增模型"}
                {selectedManufacturer && !editingModel && (
                  <span className="text-textMuted font-normal text-sm ml-2">· {selectedManufacturer.name}</span>
                )}
              </h3>
              <button
                onClick={() => setEditModelOpen(false)}
                className="p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHighlight transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {modelError && (
              <div className="mx-6 mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg p-3 text-sm">
                {modelError}
              </div>
            )}

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">
                  模型标识 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={modelForm.code}
                  onChange={(e) => setModelForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="如 gpt-4o, deepseek-chat"
                  disabled={!!editingModel}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">
                  显示名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={modelForm.name}
                  onChange={(e) => setModelForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="如 GPT-4o, DeepSeek Chat"
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">响应格式</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="response_format"
                      value="schema"
                      checked={modelForm.response_format === "schema"}
                      onChange={() => setModelForm((p) => ({ ...p, response_format: "schema" }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm text-textMain">Schema (结构化)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="response_format"
                      value="object"
                      checked={modelForm.response_format === "object"}
                      onChange={() => setModelForm((p) => ({ ...p, response_format: "object" }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm text-textMain">Object (JSON)</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.supports_image}
                    onChange={(e) => setModelForm((p) => ({ ...p, supports_image: e.target.checked }))}
                    className="w-4 h-4 rounded border-border bg-surfaceHighlight accent-primary"
                  />
                  <span className="text-sm text-textMain">支持图像</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.supports_think}
                    onChange={(e) => setModelForm((p) => ({ ...p, supports_think: e.target.checked }))}
                    className="w-4 h-4 rounded border-border bg-surfaceHighlight accent-primary"
                  />
                  <span className="text-sm text-textMain">支持思考链</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.supports_tool}
                    onChange={(e) => setModelForm((p) => ({ ...p, supports_tool: e.target.checked }))}
                    className="w-4 h-4 rounded border-border bg-surfaceHighlight accent-primary"
                  />
                  <span className="text-sm text-textMain">支持工具调用</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-textMain mb-1.5">上下文窗口</label>
                <input
                  type="text"
                  value={modelForm.context_window}
                  onChange={(e) => setModelForm((p) => ({ ...p, context_window: e.target.value }))}
                  placeholder="如 128000"
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-textMain"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.enabled}
                    onChange={(e) => setModelForm((p) => ({ ...p, enabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-border bg-surfaceHighlight accent-primary"
                  />
                  <span className="text-sm text-textMain">启用</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-textMain">排序</label>
                  <input
                    type="number"
                    value={modelForm.sort_order}
                    onChange={(e) => setModelForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))}
                    className="w-20 bg-surfaceHighlight border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary text-textMain"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setEditModelOpen(false)}
                className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void saveModel()}
                disabled={modelSubmitting}
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {modelSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
