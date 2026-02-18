"use client";

import { useMemo } from "react";
import { User, Package, MapPin, Sparkles, FileText } from "lucide-react";

type AssetType = "character" | "prop" | "location" | "vfx";

type AssetData = {
  type: AssetType;
  name: string;
  description?: string;
  keywords?: string[];
  first_appearance_episode?: number;
  meta?: Record<string, unknown>;
};

type AssetCardProps = {
  asset: AssetData;
  compact?: boolean;
};

const typeConfig: Record<AssetType, { icon: typeof User; color: string; bgColor: string; label: string }> = {
  character: {
    icon: User,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    label: "角色",
  },
  prop: {
    icon: Package,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    label: "道具",
  },
  location: {
    icon: MapPin,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    label: "地点",
  },
  vfx: {
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    label: "特效",
  },
};

export function AssetCard({ asset, compact = false }: AssetCardProps) {
  const config = typeConfig[asset.type] || typeConfig.character;
  const Icon = config.icon;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs">
        <Icon size={12} className={config.color} />
        <span className="font-medium text-textMain">{asset.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface border border-border overflow-hidden hover:border-textMuted/50 transition-colors">
      <div className={`px-4 py-3 ${config.bgColor} border-b border-border/50`}>
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${config.bgColor}`}>
            <Icon size={16} className={config.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-textMain truncate">{asset.name}</div>
            <div className={`text-[10px] ${config.color}`}>{config.label}</div>
          </div>
          {asset.first_appearance_episode && (
            <div className="text-[10px] px-2 py-1 rounded-full bg-surface text-textMuted">
              EP{String(asset.first_appearance_episode).padStart(3, "0")}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {asset.description && (
          <p className="text-sm text-textMuted leading-relaxed">{asset.description}</p>
        )}

        {asset.keywords && asset.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {asset.keywords.slice(0, 6).map((kw, idx) => (
              <span
                key={idx}
                className="text-[10px] px-2 py-0.5 rounded-full bg-surfaceHighlight text-textMuted"
              >
                {kw}
              </span>
            ))}
          </div>
        )}

        {asset.meta && Object.keys(asset.meta).length > 0 && (
          <details className="text-[10px]">
            <summary className="cursor-pointer text-textMuted hover:text-textMain">
              查看详情
            </summary>
            <pre className="mt-2 p-2 bg-background rounded-lg overflow-x-auto text-textMuted">
              {JSON.stringify(asset.meta, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

type AssetListProps = {
  assets: AssetData[];
  maxCompact?: number;
};

export function AssetList({ assets, maxCompact = 3 }: AssetListProps) {
  const { characters, props, locations, vfx } = useMemo(() => {
    const chars: AssetData[] = [];
    const prps: AssetData[] = [];
    const locs: AssetData[] = [];
    const vfs: AssetData[] = [];

    for (const a of assets) {
      switch (a.type) {
        case "character":
          chars.push(a);
          break;
        case "prop":
          prps.push(a);
          break;
        case "location":
          locs.push(a);
          break;
        case "vfx":
          vfs.push(a);
          break;
      }
    }

    return { characters: chars, props: prps, locations: locs, vfx: vfs };
  }, [assets]);

  if (assets.length === 0) return null;

  const sections = [
    { data: characters, label: "角色", type: "character" as AssetType },
    { data: props, label: "道具", type: "prop" as AssetType },
    { data: locations, label: "地点", type: "location" as AssetType },
    { data: vfx, label: "特效", type: "vfx" as AssetType },
  ].filter((s) => s.data.length > 0);

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.type}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-textMuted uppercase tracking-wide">
              {section.label}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surfaceHighlight text-textMuted">
              {section.data.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {section.data.slice(0, maxCompact).map((asset, idx) => (
              <AssetCard key={`${asset.type}-${asset.name}-${idx}`} asset={asset} />
            ))}
          </div>
          {section.data.length > maxCompact && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-textMuted hover:text-textMain">
                查看更多 ({section.data.length - maxCompact})
              </summary>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {section.data.slice(maxCompact).map((asset, idx) => (
                  <AssetCard key={`${asset.type}-${asset.name}-${idx}-more`} asset={asset} />
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

type PlanAssetPreviewProps = {
  plan: {
    kind: string;
    preview?: Record<string, unknown>;
  };
};

export function PlanAssetPreview({ plan }: PlanAssetPreviewProps) {
  const assets = useMemo(() => {
    if (plan.kind !== "asset_create") return [];
    const preview = plan.preview || {};
    const files = Array.isArray(preview.files) ? preview.files : [];
    return files.map((f: any) => ({
      type: (f.type || "character") as AssetType,
      name: String(f.name || "未命名"),
      description: undefined,
      keywords: [],
    }));
  }, [plan]);

  if (assets.length === 0) return null;

  return <AssetList assets={assets} maxCompact={2} />;
}
