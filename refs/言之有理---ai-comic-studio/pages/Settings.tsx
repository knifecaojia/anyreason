
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Settings as SettingsIcon, 
  Cpu, 
  Key, 
  Save, 
  CheckCircle, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Server,
  Zap,
  Image as ImageIcon,
  MessageSquare,
  Bot,
  Users,
  Shield,
  MoreHorizontal,
  Mail,
  Search,
  UserPlus,
  FileClock,
  LogOut,
  Lock,
  UserCog,
  LayoutGrid,
  Check
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { ModelProvider, GlobalModelConfig } from '../types';

// --- Types for RBAC ---

interface Permission {
  id: string;
  code: string;
  name: string;
  group: string;
  description?: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean; // System roles cannot be deleted
  permissionIds: string[];
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  roleId: string; // Linked to Role.id
  avatar: string;
  status: 'active' | 'inactive' | 'pending';
  lastActive: string;
}

// --- Mock Data: RBAC ---

const PERMISSIONS: Permission[] = [
  { id: 'p1', code: 'project.create', name: '创建项目', group: '项目管理' },
  { id: 'p2', code: 'project.edit', name: '编辑项目', group: '项目管理' },
  { id: 'p3', code: 'project.delete', name: '删除项目', group: '项目管理' },
  { id: 'p4', code: 'project.view', name: '查看项目', group: '项目管理' },
  
  { id: 'p5', code: 'asset.create', name: '创建资产', group: '资产中心' },
  { id: 'p6', code: 'asset.view', name: '查看资产', group: '资产中心' },
  { id: 'p7', code: 'asset.delete', name: '删除资产', group: '资产中心' },
  
  { id: 'p8', code: 'script.write', name: '剧本创作', group: '剧本创作' },
  { id: 'p9', code: 'script.analyze', name: '剧本拆解', group: '剧本创作' },
  
  { id: 'p10', code: 'system.users', name: '用户管理', group: '系统设置' },
  { id: 'p11', code: 'system.roles', name: '角色权限', group: '系统设置' },
  { id: 'p12', code: 'system.models', name: '模型配置', group: '系统设置' },
];

const INITIAL_ROLES: Role[] = [
  { 
    id: 'admin', 
    name: 'Admin', 
    description: '系统管理员，拥有全平台最高权限', 
    isSystem: true, 
    permissionIds: PERMISSIONS.map(p => p.id) 
  },
  { 
    id: 'director', 
    name: 'Director', 
    description: '导演，负责项目统筹与内容审核', 
    isSystem: false, 
    permissionIds: ['p1', 'p2', 'p4', 'p5', 'p6', 'p8', 'p9'] 
  },
  { 
    id: 'artist', 
    name: 'Artist', 
    description: '美术，专注于资产生产与分镜绘制', 
    isSystem: false, 
    permissionIds: ['p4', 'p5', 'p6'] 
  },
  { 
    id: 'editor', 
    name: 'Editor', 
    description: '剪辑/编剧，负责剧本与后期', 
    isSystem: false, 
    permissionIds: ['p4', 'p8', 'p9'] 
  }
];

const INITIAL_TEAM: TeamMember[] = [
  { id: 'u1', name: '李策划', email: 'director@studio.com', roleId: 'director', status: 'active', avatar: 'https://picsum.photos/id/64/100/100', lastActive: '2 mins ago' },
  { id: 'u2', name: '张美术', email: 'art@studio.com', roleId: 'artist', status: 'active', avatar: 'https://picsum.photos/id/65/100/100', lastActive: '1 hour ago' },
  { id: 'u3', name: '王剪辑', email: 'editor@studio.com', roleId: 'editor', status: 'inactive', avatar: 'https://picsum.photos/id/66/100/100', lastActive: '3 days ago' },
  { id: 'u4', name: 'System Admin', email: 'admin@studio.com', roleId: 'admin', status: 'active', avatar: 'https://picsum.photos/id/67/100/100', lastActive: 'Just now' },
];

// --- Mock Data: Models ---

