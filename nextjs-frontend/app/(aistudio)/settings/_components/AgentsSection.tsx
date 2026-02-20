"use client";

import { Eye, Plus, RefreshCw } from "lucide-react";

export function AgentsSection(props: {
  agentsSubTab: "custom" | "builtin";
  setAgentsSubTab: (tab: "custom" | "builtin") => void;
  agentsError: string | null;
  agentsLoading: boolean;
  agents: any[];
  agentModelConfigs: any[];
  builtinAgentsLoading: boolean;
  builtinAgents: any[];
  builtinAgentsError: string | null;
  builtinVersionsLoading: boolean;
  builtinVersions: any[];
  builtinVersionsError: string | null;
  selectedBuiltinAgentCode: string;
  setSelectedBuiltinAgentCode: (code: string) => void;
  refreshAgents: () => void;
  refreshBuiltinAgents: () => void;
  refreshBuiltinVersions: (agentCode: string) => void;
  openCreateAgentDialog: () => void;
  openBuiltinDiff: () => void;
  openCreateBuiltinPrompt: () => void;
  openEditBuiltinPrompt: (versionRow: any) => void;
  activateBuiltinVersion: (version: number) => void;
  deleteBuiltinVersion: (version: number) => void;
  openEditAgentDialog: (agent: any) => void;
  deleteAgent: (id: string) => void;
  onOpenPromptVersions: (agent: any) => void;
}) {
  const {
    agentsSubTab,
    setAgentsSubTab,
    agentsError,
    agentsLoading,
    agents,
    agentModelConfigs,
    builtinAgentsLoading,
    builtinAgents,
    builtinAgentsError,
    builtinVersionsLoading,
    builtinVersions,
    builtinVersionsError,
    selectedBuiltinAgentCode,
    setSelectedBuiltinAgentCode,
    refreshAgents,
    refreshBuiltinAgents,
    refreshBuiltinVersions,
    openCreateAgentDialog,
    openBuiltinDiff,
    openCreateBuiltinPrompt,
    openEditBuiltinPrompt,
    activateBuiltinVersion,
    deleteBuiltinVersion,
    openEditAgentDialog,
    deleteAgent,
    onOpenPromptVersions,
  } = props;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">Agent 管理</h2>
          <p className="text-textMuted text-sm">配置 Agent 类型、模型与单次消耗积分数。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surfaceHighlight p-1 rounded-lg border border-border">
            <button
              onClick={() => setAgentsSubTab("custom")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                agentsSubTab === "custom" ? "bg-surface text-textMain shadow-sm border border-border/50" : "text-textMuted hover:text-textMain"
              }`}
              type="button"
            >
              自定义 Agent
            </button>
            <button
              onClick={() => setAgentsSubTab("builtin")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                agentsSubTab === "builtin" ? "bg-surface text-textMain shadow-sm border border-border/50" : "text-textMuted hover:text-textMain"
              }`}
              type="button"
            >
              内置提示词
            </button>
          </div>
          <button
            onClick={() => {
              if (agentsSubTab === "custom") {
                refreshAgents();
              } else {
                refreshBuiltinAgents();
                if (selectedBuiltinAgentCode) refreshBuiltinVersions(selectedBuiltinAgentCode);
              }
            }}
            className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
            type="button"
          >
            <RefreshCw size={16} /> 刷新
          </button>
          {agentsSubTab === "custom" && (
            <button
              onClick={() => openCreateAgentDialog()}
              className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
              type="button"
            >
              <Plus size={16} /> 新建 Agent
            </button>
          )}
          {agentsSubTab === "builtin" && (
            <>
              <button
                onClick={() => openBuiltinDiff()}
                className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                type="button"
                disabled={!selectedBuiltinAgentCode}
              >
                <Eye size={16} /> 对比版本
              </button>
              <button
                onClick={() => openCreateBuiltinPrompt()}
                className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                type="button"
                disabled={!selectedBuiltinAgentCode}
              >
                <Plus size={16} /> 新增版本
              </button>
            </>
          )}
        </div>
      </div>

      {agentsSubTab === "custom" && agentsError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{agentsError}</div>
      )}

      {agentsSubTab === "custom" && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
              <tr>
                <th className="px-6 py-4">名称</th>
                <th className="px-6 py-4">类别</th>
                <th className="px-6 py-4">模型</th>
                <th className="px-6 py-4">单次消耗</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {agentsLoading && agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-textMuted">
                    加载中...
                  </td>
                </tr>
              )}
              {!agentsLoading && agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-textMuted">
                    暂无 Agent
                  </td>
                </tr>
              )}
              {agents.map((a) => (
                <tr key={a.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-textMain">{a.name}</td>
                  <td className="px-6 py-4 text-xs text-textMuted font-mono">{a.category}</td>
                  <td className="px-6 py-4 text-xs text-textMuted font-mono">
                    {(() => {
                      const cfgId = (a as unknown as { ai_model_config_id?: string }).ai_model_config_id;
                      const cfg = agentModelConfigs.find((c) => c.id === cfgId);
                      return cfg ? `${cfg.manufacturer} · ${cfg.model}` : cfgId || "-";
                    })()}
                  </td>
                  <td className="px-6 py-4 text-xs text-textMain font-mono">{Number(a.credits_per_call || 0)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                        a.enabled ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${a.enabled ? "bg-green-400" : "bg-gray-500"}`} />
                      {a.enabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onOpenPromptVersions(a)}
                        className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain"
                        type="button"
                      >
                        提示词版本
                      </button>
                      <button
                        onClick={() => openEditAgentDialog(a)}
                        className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain"
                        type="button"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => {
                          if (!window.confirm(`确认删除 Agent：${a.name}？`)) return;
                          void deleteAgent(a.id);
                        }}
                        className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold text-red-400"
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {agentsSubTab === "builtin" && (
        <div className="space-y-4">
          {(builtinAgentsError || builtinVersionsError) && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
              {builtinAgentsError || builtinVersionsError}
            </div>
          )}

          <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold text-textMain">内置 Agent</div>
              <select
                value={selectedBuiltinAgentCode}
                onChange={(e) => setSelectedBuiltinAgentCode(e.target.value)}
                className="bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
              >
                {builtinAgents.map((a) => (
                  <option key={a.id} value={a.agent_code}>
                    {a.agent_code} · {a.name}
                  </option>
                ))}
              </select>
              <div className="text-xs text-textMuted">{builtinAgentsLoading ? "加载中..." : `${builtinAgents.length} 个`}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-textMuted">模型：随版本</div>
              <div className="text-xs text-textMuted">
                {(() => {
                  const row = builtinAgents.find((a) => a.agent_code === selectedBuiltinAgentCode);
                  const cfgId = row?.default_ai_model_config_id;
                  const cfg = agentModelConfigs.find((c) => c.id === cfgId);
                  return cfg ? `兜底：${cfg.manufacturer} · ${cfg.model}` : cfgId ? `兜底：${cfgId}` : "兜底：未设置";
                })()}
              </div>
              <div className="text-xs text-textMuted">提示：修改默认版本会影响未覆盖用户</div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                <tr>
                  <th className="px-6 py-4">版本</th>
                  <th className="px-6 py-4">描述</th>
                  <th className="px-6 py-4">创建时间</th>
                  <th className="px-6 py-4">模型</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {builtinVersionsLoading && builtinVersions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-textMuted">
                      加载中...
                    </td>
                  </tr>
                )}
                {!builtinVersionsLoading && builtinVersions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-textMuted">
                      暂无版本
                    </td>
                  </tr>
                )}
                {builtinVersions.map((v) => (
                  <tr key={v.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                    <td className="px-6 py-4 text-xs text-textMain font-mono">v{v.version}</td>
                    <td className="px-6 py-4 text-xs text-textMuted">{v.description || "-"}</td>
                    <td className="px-6 py-4 text-xs text-textMuted font-mono">{new Date(v.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 text-xs text-textMuted font-mono">
                      {(() => {
                        const cfgId = (v as unknown as { ai_model_config_id?: string | null }).ai_model_config_id;
                        if (!cfgId) return "继承";
                        const cfg = agentModelConfigs.find((c) => c.id === cfgId);
                        return cfg ? `${cfg.manufacturer} · ${cfg.model}` : cfgId;
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                          v.is_default ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${v.is_default ? "bg-green-400" : "bg-gray-500"}`} />
                        {v.is_default ? "DEFAULT" : "VERSION"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditBuiltinPrompt(v)}
                          className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain"
                          type="button"
                        >
                          查看/编辑
                        </button>
                        {!v.is_default && (
                          <button
                            onClick={() => activateBuiltinVersion(v.version)}
                            className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain"
                            type="button"
                          >
                            设为默认
                          </button>
                        )}
                        {!v.is_default && (
                          <button
                            onClick={() => deleteBuiltinVersion(v.version)}
                            className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold text-red-400"
                            type="button"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
