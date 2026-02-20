"use client";

import { useState, useMemo } from "react";
import { Terminal, ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle, LucideIcon } from "lucide-react";
import { TraceEvent } from "./types";

interface TraceCollapseProps {
  trace: TraceEvent[];
  defaultExpanded?: boolean;
}

const eventTypeIcons: Record<string, LucideIcon> = {
  tool_call_start: Wrench,
  tool_call_done: CheckCircle,
  tool_call_error: XCircle,
  tool_agent_run_start: Wrench,
  tool_agent_run_done: CheckCircle,
  tool_event: Terminal,
};

const eventTypeColors: Record<string, string> = {
  tool_call_start: "text-amber-400",
  tool_call_done: "text-green-400",
  tool_call_error: "text-red-400",
  tool_agent_run_start: "text-blue-400",
  tool_agent_run_done: "text-green-400",
  tool_event: "text-textMuted",
};

function formatEventTime(ts: string | number | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function getStringProp(event: TraceEvent, key: string): string | undefined {
  const val = event[key];
  return typeof val === "string" ? val : undefined;
}

function getEventSummary(event: TraceEvent): string {
  const type = getStringProp(event, "type") || getStringProp(event, "event_type") || "";
  switch (type) {
    case "tool_call_start":
      return `调用 ${getStringProp(event, "tool_id") || getStringProp(event, "tool_name") || "工具"}`;
    case "tool_call_done":
      return `完成 ${getStringProp(event, "tool_id") || getStringProp(event, "tool_name") || "工具"}`;
    case "tool_call_error":
      return `错误 ${getStringProp(event, "tool_id") || getStringProp(event, "tool_name") || "工具"}: ${getStringProp(event, "error") || ""}`.slice(0, 50);
    case "tool_agent_run_start":
      return `启动代理 ${getStringProp(event, "agent_code") || getStringProp(event, "agent_name") || ""}`;
    case "tool_agent_run_done":
      return `代理完成 ${getStringProp(event, "agent_code") || getStringProp(event, "agent_name") || ""}`;
    default:
      return type;
  }
}

export function TraceCollapse({ trace, defaultExpanded = false }: TraceCollapseProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const events = useMemo(() => {
    if (!Array.isArray(trace)) return [];
    return trace;
  }, [trace]);

  if (events.length === 0) return null;

  return (
    <div className="my-2 rounded-lg border border-border bg-surface/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-surfaceHighlight/20 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-textMuted" />
        ) : (
          <ChevronRight size={14} className="text-textMuted" />
        )}
        <Terminal size={14} className="text-textMuted" />
        <span className="text-xs text-textMuted flex-1">
          Trace ({events.length} 事件)
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border bg-background/30 max-h-48 overflow-y-auto">
          <div className="p-2 space-y-1 font-mono text-[11px]">
            {events.map((event, idx) => {
              const type = getStringProp(event, "type") || getStringProp(event, "event_type") || "unknown";
              const Icon = eventTypeIcons[type] || Terminal;
              const color = eventTypeColors[type] || "text-textMuted";
              const tsRaw = event.timestamp || event.ts || event.created_at;
              const tsValue = typeof tsRaw === "string" || typeof tsRaw === "number" ? tsRaw : undefined;

              return (
                <div key={idx} className="flex items-start gap-2 py-1 px-1 rounded hover:bg-surfaceHighlight/20">
                  <Icon size={12} className={`mt-0.5 flex-shrink-0 ${color}`} />
                  {tsValue && (
                    <span className="text-textMuted/70 flex-shrink-0">
                      {formatEventTime(tsValue)}
                    </span>
                  )}
                  <span className="text-textMuted truncate">
                    {getEventSummary(event)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
