"use client";

import { useCallback, useEffect, useState } from "react";

type UserAgent = {
  id: string;
  name: string;
  description?: string | null;
  system_prompt: string;
  temperature?: number | null;
  tools: string[];
  is_public: boolean;
};

export default function MyAgentsPage() {
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [createName, setCreateName] = useState("");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createToolsRaw, setCreateToolsRaw] = useState("[]");

  const load = useCallback(async () => {
    const res = await fetch("/api/user-agents", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setAgents(json?.data || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async () => {
    let tools: string[] = [];
    try {
      tools = JSON.parse(createToolsRaw);
    } catch {
      tools = [];
    }

    const resp = await fetch("/api/user-agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: createName, system_prompt: createPrompt, tools }),
    });
    if (resp.ok) {
      setCreateName("");
      setCreatePrompt("");
      setCreateToolsRaw("[]");
      await load();
    }
  }, [createName, createPrompt, createToolsRaw, load]);

  const update = useCallback(async (id: string, patch: Partial<UserAgent>) => {
    const resp = await fetch(`/api/user-agents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (resp.ok) await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const resp = await fetch(`/api/user-agents/${id}`, { method: "DELETE" });
    if (resp.ok) await load();
  }, [load]);

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ fontWeight: 700 }}>我的 Agent</div>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>新建</div>
        <label style={{ display: "grid", gap: 4 }}>
          <span>名称</span>
          <input value={createName} onChange={(e) => setCreateName(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>system_prompt</span>
          <textarea value={createPrompt} onChange={(e) => setCreatePrompt(e.target.value)} rows={6} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>tools(JSON)</span>
          <textarea value={createToolsRaw} onChange={(e) => setCreateToolsRaw(e.target.value)} rows={3} />
        </label>
        <div>
          <button onClick={create} disabled={!createName.trim() || !createPrompt.trim()}>
            创建
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} onUpdate={update} onDelete={remove} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  onUpdate,
  onDelete,
}: {
  agent: UserAgent;
  onUpdate: (id: string, patch: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(agent.name);
  const [prompt, setPrompt] = useState(agent.system_prompt);
  const [toolsRaw, setToolsRaw] = useState(JSON.stringify(agent.tools || [], null, 2));

  useEffect(() => {
    setName(agent.name);
    setPrompt(agent.system_prompt);
    setToolsRaw(JSON.stringify(agent.tools || [], null, 2));
  }, [agent.id, agent.name, agent.system_prompt, agent.tools]);

  const save = useCallback(async () => {
    let tools: string[] = [];
    try {
      tools = JSON.parse(toolsRaw);
    } catch {
      tools = [];
    }
    await onUpdate(agent.id, { name, system_prompt: prompt, tools });
  }, [agent.id, name, onUpdate, prompt, toolsRaw]);

  const del = useCallback(async () => {
    await onDelete(agent.id);
  }, [agent.id, onDelete]);

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontWeight: 600 }}>{agent.id}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save}>保存</button>
          <button onClick={del}>删除</button>
        </div>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span>名称</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>system_prompt</span>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>tools(JSON)</span>
        <textarea value={toolsRaw} onChange={(e) => setToolsRaw(e.target.value)} rows={4} />
      </label>
    </div>
  );
}

