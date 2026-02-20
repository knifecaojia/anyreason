"use client";

import type { LucideIcon } from "lucide-react";
import { LayoutGrid } from "lucide-react";

export type SettingsTab = { key: string; label: string; icon: LucideIcon };

export function SettingsTabsHeader(props: {
  tabs: SettingsTab[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const { tabs, activeKey, onSelect } = props;

  return (
    <div className="max-w-6xl mx-auto pt-6 pb-2 px-2">
      <div className="flex items-center gap-2 mb-4">
        <LayoutGrid size={16} className="text-primary" />
        <h1 className="text-lg font-bold text-textMain">系统设置</h1>
      </div>
      <div className="flex items-center gap-2 bg-surfaceHighlight border border-border rounded-xl p-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
              activeKey === key ? "bg-surface text-textMain shadow-sm border border-border/50" : "text-textMuted hover:text-textMain"
            }`}
            type="button"
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
