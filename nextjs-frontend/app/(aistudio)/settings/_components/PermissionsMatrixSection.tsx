"use client";

import { Fragment } from "react";
import { Check, Plus } from "lucide-react";

export function PermissionsMatrixSection(props: {
  rbacError: string | null;
  roles: any[];
  permissionGroups: string[];
  permissionsByGroup: Map<string, any[]>;
  onTogglePermission: (roleId: string, permId: string) => void;
  onAddPermission: () => void;
}) {
  const { rbacError, roles, permissionGroups, permissionsByGroup, onTogglePermission, onAddPermission } = props;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">权限矩阵 (Permission Matrix)</h2>
          <p className="text-textMuted text-sm">精细化控制每个角色的系统操作权限。</p>
        </div>
        <button
          onClick={onAddPermission}
          className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          type="button"
        >
          <Plus size={16} /> 新增权限
        </button>
      </div>

      {rbacError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{rbacError}</div>}

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surfaceHighlight/50 border-b border-border">
                <th className="px-6 py-4 text-left font-medium text-textMuted w-64">权限项 / 功能模块</th>
                {roles.map((role) => (
                  <th key={role.id} className="px-4 py-4 text-center font-bold text-textMain min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span>{role.name}</span>
                      {role.isSystem && <span className="text-[9px] font-normal text-textMuted opacity-60">System</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {permissionGroups.map((group) => (
                <Fragment key={group}>
                  <tr key={`${group}-header`} className="bg-surfaceHighlight/20">
                    <td
                      colSpan={roles.length + 1}
                      className="px-6 py-2 text-xs font-bold text-textMuted uppercase tracking-widest bg-surfaceHighlight/30"
                    >
                      {group}
                    </td>
                  </tr>
                  {(permissionsByGroup.get(group) || []).map((perm) => (
                    <tr key={perm.id} className="hover:bg-surfaceHighlight/10 transition-colors">
                      <td className="px-6 py-3">
                        <div className="font-medium text-textMain">{perm.name}</div>
                        <div className="text-xs text-textMuted font-mono opacity-50">{perm.code}</div>
                      </td>
                      {roles.map((role) => {
                        const hasPerm = role.permissionIds.includes(perm.id);
                        const isAdmin = role.isSystem;
                        return (
                          <td key={role.id} className="px-4 py-3 text-center">
                            <button
                              onClick={() => onTogglePermission(role.id, perm.id)}
                              disabled={isAdmin}
                              className={`w-6 h-6 rounded border flex items-center justify-center transition-all mx-auto ${
                                hasPerm ? "bg-primary border-primary text-white" : "bg-transparent border-border text-transparent hover:border-primary/50"
                              } ${isAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                              type="button"
                            >
                              <Check size={14} strokeWidth={3} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