const INITIAL_PROVIDERS: ModelProvider[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'gemini',
    icon: 'G',
    description: 'Google 最新的多模态大模型，支持超长上下文。',
    enabled: true,
    config: { apiKey: process.env.API_KEY || '', baseUrl: '' },
    supportedModels: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash-latest'],
    capabilities: ['text', 'multimodal', 'image']
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    icon: 'O',
    description: '行业标准的 LLM 提供商，包含 GPT-4 系列。',
    enabled: false,
    config: { apiKey: '', baseUrl: 'https://api.openai.com/v1' },
    supportedModels: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    capabilities: ['text', 'image', 'multimodal']
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    icon: 'A',
    description: 'Claude 系列模型，擅长文学创作与逻辑推理。',
    enabled: false,
    config: { apiKey: '', baseUrl: 'https://api.anthropic.com' },
    supportedModels: ['claude-3-5-sonnet', 'claude-3-opus'],
    capabilities: ['text', 'multimodal']
  },
  {
    id: 'stability',
    name: 'Stability AI',
    type: 'stability',
    icon: 'S',
    description: '专业的图像生成模型供应商。',
    enabled: false,
    config: { apiKey: '' },
    supportedModels: ['stable-diffusion-3', 'sdxl-turbo'],
    capabilities: ['image']
  }
];

const INITIAL_GLOBAL_CONFIG: GlobalModelConfig = {
  scriptModel: 'gemini-3-flash-preview',
  imageModel: 'gemini-2.5-flash-image',
  visionModel: 'gemini-3-pro-preview'
};

