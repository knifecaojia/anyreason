"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Plus, MessageSquare, Trash2, ChevronRight, ChevronLeft } from "lucide-react";
import { AIChatSessionListItem } from "./types";

interface ChatSessionListProps {
  sessions: AIChatSessionListItem[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onDeleteAllSessions?: () => void;
  isLoading?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const sceneLabels: Record<string, string> = {
  asset_extract: "资产提取",
  scene_extract: "场景提取",
  character_extract: "角色提取",
  storyboard_generate: "分镜生成",
  script_analyze: "剧本分析",
  scene_storyboard: "分镜绘制",
  script_expert: "剧本专家",
};

function truncateText(text: string, maxLength: number) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function ChatSessionList({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onDeleteAllSessions,
  isLoading,
  collapsed = false,
  onToggleCollapse,
}: ChatSessionListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (collapsed) {
    return (
      <div className="w-10 border-l border-border bg-surface flex flex-col items-center py-3 gap-3">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-surfaceHighlight/30 rounded-lg transition-colors text-textMuted hover:text-text"
          title="展开会话列表"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={onNewSession}
          className="p-2 hover:bg-surfaceHighlight/30 rounded-lg transition-colors text-textMuted hover:text-text"
          title="新建会话"
        >
          <Plus size={18} />
        </button>
        <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-1 px-1">
          {sessions.slice(0, 5).map((s) => (
            <button
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSession(s.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectSession(s.id);
              }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                s.id === currentSessionId
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-surfaceHighlight/30 text-textMuted"
              }`}
              title={s.title}
            >
              <MessageSquare size={14} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 border-l border-border bg-surface flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text">会话列表</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewSession}
            className="p-1.5 hover:bg-surfaceHighlight/30 rounded-lg transition-colors text-textMuted hover:text-text"
            title="新建会话"
          >
            <Plus size={16} />
          </button>
          {onDeleteAllSessions && sessions.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("确定要删除所有会话吗？此操作不可恢复。")) {
                  onDeleteAllSessions();
                }
              }}
              className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-textMuted hover:text-red-500"
              title="清空所有会话"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-surfaceHighlight/30 rounded-lg transition-colors text-textMuted hover:text-text"
            title="折叠"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="text-center text-textMuted text-sm py-4">加载中...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-textMuted text-sm py-4">暂无会话</div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`group relative p-2.5 rounded-lg cursor-pointer transition-colors ${
                session.id === currentSessionId
                  ? "bg-primary/10 border border-primary/30"
                  : "hover:bg-surfaceHighlight/30 border border-transparent"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSession(session.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectSession(session.id);
              }}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="flex items-start gap-2">
                <MessageSquare
                  size={14}
                  className={`mt-0.5 flex-shrink-0 ${
                    session.id === currentSessionId ? "text-primary" : "text-textMuted"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text truncate">{session.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-textMuted" title={sceneLabels[session.scene_code] || session.scene_code}>
                      {truncateText(sceneLabels[session.scene_code] || session.scene_code, 6)}
                    </span>
                    <span className="text-xs text-textMuted">·</span>
                    <span className="text-xs text-textMuted">
                      {formatDistanceToNow(new Date(session.updated_at), {
                        addSuffix: false,
                        locale: zhCN,
                      })}
                    </span>
                  </div>
                </div>
              </div>
              {hoveredId === session.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className="absolute right-2 top-2 p-1 hover:bg-red-500/20 rounded transition-colors text-textMuted hover:text-red-500"
                  title="删除会话"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
