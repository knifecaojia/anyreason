"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUp,
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
import type { LucideIcon } from "lucide-react";

import { SettingsTabsHeader } from "./_components/SettingsTabsHeader";
import { UsersSection } from "./_components/UsersSection";
import { RolesSection } from "./_components/RolesSection";
import { PermissionsMatrixSection } from "./_components/PermissionsMatrixSection";
import { AuditSection } from "./_components/AuditSection";
import { CreditsSection } from "./_components/CreditsSection";
import { AgentsSection } from "./_components/AgentsSection";
import { ModelsSection } from "./_components/ModelsSection";
import { CreditsAdjustModal } from "./_components/CreditsAdjustModal";
import { BuiltinDiffModal } from "./_components/BuiltinDiffModal";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarCropDialog } from "@/components/ui/avatar-crop-dialog";
import { AgentPromptVersionsDialog } from "@/components/agents/AgentPromptVersionsDialog";
import { BuiltinPromptVersionDialog } from "@/components/agents/BuiltinPromptVersionDialog";
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
import {
  aiGetCatalog,
  type AICatalogItem,
} from "@/components/actions/ai-catalog-actions";
import { MentionPopup } from "@/components/settings/MentionPopup";
import { useTasks } from "@/components/tasks/TaskProvider";
import {
  getCaretAbsoluteCoordinates,
} from "@/lib/utils/caret-coordinates";
import {
  agentsAdminCreate,
  agentsAdminDelete,
  agentsAdminList,
  agentsAdminUpdate,
  type Agent as AgentRow,
} from "@/components/actions/agent-actions";
import {
  builtinAgentAdminActivateVersion,
  builtinAgentAdminCreateVersion,
  builtinAgentAdminDeleteVersion,
  builtinAgentAdminDiffVersions,
  builtinAgentAdminListVersions,
  builtinAgentAdminUpdateVersion,
  builtinAgentsAdminList,
  type BuiltinAgent,
  type BuiltinAgentPromptVersion,
} from "@/components/actions/builtin-agent-actions";
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

