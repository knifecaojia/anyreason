"use client";

import { useState } from "react";
import { BatchVideoJob, BatchVideoJobConfig } from "../types";

interface ConfigPanelProps {
  job: BatchVideoJob;
  onConfigChange: () => void;
}

export function ConfigPanel({ job, onConfigChange }: ConfigPanelProps) {
  const [config, setConfig] = useState<BatchVideoJobConfig>(job.config as BatchVideoJobConfig);
  const [isSaving, setIsSaving] = useState(false);

  const handleConfigChange = async (key: keyof BatchVideoJobConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    
    setIsSaving(true);
    try {
      await fetch(`/api/batch-video/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: newConfig }),
      });
      onConfigChange();
    } catch (error) {
      console.error("Failed to update config:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-textMain">配置</h2>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-textMuted mb-1">视频模型</label>
          <div className="w-full px-3 py-2 text-sm bg-secondary/40 border border-border rounded-md text-textMuted">
            在点击“生成视频”时选择
          </div>
        </div>

        <div>
          <label className="block text-xs text-textMuted mb-1">时长（秒）</label>
          <select
            value={config.duration}
            onChange={(e) => handleConfigChange("duration", parseInt(e.target.value))}
            disabled={isSaving}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value={5}>5秒</option>
            <option value={10}>10秒</option>
            <option value={15}>15秒</option>
            <option value={30}>30秒</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-textMuted mb-1">分辨率</label>
          <select
            value={config.resolution}
            onChange={(e) => handleConfigChange("resolution", e.target.value)}
            disabled={isSaving}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="1280x720">1280x720 (16:9)</option>
            <option value="1920x1080">1920x1080 (16:9)</option>
            <option value="720x1280">720x1280 (9:16)</option>
            <option value="1080x1920">1080x1920 (9:16)</option>
          </select>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <label className="text-sm text-textMain">错峰模式</label>
            <p className="text-xs text-textMuted">降低API成本</p>
          </div>
          <button
            onClick={() => handleConfigChange("off_peak", !config.off_peak)}
            disabled={isSaving}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              config.off_peak ? "bg-primary" : "bg-gray-300"
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                config.off_peak ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="text-xs text-textMuted space-y-1">
          <p>状态: {job.status === "processing" ? "处理中" : job.status === "completed" ? "已完成" : "草稿"}</p>
          <p>资产: {job.completed_assets}/{job.total_assets}</p>
          <p>创建: {new Date(job.created_at).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
