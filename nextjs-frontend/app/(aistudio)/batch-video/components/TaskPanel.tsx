"use client";

import { useEffect, useState } from "react";
import { BatchVideoJob, BatchVideoHistory } from "../types";

interface TaskPanelProps {
  job: BatchVideoJob;
}

export function TaskPanel({ job }: TaskPanelProps) {
  const [history, setHistory] = useState<BatchVideoHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/batch-video/history?asset_id=${job.id}`);
        const result = await response.json();
        if (result.code === 200) {
          setHistory(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [job.id]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-gray-100 text-gray-700",
      processing: "bg-blue-100 text-blue-700",
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = {
      pending: "等待中",
      processing: "处理中",
      completed: "已完成",
      failed: "失败",
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-textMain">生成历史</h2>

      {isLoading && history.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-textMuted text-center py-8">暂无生成记录</p>
      ) : (
        <div className="space-y-3">
          {history.map((record) => (
            <div key={record.id} className="p-3 bg-secondary/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                {getStatusBadge(record.status)}
                <span className="text-xs text-textMuted">
                  {new Date(record.created_at).toLocaleString()}
                </span>
              </div>
              
              {record.status === "processing" && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-textMuted mb-1">
                    <span>进度</span>
                    <span>{record.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${record.progress}%` }}
                    />
                  </div>
                </div>
              )}
              
              {record.status === "completed" && record.result_url && (
                <a
                  href={record.result_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-2 text-sm text-primary hover:text-primary/80"
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
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  下载视频
                </a>
              )}
              
              {record.status === "failed" && record.error_message && (
                <p className="mt-2 text-xs text-red-500">{record.error_message}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}