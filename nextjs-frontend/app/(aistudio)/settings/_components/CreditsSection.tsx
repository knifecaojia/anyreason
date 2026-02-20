"use client";

import { RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function CreditsSection(props: {
  rbacError: string | null;
  rbacLoading: boolean;
  team: any[];
  avatarCacheBust: number;
  avatarLetter: (email: string) => string;
  onRefreshUsers: () => void;
  onOpenCreditsDialog: (user: any) => void;
}) {
  const { rbacError, rbacLoading, team, avatarCacheBust, avatarLetter, onRefreshUsers, onOpenCreditsDialog } = props;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">积分管理</h2>
          <p className="text-textMuted text-sm">查看用户积分余额并进行调整，充值/兑换入口预留。</p>
        </div>
        <button
          onClick={onRefreshUsers}
          className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          type="button"
        >
          <RefreshCw size={16} /> 刷新
        </button>
      </div>

      {rbacError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{rbacError}</div>}

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
            <tr>
              <th className="px-6 py-4">成员信息</th>
              <th className="px-6 py-4">账号状态</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rbacLoading && team.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-6 text-textMuted">
                  加载中...
                </td>
              </tr>
            )}
            {!rbacLoading && team.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-6 text-textMuted">
                  暂无用户
                </td>
              </tr>
            )}
            {team.map((user) => (
              <tr key={user.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 border border-border">
                      {user.hasAvatar && <AvatarImage src={`/api/avatar/${user.id}?v=${avatarCacheBust}`} alt={user.name} />}
                      <AvatarFallback className="text-sm font-bold bg-surface">{avatarLetter(user.email)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-bold text-textMain">{user.name}</div>
                      <div className="text-xs text-textMuted">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                      user.status === "active" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${user.status === "active" ? "bg-green-400" : "bg-gray-500"}`} />
                    {user.status === "active" ? "ACTIVE" : "DISABLED"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => void onOpenCreditsDialog(user)}
                    className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    type="button"
                  >
                    查看/调整
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
        <div className="text-sm text-textMuted">充值与兑换系统入口预留（即将上线）</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain" type="button">
            充值
          </button>
          <button className="px-3 py-2 bg-surfaceHighlight border border-border rounded-lg text-xs font-bold text-textMain" type="button">
            兑换
          </button>
        </div>
      </div>
    </div>
  );
}
