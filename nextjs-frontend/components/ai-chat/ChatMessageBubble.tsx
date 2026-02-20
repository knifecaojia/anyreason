"use client";

import { useState } from "react";
import { User, Bot } from "lucide-react";
import { AIChatMessage, PlanData } from "./types";
import { PlansCard, PlansCardInline } from "./PlansCard";
import { TraceCollapse } from "./TraceCollapse";

interface ChatMessageBubbleProps {
  message: AIChatMessage;
  onExecutePlans?: (plans: PlanData[]) => void;
  isExecutingPlans?: boolean;
}

export function ChatMessageBubble({
  message,
  onExecutePlans,
  isExecutingPlans,
}: ChatMessageBubbleProps) {
  const isUser = message.role === "user";
  const hasPlans = message.plans && message.plans.length > 0;
  const hasTrace = message.trace && message.trace.length > 0;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary/20" : "bg-surfaceHighlight"
        }`}
      >
        {isUser ? (
          <User size={14} className="text-primary" />
        ) : (
          <Bot size={14} className="text-textMuted" />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block max-w-full text-left ${
            isUser
              ? "bg-primary/10 rounded-2xl rounded-tr-sm px-4 py-2"
              : ""
          }`}
        >
          <div className="text-sm text-text whitespace-pre-wrap break-words">
            {message.content}
          </div>
        </div>

        {!isUser && hasPlans && (
          <div className="mt-2">
            <PlansCard
              plans={message.plans!}
              onExecute={onExecutePlans}
              isExecuting={isExecutingPlans}
            />
          </div>
        )}

        {!isUser && hasTrace && (
          <div className="mt-1">
            <TraceCollapse trace={message.trace!} />
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatMessageListProps {
  messages: AIChatMessage[];
  onExecutePlans?: (plans: PlanData[]) => void;
  isExecutingPlans?: boolean;
  streamingContent?: string;
  streamingPlans?: PlanData[];
  streamingTrace?: AIChatMessage["trace"];
}

export function ChatMessageList({
  messages,
  onExecutePlans,
  isExecutingPlans,
  streamingContent,
  streamingPlans,
  streamingTrace,
}: ChatMessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <ChatMessageBubble
          key={msg.id}
          message={msg}
          onExecutePlans={onExecutePlans}
          isExecutingPlans={isExecutingPlans}
        />
      ))}

      {streamingContent !== undefined && streamingContent.length > 0 && (
        <ChatMessageBubble
          message={{
            id: "streaming",
            role: "assistant",
            content: streamingContent,
            plans: streamingPlans || null,
            trace: streamingTrace || null,
            created_at: new Date().toISOString(),
          }}
          onExecutePlans={onExecutePlans}
          isExecutingPlans={isExecutingPlans}
        />
      )}
    </div>
  );
}
