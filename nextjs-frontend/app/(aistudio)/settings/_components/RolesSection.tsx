"use client";

import { Lock, Plus, Trash2, Users } from "lucide-react";

export function RolesSection(props: {
  rbacError: string | null;
  roles: any[];
  team: any[];
  onAddRole: () => void;
  onDeleteRole: (roleId: string) => void;
  onGoPermissions: () => void;
}) {
  const { rbacError, roles, team, onAddRole, onDeleteRole, onGoPermissions } = props;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">角色管理</h2>
          <p className="text-textMuted text-sm">定义平台角色及其职能描述，用于权限绑定。</p>
        </div>
        <button
          onClick={onAddRole}
          className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          type="button"
        >
          <Plus size={16} /> 创建角色
        </button>
      </div>

      {rbacError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{rbacError}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.map((role) => {
          const memberCount = team.filter((u) => u.roleIds.includes(role.id)).length;
          return (
            <div
              key={role.id}
              className="bg-surface border border-border rounded-xl p-6 flex flex-col hover:border-primary/50 transition-colors group"
            >
              <div className="flex justify-between items-start mb-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${
                    role.isSystem ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                  }`}
                >
                  {role.name.charAt(0)}
                </div>
                {role.isSystem && (
                  <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                    System
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-textMain mb-2">{role.name}</h3>
              <p className="text-sm text-textMuted mb-6 flex-1 line-clamp-2">{role.description}</p>

              <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs text-textMuted">
                <div className="flex items-center gap-2">
                  <Users size={14} />
                  <span>{memberCount} 成员</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onGoPermissions}
                    className="hover:text-primary transition-colors flex items-center gap-1"
                    type="button"
                  >
                    <Lock size={12} /> 权限
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={() => onDeleteRole(role.id)}
                      className="hover:text-red-400 transition-colors ml-2"
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
