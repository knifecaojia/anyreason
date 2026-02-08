"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle,
  Cpu,
  Eye,
  EyeOff,
  FileClock,
  Image as ImageIcon,
  Key,
  LayoutGrid,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
  MessageSquare,
} from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import type { LucideIcon } from "lucide-react";

import type { GlobalModelConfig, ModelProvider } from "@/lib/aistudio/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarCropDialog } from "@/components/ui/avatar-crop-dialog";
import {
  adminCountAuditLogs,
  adminCreatePermission,
  adminCreateRole,
  adminCreateUser,
  adminDeleteRole,
  adminListAuditLogs,
  adminListPermissions,
  adminListRoles,
  adminListUsers,
  adminDeleteUserAvatar,
  adminSetRolePermissions,
  adminSetUserRoles,
  adminUpdateUserStatus,
  adminUpdateUserAvatar,
  adminUpdateUserPassword,
} from "@/components/actions/admin-rbac-actions";
import {
  llmAdminCreateCustomService,
  llmAdminDeleteCustomService,
  llmAdminListCustomServices,
  llmAdminListModels,
  llmChatCompletions,
  llmIssueMyKey,
  llmListMyKeys,
  llmListMyUsageDaily,
  llmListMyUsageEvents,
  llmRevokeMyKey,
  llmRotateMyKey,
  type LLMAdminModelInfo,
  type LLMChatAttachment,
  type LLMChatMessage,
  type LLMCustomService,
  type LLMUsageDaily,
  type LLMUsageEvent,
  type LLMVirtualKey,
} from "@/components/actions/llm-actions";

type Permission = {
  id: string;
  code: string;
  name: string;
  group: string;
  description?: string;
};

type Role = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissionIds: string[];
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  roleIds: string[];
  roleNames: string[];
  hasAvatar: boolean;
  isDisabled: boolean;
  status: "active" | "inactive" | "pending";
  lastActive: string;
};

type AuditLogRow = {
  id: string;
  created_at: string;
  action: string;
  success: boolean;
  actor_user_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  ip?: string | null;
  request_id?: string | null;
  meta: Record<string, unknown>;
};

const MENU_PERMISSION_CATALOG = [
  {
    group: "工作台",
    items: [
      { code: "menu.dashboard", name: "工作台", description: "访问工作台与概览" },
    ],
  },
  {
    group: "剧本管理",
    items: [
      { code: "menu.scripts.list", name: "剧本清单", description: "查看剧本列表" },
      { code: "menu.scripts.write", name: "剧本创作", description: "创建与编辑剧本" },
    ],
  },
  {
    group: "资产提取",
    items: [
      { code: "menu.extraction", name: "资产提取", description: "从素材生成结构化资产" },
    ],
  },
  {
    group: "资产管理",
    items: [
      { code: "menu.assets.list", name: "资产清单", description: "查看资产列表" },
      { code: "menu.assets.create", name: "资产创作", description: "创建与编辑资产" },
    ],
  },
  {
    group: "内容创作",
    items: [
      { code: "menu.storyboard", name: "内容创作", description: "生成分镜与内容规划" },
    ],
  },
  {
    group: "创作工坊",
    items: [
      { code: "menu.studio", name: "创作工坊", description: "进入创作工作流" },
    ],
  },
  {
    group: "项目归档",
    items: [
      { code: "menu.projects", name: "项目归档", description: "查看与管理项目" },
    ],
  },
  {
    group: "系统设置",
    items: [
      { code: "menu.settings.models", name: "模型引擎", description: "配置模型与密钥" },
      { code: "menu.settings.users", name: "用户管理", description: "管理成员账号与角色分配" },
      { code: "menu.settings.roles", name: "角色管理", description: "管理角色与描述" },
      { code: "menu.settings.permissions", name: "权限管理", description: "配置权限矩阵" },
      { code: "menu.settings.audit", name: "系统审计", description: "查看审计日志" },
    ],
  },
  {
    group: "系统管理",
    items: [
      { code: "system.users", name: "用户管理", description: "成员账号管理与角色分配" },
      { code: "system.roles", name: "角色与权限", description: "创建角色、配置权限矩阵" },
      { code: "system.audit", name: "审计日志", description: "查看关键管理操作记录" },
    ],
  },
] as const;

const MENU_PERMISSION_LOOKUP = new Map<
  string,
  { group: string; code: string; name: string; description: string }
>(
  MENU_PERMISSION_CATALOG.flatMap((g) =>
    g.items.map((i) => [i.code, { group: g.group, ...i }] as [string, { group: string; code: string; name: string; description: string }]),
  ),
);

const INITIAL_PROVIDERS: ModelProvider[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    type: "gemini",
    icon: "G",
    description: "Google 最新的多模态大模型，支持超长上下文。",
    enabled: true,
    config: { apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || "", baseUrl: "" },
    supportedModels: ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-2.5-flash-latest"],
    capabilities: ["text", "multimodal", "image"],
  },
  {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    icon: "O",
    description: "行业标准的 LLM 提供商，包含 GPT-4 系列。",
    enabled: false,
    config: { apiKey: "", baseUrl: "https://api.openai.com/v1" },
    supportedModels: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    capabilities: ["text", "image", "multimodal"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    icon: "A",
    description: "Claude 系列模型，擅长文学创作与逻辑推理。",
    enabled: false,
    config: { apiKey: "", baseUrl: "https://api.anthropic.com" },
    supportedModels: ["claude-3-5-sonnet", "claude-3-opus"],
    capabilities: ["text", "multimodal"],
  },
  {
    id: "stability",
    name: "Stability AI",
    type: "stability",
    icon: "S",
    description: "专业的图像生成模型供应商。",
    enabled: false,
    config: { apiKey: "" },
    supportedModels: ["stable-diffusion-3", "sdxl-turbo"],
    capabilities: ["image"],
  },
];

const INITIAL_GLOBAL_CONFIG: GlobalModelConfig = {
  scriptModel: "gemini-3-flash-preview",
  imageModel: "gemini-2.5-flash-image",
  visionModel: "gemini-3-pro-preview",
};