/** 从后端 JSON 错误响应中提取友好的错误信息 */
function extractApiErrorMessage(raw: string, fallback: string): string {
  try {
    const json = JSON.parse(raw);
    if (typeof json === "object" && json !== null) {
      // 后端 AppError 格式: { code, msg, data }
      if (typeof json.msg === "string" && json.msg) return json.msg;
      if (typeof json.detail === "string" && json.detail) return json.detail;
      if (typeof json.message === "string" && json.message) return json.message;
    }
  } catch {
    // 非 JSON，直接返回原始文本
    if (raw && raw.length < 300) return raw;
  }
  return fallback;
}

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { subscribeTask } = useTasks();

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
  const [catalogItems, setCatalogItems] = useState<AICatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
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
  const [catalogSelected, setCatalogSelected] = useState<AICatalogItem | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<{ base_url: string; api_key: string; enabled: boolean; sort_order: number }>({
    base_url: "",
    api_key: "",
    enabled: true,
    sort_order: 0,
  });
  const [catalogApiKeyVisible, setCatalogApiKeyVisible] = useState(false);

  const [modelTestChatOpen, setModelTestChatOpen] = useState(false);
  const [modelTestModelConfigId, setModelTestModelConfigId] = useState("");
  const [modelTestSessionId, setModelTestSessionId] = useState("");
  const [modelTestMessages, setModelTestMessages] = useState<AIChatMessage[]>([
    { role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" },
  ]);
  const [modelTestInput, setModelTestInput] = useState("");
  const [modelTestImagePrompt, setModelTestImagePrompt] = useState("");
  const [modelTestImageResolution, setModelTestImageResolution] = useState("");
  const [modelTestCapParams, setModelTestCapParams] = useState<Record<string, any>>({});
  const [modelTestSessionImageAttachmentNodeIds, setModelTestSessionImageAttachmentNodeIds] = useState<string[]>([]);
  const [modelTestImageResultUrl, setModelTestImageResultUrl] = useState<string | null>(null);
  const [modelTestSessionsLoading, setModelTestSessionsLoading] = useState(false);
  const [modelTestSessions, setModelTestSessions] = useState<
    { id: string; title: string; updated_at: string; run_count: number }[]
  >([]);
  const [modelTestImageRuns, setModelTestImageRuns] = useState<
    {
      id: string;
      prompt: string;
      resolution: string | null;
      input_image_count: number;
      input_file_node_ids: string[];
      output_file_node_id: string | null;
      output_content_type: string | null;
      output_url: string | null;
      error_message: string | null;
      created_at: string;
    }[]
  >([]);
  const [modelTestVideoRuns, setModelTestVideoRuns] = useState<
    {
      id: string;
      prompt: string;
      duration: number | null;
      aspect_ratio: string | null;
      input_file_node_ids: string[];
      output_file_node_id: string | null;
      output_content_type: string | null;
      output_url: string | null;
      error_message: string | null;
      created_at: string;
    }[]
  >([]);
  const [modelTestSubmitting, setModelTestSubmitting] = useState(false);
  const [modelTestError, setModelTestError] = useState<string | null>(null);
  const [modelTestLastRaw, setModelTestLastRaw] = useState<Record<string, unknown> | null>(null);
  const modelTestImagePromptRef = useRef<HTMLTextAreaElement | null>(null);
  
  // @ Mention 相关状态
  const [mentionPopupOpen, setMentionPopupOpen] = useState(false);
  const [mentionPosition, setMentionPosition] = useState<{ top: number; left: number } | null>(null);

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

  const [agentPromptVersionsOpen, setAgentPromptVersionsOpen] = useState(false);
  const [agentPromptVersionsAgent, setAgentPromptVersionsAgent] = useState<AgentRow | null>(null);

  const [agentsSubTab, setAgentsSubTab] = useState<"custom" | "builtin">("custom");
  const [builtinAgents, setBuiltinAgents] = useState<BuiltinAgent[]>([]);
  const [builtinAgentsLoading, setBuiltinAgentsLoading] = useState(false);
  const [builtinAgentsError, setBuiltinAgentsError] = useState<string | null>(null);
  const [selectedBuiltinAgentCode, setSelectedBuiltinAgentCode] = useState<string>("");
  const [builtinVersions, setBuiltinVersions] = useState<BuiltinAgentPromptVersion[]>([]);
  const [builtinVersionsLoading, setBuiltinVersionsLoading] = useState(false);
  const [builtinVersionsError, setBuiltinVersionsError] = useState<string | null>(null);

  const [builtinPromptOpen, setBuiltinPromptOpen] = useState(false);
  const [builtinPromptSubmitting, setBuiltinPromptSubmitting] = useState(false);
  const [builtinPromptError, setBuiltinPromptError] = useState<string | null>(null);
  const [builtinEditingVersion, setBuiltinEditingVersion] = useState<BuiltinAgentPromptVersion | null>(null);
  const [builtinPromptForm, setBuiltinPromptForm] = useState<{
    system_prompt: string;
    ai_model_config_id: string | null;
    description: string;
    metaText: string;
  }>({
    system_prompt: "",
    ai_model_config_id: null,
    description: "",
    metaText: "{}",
  });

  const [builtinDiffOpen, setBuiltinDiffOpen] = useState(false);
  const [builtinDiffLoading, setBuiltinDiffLoading] = useState(false);
  const [builtinDiffError, setBuiltinDiffError] = useState<string | null>(null);
  const [builtinDiffFrom, setBuiltinDiffFrom] = useState<number>(1);
  const [builtinDiffTo, setBuiltinDiffTo] = useState<number>(1);
  const [builtinDiffText, setBuiltinDiffText] = useState<string>("");

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

  const refreshBuiltinAgents = async () => {
    setBuiltinAgentsLoading(true);
    setBuiltinAgentsError(null);
    try {
      const res = await builtinAgentsAdminList();
      const list = res.data || [];
      setBuiltinAgents(list);
      if (!selectedBuiltinAgentCode && list.length > 0) {
        setSelectedBuiltinAgentCode(list[0].agent_code);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setBuiltinAgentsError(msg);
      setBuiltinAgents([]);
    } finally {
      setBuiltinAgentsLoading(false);
    }
  };

  const refreshBuiltinVersions = async (agentCode: string) => {
    if (!agentCode) return;
    setBuiltinVersionsLoading(true);
    setBuiltinVersionsError(null);
    try {
      const res = await builtinAgentAdminListVersions(agentCode);
      const list = res.data || [];
      setBuiltinVersions(list);
      if (list.length > 0) {
        setBuiltinDiffFrom(list[list.length - 1].version);
        setBuiltinDiffTo(list[0].version);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setBuiltinVersionsError(msg);
      setBuiltinVersions([]);
    } finally {
      setBuiltinVersionsLoading(false);
    }
  };

  const openCreateBuiltinPrompt = () => {
    setBuiltinEditingVersion(null);
    setBuiltinPromptError(null);
    setBuiltinPromptForm({ system_prompt: "", ai_model_config_id: null, description: "", metaText: "{}" });
    setBuiltinPromptOpen(true);
  };

  const openEditBuiltinPrompt = (row: BuiltinAgentPromptVersion) => {
    setBuiltinEditingVersion(row);
    setBuiltinPromptError(null);
    setBuiltinPromptForm({
      system_prompt: row.system_prompt || "",
      ai_model_config_id: row.ai_model_config_id || null,
      description: row.description || "",
      metaText: JSON.stringify(row.meta || {}, null, 2),
    });
    setBuiltinPromptOpen(true);
  };

  const submitBuiltinPrompt = async (payload: {
    system_prompt: string;
    ai_model_config_id: string | null;
    description: string;
    metaText: string;
  }) => {
    if (!selectedBuiltinAgentCode) return;
    setBuiltinPromptSubmitting(true);
    setBuiltinPromptError(null);
    let meta: Record<string, unknown> = {};
    try {
      const txt = (payload.metaText || "").trim();
      meta = txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
    } catch (_e) {
      setBuiltinPromptSubmitting(false);
      setBuiltinPromptError("meta 不是合法 JSON");
      return;
    }
    try {
      if (builtinEditingVersion) {
        await builtinAgentAdminUpdateVersion(selectedBuiltinAgentCode, builtinEditingVersion.version, {
          system_prompt: payload.system_prompt,
          ai_model_config_id: payload.ai_model_config_id,
          description: payload.description || null,
          meta,
        });
      } else {
        await builtinAgentAdminCreateVersion(selectedBuiltinAgentCode, {
          system_prompt: payload.system_prompt,
          ai_model_config_id: payload.ai_model_config_id,
          description: payload.description || null,
          meta,
        });
      }
      setBuiltinPromptOpen(false);
      setBuiltinEditingVersion(null);
      await refreshBuiltinVersions(selectedBuiltinAgentCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setBuiltinPromptError(msg);
    } finally {
      setBuiltinPromptSubmitting(false);
    }
  };

  const activateBuiltinVersion = async (version: number) => {
    if (!selectedBuiltinAgentCode) return;
    try {
      await builtinAgentAdminActivateVersion(selectedBuiltinAgentCode, version);
      await refreshBuiltinVersions(selectedBuiltinAgentCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失败";
      setBuiltinVersionsError(msg);
    }
  };

  const deleteBuiltinVersion = async (version: number) => {
    if (!selectedBuiltinAgentCode) return;
    if (!window.confirm(`确认删除 v${version}？`)) return;
    try {
      await builtinAgentAdminDeleteVersion(selectedBuiltinAgentCode, version);
      await refreshBuiltinVersions(selectedBuiltinAgentCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setBuiltinVersionsError(msg);
    }
  };

  const openBuiltinDiff = () => {
    setBuiltinDiffError(null);
    setBuiltinDiffText("");
    setBuiltinDiffOpen(true);
  };

  const runBuiltinDiff = async () => {
    if (!selectedBuiltinAgentCode) return;
    setBuiltinDiffLoading(true);
    setBuiltinDiffError(null);
    try {
      const res = await builtinAgentAdminDiffVersions(selectedBuiltinAgentCode, builtinDiffFrom, builtinDiffTo);
      setBuiltinDiffText((res.data as unknown as { diff?: string })?.diff || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "对比失败";
      setBuiltinDiffError(msg);
      setBuiltinDiffText("");
    } finally {
      setBuiltinDiffLoading(false);
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
          await Promise.all([refreshAgents(), refreshAgentModelConfigs(), refreshBuiltinAgents()]);
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
    if (activeSection !== "agents") return;
    if (agentsSubTab !== "builtin") return;
    if (!selectedBuiltinAgentCode) return;
    void refreshBuiltinVersions(selectedBuiltinAgentCode);
  }, [activeSection, agentsSubTab, selectedBuiltinAgentCode]);

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
    if (activeSection !== "models") return;
    setCatalogLoading(true);
    aiGetCatalog()
      .then((res) => {
        setCatalogItems(res.data || []);
      })
      .catch(() => {
        setCatalogItems([]);
      })
      .finally(() => {
        setCatalogLoading(false);
      });
  }, [activeSection]);

  useEffect(() => {
    if (!modelTestChatOpen) return;
    if (modelTestModelConfigId) return;
    const first = aiModelConfigs[0];
    if (first) setModelTestModelConfigId(first.id);
  }, [activeModelTab, aiModelConfigs, modelTestChatOpen, modelTestModelConfigId]);

  useEffect(() => {
    if (!modelTestChatOpen) return;
    setModelTestSessionId("");
    setModelTestSessionImageAttachmentNodeIds([]);
    setModelTestImageRuns([]);
    setModelTestVideoRuns([]);
    setModelTestMessages([{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }]);
  }, [activeModelTab, modelTestChatOpen]);

  useEffect(() => {
    if (!modelTestChatOpen) return;
    if (!modelTestModelConfigId) return;
    void fetchModelTestSessions({ category: activeModelTab, aiModelConfigId: modelTestModelConfigId });
  }, [activeModelTab, modelTestChatOpen, modelTestModelConfigId]);

  useEffect(() => {
    if (!modelTestChatOpen) return;
    if (!modelTestSessionId) return;
    void fetchModelTestSessionDetail(modelTestSessionId);
  }, [activeModelTab, modelTestChatOpen, modelTestSessionId]);

  const resetModelTestChat = () => {
    setModelTestMessages([{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }]);
    setModelTestInput("");
    setModelTestImagePrompt("");
    setModelTestImageResolution("");
    setModelTestSessionImageAttachmentNodeIds([]);
    setModelTestImageResultUrl(null);
    setModelTestSessionId("");
    setModelTestImageRuns([]);
    setModelTestVideoRuns([]);
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

    let sid = modelTestSessionId;
    if (!sid) sid = await createModelTestSession({ category: "text", aiModelConfigId: modelTestModelConfigId });
    if (!sid) return;

    const nextMessages: AIChatMessage[] = [...modelTestMessages, { role: "user", content }];
    setModelTestMessages([...nextMessages, { role: "assistant", content: "" }]);
    setModelTestInput("");
    setModelTestSubmitting(true);
    setModelTestError(null);
    try {
      const resp = await fetch(`/api/ai/admin/model-configs/${modelTestModelConfigId}/test-chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, session_id: sid }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(extractApiErrorMessage(t, resp.statusText));
      }
      if (!resp.body) {
        throw new Error("流式响应不可用");
      }

      setModelTestLastRaw(null);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let acc = "";

      const flushEvent = (payload: any) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.type === "delta") {
          const d = typeof payload.delta === "string" ? payload.delta : "";
          if (!d) return;
          acc += d;
          setModelTestMessages((prev) => {
            if (prev.length === 0) return prev;
            const out = prev.slice();
            const last = out[out.length - 1];
            if (last?.role === "assistant") out[out.length - 1] = { role: "assistant", content: acc };
            return out;
          });
        } else if (payload.type === "done") {
          const finalText = (acc || payload.output_text || "").trim();
          setModelTestMessages((prev) => {
            if (prev.length === 0) return prev;
            const out = prev.slice();
            const last = out[out.length - 1];
            if (last?.role === "assistant") out[out.length - 1] = { role: "assistant", content: finalText || "（空响应）" };
            return out;
          });
        } else if (payload.type === "error") {
          const msg = typeof payload.message === "string" ? payload.message : "请求失败";
          setModelTestError(msg);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              flushEvent(JSON.parse(raw));
            } catch {
              continue;
            }
          }
        }
      }

      setModelTestSessionId(sid);
      void fetchModelTestSessions({ category: "text", aiModelConfigId: modelTestModelConfigId });
      void fetchModelTestSessionDetail(sid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "请求失败";
      setModelTestError(msg);
    } finally {
      setModelTestSubmitting(false);
    }
  };

  const submitModelTestImage = async () => {
    if (modelTestSubmitting) {
      console.warn("[submitModelTestImage] blocked: modelTestSubmitting is true");
      return;
    }
    const prompt = modelTestImagePrompt.trim();
    if (!prompt) {
      console.warn("[submitModelTestImage] blocked: prompt is empty");
      return;
    }
    if (!modelTestModelConfigId) {
      setModelTestError("请选择一个模型配置");
      return;
    }

    const category: AICategory = activeModelTab === "video" ? "video" : "image";

    const matches = Array.from(prompt.matchAll(/@(\d{1,2})/g));
    const idxs = Array.from(
      new Set(
        matches
          .map((m) => Number(m[1]))
          .filter((n) => Number.isFinite(n) && n >= 1),
      ),
    ).sort((a, b) => a - b);
    const invalid = idxs.find((n) => n > modelTestSessionImageAttachmentNodeIds.length);
    if (invalid) {
      setModelTestError(`引用了不存在的参考图 @${invalid}`);
      return;
    }
    const attachmentIds = idxs.map((n) => modelTestSessionImageAttachmentNodeIds[n - 1]).filter((x) => typeof x === "string" && x.length > 0);

    let sid = modelTestSessionId;
    if (!sid) sid = await createModelTestSession({ category, aiModelConfigId: modelTestModelConfigId });
    if (!sid) return;

    setModelTestSubmitting(true);
    setModelTestError(null);
    setModelTestLastRaw(null);
    setModelTestImageResultUrl(null);
    setModelTestImagePrompt("");
    try {
      const endpoint =
        category === "video"
          ? `/api/ai/admin/model-configs/${modelTestModelConfigId}/test-video`
          : `/api/ai/admin/model-configs/${modelTestModelConfigId}/test-image`;
      const INPUT_MODE_TO_VIDEO_MODE: Record<string, string> = {
        text_to_video: "text2video",
        first_frame: "image2video",
        first_last_frame: "start_end",
        reference_to_video: "reference",
        multi_frame: "multi_frame",
      };
      const videoMode = INPUT_MODE_TO_VIDEO_MODE[modelTestCapParams.input_mode] || "text2video";
      const payload =
        category === "video"
          ? {
              prompt,
              duration: modelTestCapParams.duration ?? null,
              aspect_ratio: modelTestCapParams.aspect_ratio ?? null,
              mode: videoMode,
              attachment_file_node_ids: attachmentIds.length ? attachmentIds : null,
              session_id: sid,
              param_json: { ...modelTestCapParams, mode: videoMode },
            }
          : {
              prompt,
              resolution: modelTestCapParams.resolution || modelTestImageResolution.trim() || null,
              attachment_file_node_ids: attachmentIds.length ? attachmentIds : null,
              session_id: sid,
              param_json: modelTestCapParams,
            };

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(extractApiErrorMessage(t, resp.statusText));
      }
      const json: unknown = await resp.json();
      const data = (json && typeof json === "object" ? (json as Record<string, unknown>).data : null) as Record<string, unknown> | null;
      const taskId = data?.task_id;
      const sessionId = typeof data?.session_id === "string" ? data.session_id : "";

      if (!taskId || typeof taskId !== "string") throw new Error("未获取到任务 ID");

      setModelTestSessionId(sessionId || sid);

      // Subscribe to task events via WebSocket
      let settled = false;
      const unsub = subscribeTask(taskId, async (ev) => {
        if (settled) return;
        if (ev.event_type === "succeeded" || ev.status === "succeeded") {
          settled = true;
          unsub();
          // Fetch task detail to get result_json
          try {
            const taskResp = await fetch(`/api/tasks/${taskId}`);
            const taskJson = await taskResp.json();
            const resultJson = taskJson?.data?.result_json;
            if (resultJson) {
              setModelTestImageResultUrl(resultJson.url || "（空响应）");
              setModelTestLastRaw(resultJson);
            }
          } catch { /* ignore */ }
          void fetchModelTestSessions({ category, aiModelConfigId: modelTestModelConfigId });
          void fetchModelTestSessionDetail(sessionId || sid);
          setModelTestSubmitting(false);
        } else if (ev.event_type === "failed" || ev.status === "failed") {
          settled = true;
          unsub();
          setModelTestError(ev.error || "任务执行失败");
          void fetchModelTestSessionDetail(sessionId || sid);
          setModelTestSubmitting(false);
        }
        // progress events: modelTestSubmitting stays true, the loading indicator shows
      });

      // 轮询兜底：防止 WebSocket 事件在订阅前已发出导致永远等待
      const pollInterval = setInterval(async () => {
        if (settled) { clearInterval(pollInterval); return; }
        try {
          const taskResp = await fetch(`/api/tasks/${taskId}`);
          if (!taskResp.ok) return;
          const taskJson = await taskResp.json();
          const task = taskJson?.data;
          if (!task) return;
          if (task.status === "succeeded") {
            if (settled) return;
            settled = true;
            unsub();
            clearInterval(pollInterval);
            if (task.result_json) {
              setModelTestImageResultUrl(task.result_json.url || "（空响应）");
              setModelTestLastRaw(task.result_json);
            }
            void fetchModelTestSessions({ category, aiModelConfigId: modelTestModelConfigId });
            void fetchModelTestSessionDetail(sessionId || sid);
            setModelTestSubmitting(false);
          } else if (task.status === "failed" || task.status === "canceled") {
            if (settled) return;
            settled = true;
            unsub();
            clearInterval(pollInterval);
            setModelTestError(task.error || "任务执行失败");
            void fetchModelTestSessionDetail(sessionId || sid);
            setModelTestSubmitting(false);
          }
        } catch { /* ignore poll errors */ }
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "请求失败";
      setModelTestError(msg);
      setModelTestSubmitting(false);
    }
  };

  const addModelTestImages = async (files: FileList | null) => {
    if (activeModelTab === "text") {
      setModelTestError("文本测试不支持上传参考图");
      return;
    }
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;

    const maxBytes = 10 * 1024 * 1024;
    const available = Math.max(0, 14 - modelTestSessionImageAttachmentNodeIds.length);
    if (available <= 0) {
      setModelTestError("最多上传 14 张参考图");
      return;
    }

    const readAsDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取文件失败"));
        reader.readAsDataURL(file);
      });

    const next: string[] = [];
    for (const f of list) {
      if (next.length >= available) break;
      if (f.size > maxBytes) {
        setModelTestError("单张图片不能超过 10MB");
        continue;
      }
      try {
        const dataUrl = (await readAsDataUrl(f)).trim();
        if (dataUrl) next.push(dataUrl);
      } catch {
        setModelTestError("读取图片失败");
        continue;
      }
    }

    if (!next.length) return;
    if (!modelTestModelConfigId) {
      setModelTestError("请选择一个模型配置");
      return;
    }
    let sid = modelTestSessionId;
    const category: AICategory = activeModelTab === "video" ? "video" : "image";
    if (!sid) sid = await createModelTestSession({ category, aiModelConfigId: modelTestModelConfigId });
    if (!sid) return;

    setModelTestSubmitting(true);
    setModelTestError(null);
    try {
      const resp = await fetch(`/api/ai/admin/model-test-sessions/${encodeURIComponent(sid)}/image-attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data_urls: next }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(extractApiErrorMessage(t, resp.statusText));
      }
      const json: unknown = await resp.json();
      if (!json || typeof json !== "object") return;
      const obj = json as Record<string, unknown>;
      const data = obj.data;
      if (!Array.isArray(data)) return;
      const ids = data.filter((x) => typeof x === "string") as string[];
      setModelTestSessionImageAttachmentNodeIds(ids);
      void fetchModelTestSessionDetail(sid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "请求失败";
      setModelTestError(msg);
    } finally {
      setModelTestSubmitting(false);
    }
  };

  const fetchModelTestSessions = async (opts: { category: AICategory; aiModelConfigId?: string }) => {
    setModelTestSessionsLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("category", opts.category);
      sp.set("page", "1");
      sp.set("page_size", "20");
      if (opts.aiModelConfigId) sp.set("ai_model_config_id", opts.aiModelConfigId);
      const resp = await fetch(`/api/ai/admin/model-test-sessions?${sp.toString()}`, { cache: "no-store" });
      if (!resp.ok) return;
      const json: unknown = await resp.json();
      if (!json || typeof json !== "object") return;
      const obj = json as Record<string, unknown>;
      const data = obj.data;
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const items = Array.isArray(d.items) ? d.items : [];
      const parsed = items
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const r = it as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id : "";
          const title = typeof r.title === "string" ? r.title : "模型测试";
          const updated_at = typeof r.updated_at === "string" ? r.updated_at : "";
          const run_count =
            typeof r.run_count === "number" ? r.run_count : typeof r.image_run_count === "number" ? r.image_run_count : 0;
          if (!id) return null;
          return { id, title, updated_at, run_count };
        })
        .filter((x): x is { id: string; title: string; updated_at: string; run_count: number } => Boolean(x));
      setModelTestSessions(parsed);
      if (!modelTestSessionId && parsed[0]?.id) setModelTestSessionId(parsed[0].id);
    } finally {
      setModelTestSessionsLoading(false);
    }
  };

  const fetchModelTestSessionDetail = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const resp = await fetch(`/api/ai/admin/model-test-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!resp.ok) return;
      const json: unknown = await resp.json();
      if (!json || typeof json !== "object") return;
      const obj = json as Record<string, unknown>;
      const data = obj.data;
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const category = typeof d.category === "string" ? (d.category as AICategory) : "image";
      const attRaw = Array.isArray(d.image_attachment_node_ids) ? d.image_attachment_node_ids : [];
      const att = attRaw.filter((x) => typeof x === "string") as string[];
      setModelTestSessionImageAttachmentNodeIds(att);

      if (category === "text") {
        setModelTestImageRuns([]);
        setModelTestVideoRuns([]);
        const runsRaw = Array.isArray(d.text_runs) ? d.text_runs : [];
        const last = runsRaw.length ? runsRaw[runsRaw.length - 1] : null;
        const fallback: AIChatMessage[] = [{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }];
        if (!last || typeof last !== "object") {
          setModelTestMessages(fallback);
          return;
        }
        const r = last as Record<string, unknown>;
        const msgsRaw = Array.isArray(r.messages) ? r.messages : [];
        const msgs: AIChatMessage[] = msgsRaw.flatMap((m) => {
          if (!m || typeof m !== "object") return [];
          const mm = m as Record<string, unknown>;
          if (typeof mm.role !== "string") return [];
          if (mm.role !== "system" && mm.role !== "user" && mm.role !== "assistant") return [];
          if (typeof mm.content !== "string") return [];
          return [{ role: mm.role, content: mm.content } as AIChatMessage];
        });
        const output_text = typeof r.output_text === "string" ? r.output_text : "";
        const next: AIChatMessage[] = output_text ? [...msgs, ({ role: "assistant", content: output_text } as AIChatMessage)] : msgs;
        setModelTestMessages(next.length ? next : fallback);
        return;
      }

      if (category === "video") {
        setModelTestMessages([{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }]);
        setModelTestImageRuns([]);
        const runsRaw = Array.isArray(d.video_runs) ? d.video_runs : [];
        const runs = runsRaw
          .map((it) => {
            if (!it || typeof it !== "object") return null;
            const r = it as Record<string, unknown>;
            const id = typeof r.id === "string" ? r.id : "";
            const prompt = typeof r.prompt === "string" ? r.prompt : "";
            const duration = typeof r.duration === "number" ? r.duration : null;
            const aspect_ratio = typeof r.aspect_ratio === "string" ? r.aspect_ratio : null;
            const input_file_node_ids = Array.isArray(r.input_file_node_ids)
              ? (r.input_file_node_ids.filter((x) => typeof x === "string") as string[])
              : [];
            const output_file_node_id = typeof r.output_file_node_id === "string" ? r.output_file_node_id : null;
            const output_content_type = typeof r.output_content_type === "string" ? r.output_content_type : null;
            const output_url = typeof r.output_url === "string" ? r.output_url : null;
            const error_message = typeof r.error_message === "string" ? r.error_message : null;
            const created_at = typeof r.created_at === "string" ? r.created_at : "";
            if (!id) return null;
            return { id, prompt, duration, aspect_ratio, input_file_node_ids, output_file_node_id, output_content_type, output_url, error_message, created_at };
          })
          .filter(
            (x): x is {
              id: string;
              prompt: string;
              duration: number | null;
              aspect_ratio: string | null;
              input_file_node_ids: string[];
              output_file_node_id: string | null;
              output_content_type: string | null;
              output_url: string | null;
              error_message: string | null;
              created_at: string;
            } => Boolean(x),
          );
        setModelTestVideoRuns(runs);
        return;
      }

      setModelTestMessages([{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }]);
      setModelTestVideoRuns([]);
      const runsRaw = Array.isArray(d.image_runs) ? d.image_runs : [];
      const runs = runsRaw
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const r = it as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id : "";
          const prompt = typeof r.prompt === "string" ? r.prompt : "";
          const resolution = typeof r.resolution === "string" ? r.resolution : null;
          const input_image_count = typeof r.input_image_count === "number" ? r.input_image_count : 0;
          const input_file_node_ids = Array.isArray(r.input_file_node_ids)
            ? (r.input_file_node_ids.filter((x) => typeof x === "string") as string[])
            : [];
          const output_file_node_id = typeof r.output_file_node_id === "string" ? r.output_file_node_id : null;
          const output_content_type = typeof r.output_content_type === "string" ? r.output_content_type : null;
          const output_url = typeof r.output_url === "string" ? r.output_url : null;
          const error_message = typeof r.error_message === "string" ? r.error_message : null;
          const created_at = typeof r.created_at === "string" ? r.created_at : "";
          if (!id) return null;
          return { id, prompt, resolution, input_image_count, input_file_node_ids, output_file_node_id, output_content_type, output_url, error_message, created_at };
        })
        .filter(
          (x): x is {
            id: string;
            prompt: string;
            resolution: string | null;
            input_image_count: number;
            input_file_node_ids: string[];
            output_file_node_id: string | null;
            output_content_type: string | null;
            output_url: string | null;
            error_message: string | null;
            created_at: string;
          } => Boolean(x),
        );
      setModelTestImageRuns(runs);
    } catch {
      return;
    }
  };

  const createModelTestSession = async (opts: { category: AICategory; aiModelConfigId?: string }) => {
    setModelTestSubmitting(true);
    setModelTestError(null);
    try {
      const title =
        opts.category === "text" ? "文本测试" : opts.category === "video" ? "视频测试" : "图片测试";
      const resp = await fetch(`/api/ai/admin/model-test-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: opts.category, ai_model_config_id: opts.aiModelConfigId || null, title }),
      });
      if (!resp.ok) return "";
      const json: unknown = await resp.json();
      if (!json || typeof json !== "object") return "";
      const obj = json as Record<string, unknown>;
      const data = obj.data;
      if (!data || typeof data !== "object") return "";
      const d = data as Record<string, unknown>;
      const id = typeof d.id === "string" ? d.id : "";
      if (!id) return "";
      setModelTestSessionId(id);
      setModelTestSessionImageAttachmentNodeIds([]);
      setModelTestImageRuns([]);
      setModelTestVideoRuns([]);
      setModelTestMessages([{ role: "system", content: "你是用于测试模型连通性的助手。请用简短中文回答。" }]);
      await fetchModelTestSessions({ category: opts.category, aiModelConfigId: opts.aiModelConfigId });
      return id;
    } finally {
      setModelTestSubmitting(false);
    }
  };

  const insertModelTestImageMention = (n: number) => {
    const token = `@${n} `;
    const el = modelTestImagePromptRef.current;
    if (!el) {
      setModelTestImagePrompt((p) => `${p}${token}`);
      return;
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : el.value.length;
    const current = el.value;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    setModelTestImagePrompt(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      } catch {
        return;
      }
    });
  };

  // 解析 Prompt 中的 @ 引用
  const parseMentionIndices = (prompt: string): number[] => {
    const matches = Array.from(prompt.matchAll(/@(\d{1,2})/g));
    return Array.from(
      new Set(
        matches
          .map((m) => Number(m[1]))
          .filter((n) => Number.isFinite(n) && n >= 1),
      ),
    ).sort((a, b) => a - b);
  };

  // 处理 @ 输入
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setModelTestImagePrompt(value);

    // 检测是否刚输入了 @
    if (value[cursorPos - 1] === '@') {
      const textarea = e.currentTarget;
      const coords = getCaretAbsoluteCoordinates(textarea, cursorPos);
      
      setMentionPosition({
        top: coords.top,
        left: coords.left,
      });
      setMentionPopupOpen(true);
    }
  };

  // 处理 Mention 选择
  const handleMentionSelect = (index: number) => {
    const textarea = modelTestImagePromptRef.current;
    if (!textarea) return;

    const value = textarea.value;
    const cursorPos = textarea.selectionStart || value.length;

    // 找到最后一个 @ 的位置
    const lastAt = value.lastIndexOf('@', cursorPos - 1);
    if (lastAt === -1) {
      setMentionPopupOpen(false);
      return;
    }

    // 替换 @ 为 @n
    const before = value.slice(0, lastAt);
    const after = value.slice(cursorPos);
    const newValue = `${before}@${index} ${after}`;

    setModelTestImagePrompt(newValue);
    setMentionPopupOpen(false);

    // 恢复焦点和光标
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = lastAt + `@${index} `.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  const removeModelTestSessionImageAttachment = async (nodeId: string) => {
    if (!modelTestSessionId) return;
    try {
      const resp = await fetch(
        `/api/ai/admin/model-test-sessions/${encodeURIComponent(modelTestSessionId)}/image-attachments/${encodeURIComponent(nodeId)}`,
        { method: "DELETE", cache: "no-store" },
      );
      if (!resp.ok) return;
      const json: unknown = await resp.json();
      if (!json || typeof json !== "object") return;
      const obj = json as Record<string, unknown>;
      const data = obj.data;
      if (!Array.isArray(data)) return;
      const ids = data.filter((x) => typeof x === "string") as string[];
      setModelTestSessionImageAttachmentNodeIds(ids);
      void fetchModelTestSessionDetail(modelTestSessionId);
    } catch {
      return;
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

  const filteredCatalogByCategory = useMemo(() => {
    return catalogItems.filter((x) => x.category === activeModelTab);
  }, [catalogItems, activeModelTab]);

  const catalogManufacturers = useMemo(() => {
    const set = new Set(filteredCatalogByCategory.map((m) => m.manufacturer_code).filter((x) => x.length > 0));
    return [{ key: "all", label: "全部" }, ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((k) => ({ key: k, label: k }))];
  }, [filteredCatalogByCategory]);

  const configByKey = useMemo(() => {
    const map = new Map<string, AIModelConfig>();
    for (const c of aiModelConfigs) map.set(`${c.category}::${c.manufacturer}::${c.model}`, c);
    return map;
  }, [aiModelConfigs]);

  const filteredCatalogItems = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return filteredCatalogByCategory.filter((m) => {
      if (catalogManufacturer !== "all" && m.manufacturer_code !== catalogManufacturer) return false;
      if (!q) return true;
      const hay = `${m.manufacturer_code} ${m.manufacturer_name} ${m.model_code} ${m.model_name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filteredCatalogByCategory, catalogManufacturer, catalogSearch]);

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
      if (m === "doubao") return "https://ark.cn-beijing.volces.com/api/v3";
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

  const openCatalogConfig = (item: AICatalogItem) => {
    const cfg = configByKey.get(`${item.category}::${item.manufacturer_code}::${item.model_code}`) || null;
    const defaultBaseUrl = (item.default_base_url || "").trim();
    const existingBaseUrl = (cfg?.base_url || "").trim();
    setCatalogConfigError(null);
    setCatalogApiKeyVisible(false);
    setCatalogSelected(item);
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
      const existingCfg = configByKey.get(`${catalogSelected.category}::${catalogSelected.manufacturer_code}::${catalogSelected.model_code}`);
      if (existingCfg?.id) {
        await aiAdminUpdateModelConfig(existingCfg.id, {
          base_url: catalogDraft.base_url.trim() ? catalogDraft.base_url.trim() : null,
          api_key: catalogDraft.api_key.trim() ? catalogDraft.api_key.trim() : null,
          enabled: !!catalogDraft.enabled,
          sort_order: Number(catalogDraft.sort_order || 0),
        });
      } else {
        await aiAdminCreateModelConfig({
          category: catalogSelected.category as AICategory,
          manufacturer: catalogSelected.manufacturer_code,
          model: catalogSelected.model_code,
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

  const batchDeleteModelConfigs = async (ids: string[]) => {
    if (!window.confirm(`确认删除选中的 ${ids.length} 项模型配置？`)) return;
    setAiConfigError(null);
    try {
      await Promise.all(ids.map((id) => aiAdminDeleteModelConfig(id)));
      await refreshAIModelConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "批量删除失败";
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
      <SettingsTabsHeader
        tabs={tabs}
        activeKey={activeSection}
        onSelect={(key) => setQuery({ tab: key as Section })}
      />

      {activeSection === "models" && (
        <>
          <ModelsSection
            activeModelTab={activeModelTab}
            setActiveModelTab={setActiveModelTab}
            setModelForm={setModelForm}
            aiConfigError={aiConfigError}
            aiConfigSubmitting={aiConfigSubmitting}
            aiConfigLoading={aiConfigLoading}
            aiModelConfigs={aiModelConfigs}
            deleteModelConfig={deleteModelConfig}
            batchDeleteModelConfigs={batchDeleteModelConfigs}
            bindingForm={bindingForm}
            setBindingForm={setBindingForm}
            submitUpsertBinding={submitUpsertBinding}
            aiBindings={aiBindings}
            deleteBinding={deleteBinding}
            openModelTestChat={openModelTestChat}
            modelTestChatOpen={modelTestChatOpen}
            closeModelTestChat={closeModelTestChat}
            resetModelTestChat={resetModelTestChat}
            modelTestModelConfigId={modelTestModelConfigId}
            setModelTestModelConfigId={setModelTestModelConfigId}
            modelTestSubmitting={modelTestSubmitting}
            modelTestError={modelTestError}
            modelTestMessages={modelTestMessages}
            modelTestSessionsLoading={modelTestSessionsLoading}
            modelTestSessions={modelTestSessions}
            modelTestSessionId={modelTestSessionId}
            setModelTestSessionId={setModelTestSessionId}
            createModelTestSession={createModelTestSession}
            modelTestImageRuns={modelTestImageRuns}
            modelTestVideoRuns={modelTestVideoRuns}
            modelTestLastRaw={modelTestLastRaw}
            modelTestInput={modelTestInput}
            setModelTestInput={setModelTestInput}
            submitModelTestChat={submitModelTestChat}
            modelTestSessionImageAttachmentNodeIds={modelTestSessionImageAttachmentNodeIds}
            parseMentionIndices={parseMentionIndices}
            insertModelTestImageMention={insertModelTestImageMention}
            removeModelTestSessionImageAttachment={removeModelTestSessionImageAttachment}
            addModelTestImages={addModelTestImages}
            modelTestImagePromptRef={modelTestImagePromptRef}
            modelTestImagePrompt={modelTestImagePrompt}
            handlePromptChange={handlePromptChange}
            mentionPopupOpen={mentionPopupOpen}
            mentionPosition={mentionPosition}
            handleMentionSelect={handleMentionSelect}
            setMentionPopupOpen={setMentionPopupOpen}
            submitModelTestImage={submitModelTestImage}
            modelTestImageResolution={modelTestImageResolution}
            setModelTestImageResolution={setModelTestImageResolution}
            capParams={modelTestCapParams}
            onCapParamsChange={setModelTestCapParams}
            addModelOpen={addModelOpen}
            setAddModelOpen={setAddModelOpen}
            catalogSearch={catalogSearch}
            setCatalogSearch={setCatalogSearch}
            catalogManufacturer={catalogManufacturer}
            setCatalogManufacturer={setCatalogManufacturer}
            catalogManufacturers={catalogManufacturers}
            vendorColor={vendorColor}
            filteredCatalogItems={filteredCatalogItems}
            catalogLoading={catalogLoading}
            configByKey={configByKey}
            openCatalogConfig={openCatalogConfig}
            catalogConfigOpen={catalogConfigOpen}
            catalogSelected={catalogSelected}
            closeCatalogConfig={closeCatalogConfig}
            catalogConfigSubmitting={catalogConfigSubmitting}
            catalogDraft={catalogDraft}
            setCatalogDraft={setCatalogDraft}
            catalogApiKeyVisible={catalogApiKeyVisible}
            setCatalogApiKeyVisible={setCatalogApiKeyVisible}
            getApiKeyUrl={getApiKeyUrl}
            catalogConfigError={catalogConfigError}
            saveCatalogConfig={saveCatalogConfig}
          />
        </>
      )}

      {(activeSection as Section) === "users" && (
        <UsersSection
          rbacError={rbacError}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenCreateUser={() => openCreateUserDialog()}
          team={team}
          avatarCacheBust={avatarCacheBust}
          avatarLetter={avatarLetter}
          onToggleUserStatus={handleUserStatusToggle}
          onOpenEditUser={openEditUserDialog}
        />
      )}

      {(activeSection as Section) === "roles" && (
        <RolesSection
          rbacError={rbacError}
          roles={roles}
          team={team}
          onAddRole={handleAddRole}
          onDeleteRole={handleDeleteRole}
          onGoPermissions={() => setQuery({ tab: "permissions" })}
        />
      )}

      {(activeSection as Section) === "permissions" && (
        <PermissionsMatrixSection
          rbacError={rbacError}
          roles={roles}
          permissionGroups={permissionGroups}
          permissionsByGroup={permissionsByGroup}
          onTogglePermission={togglePermission}
          onAddPermission={handleAddPermission}
        />
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

      {(activeSection as Section) === "audit" && (
        <AuditSection
          rbacError={rbacError}
          rbacLoading={rbacLoading}
          auditLogs={auditLogs}
          onRefresh={() => void refreshAudit()}
          auditTotal={auditTotal}
          auditOffset={auditOffset}
          setAuditOffset={setAuditOffset}
        />
      )}

      {(activeSection as Section) === "credits" && (
        <CreditsSection
          rbacError={rbacError}
          rbacLoading={rbacLoading}
          team={team}
          avatarCacheBust={avatarCacheBust}
          avatarLetter={avatarLetter}
          onRefreshUsers={() => void refreshUsers()}
          onOpenCreditsDialog={openCreditsDialog}
        />
      )}

      {(activeSection as Section) === "agents" && (
        <AgentsSection
          agentsSubTab={agentsSubTab}
          setAgentsSubTab={setAgentsSubTab}
          agentsError={agentsError}
          agentsLoading={agentsLoading}
          agents={agents}
          agentModelConfigs={agentModelConfigs}
          builtinAgentsLoading={builtinAgentsLoading}
          builtinAgents={builtinAgents}
          builtinAgentsError={builtinAgentsError}
          builtinVersionsLoading={builtinVersionsLoading}
          builtinVersions={builtinVersions}
          builtinVersionsError={builtinVersionsError}
          selectedBuiltinAgentCode={selectedBuiltinAgentCode}
          setSelectedBuiltinAgentCode={setSelectedBuiltinAgentCode}
          refreshAgents={() => void refreshAgents()}
          refreshBuiltinAgents={() => void refreshBuiltinAgents()}
          refreshBuiltinVersions={(code) => void refreshBuiltinVersions(code)}
          openCreateAgentDialog={openCreateAgentDialog}
          openBuiltinDiff={openBuiltinDiff}
          openCreateBuiltinPrompt={openCreateBuiltinPrompt}
          openEditBuiltinPrompt={openEditBuiltinPrompt}
          activateBuiltinVersion={activateBuiltinVersion}
          deleteBuiltinVersion={deleteBuiltinVersion}
          openEditAgentDialog={openEditAgentDialog}
          deleteAgent={deleteAgent}
          onOpenPromptVersions={(a) => {
            setAgentPromptVersionsAgent(a);
            setAgentPromptVersionsOpen(true);
          }}
        />
      )}

      <CreditsAdjustModal
        open={creditsOpen}
        user={creditsUser}
        onClose={() => setCreditsOpen(false)}
        creditsError={creditsError}
        creditsAccount={creditsAccount}
        creditsReason={creditsReason}
        setCreditsReason={setCreditsReason}
        creditsAdjustDelta={creditsAdjustDelta}
        setCreditsAdjustDelta={setCreditsAdjustDelta}
        creditsSetBalance={creditsSetBalance}
        setCreditsSetBalance={setCreditsSetBalance}
        creditsLoading={creditsLoading}
        submitCreditsAdjust={submitCreditsAdjust}
        submitCreditsSet={submitCreditsSet}
        creditsTransactions={creditsTransactions}
      />

      <AgentPromptVersionsDialog
        open={agentPromptVersionsOpen}
        agent={agentPromptVersionsAgent as unknown as AgentRow | null}
        onClose={() => {
          setAgentPromptVersionsOpen(false);
          setAgentPromptVersionsAgent(null);
        }}
      />

      <BuiltinPromptVersionDialog
        open={builtinPromptOpen}
        agentCode={selectedBuiltinAgentCode}
        editingVersion={builtinEditingVersion}
        initialSystemPrompt={builtinPromptForm.system_prompt}
        initialModelConfigId={builtinPromptForm.ai_model_config_id}
        initialDescription={builtinPromptForm.description}
        initialMetaText={builtinPromptForm.metaText}
        modelConfigs={agentModelConfigs}
        submitting={builtinPromptSubmitting}
        error={builtinPromptError}
        onClose={() => {
          setBuiltinPromptOpen(false);
          setBuiltinPromptError(null);
        }}
        onSubmit={(payload) => void submitBuiltinPrompt(payload)}
      />

      <BuiltinDiffModal
        open={builtinDiffOpen}
        agentCode={selectedBuiltinAgentCode}
        error={builtinDiffError}
        versions={builtinVersions}
        from={builtinDiffFrom}
        to={builtinDiffTo}
        setFrom={setBuiltinDiffFrom}
        setTo={setBuiltinDiffTo}
        loading={builtinDiffLoading}
        diffText={builtinDiffText}
        onRun={() => void runBuiltinDiff()}
        onClose={() => {
          setBuiltinDiffOpen(false);
          setBuiltinDiffError(null);
        }}
      />

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
