"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  LayoutDashboard,
  Clapperboard,
  Library,
  Settings,
  Wand2,
  Search,
  DoorOpen,
  ChevronRight,
  ChevronLeft,
  FileText,
  ChevronDown,
  Film,
  Coins,

  Cpu,
  Users,
  Shield,
  Lock,
  FileClock,
  ListTodo,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { logout } from "@/components/actions/logout-action";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarCropDialog } from "@/components/ui/avatar-crop-dialog";
import type { Me } from "@/components/actions/me-actions";
import { deleteMeAvatar, updateMeAvatar, updateMePassword } from "@/components/actions/me-actions";
import { TaskProvider } from "@/components/tasks/TaskProvider";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useCredits } from "@/components/credits/CreditsContext";
import { CreditsHistoryDrawer } from "@/components/credits/CreditsHistoryDrawer";

function SidebarGroup({
  icon: Icon,
  label,
  collapsed,
  active,
  children,
}: {
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  if (collapsed) {
    return (
      <div className="group relative">
        <div
          className={`flex justify-center p-3 rounded-xl mb-2 transition-colors ${
            active
              ? "bg-primary/10 text-primary"
              : "text-textMuted hover:bg-surfaceHighlight"
          }`}
        >
          <Icon size={20} />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-2 rounded-xl transition-all duration-200 group ${
          active
            ? "text-primary font-medium"
            : "text-textMuted hover:text-textMain"
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon size={20} className="flex-shrink-0" />
          <span className="whitespace-nowrap overflow-hidden text-lg">
            {label}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${
            isOpen ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="mt-1 ml-4 border-l border-border pl-2 space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function SubItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [pathname, searchParams]);

  let isActive = current === to;
  if (to === "/settings?tab=models" && pathname === "/settings" && !searchParams?.toString()) {
    isActive = true;
  }

  return (
    <Link
      href={to}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-base transition-all ${
        isActive
          ? "bg-surfaceHighlight text-textMain font-medium"
          : "text-textMuted hover:text-textMain hover:bg-surfaceHighlight/50"
      }`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </Link>
  );
}

function SidebarItem({
  to,
  icon: Icon,
  label,
  collapsed,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === to;

  return (
    <Link
      href={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group mb-1 ${
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-textMuted hover:bg-surfaceHighlight hover:text-textMain"
      } ${collapsed ? "justify-center px-2" : ""}`}
    >
      <Icon size={20} className="group-hover:scale-110 transition-transform flex-shrink-0" />
      {!collapsed && (
        <span className="whitespace-nowrap overflow-hidden transition-all text-lg">
          {label}
        </span>
      )}
    </Link>
  );
}

export function AppLayout({ children, me }: { children: React.ReactNode; me: Me }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [, startTransition] = useTransition();
  const [meState, setMeState] = useState(me);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileAvatarBase64, setProfileAvatarBase64] = useState<string | null>(null);
  const [profileAvatarContentType, setProfileAvatarContentType] = useState<string | null>(null);
  const [profileCropOpen, setProfileCropOpen] = useState(false);
  const [profileCropFile, setProfileCropFile] = useState<File | null>(null);
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [avatarCacheBust, setAvatarCacheBust] = useState(0);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const { balance, isLoading: balanceLoading } = useCredits();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
    document.cookie = "theme=dark; path=/";
  }, []);

  const handleLogout = () => {
    startTransition(() => {
      void logout();
    });
  };

  const avatarLetter = (email: string) => (email.trim()[0] ? email.trim()[0].toUpperCase() : "?");

  const submitProfile = async () => {
    setProfileSubmitting(true);
    setProfileError(null);
    try {
      if (profileAvatarBase64 && profileAvatarContentType) {
        await updateMeAvatar({ data_base64: profileAvatarBase64, content_type: profileAvatarContentType });
        setMeState((prev) => ({ ...prev, has_avatar: true }));
        setAvatarCacheBust((v) => v + 1);
        setProfileAvatarBase64(null);
        setProfileAvatarContentType(null);
      }

      if (profileNewPassword) {
        if (!profileCurrentPassword) throw new Error("请输入当前密码");
        await updateMePassword({ current_password: profileCurrentPassword, new_password: profileNewPassword });
        setProfileCurrentPassword("");
        setProfileNewPassword("");
      }
      setProfileOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setProfileError(msg);
    } finally {
      setProfileSubmitting(false);
    }
  };

  const removeProfileAvatar = async () => {
    setProfileSubmitting(true);
    setProfileError(null);
    try {
      await deleteMeAvatar();
      setMeState((prev) => ({ ...prev, has_avatar: false }));
      setAvatarCacheBust((v) => v + 1);
      setProfileAvatarBase64(null);
      setProfileAvatarContentType(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setProfileError(msg);
    } finally {
      setProfileSubmitting(false);
    }
  };

  const getPageTitle = () => {
    const path = pathname;
    if (path.includes("/dashboard")) return "工作台 / Dashboard";
    if (path.includes("/projects")) return "漫剧项目 / Projects";
    if (path.includes("/scripts")) return "剧本管理 / Script Management";
    if (path.includes("/extraction")) return "资产提取 / Asset Extraction";
    if (path.includes("/storyboard")) return "内容创作 / Content Creation";
    if (path.includes("/assets")) return "资产管理 / Asset Management";
    if (path.includes("/studio")) return "AI 创作工坊 / Studio";
    if (path.includes("/ai-scenes")) return "AI 场景管理 / AI Scenes";
    if (path.includes("/chat")) return "AI 助手 / Chat";
    if (path.includes("/tasks")) return "任务清单 / Tasks";
    if (path.includes("/settings")) return "系统设置 / Settings";
    return "言之有理";
  };

  // 页面宽度模式：三档策略
  type PageWidthMode = "immersive" | "workspace" | "admin";

  const immersiveRoutes = ["/storyboard", "/studio"];
  const workspacePrefixes = [
    "/dashboard",
    "/scripts",
    "/extraction",
    "/assets",
    "/batch-video",
    "/ai/image",
    "/ai/video",
  ];
  const adminPrefixes = ["/settings", "/chat"];

  const pageWidthMode = useMemo<PageWidthMode>(() => {
    if (immersiveRoutes.includes(pathname)) return "immersive";
    if (workspacePrefixes.some((prefix) => pathname.startsWith(prefix))) return "workspace";
    return "admin";
  }, [pathname]);

  // 内容容器样式根据页面模式变化
  const contentContainerClassName = useMemo(() => {
    switch (pageWidthMode) {
      case "immersive":
        return "flex-1 relative overflow-hidden p-0";
      case "workspace":
        return "flex-1 relative overflow-auto px-4 py-4 lg:px-6 lg:py-6";
      case "admin":
      default:
        return "flex-1 relative overflow-auto p-8";
    }
  }, [pageWidthMode]);

  return (
    <TaskProvider>
      <div className="flex h-screen bg-background text-textMain overflow-hidden font-sans transition-colors duration-300">
      <aside
        className={`${
          collapsed ? "w-20" : "w-64"
        } flex-shrink-0 bg-surface border-r border-border flex flex-col justify-between transition-all duration-300 relative z-20`}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 bg-surface border border-border text-textMuted hover:text-primary rounded-full p-1 z-30 shadow-sm"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="p-4 flex flex-col h-full overflow-hidden">
          <div
            className={`flex items-center gap-3 mb-8 ${
              collapsed ? "justify-center" : "px-2"
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
              <Wand2 className="text-white" size={18} />
            </div>
            {!collapsed && (
              <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-textMain to-textMuted whitespace-nowrap overflow-hidden">
                言之有理
              </h1>
            )}
          </div>

          <nav className="space-y-1 flex-1 overflow-y-auto no-scrollbar">
            <SidebarItem
              to="/dashboard"
              icon={LayoutDashboard}
              label="工作台"
              collapsed={collapsed}
            />

            <div className="pt-4 pb-2">
              {!collapsed && (
                <p className="px-4 text-[10px] font-bold text-textMuted/50 uppercase tracking-wider mb-2 animate-fade-in">
                  Production Pipeline
                </p>
              )}

              <SidebarItem
                to="/scripts"
                icon={FileText}
                label="剧本管理"
                collapsed={collapsed}
              />

              <SidebarItem
                to="/assets"
                icon={Library}
                label="资产管理"
                collapsed={collapsed}
              />

              <SidebarItem
                to="/studio"
                icon={Film}
                label="创作工坊"
                collapsed={collapsed}
              />

              <SidebarItem
                to="/batch-video"
                icon={Film}
                label="批量视频"
                collapsed={collapsed}
              />

              <SidebarItem
                to="/ai-scenes"
                icon={Wand2}
                label="AI 场景管理"
                collapsed={collapsed}
              />

            </div>

            <div className="pb-2 mt-2">
              {!collapsed && (
                <p className="px-4 text-[10px] font-bold text-textMuted/50 uppercase tracking-wider mb-2 animate-fade-in">
                  System
                </p>
              )}
              <SidebarItem
                to="/projects"
                icon={Clapperboard}
                label="项目归档"
                collapsed={collapsed}
              />
              <SidebarItem
                to="/tasks"
                icon={ListTodo}
                label="任务清单"
                collapsed={collapsed}
              />

              <SidebarGroup
                icon={Settings}
                label="系统设置"
                collapsed={collapsed}
                active={pathname.includes("/settings")}
              >
                <SubItem to="/settings?tab=models" icon={Cpu} label="模型引擎" />
                <SubItem to="/settings?tab=users" icon={Users} label="用户管理" />
                <SubItem to="/settings?tab=roles" icon={Shield} label="角色管理" />
                <SubItem
                  to="/settings?tab=permissions"
                  icon={Lock}
                  label="权限管理"
                />
                <SubItem to="/settings?tab=audit" icon={FileClock} label="系统审计" />
              </SidebarGroup>
            </div>
          </nav>
        </div>

        <div
          className={`p-4 m-2 bg-surfaceHighlight/50 rounded-xl border border-border/50 ${
            collapsed ? "flex flex-col items-center gap-2 p-2" : ""
          }`}
        >
          <div
            className={`flex items-center gap-3 ${
              collapsed ? "justify-center w-full" : ""
            }`}
          >
            <button
              type="button"
              className={`flex items-center gap-3 ${collapsed ? "justify-center w-full" : ""}`}
              onClick={() => {
                setProfileError(null);
                setProfileOpen(true);
              }}
            >
              <Avatar className="h-8 w-8 border border-border">
                {meState.has_avatar && (
                  <AvatarImage src={`/api/avatar/${meState.id}?v=${avatarCacheBust}`} alt="User" />
                )}
                <AvatarFallback className="text-xs font-bold bg-surface">
                  {avatarLetter(meState.email)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium truncate">{meState.email}</p>
                  <p className="text-[10px] text-textMuted truncate">
                    {(meState.roles || []).map((r) => r.name).join(" / ") || "user"}
                  </p>
                </div>
              )}
            </button>
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="ml-auto inline-flex items-center justify-center rounded-lg p-2 text-textMuted hover:text-textMain hover:bg-surface transition-colors"
                title="退出登录"
              >
                <DoorOpen size={18} />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              onClick={handleLogout}
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg p-2 text-textMuted hover:text-textMain hover:bg-surface transition-colors"
              title="退出登录"
            >
              <DoorOpen size={18} />
            </button>
          )}
        </div>
      </aside>

      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-textMain">个人信息</div>
                <div className="text-xs text-textMuted mt-1">编辑头像与密码。</div>
              </div>
              <button
                type="button"
                className="text-textMuted hover:text-textMain"
                onClick={() => setProfileOpen(false)}
                disabled={profileSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {profileError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
                {profileError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border border-border">
                  {(profileAvatarBase64 || meState.has_avatar) && (
                    <AvatarImage
                      src={
                        profileAvatarBase64
                          ? `data:${profileAvatarContentType};base64,${profileAvatarBase64}`
                          : `/api/avatar/${meState.id}?v=${avatarCacheBust}`
                      }
                      alt="avatar"
                    />
                  )}
                  <AvatarFallback className="text-lg font-bold bg-surface">
                    {avatarLetter(meState.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium text-textMain">{meState.email}</div>
                  <div className="text-xs text-textMuted mt-1">
                    {(meState.roles || []).map((r) => r.name).join(" / ") || "user"}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-xs font-medium text-textMain cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={profileSubmitting}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setProfileCropFile(file);
                          setProfileCropOpen(true);
                        }}
                      />
                      <span className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-xs font-medium transition-all inline-block">
                        上传头像
                      </span>
                    </label>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200 disabled:opacity-50"
                      onClick={() => void removeProfileAvatar()}
                      disabled={profileSubmitting || (!meState.has_avatar && !profileAvatarBase64)}
                    >
                      删除头像
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">当前密码</label>
                <input
                  type="password"
                  value={profileCurrentPassword}
                  onChange={(e) => setProfileCurrentPassword(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  disabled={profileSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">新密码</label>
                <input
                  type="password"
                  value={profileNewPassword}
                  onChange={(e) => setProfileNewPassword(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  placeholder="至少 8 位"
                  disabled={profileSubmitting}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                onClick={() => setProfileOpen(false)}
                disabled={profileSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                onClick={() => void submitProfile()}
                disabled={profileSubmitting || (!profileAvatarBase64 && !profileNewPassword)}
              >
                {profileSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-background/50 h-screen transition-colors duration-300">
        <header className="h-16 px-6 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between z-10 sticky top-0 flex-shrink-0">
          <div className="flex items-center gap-2 text-textMuted">
            <span className="text-sm uppercase tracking-wider font-semibold opacity-60 hidden md:inline">
              Workspace
            </span>
            <ChevronRight size={14} className="hidden md:block" />
            <span className="text-textMain font-medium">{getPageTitle()}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Credits Balance Badge */}
            <button
              type="button"
              onClick={() => setHistoryDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors group"
              title="查看积分流水"
            >
              <Coins
                size={16}
                className={`text-primary ${balanceLoading ? "animate-pulse" : ""}`}
              />
              <span className="text-sm font-semibold text-primary group-hover:text-blue-300 transition-colors">
                {balance}
              </span>
            </button>

            <div className="relative group hidden md:block">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted group-focus-within:text-primary transition-colors"
                size={16}
              />
              <input
                type="text"
                placeholder="搜索项目、资产..."
                className="bg-surfaceHighlight border-none rounded-full py-1.5 pl-9 pr-4 text-sm w-48 focus:w-64 focus:ring-1 focus:ring-primary focus:bg-surface transition-all placeholder-textMuted/50 text-textMain outline-none"
              />
            </div>
            <NotificationCenter />
          </div>
        </header>

        <div className={contentContainerClassName}>
          {children}
        </div>
      </main>

      <AvatarCropDialog
        open={profileCropOpen}
        file={profileCropFile}
        title="裁剪头像"
        onClose={() => {
          setProfileCropOpen(false);
          setProfileCropFile(null);
        }}
        onConfirm={(r) => {
          setProfileAvatarBase64(r.dataBase64);
          setProfileAvatarContentType(r.contentType);
        }}
      />

      {/* Credits History Drawer */}
      <CreditsHistoryDrawer
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
      />
      </div>
    </TaskProvider>
  );
}
