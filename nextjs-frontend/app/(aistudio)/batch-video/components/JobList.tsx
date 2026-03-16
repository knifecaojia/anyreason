"use client";

import { useState } from "react";
import { BatchVideoJob } from "../types";

interface JobListProps {
  jobs: BatchVideoJob[];
  currentJob: BatchVideoJob | null;
  onSelectJob: (job: BatchVideoJob) => void;
  onCreateJob: (title: string, config: any) => void;
  onDeleteJob: (jobId: string) => void;
  isLoading: boolean;
}

export function JobList({
  jobs,
  currentJob,
  onSelectJob,
  onCreateJob,
  onDeleteJob,
  isLoading,
}: JobListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleCreate = () => {
    if (newTitle.trim()) {
      onCreateJob(newTitle.trim(), {
        model: "vidu",
        duration: 5,
        resolution: "1280x720",
        off_peak: false,
      });
      setNewTitle("");
      setShowCreate(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      processing: "bg-blue-100 text-blue-700",
      completed: "bg-green-100 text-green-700",
      archived: "bg-yellow-100 text-yellow-700",
    };
    const labels: Record<string, string> = {
      draft: "草稿",
      processing: "处理中",
      completed: "已完成",
      archived: "已归档",
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.draft}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-textMain">任务列表</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm text-primary hover:text-primary/80"
        >
          + 新建
        </button>
      </div>

      {showCreate && (
        <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
          <input
            type="text"
            placeholder="输入任务名称"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || isLoading}
              className="flex-1 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              创建
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewTitle("");
              }}
              className="flex-1 px-3 py-1.5 text-sm bg-secondary rounded-md hover:bg-secondary/80"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {jobs.length === 0 ? (
          <p className="text-sm text-textMuted text-center py-8">暂无任务</p>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => onSelectJob(job)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                currentJob?.id === job.id
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-secondary/30 hover:bg-secondary/50 border border-transparent"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-textMain truncate">{job.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(job.status)}
                    <span className="text-xs text-textMuted">
                      {job.completed_assets}/{job.total_assets}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("确定删除此任务吗？")) {
                      onDeleteJob(job.id);
                    }
                  }}
                  className="p-1 text-textMuted hover:text-red-500 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}