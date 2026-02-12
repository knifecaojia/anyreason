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
  Filter,
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
  aiAdminCreateModelConfig,
  aiAdminDeleteBinding,
  aiAdminDeleteModelConfig,
  aiAdminListBindings,
  aiAdminListModelConfigs,
  aiAdminTestChat,
  aiAdminUpsertBinding,
  aiAdminUpdateModelConfig,
  type AICategory,
  type AIChatMessage,
  type AIModelBinding,
  type AIModelConfig,
} from "@/components/actions/ai-model-actions";
import modelCatalog, { type ModelCatalogItem } from "@/lib/aistudio/modelCatalog";
import {
  agentsAdminCreate,
  agentsAdminDelete,
  agentsAdminList,
  agentsAdminUpdate,
  type Agent as AgentRow,
} from "@/components/actions/agent-actions";
import {
  creditsAdminAdjustUser,
  creditsAdminGetUser,
  creditsAdminSetUser,
  type CreditAccount,
  type CreditTransaction,
} from "@/components/actions/credits-actions";

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
      { code: "menu.settings.credits", name: "积分管理", description: "查看与调整用户积分余额" },
      { code: "menu.settings.agents", name: "Agent 管理", description: "配置 Agent 与消耗规则" },
    ],
  },
  {
    group: "系统管理",
    items: [
      { code: "system.users", name: "用户管理", description: "成员账号管理与角色分配" },
      { code: "system.roles", name: "角色与权限", description: "创建角色、配置权限矩阵" },
      { code: "system.audit", name: "审计日志", description: "查看关键管理操作记录" },
      { code: "system.credits", name: "积分管理", description: "调整用户积分与查看流水" },
      { code: "system.agents", name: "Agent 管理", description: "创建与维护可调用 Agent 配置" },
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

type Section = "models" | "users" | "roles" | "permissions" | "audit" | "credits" | "agents";

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

  const [activeModelTab, setActiveModelTab] = useState<AICategory>("text");
  const [aiModelConfigs, setAiModelConfigs] = useState<AIModelConfig[]>([]);
  const [aiBindings, setAiBindings] = useState<AIModelBinding[]>([]);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);
  const [aiConfigError, setAiConfigError] = useState<string | null>(null);
  const [createModelOpen, setCreateModelOpen] = useState(false);
  const [modelForm, setModelForm] = useState({
    category: "text" as AICategory,
    manufacturer: "",
    model: "",
    base_url: "",
    api_key: "",
    enabled: true,
    sort_order: 0,
  });
  const [bindingForm, setBindingForm] = useState({ key: "", ai_model_config_id: "" });
  const [aiConfigSubmitting, setAiConfigSubmitting] = useState(false);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogManufacturer, setCatalogManufacturer] = useState("all");
  const [catalogConfigOpen, setCatalogConfigOpen] = useState(false);
  const [catalogConfigSubmitting, setCatalogConfigSubmitting] = useState(false);
  const [catalogConfigError, setCatalogConfigError] = useState<string | null>(null);
  const [catalogSelected, setCatalogSelected] = useState<{ category: AICategory; manufacturer: string; model: string; configId: string | null } | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<{ base_url: string; api_key: string; enabled: boolean; sort_order: number }>({
    base_url: "",
    api_key: "",
    enabled: true,
    sort_order: 0,
  });
  const [catalogApiKeyVisible, setCatalogApiKeyVisible] = useState(false);

  const [modelTestChatOpen, setModelTestChatOpen] = useState(false);
  const [modelTestModelConfigId, setModelTestModelConfigId] = useState("");
  const [modelTestMessages, setModelTestMessages] = useState<AIChatMessage[]>([
    { role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" },
  ]);
  const [modelTestInput, setModelTestInput] = useState("");
  const [modelTestSubmitting, setModelTestSubmitting] = useState(false);
  const [modelTestError, setModelTestError] = useState<string | null>(null);
  const [modelTestLastRaw, setModelTestLastRaw] = useState<Record<string, unknown> | null>(null);

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [rbacError, setRbacError] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentModelConfigs, setAgentModelConfigs] = useState<AIModelConfig[]>([]);
  const [agentEditOpen, setAgentEditOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentRow | null>(null);
  const [agentForm, setAgentForm] = useState({
    name: "",
    category: "text",
    purpose: "general",
    ai_model_config_id: "",
    system_prompt: "",
    user_prompt_template: "{input}",
    credits_per_call: 0,
    enabled: true,
  });
  const [agentSubmitting, setAgentSubmitting] = useState(false);

  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditsUser, setCreditsUser] = useState<TeamMember | null>(null);
  const [creditsAccount, setCreditsAccount] = useState<CreditAccount | null>(null);
  const [creditsTransactions, setCreditsTransactions] = useState<CreditTransaction[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsAdjustDelta, setCreditsAdjustDelta] = useState<number>(0);
  const [creditsSetBalance, setCreditsSetBalance] = useState<number>(0);
  const [creditsReason, setCreditsReason] = useState<string>("admin.adjust");

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

  const refreshAgents = async () => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const res = await agentsAdminList();
      setAgents(res.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setAgentsError(msg);
    } finally {
      setAgentsLoading(false);
    }
  };

  const refreshAgentModelConfigs = async () => {
    try {
      const res = await aiAdminListModelConfigs();
      setAgentModelConfigs(res.data || []);
    } catch (_err) {
      setAgentModelConfigs([]);
    }
  };

  const openCreateAgentDialog = () => {
    setEditingAgent(null);
    const firstTextCfg = agentModelConfigs.find((c) => c.category === "text");
    setAgentForm({
      name: "",
      category: "text",
      purpose: "general",
      ai_model_config_id: firstTextCfg?.id || "",
      system_prompt: "",
      user_prompt_template: "{input}",
      credits_per_call: 0,
      enabled: true,
    });
    setAgentsError(null);
    setAgentEditOpen(true);
  };

  const openEditAgentDialog = (row: AgentRow) => {
    setEditingAgent(row);
    setAgentForm({
      name: row.name || "",
      category: row.category || "text",
      purpose: (row as unknown as { purpose?: string }).purpose || "general",
      ai_model_config_id: (row as unknown as { ai_model_config_id?: string }).ai_model_config_id || "",
      system_prompt: row.system_prompt || "",
      user_prompt_template: row.user_prompt_template || "{input}",
      credits_per_call: Number(row.credits_per_call || 0),
      enabled: !!row.enabled,
    });
    setAgentsError(null);
    setAgentEditOpen(true);
  };

  const submitAgent = async () => {
    try {
      setAgentSubmitting(true);
      setAgentsError(null);
      if (editingAgent) {
        await agentsAdminUpdate(editingAgent.id, {
          name: agentForm.name,
          category: agentForm.category,
          purpose: agentForm.purpose,
          ai_model_config_id: agentForm.ai_model_config_id,
          system_prompt: agentForm.system_prompt,
          user_prompt_template: agentForm.user_prompt_template,
          credits_per_call: Number(agentForm.credits_per_call || 0),
          enabled: !!agentForm.enabled,
        });
      } else {
        await agentsAdminCreate({
          name: agentForm.name,
          category: agentForm.category,
          purpose: agentForm.purpose,
          ai_model_config_id: agentForm.ai_model_config_id,
          system_prompt: agentForm.system_prompt,
          user_prompt_template: agentForm.user_prompt_template,
          credits_per_call: Number(agentForm.credits_per_call || 0),
          enabled: !!agentForm.enabled,
        });
      }
      setAgentEditOpen(false);
      setEditingAgent(null);
      await refreshAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setAgentsError(msg);
    } finally {
      setAgentSubmitting(false);
    }
  };

  const deleteAgent = async (agentId: string) => {
    try {
      setAgentsLoading(true);
      setAgentsError(null);
      await agentsAdminDelete(agentId);
      await refreshAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setAgentsError(msg);
    } finally {
      setAgentsLoading(false);
    }
  };

  const openCreditsDialog = async (member: TeamMember) => {
    setCreditsOpen(true);
    setCreditsUser(member);
    setCreditsAccount(null);
    setCreditsTransactions([]);
    setCreditsError(null);
    setCreditsAdjustDelta(0);
    setCreditsSetBalance(0);
    setCreditsReason("admin.adjust");
    try {
      setCreditsLoading(true);
      const res = await creditsAdminGetUser(member.id, 50);
      const data = res.data;
      if (data?.account) {
        setCreditsAccount(data.account);
        setCreditsSetBalance(Number(data.account.balance || 0));
      }
      setCreditsTransactions(data?.transactions || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setCreditsError(msg);
    } finally {
      setCreditsLoading(false);
    }
  };

  const submitCreditsAdjust = async () => {
    if (!creditsUser) return;
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      await creditsAdminAdjustUser(creditsUser.id, {
        delta: Number(creditsAdjustDelta || 0),
        reason: creditsReason || "admin.adjust",
        meta: null,
      });
      await openCreditsDialog(creditsUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setCreditsError(msg);
    } finally {
      setCreditsLoading(false);
    }
  };

  const submitCreditsSet = async () => {
    if (!creditsUser) return;
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      await creditsAdminSetUser(creditsUser.id, {
        balance: Number(creditsSetBalance || 0),
        reason: "admin.set",
        meta: null,
      });
      await openCreditsDialog(creditsUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setCreditsError(msg);
    } finally {
      setCreditsLoading(false);
    }
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
        } else if (activeSection === "credits") {
          await refreshUsers();
        } else if (activeSection === "agents") {
          await Promise.all([refreshAgents(), refreshAgentModelConfigs()]);
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

  const refreshAIModelConfig = async () => {
    setAiConfigLoading(true);
    setAiConfigError(null);
    try {
      const [cfgRes, bindRes] = await Promise.all([aiAdminListModelConfigs(activeModelTab), aiAdminListBindings(activeModelTab)]);
      setAiModelConfigs(cfgRes.data || []);
      setAiBindings(bindRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setAiConfigError(msg);
      setAiModelConfigs([]);
      setAiBindings([]);
    } finally {
      setAiConfigLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== "models") return;
    void refreshAIModelConfig();
  }, [activeSection, activeModelTab]);

  useEffect(() => {
    if (!modelTestChatOpen) return;
    if (activeModelTab !== "text") return;
    if (modelTestModelConfigId) return;
    const first = aiModelConfigs[0];
    if (first) setModelTestModelConfigId(first.id);
  }, [activeModelTab, aiModelConfigs, modelTestChatOpen, modelTestModelConfigId]);

  const resetModelTestChat = () => {
    setModelTestMessages([{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }]);
    setModelTestInput("");
    setModelTestError(null);
    setModelTestLastRaw(null);
  };

  const openModelTestChat = () => {
    setModelTestChatOpen(true);
    setModelTestSubmitting(false);
    resetModelTestChat();
    const first = aiModelConfigs[0];
    setModelTestModelConfigId(first ? first.id : "");
  };

  const closeModelTestChat = () => {
    setModelTestChatOpen(false);
  };

  const submitModelTestChat = async () => {
    if (modelTestSubmitting) return;
    const content = modelTestInput.trim();
    if (!content) return;
    if (!modelTestModelConfigId) {
      setModelTestError("请选择一个模型配置");
      return;
    }

    const nextMessages: AIChatMessage[] = [...modelTestMessages, { role: "user", content }];
    setModelTestMessages(nextMessages);
    setModelTestInput("");
    setModelTestSubmitting(true);
    setModelTestError(null);
    try {
      const res = await aiAdminTestChat(modelTestModelConfigId, nextMessages);
      const data = res.data;
      const outputText = (data?.output_text || "").trim();
      setModelTestLastRaw(data?.raw || null);
      setModelTestMessages([
        ...nextMessages,
        { role: "assistant", content: outputText || "（空响应）" },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "请求失败";
      setModelTestError(msg);
    } finally {
      setModelTestSubmitting(false);
    }
  };

  const manufacturerLabel = (manufacturer: string) => {
    const m = manufacturer.toLowerCase();
    if (m === "doubao") return "火山引擎";
    if (m === "zhipu") return "智谱";
    if (m === "qwen") return "阿里千问";
    if (m === "deepseek") return "DeepSeek";
    if (m === "openai") return "OpenAI";
    if (m === "gemini") return "Gemini";
    if (m === "anthropic") return "Anthropic";
    if (m === "xai") return "xAI";
    if (m === "other") return "其他";
    return manufacturer;
  };

  const vendorColor = (vendor: string) => {
    const s = vendor.toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const palette = [
      "bg-blue-400",
      "bg-cyan-400",
      "bg-emerald-400",
      "bg-green-400",
      "bg-lime-400",
      "bg-yellow-400",
      "bg-orange-400",
      "bg-rose-400",
      "bg-pink-400",
      "bg-purple-400",
    ];
    return palette[h % palette.length];
  };

  const isVideoModel = (item: ModelCatalogItem) => {
    const m = `${item.manufacturer} ${item.model}`.toLowerCase();
    return m.includes("kling") || m.includes("video") || m.includes("pika") || m.includes("runway") || m.includes("luma") || m.includes("hailuo");
  };

  const catalogItems = useMemo(() => {
    const base = modelCatalog.slice();
    if (activeModelTab === "image") return base.filter((x) => x.image);
    if (activeModelTab === "video") return base.filter((x) => isVideoModel(x));
    return base.filter((x) => !isVideoModel(x));
  }, [activeModelTab]);

  const catalogManufacturers = useMemo(() => {
    const set = new Set(catalogItems.map((m) => (m.manufacturer || "").trim()).filter((x) => x.length > 0));
    return [{ key: "all", label: "全部" }, ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((k) => ({ key: k, label: manufacturerLabel(k) }))];
  }, [catalogItems]);

  const configByKey = useMemo(() => {
    const map = new Map<string, AIModelConfig>();
    for (const c of aiModelConfigs) map.set(`${c.category}::${c.manufacturer}::${c.model}`, c);
    return map;
  }, [aiModelConfigs]);

  const filteredCatalogItems = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalogItems.filter((m) => {
      if (catalogManufacturer !== "all" && (m.manufacturer || "").trim() !== catalogManufacturer) return false;
      if (!q) return true;
      const hay = `${m.manufacturer} ${m.model}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalogItems, catalogManufacturer, catalogSearch]);

  useEffect(() => {
    if (!catalogManufacturers.some((x) => x.key === catalogManufacturer)) setCatalogManufacturer("all");
  }, [catalogManufacturers, catalogManufacturer]);

  const getApiKeyUrl = (manufacturer: string) => {
    const m = manufacturer.toLowerCase();
    if (m.includes("deepseek")) return "https://platform.deepseek.com/";
    if (m.includes("openai")) return "https://platform.openai.com/api-keys";
    if (m.includes("anthropic")) return "https://console.anthropic.com/settings/keys";
    if (m.includes("gemini") || m.includes("google")) return "https://aistudio.google.com/app/apikey";
    return "";
  };

  const getDefaultBaseUrl = (manufacturer: string, category: AICategory) => {
    const m = (manufacturer || "").trim().toLowerCase();
    if (category !== "text") {
      if (m === "openai") return "https://api.openai.com/v1";
      return "";
    }
    if (m === "openai") return "https://api.openai.com/v1";
    if (m === "deepseek") return "https://api.deepseek.com/v1";
    if (m === "qwen") return "https://dashscope.aliyuncs.com/compatible-mode/v1";
    if (m === "zhipu") return "https://open.bigmodel.cn/api/paas/v4/";
    if (m === "doubao") return "https://ark.cn-beijing.volces.com/api/v3";
    if (m === "xai") return "https://api.x.ai/v1";
    return "";
  };

  const openCatalogConfig = (item: ModelCatalogItem) => {
    const cfg = configByKey.get(`${activeModelTab}::${item.manufacturer}::${item.model}`) || null;
    const defaultBaseUrl = getDefaultBaseUrl(item.manufacturer, activeModelTab);
    const existingBaseUrl = (cfg?.base_url || "").trim();
    setCatalogConfigError(null);
    setCatalogApiKeyVisible(false);
    setCatalogSelected({ category: activeModelTab, manufacturer: item.manufacturer, model: item.model, configId: cfg?.id || null });
    setCatalogDraft({
      base_url: existingBaseUrl || defaultBaseUrl,
      api_key: "",
      enabled: cfg?.enabled ?? true,
      sort_order: Number(cfg?.sort_order ?? 0),
    });
    setCatalogConfigOpen(true);
  };

  const closeCatalogConfig = () => {
    if (catalogConfigSubmitting) return;
    setCatalogConfigOpen(false);
    setCatalogSelected(null);
    setCatalogConfigError(null);
    setCatalogConfigSubmitting(false);
  };

  const saveCatalogConfig = async () => {
    if (!catalogSelected) return;
    setCatalogConfigSubmitting(true);
    setCatalogConfigError(null);
    try {
      if (catalogSelected.configId) {
        await aiAdminUpdateModelConfig(catalogSelected.configId, {
          base_url: catalogDraft.base_url.trim() ? catalogDraft.base_url.trim() : null,
          api_key: catalogDraft.api_key.trim() ? catalogDraft.api_key.trim() : null,
          enabled: !!catalogDraft.enabled,
          sort_order: Number(catalogDraft.sort_order || 0),
        });
      } else {
        await aiAdminCreateModelConfig({
          category: catalogSelected.category,
          manufacturer: catalogSelected.manufacturer,
          model: catalogSelected.model,
          base_url: catalogDraft.base_url.trim() ? catalogDraft.base_url.trim() : null,
          api_key: catalogDraft.api_key.trim() ? catalogDraft.api_key.trim() : null,
          enabled: !!catalogDraft.enabled,
          sort_order: Number(catalogDraft.sort_order || 0),
        });
      }
      await refreshAIModelConfig();
      setCatalogConfigOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setCatalogConfigError(msg);
    } finally {
      setCatalogConfigSubmitting(false);
    }
  };

  const submitCreateModelConfig = async () => {
    if (!modelForm.manufacturer.trim() || !modelForm.model.trim()) {
      setAiConfigError("厂商与模型名不能为空");
      return;
    }
    setAiConfigSubmitting(true);
    setAiConfigError(null);
    try {
      await aiAdminCreateModelConfig({
        category: modelForm.category,
        manufacturer: modelForm.manufacturer.trim(),
        model: modelForm.model.trim(),
        base_url: modelForm.base_url.trim() || null,
        api_key: modelForm.api_key.trim() || null,
        enabled: !!modelForm.enabled,
        sort_order: Number(modelForm.sort_order || 0),
      });
      setCreateModelOpen(false);
      await refreshAIModelConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建失败";
      setAiConfigError(msg);
    } finally {
      setAiConfigSubmitting(false);
    }
  };

  const deleteModelConfig = async (id: string) => {
    if (!window.confirm("确认删除该模型配置？")) return;
    setAiConfigError(null);
    try {
      await aiAdminDeleteModelConfig(id);
      await refreshAIModelConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setAiConfigError(msg);
    }
  };

  const submitUpsertBinding = async () => {
    if (!bindingForm.key.trim()) {
      setAiConfigError("用途 key 不能为空");
      return;
    }
    setAiConfigSubmitting(true);
    setAiConfigError(null);
    try {
      await aiAdminUpsertBinding({
        key: bindingForm.key.trim(),
        category: activeModelTab,
        ai_model_config_id: bindingForm.ai_model_config_id || null,
      });
      setBindingForm({ key: "", ai_model_config_id: "" });
      await refreshAIModelConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setAiConfigError(msg);
    } finally {
      setAiConfigSubmitting(false);
    }
  };

  const deleteBinding = async (id: string) => {
    if (!window.confirm("确认删除该用途绑定？")) return;
    setAiConfigError(null);
    try {
      await aiAdminDeleteBinding(id);
      await refreshAIModelConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setAiConfigError(msg);
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

  const tabs: { key: Section; label: string; icon: LucideIcon }[] = [
    { key: "models", label: "模型引擎", icon: Cpu },
    { key: "users", label: "用户管理", icon: Users },
    { key: "roles", label: "角色管理", icon: Shield },
    { key: "permissions", label: "权限矩阵", icon: Lock },
    { key: "audit", label: "审计日志", icon: FileClock },
    { key: "credits", label: "积分管理", icon: Zap },
    { key: "agents", label: "Agent 管理", icon: Bot },
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
              <h2 className="text-2xl font-bold text-textMain mb-2">AI 模型配置</h2>
              <p className="text-textMuted text-sm">平台级共享：按文本/图片/视频分类维护模型配置与用途绑定。</p>
            </div>
            <div className="flex items-center gap-1 bg-surfaceHighlight p-1 rounded-lg border border-border">
              {(["text", "image", "video"] as AICategory[]).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setActiveModelTab(c);
                    setModelForm((prev) => ({ ...prev, category: c }));
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    activeModelTab === c ? "bg-surface text-textMain shadow-sm border border-border/50" : "text-textMuted hover:text-textMain"
                  }`}
                  type="button"
                >
                  {c === "text" ? "文本" : c === "image" ? "图片" : "视频"}
                </button>
              ))}
            </div>
          </div>

          {aiConfigError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{aiConfigError}</div>
          )}

          <div className="bg-surface border border-border rounded-xl p-6 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-textMain">新增模型</h3>
                <p className="text-sm text-textMuted mt-1">从模型清单点选，进入配置弹窗填写 Base URL / API Key。</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openModelTestChat}
                  className="flex items-center gap-2 text-sm font-bold bg-surfaceHighlight border border-border hover:border-primary/40 text-textMain px-4 py-2 rounded-lg transition-all disabled:opacity-60"
                  type="button"
                  disabled={activeModelTab !== "text"}
                >
                  <MessageSquare size={16} /> 测试对话
                </button>
                <button
                  onClick={() => {
                    setCatalogSearch("");
                    setCatalogManufacturer("all");
                    setAddModelOpen(true);
                  }}
                  className="flex items-center gap-2 text-sm font-bold bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-all"
                  type="button"
                >
                  <Plus size={16} /> 新增模型
                </button>
              </div>
            </div>
            <div className="text-xs text-textMuted">提示：API Key 会加密保存，不会以明文返回。</div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-textMain">模型配置列表</h3>
            <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                  <tr>
                    <th className="px-4 py-3">厂商</th>
                    <th className="px-4 py-3">模型</th>
                    <th className="px-4 py-3">Base URL</th>
                    <th className="px-4 py-3">Key</th>
                    <th className="px-4 py-3">启用</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {aiConfigLoading && (
                    <tr>
                      <td className="px-4 py-6 text-textMuted" colSpan={6}>
                        加载中...
                      </td>
                    </tr>
                  )}
                  {!aiConfigLoading && aiModelConfigs.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-textMuted" colSpan={6}>
                        暂无配置。
                      </td>
                    </tr>
                  )}
                  {!aiConfigLoading &&
                    aiModelConfigs.map((c) => (
                      <tr key={c.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-textMain">{c.manufacturer}</td>
                        <td className="px-4 py-3 text-xs text-textMain font-mono">{c.model}</td>
                        <td className="px-4 py-3 text-xs text-textMuted font-mono truncate max-w-[18rem]">{c.base_url || "-"}</td>
                        <td className="px-4 py-3 text-xs text-textMuted">{c.has_api_key ? "已配置" : "未配置"}</td>
                        <td className="px-4 py-3 text-xs text-textMain">{c.enabled ? "是" : "否"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200"
                            type="button"
                            onClick={() => void deleteModelConfig(c.id)}
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

          <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-textMain">用途绑定</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-textMuted font-bold">用途 key</label>
                <input
                  value={bindingForm.key}
                  onChange={(e) => setBindingForm((p) => ({ ...p, key: e.target.value }))}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                  placeholder="chatbox / image / video ..."
                  disabled={aiConfigSubmitting}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs text-textMuted font-bold">绑定到模型配置</label>
                <select
                  value={bindingForm.ai_model_config_id}
                  onChange={(e) => setBindingForm((p) => ({ ...p, ai_model_config_id: e.target.value }))}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                  disabled={aiConfigSubmitting}
                >
                  <option value="">不绑定</option>
                  {aiModelConfigs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.manufacturer} · {c.model}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3 flex justify-end">
                <button
                  onClick={() => void submitUpsertBinding()}
                  className="bg-primary hover:bg-blue-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
                  type="button"
                  disabled={aiConfigSubmitting}
                >
                  保存绑定
                </button>
              </div>
            </div>

            <div className="bg-surfaceHighlight/40 border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
                  <tr>
                    <th className="px-4 py-3">key</th>
                    <th className="px-4 py-3">模型</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {aiBindings.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-textMuted" colSpan={3}>
                        暂无绑定。
                      </td>
                    </tr>
                  )}
                  {aiBindings.map((b) => {
                    const cfg = aiModelConfigs.find((c) => c.id === b.ai_model_config_id);
                    return (
                      <tr key={b.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-textMain font-mono">{b.key}</td>
                        <td className="px-4 py-3 text-xs text-textMuted">{cfg ? `${cfg.manufacturer} · ${cfg.model}` : "-"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            className="px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-red-200"
                            type="button"
                            onClick={() => void deleteBinding(b.id)}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {modelTestChatOpen && (
            <div
              className="fixed inset-0 z-[70] bg-black/60"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                closeModelTestChat();
              }}
            >
              <div className="h-full w-full p-4 flex items-center justify-center">
                <div className="w-full max-w-3xl h-[80vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col">
                  <div className="h-14 px-6 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
                    <div className="font-bold text-base text-textMain">模型对话测试</div>
                    <button
                      type="button"
                      onClick={closeModelTestChat}
                      className="p-2 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs text-textMuted font-bold">选择模型配置</label>
                        <select
                          value={modelTestModelConfigId}
                          onChange={(e) => setModelTestModelConfigId(e.target.value)}
                          className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                          disabled={modelTestSubmitting || activeModelTab !== "text"}
                        >
                          {aiModelConfigs.length === 0 ? (
                            <option value="">暂无可用模型配置</option>
                          ) : (
                            <>
                              <option value="">请选择…</option>
                              {aiModelConfigs.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.manufacturer} · {c.model}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-textMuted font-bold">快捷操作</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={resetModelTestChat}
                            className="px-4 py-2 rounded-lg text-sm font-bold border border-border bg-surfaceHighlight hover:bg-surfaceHighlight/70 text-textMain transition-colors disabled:opacity-60"
                            disabled={modelTestSubmitting}
                          >
                            清空对话
                          </button>
                        </div>
                      </div>
                    </div>

                    {modelTestError && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">{modelTestError}</div>
                    )}

                    <div className="rounded-xl border border-border bg-background/20 p-3 h-[42vh] overflow-y-auto space-y-3">
                      {modelTestMessages.map((m, idx) => {
                        const isUser = m.role === "user";
                        const label = m.role === "system" ? "SYSTEM" : isUser ? "YOU" : "AI";
                        const bubble =
                          m.role === "system"
                            ? "bg-surfaceHighlight/40 text-textMain"
                            : isUser
                              ? "bg-primary/10 text-textMain"
                              : "bg-background/40 text-textMain";
                        return (
                          <div key={`${m.role}-${idx}`} className={isUser ? "flex justify-end" : "flex justify-start"}>
                            <div className={`max-w-[82%] rounded-xl border border-border px-3 py-2 text-sm whitespace-pre-wrap ${bubble}`}>
                              <div className="text-[10px] font-bold text-textMuted mb-1">{label}</div>
                              <div>{m.content}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {modelTestLastRaw && (
                      <details className="rounded-xl border border-border bg-background/20 p-3">
                        <summary className="text-xs font-bold text-textMain cursor-pointer select-none">查看 raw</summary>
                        <pre className="mt-3 text-xs text-textMuted overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(modelTestLastRaw, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="border-t border-border bg-surfaceHighlight/20 p-4">
                    <div className="flex items-start gap-2">
                      <textarea
                        value={modelTestInput}
                        onChange={(e) => setModelTestInput(e.target.value)}
                        className="flex-1 bg-background border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                        placeholder="输入一条消息，例如：hello"
                        rows={2}
                        disabled={modelTestSubmitting}
                      />
                      <button
                        type="button"
                        onClick={() => void submitModelTestChat()}
                        className="bg-primary hover:bg-blue-600 disabled:opacity-60 text-white px-4 py-3 rounded-lg text-sm font-bold transition-all"
                        disabled={modelTestSubmitting || !modelTestInput.trim()}
                      >
                        {modelTestSubmitting ? "发送中..." : "发送"}
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-textMuted">该测试接口不扣积分，仅用于验证模型配置可用性。</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {addModelOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/60"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                setAddModelOpen(false);
              }}
            >
              <div className="h-full w-full p-4 flex items-center justify-center">
                <div className="w-full max-w-6xl h-[86vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col">
                  <div className="h-14 px-6 border-b border-border bg-surfaceHighlight/30 flex items-center justify-between">
                    <div className="font-bold text-base text-textMain">新增模型</div>
                    <button
                      type="button"
                      onClick={() => setAddModelOpen(false)}
                      className="p-2 rounded-lg hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    <div className="px-6 pt-4 pb-6 space-y-4">
                      <div className="flex items-center gap-1">
                        {(["text", "image", "video"] as AICategory[]).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setActiveModelTab(c)}
                            className={`px-3 py-2 text-sm font-bold border-b-2 transition-colors ${
                              activeModelTab === c ? "border-primary text-primary" : "border-transparent text-textMuted hover:text-textMain"
                            }`}
                          >
                            {c === "text" ? "文本" : c === "image" ? "图像" : "视频"}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                          <input
                            value={catalogSearch}
                            onChange={(e) => setCatalogSearch(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm outline-none focus:border-primary text-textMain"
                            placeholder="搜索模型名称或厂商…"
                          />
                        </div>
                        <button
                          type="button"
                          className="w-10 h-10 rounded-lg border border-border bg-background hover:bg-surfaceHighlight transition-colors flex items-center justify-center text-textMuted hover:text-textMain"
                          onClick={() => setCatalogSearch((s) => s.trim())}
                        >
                          <Search size={16} />
                        </button>
                      </div>

                      <div className="rounded-xl border border-border bg-background/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-bold text-textMain">
                            <Filter size={16} className="text-textMuted" />
                            厂商筛选
                          </div>
                          <button
                            type="button"
                            className="text-xs font-bold text-primary hover:underline"
                            onClick={() => {
                              setCatalogManufacturer("all");
                              setCatalogSearch("");
                            }}
                          >
                            清空筛选
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {catalogManufacturers.map((m) => {
                            const active = catalogManufacturer === m.key;
                            return (
                              <button
                                key={m.key}
                                type="button"
                                onClick={() => setCatalogManufacturer(m.key)}
                                className={`px-4 py-2 rounded-full text-xs font-bold transition-colors border ${
                                  active ? "bg-primary text-white border-primary" : "bg-background border-border text-textMain hover:bg-surfaceHighlight"
                                }`}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${m.key === "all" ? "bg-textMuted" : vendorColor(m.key)}`} />
                                  {m.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-textMain">
                        找到 {filteredCatalogItems.length} 个模型
                      </div>

                      {aiConfigLoading ? (
                        <div className="text-sm text-textMuted flex items-center gap-2">
                          <RefreshCw size={16} className="animate-spin" /> 加载模型配置...
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {filteredCatalogItems
                            .slice()
                            .sort((a, b) => {
                              const am = manufacturerLabel(a.manufacturer).localeCompare(manufacturerLabel(b.manufacturer));
                              if (am !== 0) return am;
                              return a.model.localeCompare(b.model);
                            })
                            .map((item) => {
                              const k = `${activeModelTab}::${item.manufacturer}::${item.model}`;
                              const cfg = configByKey.get(k);
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => openCatalogConfig(item)}
                                  className="rounded-2xl border border-border bg-background hover:bg-surfaceHighlight/40 transition-colors p-4 text-left"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="w-8 h-8 rounded-lg border border-border bg-surfaceHighlight/40 flex items-center justify-center text-primary font-bold">
                                      T
                                    </div>
                                    <div className="px-2 py-1 rounded-md text-[11px] font-bold border border-border bg-surfaceHighlight/30 text-textMain">
                                      {manufacturerLabel(item.manufacturer)}
                                    </div>
                                  </div>
                                  <div className="mt-3 font-bold text-sm text-textMain truncate">{item.model}</div>
                                  <div className="mt-1 text-xs text-textMuted truncate">{cfg?.base_url || "默认 Base URL"}</div>
                                  <div className="mt-3 flex items-center justify-between text-xs">
                                    <div className="text-textMuted">{cfg?.has_api_key ? "已配置 API Key" : "未配置 API Key"}</div>
                                    <div className={`font-bold ${cfg?.enabled ? "text-green-300" : "text-textMuted"}`}>{cfg?.enabled ? "启用" : "未启用"}</div>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {catalogConfigOpen && catalogSelected && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                closeCatalogConfig();
              }}
            >
              <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
                <div className="h-12 px-4 border-b border-border flex items-center justify-between">
                  <div className="font-bold text-sm truncate">
                    配置 {manufacturerLabel(catalogSelected.manufacturer)} · {catalogSelected.model}
                  </div>
                  <button
                    onClick={closeCatalogConfig}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface/60 hover:bg-surfaceHighlight text-textMuted hover:text-textMain transition-colors disabled:opacity-50"
                    type="button"
                    disabled={catalogConfigSubmitting}
                  >
                    关闭
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-textMuted font-bold">模型名称</label>
                    <input
                      value={catalogSelected.model}
                      readOnly
                      className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none text-textMain font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-textMuted font-bold">Base URL（可选）</label>
                    <input
                      value={catalogDraft.base_url}
                      onChange={(e) => setCatalogDraft((p) => ({ ...p, base_url: e.target.value }))}
                      className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain font-mono"
                      placeholder="留空使用默认"
                      disabled={catalogConfigSubmitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-textMuted font-bold">API Key（留空则不改）</label>
                    <div className="relative">
                      <input
                        value={catalogDraft.api_key}
                        onChange={(e) => setCatalogDraft((p) => ({ ...p, api_key: e.target.value }))}
                        className="w-full bg-surfaceHighlight border border-border rounded-lg pl-3 pr-10 py-3 text-sm outline-none focus:border-primary text-textMain font-mono"
                        placeholder="请输入 API Key"
                        disabled={catalogConfigSubmitting}
                        type={catalogApiKeyVisible ? "text" : "password"}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setCatalogApiKeyVisible((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-background/40 text-textMuted hover:text-textMain transition-colors"
                        disabled={catalogConfigSubmitting}
                      >
                        {catalogApiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {getApiKeyUrl(catalogSelected.manufacturer) ? (
                      <a
                        href={getApiKeyUrl(catalogSelected.manufacturer)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-primary hover:underline inline-block"
                      >
                        点击获取 {manufacturerLabel(catalogSelected.manufacturer)} API Key
                      </a>
                    ) : null}
                  </div>

                  <details className="rounded-xl border border-border bg-background/20 p-3">
                    <summary className="cursor-pointer text-sm font-bold text-textMain">高级设置</summary>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs text-textMuted font-bold">排序（sort_order）</label>
                        <input
                          value={String(catalogDraft.sort_order)}
                          onChange={(e) => setCatalogDraft((p) => ({ ...p, sort_order: Number(e.target.value || 0) }))}
                          className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary text-textMain"
                          type="number"
                          disabled={catalogConfigSubmitting}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-textMuted font-bold">启用</label>
                        <div className="flex items-center gap-2 pt-2">
                          <input
                            type="checkbox"
                            checked={catalogDraft.enabled}
                            onChange={(e) => setCatalogDraft((p) => ({ ...p, enabled: e.target.checked }))}
                            disabled={catalogConfigSubmitting}
                          />
                          <span className="text-sm text-textMain">enabled</span>
                        </div>
                      </div>
                    </div>
                  </details>

                  {catalogConfigError && <div className="text-xs text-red-400 whitespace-pre-wrap">{catalogConfigError}</div>}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
                      onClick={closeCatalogConfig}
                      disabled={catalogConfigSubmitting}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2"
                      onClick={() => void saveCatalogConfig()}
                      disabled={catalogConfigSubmitting}
                    >
                      {catalogConfigSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} 保存
                    </button>
                  </div>
                </div>
              </div>
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

      {activeSection === "credits" && (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
          <div className="flex justify-between items-end border-b border-border pb-6">
            <div>
              <h2 className="text-2xl font-bold text-textMain mb-2">积分管理</h2>
              <p className="text-textMuted text-sm">查看用户积分余额并进行调整，充值/兑换入口预留。</p>
            </div>
            <button
              onClick={() => void refreshUsers()}
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
                          {user.hasAvatar && (
                            <AvatarImage src={`/api/avatar/${user.id}?v=${avatarCacheBust}`} alt={user.name} />
                          )}
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
                          user.status === "active"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === "active" ? "bg-green-400" : "bg-gray-500"}`} />
                        {user.status === "active" ? "ACTIVE" : "DISABLED"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => void openCreditsDialog(user)}
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
      )}

      {activeSection === "agents" && (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
          <div className="flex justify-between items-end border-b border-border pb-6">
            <div>
              <h2 className="text-2xl font-bold text-textMain mb-2">Agent 管理</h2>
              <p className="text-textMuted text-sm">配置 Agent 类型、模型与单次消耗积分数。</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void refreshAgents()}
                className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                type="button"
              >
                <RefreshCw size={16} /> 刷新
              </button>
              <button
                onClick={() => openCreateAgentDialog()}
                className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                type="button"
              >
                <Plus size={16} /> 新建 Agent
              </button>
            </div>
          </div>

          {agentsError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm">
              {agentsError}
            </div>
          )}

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
                          a.enabled
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${a.enabled ? "bg-green-400" : "bg-gray-500"}`} />
                        {a.enabled ? "ENABLED" : "DISABLED"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
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
        </div>
      )}

      {creditsOpen && creditsUser && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-textMain">积分调整</div>
                <div className="text-sm text-textMuted mt-1">{creditsUser.email}</div>
              </div>
              <button
                onClick={() => setCreditsOpen(false)}
                className="w-9 h-9 rounded-lg bg-surfaceHighlight border border-border flex items-center justify-center text-textMuted hover:text-textMain"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {creditsError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
                {creditsError}
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surfaceHighlight/40 border border-border rounded-xl p-4">
                <div className="text-xs text-textMuted">当前余额</div>
                <div className="text-2xl font-bold text-textMain mt-1">{creditsAccount?.balance ?? "-"}</div>
              </div>
              <div className="col-span-2 bg-surfaceHighlight/40 border border-border rounded-xl p-4 space-y-2">
                <div className="text-xs text-textMuted">调整原因</div>
                <input
                  value={creditsReason}
                  onChange={(e) => setCreditsReason(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                  placeholder="admin.adjust"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surfaceHighlight/40 border border-border rounded-xl p-4 space-y-3">
                <div className="text-sm font-bold text-textMain">加/减积分</div>
                <input
                  type="number"
                  value={creditsAdjustDelta}
                  onChange={(e) => setCreditsAdjustDelta(Number(e.target.value))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                />
                <button
                  onClick={() => void submitCreditsAdjust()}
                  disabled={creditsLoading || Number(creditsAdjustDelta || 0) === 0}
                  className="w-full bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                  type="button"
                >
                  {creditsLoading ? "处理中..." : "提交调整"}
                </button>
              </div>

              <div className="bg-surfaceHighlight/40 border border-border rounded-xl p-4 space-y-3">
                <div className="text-sm font-bold text-textMain">直接设置余额</div>
                <input
                  type="number"
                  value={creditsSetBalance}
                  onChange={(e) => setCreditsSetBalance(Number(e.target.value))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                />
                <button
                  onClick={() => void submitCreditsSet()}
                  disabled={creditsLoading}
                  className="w-full bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                  type="button"
                >
                  {creditsLoading ? "处理中..." : "设置余额"}
                </button>
              </div>
            </div>

            <div className="bg-surfaceHighlight/20 border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-sm font-bold text-textMain">最近流水</div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {creditsTransactions.length === 0 && (
                  <div className="px-4 py-6 text-sm text-textMuted">{creditsLoading ? "加载中..." : "暂无流水"}</div>
                )}
                {creditsTransactions.map((t) => (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs text-textMain font-mono truncate">{t.reason}</div>
                      <div className="text-xs text-textMuted font-mono truncate">{new Date(t.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-xs text-textMain font-mono">
                      {t.delta > 0 ? `+${t.delta}` : `${t.delta}`} → {t.balance_after}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {agentEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-textMain">{editingAgent ? "编辑 Agent" : "新建 Agent"}</div>
                <div className="text-sm text-textMuted mt-1">配置类别、模型与提示词模板</div>
              </div>
              <button
                onClick={() => setAgentEditOpen(false)}
                className="w-9 h-9 rounded-lg bg-surfaceHighlight border border-border flex items-center justify-center text-textMuted hover:text-textMain"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {agentsError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
                {agentsError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-textMuted">名称</label>
                <input
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-textMuted">类别</label>
                <select
                  value={agentForm.category}
                  onChange={(e) => {
                    const nextCategory = e.target.value;
                    const nextCfg =
                      agentModelConfigs.find((c) => c.category === nextCategory) ||
                      agentModelConfigs[0];
                    setAgentForm({
                      ...agentForm,
                      category: nextCategory,
                      ai_model_config_id: nextCfg?.id || "",
                    });
                  }}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                >
                  <option value="text">文本</option>
                  <option value="image">图像</option>
                  <option value="video">视频</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-textMuted">用途</label>
                <select
                  value={agentForm.purpose}
                  onChange={(e) => setAgentForm({ ...agentForm, purpose: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                >
                  <option value="storyboard_extraction">故事板提取</option>
                  <option value="scene_extraction">场景提取</option>
                  <option value="character_extraction">角色提取</option>
                  <option value="prop_extraction">道具提取</option>
                  <option value="vfx_extraction">特效提取</option>
                  <option value="general">通用</option>
                </select>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs text-textMuted">模型配置</label>
                <select
                  value={agentForm.ai_model_config_id}
                  onChange={(e) => setAgentForm({ ...agentForm, ai_model_config_id: e.target.value })}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                >
                  <option value="">请选择模型</option>
                  {agentModelConfigs
                    .filter((c) => c.category === agentForm.category)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.manufacturer} · {c.model}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-textMuted">单次消耗积分</label>
                <input
                  type="number"
                  value={agentForm.credits_per_call}
                  onChange={(e) => setAgentForm({ ...agentForm, credits_per_call: Number(e.target.value) })}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-textMuted">启用</label>
                <select
                  value={agentForm.enabled ? "true" : "false"}
                  onChange={(e) => setAgentForm({ ...agentForm, enabled: e.target.value === "true" })}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-textMain outline-none"
                >
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-textMuted">系统提示词</label>
              <textarea
                value={agentForm.system_prompt}
                onChange={(e) => setAgentForm({ ...agentForm, system_prompt: e.target.value })}
                className="w-full h-24 bg-surfaceHighlight/50 border border-border rounded-lg p-3 text-xs text-textMuted font-mono outline-none resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-textMuted">用户提示词模板</label>
              <textarea
                value={agentForm.user_prompt_template}
                onChange={(e) => setAgentForm({ ...agentForm, user_prompt_template: e.target.value })}
                className="w-full h-20 bg-surfaceHighlight/50 border border-border rounded-lg p-3 text-xs text-textMuted font-mono outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setAgentEditOpen(false)}
                className="px-4 py-2 bg-surfaceHighlight border border-border rounded-lg text-sm font-bold text-textMain"
                type="button"
              >
                取消
              </button>
              <button
                onClick={() => void submitAgent()}
                disabled={agentSubmitting || !agentForm.name.trim()}
                className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                type="button"
              >
                {agentSubmitting ? "保存中..." : "保存"}
              </button>
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
