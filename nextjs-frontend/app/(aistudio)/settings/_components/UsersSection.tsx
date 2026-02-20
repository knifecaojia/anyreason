"use client";

import { MoreHorizontal, Search, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UsersSection(props: {
  rbacError: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onOpenCreateUser: () => void;
  team: any[];
  avatarCacheBust: number;
  avatarLetter: (email: string) => string;
  onToggleUserStatus: (userId: string) => void;
  onOpenEditUser: (user: any) => void;
}) {
  const {
    rbacError,
    searchQuery,
    setSearchQuery,
    onOpenCreateUser,
    team,
    avatarCacheBust,
    avatarLetter,
    onToggleUserStatus,
    onOpenEditUser,
  } = props;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">用户管理</h2>
          <p className="text-textMuted text-sm">管理成员账号、分配角色及重置访问权限。</p>
        </div>
        <button
          onClick={onOpenCreateUser}
          className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
          type="button"
        >
          <UserPlus size={16} /> 新建用户
        </button>
      </div>

      {rbacError && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{rbacError}</div>}

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
          <input
            type="text"
            placeholder="搜索成员姓名或邮箱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary text-textMain"
          />
        </div>
        <select className="bg-surfaceHighlight border border-border rounded-lg px-4 py-2.5 text-sm outline-none focus:border-primary text-textMain">
          <option value="all">所有状态</option>
          <option value="active">活跃</option>
          <option value="inactive">已禁用</option>
        </select>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
            <tr>
              <th className="px-6 py-4">成员信息</th>
              <th className="px-6 py-4">分配角色</th>
              <th className="px-6 py-4">账号状态</th>
              <th className="px-6 py-4">最近活跃</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {team
              .filter((u) => u.name.includes(searchQuery) || u.email.includes(searchQuery))
              .map((user) => (
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
                  <div className="flex flex-wrap gap-2">
                    {(user.roleNames.length ? user.roleNames : ["user"]).map((name: string) => (
                      <span
                        key={name}
                        className="inline-flex items-center rounded-full border border-border bg-surfaceHighlight px-2 py-1 text-[10px] font-bold text-textMain"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => onToggleUserStatus(user.id)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border flex items-center justify-center gap-1 w-20 transition-all ${
                      user.status === "active"
                        ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                        : "bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
                    }`}
                    type="button"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${user.status === "active" ? "bg-green-400" : "bg-gray-500"}`} />
                    {user.status === "active" ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-6 py-4 text-textMuted text-xs font-mono">{user.lastActive}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onOpenEditUser(user)}
                    className="p-2 text-textMuted hover:text-textMain hover:bg-surfaceHighlight rounded-lg transition-colors"
                    type="button"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