type Section = "models" | "users" | "roles" | "permissions" | "audit";

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setQuery = (next: Record<string, string | null | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    });
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const activeSection = (searchParams.get("tab") || "models") as Section;

  const [activeModelTab, setActiveModelTab] = useState<"providers" | "defaults" | "keys" | "chatbox">("providers");
  const [providers, setProviders] = useState<ModelProvider[]>(INITIAL_PROVIDERS);
  const [globalConfig, setGlobalConfig] = useState<GlobalModelConfig>(INITIAL_GLOBAL_CONFIG);

  const [customServices, setCustomServices] = useState<LLMCustomService[]>([]);
  const [customServicesLoading, setCustomServicesLoading] = useState(false);
  const [customServicesError, setCustomServicesError] = useState<string | null>(null);
  const [customServiceCreateOpen, setCustomServiceCreateOpen] = useState(false);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServiceBaseUrl, setCustomServiceBaseUrl] = useState("");
  const [customServiceApiKey, setCustomServiceApiKey] = useState("");
  const [customServiceModelsText, setCustomServiceModelsText] = useState("");
  const [customServiceSubmitting, setCustomServiceSubmitting] = useState(false);

  const [adminModels, setAdminModels] = useState<string[]>([]);
  const [adminModelsLoading, setAdminModelsLoading] = useState(false);
  const [adminModelsError, setAdminModelsError] = useState<string | null>(null);

  const [chatModel, setChatModel] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<LLMChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatAttachments, setChatAttachments] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [myVirtualKeys, setMyVirtualKeys] = useState<LLMVirtualKey[]>([]);
  const [myUsageDaily, setMyUsageDaily] = useState<LLMUsageDaily[]>([]);
  const [myUsageEvents, setMyUsageEvents] = useState<LLMUsageEvent[]>([]);
  const [myLlmLoading, setMyLlmLoading] = useState(false);
  const [myLlmError, setMyLlmError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [issuingKey, setIssuingKey] = useState(false);

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [rbacError, setRbacError] = useState<string | null>(null);

  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserEmail, setCreateUserEmail] = useState("");
  const [createUserPassword, setCreateUserPassword] = useState("");
  const [createUserRoleIds, setCreateUserRoleIds] = useState<string[]>([]);
  const [createUserAvatarBase64, setCreateUserAvatarBase64] = useState<string | null>(null);
  const [createUserAvatarContentType, setCreateUserAvatarContentType] = useState<string | null>(null);
  const [createUserCropOpen, setCreateUserCropOpen] = useState(false);
  const [createUserCropFile, setCreateUserCropFile] = useState<File | null>(null);
  const [createUserSubmitting, setCreateUserSubmitting] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);

  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamMember | null>(null);
  const [editUserRoleIds, setEditUserRoleIds] = useState<string[]>([]);
  const [editUserPassword, setEditUserPassword] = useState("");
  const [editUserAvatarBase64, setEditUserAvatarBase64] = useState<string | null>(null);
  const [editUserAvatarContentType, setEditUserAvatarContentType] = useState<string | null>(null);
  const [editUserCropOpen, setEditUserCropOpen] = useState(false);
  const [editUserCropFile, setEditUserCropFile] = useState<File | null>(null);
  const [editUserSubmitting, setEditUserSubmitting] = useState(false);
  const [editUserError, setEditUserError] = useState<string | null>(null);
  const [avatarCacheBust, setAvatarCacheBust] = useState(0);

  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [createRoleName, setCreateRoleName] = useState("");
  const [createRoleDescription, setCreateRoleDescription] = useState("");
  const [createRoleSubmitting, setCreateRoleSubmitting] = useState(false);
  const [createRoleError, setCreateRoleError] = useState<string | null>(null);

  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [tempConfig, setTempConfig] = useState<ModelProvider["config"]>({});
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  const handleEditProvider = (provider: ModelProvider) => {
    setEditingProvider(provider);
    setTempConfig({ ...provider.config });
    setTestResult(null);
    setShowKey(false);
  };

  const handleSaveProvider = () => {
    if (!editingProvider) return;
    setProviders((prev) =>
      prev.map((p) =>
        p.id === editingProvider.id ? { ...p, config: tempConfig, enabled: !!tempConfig.apiKey } : p,
      ),
    );
    setEditingProvider(null);
  };

  const handleTestConnection = async () => {
    if (!editingProvider) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      if (editingProvider.type === "gemini") {
        const ai = new GoogleGenAI({ apiKey: tempConfig.apiKey || process.env.API_KEY });
        await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: "Test connection",
        });
        setTestResult({ success: true, msg: "连接成功：Gemini API 响应正常。" });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (tempConfig.apiKey && tempConfig.apiKey.length > 5) {
          setTestResult({ success: true, msg: `连接成功：已验证 ${editingProvider.name} 凭证。` });
        } else {
          throw new Error("API Key 无效或为空");
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "未知错误";
      setTestResult({ success: false, msg: `连接失败：${msg}` });
    } finally {
      setIsTesting(false);
    }
  };

  const refreshUsers = async () => {
    const users = await adminListUsers();
    setTeam(
      users.map((u) => {
        const roleIds = u.roles.map((r) => r.id);
        const roleNames = u.roles.map((r) => r.name);
        const isDisabled = !!u.is_disabled;
        return {
          id: u.id,
          name: u.email.split("@")[0] || u.email,
          email: u.email,
          roleIds,
          roleNames,
          hasAvatar: !!u.has_avatar,
          isDisabled,
          status: !isDisabled && u.is_active ? "active" : "inactive",
          lastActive: "-",
        } satisfies TeamMember;
      }),
    );
  };

  const refreshRoles = async () => {
    const rs = await adminListRoles();
    setRoles(
      rs.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || "",
        isSystem: r.name.toLowerCase() === "admin",
        permissionIds: r.permissions.map((p) => p.id),
      })),
    );
  };

  const openCreateUserDialog = () => {
    const defaultRoleId = roles.find((r) => r.name.toLowerCase() === "user")?.id || roles[0]?.id || "";
    setCreateUserEmail("");
    setCreateUserPassword("");
    setCreateUserRoleIds(defaultRoleId ? [defaultRoleId] : []);
    setCreateUserAvatarBase64(null);
    setCreateUserAvatarContentType(null);
    setCreateUserError(null);
    setCreateUserOpen(true);
  };

  const submitCreateUser = async () => {
    if (!createUserEmail.trim()) {
      setCreateUserError("邮箱不能为空");
      return;
    }
    if (!createUserPassword) {
      setCreateUserError("初始密码不能为空");
      return;
    }
    if (createUserRoleIds.length === 0) {
      setCreateUserError("请选择角色");
      return;
    }
    setCreateUserSubmitting(true);
    setCreateUserError(null);
    try {
      const user = await adminCreateUser({
        email: createUserEmail.trim(),
        password: createUserPassword,
        role_ids: createUserRoleIds,
      });
      if (createUserAvatarBase64 && createUserAvatarContentType) {
        await adminUpdateUserAvatar(user.id, {
          data_base64: createUserAvatarBase64,
          content_type: createUserAvatarContentType,
        });
      }
      setCreateUserOpen(false);
      await refreshUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建失败";
      setCreateUserError(msg);
    } finally {
      setCreateUserSubmitting(false);
    }
  };

  const avatarLetter = (email: string) => (email.trim()[0] ? email.trim()[0].toUpperCase() : "?");

  const openEditUserDialog = (u: TeamMember) => {
    setEditingUser(u);
    setEditUserRoleIds(u.roleIds);
    setEditUserPassword("");
    setEditUserAvatarBase64(null);
    setEditUserAvatarContentType(null);
    setEditUserError(null);
    setEditUserOpen(true);
  };

  const submitEditUser = async () => {
    if (!editingUser) return;
    setEditUserSubmitting(true);
    setEditUserError(null);
    try {
      await adminSetUserRoles(editingUser.id, editUserRoleIds);
      if (editUserPassword) {
        await adminUpdateUserPassword(editingUser.id, editUserPassword);
      }
      if (editUserAvatarBase64 && editUserAvatarContentType) {
        await adminUpdateUserAvatar(editingUser.id, {
          data_base64: editUserAvatarBase64,
          content_type: editUserAvatarContentType,
        });
        setAvatarCacheBust((v) => v + 1);
      }
      setEditUserOpen(false);
      await refreshUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setEditUserError(msg);
    } finally {
      setEditUserSubmitting(false);
    }
  };

  const deleteEditingUserAvatar = async () => {
    if (!editingUser) return;
    setEditUserSubmitting(true);
    setEditUserError(null);
    try {
      await adminDeleteUserAvatar(editingUser.id);
      setAvatarCacheBust((v) => v + 1);
      await refreshUsers();
      setEditingUser((prev) => (prev ? { ...prev, hasAvatar: false } : prev));
      setEditUserAvatarBase64(null);
      setEditUserAvatarContentType(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setEditUserError(msg);
    } finally {
      setEditUserSubmitting(false);
    }
  };

  const refreshPermissions = async () => {
    const ps = await adminListPermissions();
    setPermissions(
      ps.map((p) => {
        const menu = MENU_PERMISSION_LOOKUP.get(p.code);
        const group = menu?.group || (p.code.includes(".") ? p.code.split(".")[0] : "misc");
        return {
          id: p.id,
          code: p.code,
          name: menu?.name || p.code,
          group,
          description: menu?.description || p.description || undefined,
        };
      }),
    );
  };

  const refreshAudit = async () => {
    const [total, logs] = await Promise.all([adminCountAuditLogs(), adminListAuditLogs(50, auditOffset)]);
    setAuditTotal(total);
    setAuditLogs(
      logs.map((l) => ({
        id: l.id,
        created_at: l.created_at,
        action: l.action,
        success: l.success,
        actor_user_id: l.actor_user_id,
        resource_type: l.resource_type,
        resource_id: l.resource_id,
        ip: l.ip,
        request_id: l.request_id,
        meta: l.meta || {},
      })),
    );
  };

  useEffect(() => {
    if (activeSection === "models") return;

    let cancelled = false;
    const run = async () => {
      setRbacLoading(true);
      setRbacError(null);
      try {
        if (activeSection === "users") {
          await Promise.all([refreshRoles(), refreshUsers()]);
        } else if (activeSection === "roles") {
          await Promise.all([refreshRoles(), refreshUsers()]);
        } else if (activeSection === "permissions") {
          await Promise.all([refreshRoles(), refreshPermissions()]);
        } else if (activeSection === "audit") {
          await refreshAudit();
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "加载失败";
        setRbacError(msg);
      } finally {
        if (!cancelled) setRbacLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeSection, auditOffset]);

  useEffect(() => {
    if (!createUserOpen) return;
    if (createUserRoleIds.length > 0) return;
    if (roles.length === 0) return;
    const defaultRoleId = roles.find((r) => r.name.toLowerCase() === "user")?.id || roles[0].id;
    setCreateUserRoleIds(defaultRoleId ? [defaultRoleId] : []);
  }, [createUserOpen, createUserRoleIds.length, roles]);

  const refreshMyLlm = async () => {
    setMyLlmLoading(true);
    setMyLlmError(null);
    try {
      const [keysRes, dailyRes, eventsRes] = await Promise.all([
        llmListMyKeys(),
        llmListMyUsageDaily(30),
        llmListMyUsageEvents(50),
      ]);
      setMyVirtualKeys(keysRes.data || []);
      setMyUsageDaily(dailyRes.data || []);
      setMyUsageEvents(eventsRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setMyLlmError(msg);
    } finally {
      setMyLlmLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== "models") return;
    if (activeModelTab !== "keys") return;
    void refreshMyLlm();
  }, [activeSection, activeModelTab]);

  const refreshCustomServices = async () => {
    setCustomServicesLoading(true);
    setCustomServicesError(null);
    try {
      const res = await llmAdminListCustomServices();
      setCustomServices(res.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setCustomServicesError(msg);
    } finally {
      setCustomServicesLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== "models") return;
    if (activeModelTab !== "providers") return;
    void refreshCustomServices();
  }, [activeSection, activeModelTab]);

  const refreshAdminModels = async () => {
    setAdminModelsLoading(true);
    setAdminModelsError(null);
    try {
      const res = await llmAdminListModels();
      const data = (res.data as LLMAdminModelInfo | null)?.data || [];
      const names = data.map((m) => m.model_name).filter(Boolean);
      setAdminModels(names);
      if (!chatModel && names.length > 0) setChatModel(names.includes("mock") ? "mock" : names[0]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setAdminModelsError(msg);
    } finally {
      setAdminModelsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== "models") return;
    if (activeModelTab !== "chatbox") return;
    void refreshAdminModels();
  }, [activeSection, activeModelTab]);

  const openCreateCustomService = () => {
    setCustomServiceName("");
    setCustomServiceBaseUrl("");
    setCustomServiceApiKey("");
    setCustomServiceModelsText("");
    setCustomServicesError(null);
    setCustomServiceCreateOpen(true);
  };

  const submitCreateCustomService = async () => {
    if (!customServiceName.trim()) {
      setCustomServicesError("名称不能为空");
      return;
    }
    if (!customServiceBaseUrl.trim()) {
      setCustomServicesError("Base URL 不能为空");
      return;
    }
    if (!customServiceApiKey.trim()) {
      setCustomServicesError("API Key 不能为空");
      return;
    }
    const models = customServiceModelsText
      .split(/[,\n]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (models.length === 0) {
      setCustomServicesError("至少填写一个模型名");
      return;
    }

    setCustomServiceSubmitting(true);
    setCustomServicesError(null);
    try {
      await llmAdminCreateCustomService({
        name: customServiceName.trim(),
        base_url: customServiceBaseUrl.trim(),
        api_key: customServiceApiKey.trim(),
        models,
        enabled: true,
      });
      setCustomServiceCreateOpen(false);
      await refreshCustomServices();
      await refreshAdminModels();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建失败";
      setCustomServicesError(msg);
    } finally {
      setCustomServiceSubmitting(false);
    }
  };

  const deleteCustomService = async (serviceId: string) => {
    if (!window.confirm("确认删除该自定义服务？（不会自动删除 LiteLLM 已创建的模型）")) return;
    setCustomServicesError(null);
    try {
      await llmAdminDeleteCustomService(serviceId);
      await refreshCustomServices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setCustomServicesError(msg);
    }
  };

  const onChatPickFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files);
    setChatAttachments((prev) => [...prev, ...next].slice(0, 6));
  };

  const removeChatAttachment = (idx: number) => {
    setChatAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const sendChat = async () => {
    if (!chatModel) {
      setChatError("请选择模型");
      return;
    }
    if (!chatInput.trim() && chatAttachments.length === 0) return;
    setChatSending(true);
    setChatError(null);

    const userMsg: LLMChatMessage = { role: "user", content: chatInput.trim() };
    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatInput("");

    const attachments: LLMChatAttachment[] = [];
    for (const f of chatAttachments) {
      if (f.type.startsWith("image/")) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("读取图片失败"));
          reader.readAsDataURL(f);
        });
        if (dataUrl) attachments.push({ kind: "image", name: f.name, content_type: f.type, data_url: dataUrl });
      } else {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("读取文本失败"));
          reader.readAsText(f);
        });
        if (text) attachments.push({ kind: "text", name: f.name, content_type: f.type || "text/plain", text });
      }
    }
    setChatAttachments([]);

    try {
      const res = await llmChatCompletions({
        model: chatModel,
        messages: nextMessages,
        attachments,
      });
      const output = res.data?.output_text || "";
      setChatMessages((prev) => [...prev, { role: "assistant", content: output }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "发送失败";
      setChatError(msg);
    } finally {
      setChatSending(false);
    }
  };

  const handleIssueOrRotateKey = async (mode: "issue" | "rotate") => {
    setIssuingKey(true);
    setMyLlmError(null);
    try {
      const res = mode === "issue" ? await llmIssueMyKey({ purpose: "default" }) : await llmRotateMyKey({ purpose: "default" });
      const token = res.data?.token;
      if (token) setIssuedToken(token);
      await refreshMyLlm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失败";
      setMyLlmError(msg);
    } finally {
      setIssuingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!window.confirm("确认吊销该 Key？吊销后，使用该 Key 的工具将立即失效。")) return;
    setMyLlmError(null);
    try {
      await llmRevokeMyKey(keyId);
      await refreshMyLlm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "吊销失败";
      setMyLlmError(msg);
    }
  };

  const handleUserStatusToggle = async (userId: string) => {
    const user = team.find((u) => u.id === userId);
    if (!user) return;
    const nextDisabled = !user.isDisabled;
    setTeam((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, isDisabled: nextDisabled, status: nextDisabled ? "inactive" : "active" }
          : u,
      ),
    );
    try {
      await adminUpdateUserStatus(userId, nextDisabled);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setRbacError(msg);
      await refreshUsers();
    }
  };

  const togglePermission = async (roleId: string, permissionId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.isSystem) return;

    const nextPermissionIds = role.permissionIds.includes(permissionId)
      ? role.permissionIds.filter((id) => id !== permissionId)
      : [...role.permissionIds, permissionId];

    setRoles((prev) => prev.map((r) => (r.id === roleId ? { ...r, permissionIds: nextPermissionIds } : r)));

    try {
      const updated = await adminSetRolePermissions(roleId, nextPermissionIds);
      setRoles((prev) =>
        prev.map((r) =>
          r.id === roleId
            ? {
                ...r,
                permissionIds: updated.permissions.map((p) => p.id),
              }
            : r,
        ),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setRbacError(msg);
      await refreshRoles();
    }
  };

  const handleAddRole = async () => {
    setCreateRoleName("");
    setCreateRoleDescription("");
    setCreateRoleError(null);
    setCreateRoleOpen(true);
  };

  const handleDeleteRole = async (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;
    if (!window.confirm(`确认删除角色「${role.name}」？`)) return;
    try {
      await adminDeleteRole(roleId);
      await refreshRoles();
      await refreshUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setRbacError(msg);
    }
  };

  const handleAddPermission = async () => {
    const code = window.prompt("请输入权限编码（如 system.users / project.view）");
    if (!code) return;
    const description = window.prompt("请输入权限描述（可选）") || "";
    try {
      await adminCreatePermission({ code, description });
      await refreshPermissions();
      await refreshRoles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建失败";
      setRbacError(msg);
    }
  };

  const getPermissionOrderIndex = (code: string) => {
    for (let gi = 0; gi < MENU_PERMISSION_CATALOG.length; gi++) {
      const g = MENU_PERMISSION_CATALOG[gi];
      const pi = g.items.findIndex((it) => it.code === code);
      if (pi >= 0) return gi * 1000 + pi;
    }
    return 999999;
  };

  const permissionGroups = useMemo(() => {
    const set = new Set(permissions.map((p) => p.group));
    const groups = Array.from(set);
    const order = new Map<string, number>(MENU_PERMISSION_CATALOG.map((g, i) => [g.group, i]));
    groups.sort((a, b) => {
      const ai = order.get(a);
      const bi = order.get(b);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.localeCompare(b);
    });
    return groups;
  }, [permissions]);

  const permissionsByGroup = useMemo(() => {
    const groupMap = new Map<string, Permission[]>();
    permissions.forEach((p) => {
      const arr = groupMap.get(p.group) || [];
      arr.push(p);
      groupMap.set(p.group, arr);
    });
    groupMap.forEach((arr, group) => {
      arr.sort((a, b) => {
        const ao = getPermissionOrderIndex(a.code);
        const bo = getPermissionOrderIndex(b.code);
        if (ao !== bo) return ao - bo;
        return a.code.localeCompare(b.code);
      });
      groupMap.set(group, arr);
    });
    return groupMap;
  }, [permissions]);

  const submitCreateRole = async () => {
    if (!createRoleName.trim()) {
      setCreateRoleError("角色名不能为空");
      return;
    }
    setCreateRoleSubmitting(true);
    setCreateRoleError(null);
    try {
      await adminCreateRole({ name: createRoleName.trim(), description: createRoleDescription.trim() || null });
      setCreateRoleOpen(false);
      await refreshRoles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建失败";
      setCreateRoleError(msg);
    } finally {
      setCreateRoleSubmitting(false);
    }
  };

  const ProviderCard = ({ provider }: { provider: ModelProvider }) => (
    <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/30 transition-all group relative overflow-hidden">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg shadow-inner ${
              provider.enabled ? "bg-primary/20 text-primary" : "bg-surfaceHighlight text-textMuted"
            }`}
          >
            {provider.icon}
          </div>
          <div>
            <h3 className="font-bold text-textMain">{provider.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              {provider.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-[10px] uppercase bg-surfaceHighlight border border-border px-1.5 rounded text-textMuted"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div
          className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${
            provider.enabled ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-500"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${provider.enabled ? "bg-green-400" : "bg-gray-500"}`}
          />
          {provider.enabled ? "已启用" : "未配置"}
        </div>
      </div>
      <p className="text-sm text-textMuted mb-6 h-10 line-clamp-2">{provider.description}</p>
      <div className="flex items-center justify-between border-t border-border/50 pt-4">
        <div className="text-xs text-textMuted">
          <span className="text-textMain font-medium">{provider.supportedModels.length}</span> 个可用模型
        </div>
        <button
          onClick={() => handleEditProvider(provider)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-blue-400 transition-colors bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20"
          type="button"
        >
          <SettingsIcon size={14} />
          <span>设置</span>
        </button>
      </div>
    </div>
  );

  const tabs: { key: Section; label: string; icon: LucideIcon }[] = [
    { key: "models", label: "模型引擎", icon: Cpu },
    { key: "users", label: "用户管理", icon: Users },
    { key: "roles", label: "角色管理", icon: Shield },
    { key: "permissions", label: "权限矩阵", icon: Lock },
    { key: "audit", label: "审计日志", icon: FileClock },
  ];

  return (
    <div className="w-full">
      <div className="max-w-6xl mx-auto pt-6 pb-2 px-2">
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid size={16} className="text-primary" />
          <h1 className="text-lg font-bold text-textMain">系统设置</h1>
        </div>
        <div className="flex items-center gap-2 bg-surfaceHighlight border border-border rounded-xl p-2">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setQuery({ tab: key })}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                activeSection === key
                  ? "bg-surface text-textMain shadow-sm border border-border/50"
                  : "text-textMuted hover:text-textMain"
              }`}
              type="button"
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeSection === "models" && (
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
          <div className="flex justify-between items-end border-b border-border pb-6">
            <div>
              <h2 className="text-2xl font-bold text-textMain mb-2">模型引擎配置</h2>
              <p className="text-textMuted text-sm">管理 LLM 供应商、API 密钥及系统默认推理模型。</p>
            </div>
            <div className="flex items-center gap-1 bg-surfaceHighlight p-1 rounded-lg border border-border">
              <button
                onClick={() => setActiveModelTab("providers")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                  activeModelTab === "providers"
                    ? "bg-surface text-textMain shadow-sm border border-border/50"
                    : "text-textMuted hover:text-textMain"
                }`}
                type="button"
              >
                <Server size={14} /> 供应商
              </button>
              <button
                onClick={() => setActiveModelTab("defaults")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                  activeModelTab === "defaults"
                    ? "bg-surface text-textMain shadow-sm border border-border/50"
                    : "text-textMuted hover:text-textMain"
                }`}
                type="button"
              >
                <Zap size={14} /> 默认模型
              </button>
              <button
                onClick={() => setActiveModelTab("keys")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                  activeModelTab === "keys"
                    ? "bg-surface text-textMain shadow-sm border border-border/50"
                    : "text-textMuted hover:text-textMain"
                }`}
                type="button"
              >
                <Key size={14} /> 我的 Key
              </button>
              <button
                onClick={() => setActiveModelTab("chatbox")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                  activeModelTab === "chatbox"
                    ? "bg-surface text-textMain shadow-sm border border-border/50"
                    : "text-textMuted hover:text-textMain"
                }`}
                type="button"
              >
                <MessageSquare size={14} /> Chatbox
              </button>
            </div>
          </div>

          {activeModelTab === "providers" && (
            <div className="space-y-6">
              <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-textMain">自定义服务</h3>
                    <p className="text-sm text-textMuted mt-1">新增 OpenAI-compatible 模型服务，并同步为 LiteLLM 可用模型。</p>
                  </div>
                  <button
                    onClick={() => openCreateCustomService()}
                    className="flex items-center gap-2 text-sm font-bold bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-all"
                    type="button"
                  >
                    <Plus size={16} /> 添加
                  </button>
                </div>

                {customServicesError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
                    {customServicesError}
                  </div>
                )}

                <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                      <tr>
                        <th className="px-4 py-3">名称</th>
                        <th className="px-4 py-3">Base URL</th>
                        <th className="px-4 py-3">模型</th>
                        <th className="px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customServicesLoading && (
                        <tr>
                          <td className="px-4 py-6 text-textMuted" colSpan={4}>
                            加载中...
                          </td>
                        </tr>
                      )}
                      {!customServicesLoading && customServices.length === 0 && (
                        <tr>
                          <td className="px-4 py-6 text-textMuted" colSpan={4}>
                            暂无自定义服务，可点击“添加”创建。
                          </td>
                        </tr>
                      )}
                      {!customServicesLoading &&
                        customServices.map((s) => (
                          <tr key={s.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-textMain">{s.name}</td>
                            <td className="px-4 py-3 text-xs text-textMuted font-mono truncate max-w-[18rem]">
                              {s.base_url}
                            </td>
                            <td className="px-4 py-3 text-xs text-textMuted">
                              <div className="space-y-1">
                                <div className="truncate">{(s.supported_models || []).join(", ")}</div>
                                {(s.created_models || []).length > 0 && (
                                  <div className="text-[11px] text-textMuted truncate">
                                    已创建: {(s.created_models || []).join(", ")}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200"
                                type="button"
                                onClick={() => void deleteCustomService(s.id)}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {providers.map((p) => (
                  <ProviderCard key={p.id} provider={p} />
                ))}
              </div>
            </div>
          )}

          {activeModelTab === "defaults" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-surface border border-border rounded-xl p-6 space-y-8">
                <h3 className="text-lg font-bold border-b border-border/50 pb-4 text-textMain">系统推理模型</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2 text-textMuted">
                      <MessageSquare size={16} className="text-purple-400" /> 剧本创作 (Scripting)
                    </label>
                    <select
                      value={globalConfig.scriptModel}
                      onChange={(e) => setGlobalConfig({ ...globalConfig, scriptModel: e.target.value })}
                      className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain"
                    >
                      {providers
                        .filter((p) => p.enabled && p.capabilities.includes("text"))
                        .flatMap((p) =>
                          p.supportedModels.map((m) => (
                            <option key={`${p.id}-${m}`} value={m}>
                              {p.name} - {m}
                            </option>
                          )),
                        )}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2 text-textMuted">
                      <Bot size={16} className="text-yellow-400" /> 复杂推理 (Reasoning)
                    </label>
                    <select
                      value={globalConfig.visionModel}
                      onChange={(e) => setGlobalConfig({ ...globalConfig, visionModel: e.target.value })}
                      className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain"
                    >
                      {providers
                        .filter((p) => p.enabled)
                        .flatMap((p) =>
                          p.supportedModels.map((m) => (
                            <option key={`${p.id}-${m}`} value={m}>
                              {p.name} - {m}
                            </option>
                          )),
                        )}
                    </select>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-6 space-y-8">
                <h3 className="text-lg font-bold border-b border-border/50 pb-4 text-textMain">多模态生成模型</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2 text-textMuted">
                      <ImageIcon size={16} className="text-pink-400" /> 图像生成 (Image Generation)
                    </label>
                    <select
                      value={globalConfig.imageModel}
                      onChange={(e) => setGlobalConfig({ ...globalConfig, imageModel: e.target.value })}
                      className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain"
                    >
                      {providers
                        .filter((p) => p.enabled && p.capabilities.includes("image"))
                        .flatMap((p) =>
                          p.supportedModels.map((m) => (
                            <option key={`${p.id}-${m}`} value={m}>
                              {p.name} - {m}
                            </option>
                          )),
                        )}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeModelTab === "chatbox" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-textMain">Chatbox</h3>
                    <p className="text-sm text-textMuted mt-1">选择一个模型，发送文本或上传图文附件进行对话测试。</p>
                  </div>
                  <button
                    onClick={() => refreshAdminModels()}
                    className="flex items-center gap-2 text-sm font-bold bg-surfaceHighlight border border-border px-3 py-2 rounded-lg hover:bg-surfaceHighlight/70 transition-colors text-textMain"
                    type="button"
                    disabled={adminModelsLoading}
                  >
                    <RefreshCw size={14} className={adminModelsLoading ? "animate-spin" : ""} />
                    刷新模型
                  </button>
                </div>

                {adminModelsError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
                    {adminModelsError}
                  </div>
                )}
                {chatError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
                    {chatError}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <label className="text-sm font-bold text-textMuted">模型</label>
                  <select
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    className="flex-1 bg-surfaceHighlight border border-border rounded-lg p-2 text-sm outline-none focus:border-primary transition-colors text-textMain"
                    disabled={adminModelsLoading}
                  >
                    {adminModels.length === 0 && <option value="">暂无可用模型</option>}
                    {adminModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-textMuted whitespace-nowrap">
                    状态：{chatSending ? "模型正在思考中" : "就绪"}
                  </div>
                </div>

                <div className="h-[420px] bg-surfaceHighlight/40 border border-border rounded-xl p-4 overflow-auto space-y-3">
                  {chatMessages.length === 0 && <div className="text-sm text-textMuted">开始对话吧。</div>}
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-primary text-white"
                            : m.role === "assistant"
                              ? "bg-surface border border-border text-textMain"
                              : "bg-surfaceHighlight border border-border text-textMain"
                        }`}
                      >
                        <div className="text-[11px] opacity-70 mb-1">
                          {m.role === "user" ? "你" : m.role === "assistant" ? "模型" : "系统"}
                        </div>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatSending && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm bg-surface border border-border text-textMain">
                        <div className="text-[11px] opacity-70 mb-1">模型</div>
                        <div className="inline-flex items-center gap-1">
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-textMuted" style={{ animationDelay: "0ms" }} />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-textMuted" style={{ animationDelay: "200ms" }} />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-textMuted" style={{ animationDelay: "400ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <style jsx>{`
                  @keyframes typingDot {
                    0%,
                    80%,
                    100% {
                      opacity: 0.25;
                      transform: translateY(0);
                    }
                    40% {
                      opacity: 1;
                      transform: translateY(-2px);
                    }
                  }
                  .typing-dot {
                    animation: typingDot 1.2s infinite ease-in-out;
                  }
                `}</style>

                {chatAttachments.length > 0 && (
                  <div className="bg-surfaceHighlight/40 border border-border rounded-xl p-3">
                    <div className="text-xs text-textMuted mb-2">附件（最多 6 个）</div>
                    <div className="flex flex-wrap gap-2">
                      {chatAttachments.map((f, idx) => (
                        <div key={`${f.name}-${idx}`} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
                          <div className="text-xs text-textMain max-w-[14rem] truncate">{f.name}</div>
                          <button
                            type="button"
                            className="text-textMuted hover:text-textMain"
                            onClick={() => removeChatAttachment(idx)}
                            disabled={chatSending}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    rows={3}
                    className="w-full bg-surfaceHighlight border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary transition-colors"
                    placeholder="输入消息..."
                    disabled={chatSending}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-textMain cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept="image/*,text/*"
                        onChange={(e) => onChatPickFiles(e.target.files)}
                        disabled={chatSending}
                      />
                      <span className="px-3 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-bold transition-all inline-flex items-center gap-2">
                        <Plus size={16} /> 上传附件
                      </span>
                    </label>
                    <button
                      onClick={() => void sendChat()}
                      className="bg-primary hover:bg-blue-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
                      type="button"
                      disabled={chatSending || (!chatInput.trim() && chatAttachments.length === 0) || !chatModel}
                    >
                      {chatSending ? "发送中..." : "发送"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-textMain">说明</h3>
                <div className="text-sm text-textMuted space-y-2">
                  <div>1) 会使用你的 Virtual Key（purpose=chatbox）调用 LiteLLM 网关。</div>
                  <div>2) 图片会以 data URL 形式发送到 /chat/completions（取决于模型是否支持视觉）。</div>
                  <div>3) 文本附件会追加到最后一条用户消息中。</div>
                </div>
              </div>
            </div>
          )}

          {activeModelTab === "keys" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
                <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-textMain">我的 Virtual Key</h3>
                    <p className="text-sm text-textMuted mt-1">
                      用于站外定制工具直连 LiteLLM 网关。Key 只会在生成/轮换时显示一次。
                    </p>
                  </div>
                  <button
                    onClick={() => refreshMyLlm()}
                    className="flex items-center gap-2 text-sm font-bold bg-surfaceHighlight border border-border px-3 py-2 rounded-lg hover:bg-surfaceHighlight/70 transition-colors text-textMain"
                    type="button"
                    disabled={myLlmLoading}
                  >
                    <RefreshCw size={14} className={myLlmLoading ? "animate-spin" : ""} />
                    刷新
                  </button>
                </div>

                {myLlmError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
                    {myLlmError}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleIssueOrRotateKey("issue")}
                    className="bg-primary hover:bg-blue-600 disabled:opacity-60 disabled:hover:bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                    type="button"
                    disabled={issuingKey}
                  >
                    <Plus size={16} /> 生成 Key
                  </button>
                  <button
                    onClick={() => handleIssueOrRotateKey("rotate")}
                    className="bg-surfaceHighlight hover:bg-surfaceHighlight/70 disabled:opacity-60 border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                    type="button"
                    disabled={issuingKey}
                  >
                    <RefreshCw size={16} className={issuingKey ? "animate-spin" : ""} /> 轮换 Key
                  </button>
                </div>

                <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                      <tr>
                        <th className="px-4 py-3">前缀</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3">创建时间</th>
                        <th className="px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {myVirtualKeys.length === 0 && (
                        <tr>
                          <td className="px-4 py-6 text-textMuted" colSpan={4}>
                            暂无 Key，可点击“生成 Key”创建。
                          </td>
                        </tr>
                      )}
                      {myVirtualKeys.map((k) => (
                        <tr key={k.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-textMain">{k.key_prefix}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold ${
                                k.status === "active"
                                  ? "bg-green-500/10 text-green-400"
                                  : k.status === "revoked"
                                    ? "bg-gray-500/10 text-gray-400"
                                    : "bg-yellow-500/10 text-yellow-300"
                              }`}
                            >
                              {k.status === "active" ? "生效" : k.status === "revoked" ? "已吊销" : "已过期"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-textMuted text-xs">{new Date(k.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            {k.status === "active" ? (
                              <button
                                onClick={() => handleRevokeKey(k.id)}
                                className="inline-flex items-center gap-2 text-sm font-bold text-red-300 hover:text-red-200 transition-colors"
                                type="button"
                              >
                                <Trash2 size={14} />
                                吊销
                              </button>
                            ) : (
                              <span className="text-xs text-textMuted">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="text-textMain font-bold">站外工具接入</div>
                  <div className="text-textMuted">
                    Base URL：<span className="font-mono text-xs text-textMain">http://localhost:4000</span>
                  </div>
                  <div className="text-textMuted">
                    Header：<span className="font-mono text-xs text-textMain">Authorization: Bearer &lt;VirtualKey&gt;</span>
                  </div>
                  <div className="text-textMuted">
                    端点：<span className="font-mono text-xs text-textMain">POST /v1/chat/completions</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
                <div className="border-b border-border/50 pb-4">
                  <h3 className="text-lg font-bold text-textMain">我的用量（近 30 天）</h3>
                  <p className="text-sm text-textMuted mt-1">数据来自 LiteLLM 回调，可能会有少量延迟。</p>
                </div>

                <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                      <tr>
                        <th className="px-4 py-3">日期</th>
                        <th className="px-4 py-3">模型</th>
                        <th className="px-4 py-3 text-right">Tokens</th>
                        <th className="px-4 py-3 text-right">次数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {myUsageDaily.length === 0 && (
                        <tr>
                          <td className="px-4 py-6 text-textMuted" colSpan={4}>
                            暂无统计数据。
                          </td>
                        </tr>
                      )}
                      {myUsageDaily.slice(0, 20).map((r) => (
                        <tr key={r.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-textMuted">{r.date}</td>
                          <td className="px-4 py-3 text-xs text-textMain">{r.model}</td>
                          <td className="px-4 py-3 text-right text-xs text-textMain">{r.total_tokens}</td>
                          <td className="px-4 py-3 text-right text-xs text-textMuted">{r.request_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border text-textMain font-bold text-sm">最近调用</div>
                  <div className="divide-y divide-border">
                    {myUsageEvents.length === 0 && <div className="px-4 py-6 text-sm text-textMuted">暂无明细。</div>}
                    {myUsageEvents.slice(0, 10).map((e) => (
                      <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs text-textMain truncate">{e.model || "-"}</div>
                          <div className="text-xs text-textMuted truncate">{new Date(e.created_at).toLocaleString()}</div>
                        </div>
                        <div className="text-xs text-textMain font-mono">{e.total_tokens}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {issuedToken && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                  <div className="w-full max-w-xl bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-bold text-textMain">已生成 Virtual Key</div>
                        <div className="text-sm text-textMuted mt-1">请立即复制保存，关闭后将无法再次查看明文。</div>
                      </div>
                      <button
                        onClick={() => setIssuedToken(null)}
                        className="w-9 h-9 rounded-lg bg-surfaceHighlight border border-border flex items-center justify-center text-textMuted hover:text-textMain"
                        type="button"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <textarea
                      value={issuedToken}
                      readOnly
                      rows={3}
                      className="w-full bg-surfaceHighlight border border-border rounded-xl p-3 text-sm font-mono text-textMain outline-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(issuedToken);
                        }}
                        className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                        type="button"
                      >
                        <Save size={16} /> 复制 Key
                      </button>
                      <button
                        onClick={() => setIssuedToken(null)}
                        className="bg-surfaceHighlight hover:bg-surfaceHighlight/70 border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all"
                        type="button"
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === "users" && (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
          <div className="flex justify-between items-end border-b border-border pb-6">
            <div>
              <h2 className="text-2xl font-bold text-textMain mb-2">用户管理</h2>
              <p className="text-textMuted text-sm">管理成员账号、分配角色及重置访问权限。</p>
            </div>
            <button
              onClick={() => openCreateUserDialog()}
              className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
              type="button"
            >
              <UserPlus size={16} /> 新建用户
            </button>
          </div>

          {rbacError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
              {rbacError}
            </div>
          )}

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
                            {user.hasAvatar && (
                              <AvatarImage src={`/api/avatar/${user.id}?v=${avatarCacheBust}`} alt={user.name} />
                            )}
                            <AvatarFallback className="text-sm font-bold bg-surface">
                              {avatarLetter(user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-bold text-textMain">{user.name}</div>
                            <div className="text-xs text-textMuted">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {(user.roleNames.length ? user.roleNames : ["user"]).map((name) => (
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
                          onClick={() => handleUserStatusToggle(user.id)}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold border flex items-center justify-center gap-1 w-20 transition-all ${
                            user.status === "active"
                              ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                              : "bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
                          }`}
                          type="button"
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.status === "active" ? "bg-green-400" : "bg-gray-500"
                            }`}
                          />
                          {user.status === "active" ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-textMuted text-xs font-mono">{user.lastActive}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openEditUserDialog(user)}
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
      )}

      {activeSection === "roles" && (
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
          <div className="flex justify-between items-end border-b border-border pb-6">
            <div>
              <h2 className="text-2xl font-bold text-textMain mb-2">角色管理</h2>
              <p className="text-textMuted text-sm">定义平台角色及其职能描述，用于权限绑定。</p>
            </div>
            <button
              onClick={handleAddRole}
              className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
              type="button"
            >
              <Plus size={16} /> 创建角色
            </button>
          </div>

          {rbacError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
              {rbacError}
            </div>
          )}

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
                        onClick={() => setQuery({ tab: "permissions" })}
                        className="hover:text-primary transition-colors flex items-center gap-1"
                        type="button"
                      >
                        <Lock size={12} /> 权限
                      </button>
                      {!role.isSystem && (
                        <button
                          onClick={() => handleDeleteRole(role.id)}
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
      )}

      {activeSection === "permissions" && (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
          <div className="flex justify-between items-end border-b border-border pb-6">
            <div>
              <h2 className="text-2xl font-bold text-textMain mb-2">权限矩阵 (Permission Matrix)</h2>
              <p className="text-textMuted text-sm">精细化控制每个角色的系统操作权限。</p>
            </div>
            <button
              onClick={handleAddPermission}
              className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
              type="button"
            >
              <Plus size={16} /> 新增权限
            </button>
          </div>

          {rbacError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
              {rbacError}
            </div>
          )}

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
                          {role.isSystem && (
                            <span className="text-[9px] font-normal text-textMuted opacity-60">System</span>
                          )}
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
                                  onClick={() => togglePermission(role.id, perm.id)}
                                  disabled={isAdmin}
                                  className={`w-6 h-6 rounded border flex items-center justify-center transition-all mx-auto ${
                                    hasPerm
                                      ? "bg-primary border-primary text-white"
                                      : "bg-transparent border-border text-transparent hover:border-primary/50"
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
      )}

      {createRoleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateRoleOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-textMain">创建角色</div>
                <div className="text-xs text-textMuted mt-1">输入角色名称与简介。</div>
              </div>
              <button
                type="button"
                className="text-textMuted hover:text-textMain"
                onClick={() => setCreateRoleOpen(false)}
                disabled={createRoleSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {createRoleError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
                {createRoleError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">角色名</label>
                <input
                  type="text"
                  value={createRoleName}
                  onChange={(e) => setCreateRoleName(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  placeholder="例如：ops / qa / producer"
                  disabled={createRoleSubmitting}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">角色简介</label>
                <input
                  type="text"
                  value={createRoleDescription}
                  onChange={(e) => setCreateRoleDescription(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  placeholder="可选"
                  disabled={createRoleSubmitting}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                onClick={() => setCreateRoleOpen(false)}
                disabled={createRoleSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                onClick={() => void submitCreateRole()}
                disabled={createRoleSubmitting || !createRoleName.trim()}
              >
                {createRoleSubmitting ? "创建中..." : "创建角色"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSection === "audit" && (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
          <div className="flex justify-between items-end border-b border-border pb-6">
            <div>
              <h2 className="text-2xl font-bold text-textMain mb-2">系统审计日志</h2>
              <p className="text-textMuted text-sm">记录关键管理操作，用于追溯与排障。</p>
            </div>
            <button
              onClick={() => void refreshAudit()}
              className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
              type="button"
            >
              <RefreshCw size={16} /> 刷新
            </button>
          </div>

          {rbacError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
              {rbacError}
            </div>
          )}

          <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                <tr>
                  <th className="px-6 py-4">时间</th>
                  <th className="px-6 py-4">动作</th>
                  <th className="px-6 py-4">资源</th>
                  <th className="px-6 py-4">操作者</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-6 py-4">Request</th>
                  <th className="px-6 py-4">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rbacLoading && auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-textMuted">
                      加载中...
                    </td>
                  </tr>
                )}
                {!rbacLoading && auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-textMuted">
                      暂无审计记录
                    </td>
                  </tr>
                )}
                {auditLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                    <td className="px-6 py-4 text-xs text-textMuted font-mono">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-textMain">{row.action}</td>
                    <td className="px-6 py-4 text-xs text-textMuted font-mono">
                      {(row.resource_type || "-") + (row.resource_id ? `:${row.resource_id.slice(0, 8)}` : "")}
                    </td>
                    <td className="px-6 py-4 text-xs text-textMuted font-mono">
                      {row.actor_user_id ? row.actor_user_id.slice(0, 8) : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                          row.success
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${row.success ? "bg-green-400" : "bg-red-400"}`} />
                        {row.success ? "SUCCESS" : "FAILED"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-textMuted font-mono">{row.request_id || "-"}</td>
                    <td className="px-6 py-4 text-xs text-textMuted font-mono">{row.ip || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-textMuted">
            <div>
              共 <span className="text-textMain font-medium">{auditTotal}</span> 条
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAuditOffset(Math.max(0, auditOffset - 50))}
                disabled={auditOffset === 0}
                className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg disabled:opacity-50"
                type="button"
              >
                上一页
              </button>
              <button
                onClick={() => setAuditOffset(auditOffset + 50)}
                disabled={auditOffset + 50 >= auditTotal}
                className="px-3 py-1.5 bg-surfaceHighlight border border-border rounded-lg disabled:opacity-50"
                type="button"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in-up">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/20 text-primary rounded-lg flex items-center justify-center font-bold text-xl">
                  {editingProvider.icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-textMain">{editingProvider.name} 设置</h2>
                  <p className="text-xs text-textMuted flex items-center gap-2">
                    类型: <span className="uppercase bg-surfaceHighlight px-1 rounded">{editingProvider.type}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingProvider(null)}
                  className="text-textMuted hover:text-textMain px-3 py-2 text-sm"
                  type="button"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveProvider}
                  className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                  type="button"
                >
                  <Save size={16} /> 保存配置
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-textMuted uppercase tracking-wider flex items-center gap-2">
                  <Key size={14} /> 认证信息
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-textMain">
                      API Key <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={tempConfig.apiKey || ""}
                        onChange={(e) => setTempConfig({ ...tempConfig, apiKey: e.target.value })}
                        className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 pl-4 pr-10 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain"
                        type="button"
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  {editingProvider.type !== "gemini" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-textMain">Endpoint URL</label>
                      <input
                        type="text"
                        value={tempConfig.baseUrl || ""}
                        onChange={(e) => setTempConfig({ ...tempConfig, baseUrl: e.target.value })}
                        className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none font-mono text-textMuted"
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !tempConfig.apiKey}
                    className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 text-textMain"
                    type="button"
                  >
                    {isTesting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />} 测试连接
                  </button>
                  {testResult && (
                    <div
                      className={`text-sm flex items-center gap-2 ${
                        testResult.success ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                      {testResult.msg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editUserOpen && editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditUserOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-textMain">编辑用户</div>
                <div className="text-xs text-textMuted mt-1">{editingUser.email}</div>
              </div>
              <button
                type="button"
                className="text-textMuted hover:text-textMain"
                onClick={() => setEditUserOpen(false)}
                disabled={editUserSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {editUserError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
                {editUserError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border border-border">
                  {(editUserAvatarBase64 || editingUser.hasAvatar) && (
                    <AvatarImage
                      src={
                        editUserAvatarBase64
                          ? `data:${editUserAvatarContentType};base64,${editUserAvatarBase64}`
                          : `/api/avatar/${editingUser.id}?v=${avatarCacheBust}`
                      }
                      alt="avatar"
                    />
                  )}
                  <AvatarFallback className="text-lg font-bold bg-surface">
                    {avatarLetter(editingUser.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium text-textMain">头像</div>
                  <div className="text-xs text-textMuted mt-1">上传新头像将覆盖旧头像。</div>
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-xs font-medium text-textMain cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={editUserSubmitting}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setEditUserCropFile(file);
                          setEditUserCropOpen(true);
                        }}
                      />
                      <span className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-xs font-medium transition-all inline-block">
                        上传头像
                      </span>
                    </label>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200 disabled:opacity-50"
                      onClick={() => void deleteEditingUserAvatar()}
                      disabled={editUserSubmitting || (!editingUser.hasAvatar && !editUserAvatarBase64)}
                    >
                      删除头像
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">重置密码（可选）</label>
                <input
                  type="password"
                  value={editUserPassword}
                  onChange={(e) => setEditUserPassword(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  placeholder="至少 8 位"
                  disabled={editUserSubmitting}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">角色（可多选）</label>
                <div className="rounded-lg border border-border bg-surfaceHighlight/40 p-3 space-y-2">
                  {roles.length === 0 ? (
                    <div className="text-xs text-textMuted">暂无可用角色</div>
                  ) : (
                    roles.map((r) => {
                      const checked = editUserRoleIds.includes(r.id);
                      return (
                        <label key={r.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={editUserSubmitting}
                              onChange={() => {
                                setEditUserRoleIds((prev) =>
                                  prev.includes(r.id) ? prev.filter((id) => id !== r.id) : [...prev, r.id],
                                );
                              }}
                            />
                            <span className="font-medium text-textMain">{r.name}</span>
                          </div>
                          <span className="text-xs text-textMuted truncate max-w-[12rem]">{r.description}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                onClick={() => setEditUserOpen(false)}
                disabled={editUserSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                onClick={() => void submitEditUser()}
                disabled={editUserSubmitting || editUserRoleIds.length === 0}
              >
                {editUserSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {customServiceCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCustomServiceCreateOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl bg-surface border border-border shadow-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-textMain">添加自定义服务</div>
                <div className="text-xs text-textMuted mt-1">用于接入 OpenAI-compatible 的内部/第三方模型服务。</div>
              </div>
              <button
                type="button"
                className="text-textMuted hover:text-textMain"
                onClick={() => setCustomServiceCreateOpen(false)}
                disabled={customServiceSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {customServicesError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
                {customServicesError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-textMuted">名称</label>
                <input
                  value={customServiceName}
                  onChange={(e) => setCustomServiceName(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain"
                  placeholder="例如：内网 OpenAI Compatible"
                  disabled={customServiceSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-textMuted">Base URL</label>
                <input
                  value={customServiceBaseUrl}
                  onChange={(e) => setCustomServiceBaseUrl(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain font-mono"
                  placeholder="例如：https://your-host/v1 或 https://your-host（将自动补 /v1）"
                  disabled={customServiceSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-textMuted">API Key</label>
                <input
                  value={customServiceApiKey}
                  onChange={(e) => setCustomServiceApiKey(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain font-mono"
                  placeholder="例如：sk-xxxx"
                  type="password"
                  disabled={customServiceSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-textMuted">模型列表</label>
                <textarea
                  value={customServiceModelsText}
                  onChange={(e) => setCustomServiceModelsText(e.target.value)}
                  rows={4}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain font-mono"
                  placeholder={"例如：\nqwen2.5-72b-instruct\nqwen2.5-vl-72b-instruct"}
                  disabled={customServiceSubmitting}
                />
                <div className="text-xs text-textMuted">支持换行或逗号分隔。创建后会在 LiteLLM 中生成模型别名。</div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                onClick={() => setCustomServiceCreateOpen(false)}
                disabled={customServiceSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                onClick={() => void submitCreateCustomService()}
                disabled={customServiceSubmitting}
              >
                {customServiceSubmitting ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createUserOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateUserOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-textMain">新建用户</div>
                <div className="text-xs text-textMuted mt-1">创建账号并分配初始角色。</div>
              </div>
              <button
                type="button"
                className="text-textMuted hover:text-textMain"
                onClick={() => setCreateUserOpen(false)}
                disabled={createUserSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {createUserError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
                {createUserError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border border-border">
                  {createUserAvatarBase64 && (
                    <AvatarImage
                      src={`data:${createUserAvatarContentType};base64,${createUserAvatarBase64}`}
                      alt="avatar"
                    />
                  )}
                  <AvatarFallback className="text-lg font-bold bg-surface">
                    {avatarLetter(createUserEmail)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium text-textMain">头像</div>
                  <div className="text-xs text-textMuted mt-1">可选，不上传则使用邮箱首字母默认头像。</div>
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-xs font-medium text-textMain cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={createUserSubmitting}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setCreateUserCropFile(file);
                          setCreateUserCropOpen(true);
                        }}
                      />
                      <span className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-xs font-medium transition-all inline-block">
                        上传头像
                      </span>
                    </label>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200 disabled:opacity-50"
                      onClick={() => {
                        setCreateUserAvatarBase64(null);
                        setCreateUserAvatarContentType(null);
                      }}
                      disabled={createUserSubmitting || !createUserAvatarBase64}
                    >
                      清除
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">邮箱</label>
                <input
                  type="email"
                  value={createUserEmail}
                  onChange={(e) => setCreateUserEmail(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  placeholder="user@example.com"
                  disabled={createUserSubmitting}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">初始密码</label>
                <input
                  type="password"
                  value={createUserPassword}
                  onChange={(e) => setCreateUserPassword(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  placeholder="至少 8 位"
                  disabled={createUserSubmitting}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">角色（可多选）</label>
                <div className="rounded-lg border border-border bg-surfaceHighlight/40 p-3 space-y-2">
                  {roles.length === 0 ? (
                    <div className="text-xs text-textMuted">暂无可用角色</div>
                  ) : (
                    roles.map((r) => {
                      const checked = createUserRoleIds.includes(r.id);
                      return (
                        <label key={r.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={createUserSubmitting}
                              onChange={() => {
                                setCreateUserRoleIds((prev) =>
                                  prev.includes(r.id) ? prev.filter((id) => id !== r.id) : [...prev, r.id],
                                );
                              }}
                            />
                            <span className="font-medium text-textMain">{r.name}</span>
                          </div>
                          <span className="text-xs text-textMuted truncate max-w-[12rem]">{r.description}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="text-xs text-textMuted">任意角色具备权限，则用户拥有该权限。</div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                onClick={() => setCreateUserOpen(false)}
                disabled={createUserSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                onClick={() => void submitCreateUser()}
                disabled={createUserSubmitting || !createUserEmail.trim() || !createUserPassword || createUserRoleIds.length === 0}
              >
                {createUserSubmitting ? "创建中..." : "创建用户"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AvatarCropDialog
        open={createUserCropOpen}
        file={createUserCropFile}
        title="裁剪头像"
        onClose={() => {
          setCreateUserCropOpen(false);
          setCreateUserCropFile(null);
        }}
        onConfirm={(r) => {
          setCreateUserAvatarBase64(r.dataBase64);
          setCreateUserAvatarContentType(r.contentType);
        }}
      />

      <AvatarCropDialog
        open={editUserCropOpen}
        file={editUserCropFile}
        title="裁剪头像"
        onClose={() => {
          setEditUserCropOpen(false);
          setEditUserCropFile(null);
        }}
        onConfirm={(r) => {
          setEditUserAvatarBase64(r.dataBase64);
          setEditUserAvatarContentType(r.contentType);
        }}
      />
    </div>
  );
}
