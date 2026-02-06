"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Image,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Upload,
  User,
  Wand2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GoogleGenAI } from "@google/genai";

import { ASSETS } from "@/lib/aistudio/constants";
import type { Asset, AssetType } from "@/lib/aistudio/types";

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "list";
  const targetAssetId = searchParams.get("assetId");

  const [activeTab, setActiveTab] = useState<"ALL" | AssetType>("ALL");
  const [assets, setAssets] = useState<Asset[]>(ASSETS);

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<AssetType>("CHARACTER");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(targetAssetId);

  const tabs = useMemo(
    () =>
      [
        { id: "ALL", label: "全部", icon: null },
        { id: "CHARACTER", label: "角色", icon: User },
        { id: "SCENE", label: "场景", icon: Image },
        { id: "PROP", label: "道具", icon: Box },
        { id: "EFFECT", label: "特效", icon: Wand2 },
      ] satisfies ReadonlyArray<{ id: "ALL" | AssetType; label: string; icon: LucideIcon | null }>,
    [],
  );

  const creatorAssetTypes = useMemo(() => ["CHARACTER", "SCENE", "PROP"] satisfies AssetType[], []);

  useEffect(() => {
    if (targetAssetId) {
      const target = assets.find((a) => a.id === targetAssetId);
      if (target) {
        setAssetType(target.type);
        setPrompt(`High quality visualization of ${target.name}. ${target.tags.join(", ")}.`);
        setSelectedDraftId(targetAssetId);
      }
    }
  }, [targetAssetId, assets]);

  const setQuery = (next: Record<string, string | null | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    });
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleModeChange = (newMode: string, params?: Record<string, string>) => {
    setQuery({ mode: newMode, ...(params || {}), assetId: params?.assetId ?? null });
  };

  const handleGenerateAsset = async () => {
    if (!prompt) return;
    setIsGenerating(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } },
      });

      let imageUrl = "";
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (imageUrl) {
        setGeneratedImage(imageUrl);
      }
    } catch {
      alert("生成失败，请检查配置");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAsset = () => {
    if (!generatedImage) return;

    if (selectedDraftId) {
      setAssets((prev) =>
        prev.map((a) =>
          a.id === selectedDraftId
            ? {
                ...a,
                thumbnail: generatedImage,
                tags: a.tags.filter((t) => t !== "待生成").concat("AI Generated"),
              }
            : a,
        ),
      );
    } else {
      const newAsset: Asset = {
        id: `gen-${Date.now()}`,
        name: `New ${assetType} ${Date.now().toString().slice(-4)}`,
        type: assetType,
        thumbnail: generatedImage,
        tags: ["AI Generated"],
        createdAt: new Date().toISOString().split("T")[0],
      };
      setAssets((prev) => [newAsset, ...prev]);
    }

    setGeneratedImage(null);
    setPrompt("");
    setSelectedDraftId(null);
    handleModeChange("list");
  };

  const filteredAssets = useMemo(() => {
    if (activeTab === "ALL") return assets;
    return assets.filter((a) => a.type === activeTab);
  }, [activeTab, assets]);

  const AssetCard = ({ asset }: { asset: Asset }) => {
    const isDraft = !asset.thumbnail;
    const hasVariants = !!(asset.variants && asset.variants.length > 0);
    const [currentThumb, setCurrentThumb] = useState(asset.thumbnail);

    useEffect(() => {
      setCurrentThumb(asset.thumbnail);
    }, [asset.thumbnail]);

    return (
      <div
        className={`group relative bg-surface rounded-xl overflow-hidden border transition-all cursor-pointer flex flex-col ${
          isDraft
            ? "border-dashed border-textMuted hover:border-primary"
            : "border-border hover:border-primary/50"
        }`}
      >
        <div className="aspect-square relative overflow-hidden bg-surfaceHighlight/30 flex items-center justify-center">
          {isDraft ? (
            <div className="flex flex-col items-center gap-2 text-textMuted opacity-60">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <Wand2 size={20} />
              </div>
              <span className="text-xs">待生成视觉</span>
            </div>
          ) : (
            <>
              <img
                src={currentThumb}
                alt={asset.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center pointer-events-none p-4">
                {hasVariants && (
                  <div className="flex gap-1 mb-2 pointer-events-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentThumb(asset.thumbnail);
                      }}
                      className="w-6 h-6 rounded border border-white/50 overflow-hidden"
                      type="button"
                    >
                      <img
                        src={asset.thumbnail}
                        className="w-full h-full object-cover"
                        alt="Variant"
                      />
                    </button>
                    {asset.variants?.map((v) => (
                      <button
                        key={v.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentThumb(v.thumbnail);
                        }}
                        className="w-6 h-6 rounded border border-white/50 overflow-hidden"
                        type="button"
                      >
                        <img
                          src={v.thumbnail}
                          className="w-full h-full object-cover"
                          alt={v.name}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-white bg-white/10 backdrop-blur border border-white/20 px-3 py-1 rounded text-xs font-medium">
                  查看详情
                </span>
              </div>
            </>
          )}
        </div>

        <div className="p-3 flex flex-col flex-1">
          <div className="flex items-center justify-between">
            <h4
              className={`text-sm font-medium truncate ${
                isDraft ? "text-textMuted italic" : "text-textMain"
              }`}
            >
              {asset.name}
            </h4>
            {hasVariants && (
              <div title={`${asset.variants?.length} variants`}>
                <Layers size={14} className="text-primary" />
              </div>
            )}
          </div>

          <div className="flex gap-1 mt-2 flex-wrap mb-2">
            {asset.tags.map((tag) => (
              <span
                key={tag}
                className={`text-[10px] px-1.5 rounded ${
                  tag === "待生成"
                    ? "text-yellow-400 bg-yellow-400/10"
                    : "text-accent bg-accent/10"
                }`}
              >
                {tag}
              </span>
            ))}
          </div>

          {isDraft && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange("create", { assetId: asset.id });
              }}
              className="mt-auto w-full py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
              type="button"
            >
              <Wand2 size={12} /> 去生成
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in">
      <div className="flex justify-between items-center border-b border-border pb-4">
        <div className="flex gap-6">
          <button
            onClick={() => handleModeChange("list")}
            className={`text-lg font-bold transition-colors ${
              mode === "list" ? "text-primary" : "text-textMuted hover:text-textMain"
            }`}
            type="button"
          >
            资产清单 (Library)
          </button>
          <button
            onClick={() => handleModeChange("create")}
            className={`text-lg font-bold transition-colors ${
              mode === "create"
                ? "text-primary"
                : "text-textMuted hover:text-textMain"
            }`}
            type="button"
          >
            资产创作 (Studio)
          </button>
        </div>

        {mode === "list" && (
          <div className="flex gap-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted"
                size={16}
              />
              <input
                type="text"
                placeholder="检索资产..."
                className="bg-surface border border-border rounded-lg pl-9 pr-4 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none text-textMain w-64"
              />
            </div>
            <button
              className="p-2 border border-border rounded-lg text-textMuted hover:bg-surfaceHighlight hover:text-textMain transition-colors"
              type="button"
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        )}
      </div>

      {mode === "list" && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-surface text-textMain shadow-md border border-border"
                      : "text-textMuted hover:text-textMain hover:bg-surfaceHighlight"
                  }`}
                  type="button"
                >
                  {Icon && <Icon size={14} />}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-10">
            <button
              onClick={() => handleModeChange("create")}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-surface/50 transition-all flex flex-col items-center justify-center cursor-pointer text-textMuted hover:text-primary gap-2 group"
              type="button"
            >
              <div className="w-12 h-12 rounded-full bg-surfaceHighlight group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                <Plus size={24} />
              </div>
              <span className="text-xs font-medium">新建资产</span>
            </button>

            {filteredAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        </div>
      )}

      {mode === "create" && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-6 overflow-y-auto">
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-textMain">
                <Wand2 size={20} className="text-primary" /> 资产生成配置
              </h3>

              {selectedDraftId && (
                <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-3">
                  <div className="text-xs text-blue-300">
                    正在为{" "}
                    <span className="font-bold text-white">
                      {assets.find((a) => a.id === selectedDraftId)?.name}
                    </span>{" "}
                    生成视觉资产
                  </div>
                  <button
                    onClick={() => {
                      setSelectedDraftId(null);
                      setPrompt("");
                      setQuery({ assetId: null });
                    }}
                    className="ml-auto text-blue-300 hover:text-white"
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMuted">资产类型</label>
                  <div className="grid grid-cols-3 gap-2">
                    {creatorAssetTypes.map((t) => (
                      <button
                        key={t}
                        onClick={() => setAssetType(t)}
                        disabled={!!selectedDraftId}
                        className={`py-2 text-xs font-medium rounded border transition-all ${
                          assetType === t
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-surfaceHighlight border-border text-textMuted disabled:opacity-50"
                        }`}
                        type="button"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMuted">
                    生成提示词 (Prompt)
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full h-40 bg-surfaceHighlight/50 border border-border rounded-xl p-3 text-sm focus:border-primary outline-none resize-none text-textMain"
                    placeholder="描述你想生成的资产细节..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMuted">标签 (Tags)</label>
                  <div className="flex items-center gap-2 bg-surfaceHighlight/30 border border-border rounded-lg px-3 py-2">
                    <Tag size={14} className="text-textMuted" />
                    <input
                      className="bg-transparent text-xs text-textMain outline-none w-full"
                      placeholder="输入标签，用逗号分隔..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-textMuted">
                    参考图 (Image-to-Image)
                  </label>
                  <div className="h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-textMuted hover:border-primary/50 hover:bg-surfaceHighlight/20 cursor-pointer transition-colors">
                    <Upload size={20} className="mb-2" />
                    <span className="text-xs">点击上传或拖拽图片</span>
                  </div>
                </div>

                <button
                  onClick={handleGenerateAsset}
                  disabled={isGenerating || !prompt}
                  className="w-full py-3 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  type="button"
                >
                  {isGenerating ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  生成资产
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-background border border-border rounded-2xl flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />

            {generatedImage ? (
              <div className="relative w-full h-full p-8 flex flex-col items-center justify-center animate-fade-in">
                <img
                  src={generatedImage}
                  className="max-w-full max-h-[80%] rounded-xl shadow-2xl object-contain border border-border/50"
                  alt="Generated"
                />

                <div className="absolute bottom-8 flex gap-4">
                  <button
                    onClick={() => setGeneratedImage(null)}
                    className="px-6 py-2 bg-surface border border-border rounded-full hover:bg-surfaceHighlight transition-colors flex items-center gap-2 text-sm text-textMain"
                    type="button"
                  >
                    <RefreshCw size={14} /> 放弃
                  </button>
                  <button
                    onClick={handleSaveAsset}
                    className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-full shadow-lg flex items-center gap-2 text-sm font-bold transition-colors"
                    type="button"
                  >
                    <Box size={14} /> {selectedDraftId ? "更新资产" : "存入资产库"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-textMuted space-y-2">
                <div className="w-16 h-16 bg-surfaceHighlight rounded-full flex items-center justify-center mx-auto mb-4">
                  <Image size={32} className="opacity-50" />
                </div>
                <p className="font-medium">预览区域</p>
                <p className="text-xs max-w-xs mx-auto opacity-60">
                  AI 生成的结果将显示在这里，您可以预览并决定是否存入系统资产库。
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