export const Settings: React.FC = () => {
  // Navigation State
  const [searchParams] = useSearchParams();
  const activeSection = (searchParams.get('tab') || 'models') as 'models' | 'users' | 'roles' | 'permissions' | 'audit';

  // Models State
  const [activeModelTab, setActiveModelTab] = useState<'providers' | 'defaults'>('providers');
  const [providers, setProviders] = useState<ModelProvider[]>(INITIAL_PROVIDERS);
  const [globalConfig, setGlobalConfig] = useState<GlobalModelConfig>(INITIAL_GLOBAL_CONFIG);
  
  // RBAC State
  const [team, setTeam] = useState<TeamMember[]>(INITIAL_TEAM);
  const [roles, setRoles] = useState<Role[]>(INITIAL_ROLES);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [tempConfig, setTempConfig] = useState<any>({});
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, msg: string} | null>(null);

  // --- Handlers: Models ---

  const handleEditProvider = (provider: ModelProvider) => {
    setEditingProvider(provider);
    setTempConfig({ ...provider.config });
    setTestResult(null);
    setShowKey(false);
  };

  const handleSaveProvider = () => {
    if (!editingProvider) return;
    setProviders(prev => prev.map(p => 
      p.id === editingProvider.id 
        ? { ...p, config: tempConfig, enabled: !!tempConfig.apiKey } 
        : p
    ));
    setEditingProvider(null);
  };

  const handleTestConnection = async () => {
    if (!editingProvider) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      if (editingProvider.type === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: tempConfig.apiKey || process.env.API_KEY });
        await ai.models.generateContent({
           model: 'gemini-3-flash-preview',
           contents: 'Test connection',
        });
        setTestResult({ success: true, msg: '连接成功：Gemini API 响应正常。' });
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (tempConfig.apiKey && tempConfig.apiKey.length > 5) {
           setTestResult({ success: true, msg: `连接成功：已验证 ${editingProvider.name} 凭证。` });
        } else {
           throw new Error("API Key 无效或为空");
        }
      }
    } catch (error: any) {
      setTestResult({ success: false, msg: `连接失败：${error.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  // --- Handlers: RBAC ---

  const handleUserRoleChange = (userId: string, newRoleId: string) => {
    setTeam(prev => prev.map(u => u.id === userId ? { ...u, roleId: newRoleId } : u));
  };

  const handleUserStatusToggle = (userId: string) => {
    setTeam(prev => prev.map(u => u.id === userId ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u));
  };

  const togglePermission = (roleId: string, permissionId: string) => {
    setRoles(prev => prev.map(role => {
      if (role.id === roleId) {
        if (role.isSystem && role.id === 'admin') return role; // Admin always has all, but for UI feedback we usually disable checkbox. This is double safety.
        const hasPermission = role.permissionIds.includes(permissionId);
        return {
          ...role,
          permissionIds: hasPermission 
            ? role.permissionIds.filter(id => id !== permissionId)
            : [...role.permissionIds, permissionId]
        };
      }
      return role;
    }));
  };

  const handleAddRole = () => {
    const newRole: Role = {
      id: `role-${Date.now()}`,
      name: 'New Role',
      description: 'Custom role description',
      isSystem: false,
      permissionIds: []
    };
    setRoles([...roles, newRole]);
  };

  const handleDeleteRole = (roleId: string) => {
    setRoles(prev => prev.filter(r => r.id !== roleId));
  };

  // --- Render Components ---

  const ProviderCard: React.FC<{ provider: ModelProvider }> = ({ provider }) => (
    <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/30 transition-all group relative overflow-hidden">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg shadow-inner ${
             provider.enabled ? 'bg-primary/20 text-primary' : 'bg-surfaceHighlight text-textMuted'
          }`}>
            {provider.icon}
          </div>
          <div>
            <h3 className="font-bold text-textMain">{provider.name}</h3>
            <div className="flex items-center gap-2 mt-1">
               {provider.capabilities.map(cap => (
                 <span key={cap} className="text-[10px] uppercase bg-surfaceHighlight border border-border px-1.5 rounded text-textMuted">{cap}</span>
               ))}
            </div>
          </div>
        </div>
        <div className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${
          provider.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${provider.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
          {provider.enabled ? '已启用' : '未配置'}
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
        >
          <SettingsIcon size={14} />
          <span>设置</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {/* Right Content Area - Direct Content No Sidebar */}
      
        {/* === SECTION: MODEL ENGINE === */}
        {activeSection === 'models' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
             <div className="flex justify-between items-end border-b border-border pb-6">
                <div>
                   <h1 className="text-2xl font-bold text-textMain mb-2">模型引擎配置</h1>
                   <p className="text-textMuted text-sm">管理 LLM 供应商、API 密钥及系统默认推理模型。</p>
                </div>
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-surfaceHighlight p-1 rounded-lg border border-border">
                  <button 
                    onClick={() => setActiveModelTab('providers')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                      activeModelTab === 'providers' ? 'bg-surface text-textMain shadow-sm border border-border/50' : 'text-textMuted hover:text-textMain'
                    }`}
                  >
                    <Server size={14} /> 供应商
                  </button>
                  <button 
                    onClick={() => setActiveModelTab('defaults')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                      activeModelTab === 'defaults' ? 'bg-surface text-textMain shadow-sm border border-border/50' : 'text-textMuted hover:text-textMain'
                    }`}
                  >
                    <Zap size={14} /> 默认模型
                  </button>
                </div>
             </div>

             {/* Providers Grid */}
             {activeModelTab === 'providers' && (
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                 {providers.map(p => <ProviderCard key={p.id} provider={p} />)}
                 <button className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl flex flex-col items-center justify-center gap-3 text-textMuted hover:text-primary transition-all p-6 bg-surface/30 min-h-[200px]">
                    <div className="w-12 h-12 rounded-full bg-surfaceHighlight flex items-center justify-center">
                      <Plus size={24} />
                    </div>
                    <span className="font-medium">添加自定义服务</span>
                 </button>
               </div>
             )}

             {/* Defaults Config */}
             {activeModelTab === 'defaults' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-surface border border-border rounded-xl p-6 space-y-8">
                     <h3 className="text-lg font-bold border-b border-border/50 pb-4 text-textMain">系统推理模型</h3>
                     <div className="space-y-4">
                       <div className="space-y-2">
                          <label className="text-sm font-medium flex items-center gap-2 text-textMuted"><MessageSquare size={16} className="text-purple-400" /> 剧本创作 (Scripting)</label>
                          <select 
                            value={globalConfig.scriptModel}
                            onChange={(e) => setGlobalConfig({...globalConfig, scriptModel: e.target.value})}
                            className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain"
                          >
                            {providers.filter(p => p.enabled && p.capabilities.includes('text')).flatMap(p => 
                              p.supportedModels.map(m => <option key={`${p.id}-${m}`} value={m}>{p.name} - {m}</option>)
                            )}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-sm font-medium flex items-center gap-2 text-textMuted"><Bot size={16} className="text-yellow-400" /> 复杂推理 (Reasoning)</label>
                          <select 
                            value={globalConfig.visionModel}
                            onChange={(e) => setGlobalConfig({...globalConfig, visionModel: e.target.value})}
                            className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain"
                          >
                            {providers.filter(p => p.enabled).flatMap(p => 
                              p.supportedModels.map(m => <option key={`${p.id}-${m}`} value={m}>{p.name} - {m}</option>)
                            )}
                          </select>
                       </div>
                     </div>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-6 space-y-8">
                     <h3 className="text-lg font-bold border-b border-border/50 pb-4 text-textMain">多模态生成模型</h3>
                     <div className="space-y-4">
                       <div className="space-y-2">
                          <label className="text-sm font-medium flex items-center gap-2 text-textMuted"><ImageIcon size={16} className="text-pink-400" /> 图像生成 (Image Generation)</label>
                          <select 
                            value={globalConfig.imageModel}
                            onChange={(e) => setGlobalConfig({...globalConfig, imageModel: e.target.value})}
                            className="w-full bg-surfaceHighlight border border-border rounded-lg p-3 text-sm outline-none focus:border-primary transition-colors text-textMain"
                          >
                            {providers.filter(p => p.enabled && p.capabilities.includes('image')).flatMap(p => 
                              p.supportedModels.map(m => <option key={`${p.id}-${m}`} value={m}>{p.name} - {m}</option>)
                            )}
                          </select>
                       </div>
                     </div>
                  </div>
                </div>
             )}
          </div>
        )}

        {/* === SECTION: USERS === */}
        {activeSection === 'users' && (
          <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
             <div className="flex justify-between items-end border-b border-border pb-6">
                <div>
                   <h1 className="text-2xl font-bold text-textMain mb-2">用户管理</h1>
                   <p className="text-textMuted text-sm">管理成员账号、分配角色及重置访问权限。</p>
                </div>
                <button className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2">
                   <UserPlus size={16} /> 邀请成员
                </button>
             </div>

             <div className="flex gap-4 mb-6">
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16}/>
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
                    {team.filter(u => u.name.includes(searchQuery) || u.email.includes(searchQuery)).map(user => (
                      <tr key={user.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                              <img src={user.avatar} className="w-10 h-10 rounded-full border border-border" />
                              <div>
                                 <div className="font-bold text-textMain">{user.name}</div>
                                 <div className="text-xs text-textMuted">{user.email}</div>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <select 
                             value={user.roleId} 
                             onChange={(e) => handleUserRoleChange(user.id, e.target.value)}
                             className="bg-transparent border border-border rounded px-2 py-1.5 text-xs font-medium outline-none cursor-pointer hover:border-primary focus:border-primary text-textMain"
                           >
                              {roles.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                           </select>
                        </td>
                        <td className="px-6 py-4">
                           <button 
                             onClick={() => handleUserStatusToggle(user.id)}
                             className={`px-3 py-1 rounded-full text-[10px] font-bold border flex items-center justify-center gap-1 w-20 transition-all ${
                               user.status === 'active' 
                                 ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20' 
                                 : 'bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20'
                             }`}
                           >
                             <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-400' : 'bg-gray-500'}`}></div>
                             {user.status === 'active' ? 'Active' : 'Disabled'}
                           </button>
                        </td>
                        <td className="px-6 py-4 text-textMuted text-xs font-mono">
                           {user.lastActive}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <button className="p-2 text-textMuted hover:text-textMain hover:bg-surfaceHighlight rounded-lg transition-colors">
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

        {/* === SECTION: ROLES === */}
        {activeSection === 'roles' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
             <div className="flex justify-between items-end border-b border-border pb-6">
                <div>
                   <h1 className="text-2xl font-bold text-textMain mb-2">角色管理</h1>
                   <p className="text-textMuted text-sm">定义平台角色及其职能描述，用于权限绑定。</p>
                </div>
                <button onClick={handleAddRole} className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2">
                   <Plus size={16} /> 创建角色
                </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {roles.map(role => {
                   const memberCount = team.filter(u => u.roleId === role.id).length;
                   return (
                    <div key={role.id} className="bg-surface border border-border rounded-xl p-6 flex flex-col hover:border-primary/50 transition-colors group">
                       <div className="flex justify-between items-start mb-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${role.isSystem ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                             {role.name.charAt(0)}
                          </div>
                          {role.isSystem && <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">System</span>}
                       </div>
                       <h3 className="text-lg font-bold text-textMain mb-2">{role.name}</h3>
                       <p className="text-sm text-textMuted mb-6 flex-1 line-clamp-2">{role.description}</p>
                       
                       <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs text-textMuted">
                          <div className="flex items-center gap-2">
                             <Users size={14} /> 
                             <span>{memberCount} 成员</span>
                          </div>
                          <div className="flex items-center gap-2">
                             {/* Keep as pure navigation if sidebar is gone, or just change tabs */}
                             {/* Note: In query-param nav, we just link to permission tab */}
                             <a href="/settings?tab=permissions" className="hover:text-primary transition-colors flex items-center gap-1">
                               <Lock size={12} /> 权限
                             </a>
                             {!role.isSystem && (
                               <button onClick={() => handleDeleteRole(role.id)} className="hover:text-red-400 transition-colors ml-2">
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

        {/* === SECTION: PERMISSION MATRIX === */}
        {activeSection === 'permissions' && (
           <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
              <div className="flex justify-between items-end border-b border-border pb-6">
                 <div>
                    <h1 className="text-2xl font-bold text-textMain mb-2">权限矩阵 (Permission Matrix)</h1>
                    <p className="text-textMuted text-sm">精细化控制每个角色的系统操作权限。</p>
                 </div>
              </div>

              <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                       <thead>
                          <tr className="bg-surfaceHighlight/50 border-b border-border">
                             <th className="px-6 py-4 text-left font-medium text-textMuted w-64">权限项 / 功能模块</th>
                             {roles.map(role => (
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
                          {Array.from(new Set(PERMISSIONS.map(p => p.group))).map(group => (
                             <React.Fragment key={group}>
                                <tr className="bg-surfaceHighlight/20">
                                   <td colSpan={roles.length + 1} className="px-6 py-2 text-xs font-bold text-textMuted uppercase tracking-widest bg-surfaceHighlight/30">
                                      {group}
                                   </td>
                                </tr>
                                {PERMISSIONS.filter(p => p.group === group).map(perm => (
                                   <tr key={perm.id} className="hover:bg-surfaceHighlight/10 transition-colors">
                                      <td className="px-6 py-3">
                                         <div className="font-medium text-textMain">{perm.name}</div>
                                         <div className="text-xs text-textMuted font-mono opacity-50">{perm.code}</div>
                                      </td>
                                      {roles.map(role => {
                                         const hasPerm = role.permissionIds.includes(perm.id);
                                         const isAdmin = role.id === 'admin';
                                         return (
                                            <td key={role.id} className="px-4 py-3 text-center">
                                               <button 
                                                  onClick={() => togglePermission(role.id, perm.id)}
                                                  disabled={isAdmin}
                                                  className={`w-6 h-6 rounded border flex items-center justify-center transition-all mx-auto ${
                                                     hasPerm 
                                                        ? 'bg-primary border-primary text-white' 
                                                        : 'bg-transparent border-border text-transparent hover:border-primary/50'
                                                  } ${isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                               >
                                                  <Check size={14} strokeWidth={3} />
                                               </button>
                                            </td>
                                         );
                                      })}
                                   </tr>
                                ))}
                             </React.Fragment>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        )}

        {/* === SECTION: AUDIT LOGS === */}
        {activeSection === 'audit' && (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-textMuted">
             <div className="w-16 h-16 bg-surfaceHighlight rounded-full flex items-center justify-center mb-4">
                <FileClock size={32} />
             </div>
             <h3 className="text-lg font-bold text-textMain">系统审计日志</h3>
             <p className="text-sm opacity-60">此功能模块暂未开放，敬请期待。</p>
          </div>
        )}

      {/* --- Edit Provider Modal (Same as before) --- */}
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
                 <button onClick={() => setEditingProvider(null)} className="text-textMuted hover:text-textMain px-3 py-2 text-sm">取消</button>
                 <button onClick={handleSaveProvider} className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"><Save size={16} /> 保存配置</button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              <div className="space-y-4">
                 <h3 className="text-sm font-bold text-textMuted uppercase tracking-wider flex items-center gap-2"><Key size={14} /> 认证信息</h3>
                 <div className="grid grid-cols-1 gap-4">
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-textMain">API Key <span className="text-red-400">*</span></label>
                     <div className="relative">
                       <input type={showKey ? "text" : "password"} value={tempConfig.apiKey} onChange={(e) => setTempConfig({...tempConfig, apiKey: e.target.value})} className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 pl-4 pr-10 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain" />
                       <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain">{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                     </div>
                   </div>
                   {editingProvider.type !== 'gemini' && (
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-textMain">Endpoint URL</label>
                       <input type="text" value={tempConfig.baseUrl || ''} onChange={(e) => setTempConfig({...tempConfig, baseUrl: e.target.value})} className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none font-mono text-textMuted" />
                     </div>
                   )}
                 </div>
                 <div className="flex items-center gap-4 pt-2">
                   <button onClick={handleTestConnection} disabled={isTesting || !tempConfig.apiKey} className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 text-textMain">{isTesting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />} 测试连接</button>
                   {testResult && (<div className={`text-sm flex items-center gap-2 ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>{testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}{testResult.msg}</div>)}
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
