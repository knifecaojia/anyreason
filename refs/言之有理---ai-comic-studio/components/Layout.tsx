
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Clapperboard, 
  Library, 
  Settings, 
  Wand2, 
  Bell, 
  Search,
  LogOut,
  ChevronRight,
  ChevronLeft,
  FileText,
  ScanSearch,
  Film,
  Menu,
  ChevronDown,
  PlusCircle,
  List,
  ImagePlus,
  Workflow,
  Sun,
  Moon,
  Cpu,
  Users,
  Shield,
  Lock,
  FileClock
} from 'lucide-react';
import { MOCK_USER } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
}

const SidebarGroup: React.FC<{ 
  icon: any, 
  label: string, 
  collapsed: boolean, 
  active: boolean,
  children: React.ReactNode 
}> = ({ 
  icon: Icon, 
  label, 
  collapsed, 
  active, 
  children 
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (collapsed) {
    return (
      <div className="group relative">
        <div className={`flex justify-center p-3 rounded-xl mb-2 transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-textMuted hover:bg-surfaceHighlight'}`}>
          <Icon size={20} />
        </div>
        {/* Hover Tooltip for collapsed state would go here */}
      </div>
    );
  }

  return (
    <div className="mb-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-2 rounded-xl transition-all duration-200 group ${
          active ? 'text-primary font-medium' : 'text-textMuted hover:text-textMain'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon size={20} className="flex-shrink-0" />
          <span className="whitespace-nowrap overflow-hidden text-sm">{label}</span>
        </div>
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
      </button>
      
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="mt-1 ml-4 border-l border-border pl-2 space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
};

const SubItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
  const location = useLocation();
  // Handle query params matching
  let isActive = (location.pathname + location.search) === to;
  
  // Default handling for settings: if we are at /settings without query params, treat as /settings?tab=models
  if (to === '/settings?tab=models' && location.pathname === '/settings' && !location.search) {
    isActive = true;
  }

  return (
    <NavLink 
      to={to} 
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
        isActive 
          ? 'bg-surfaceHighlight text-textMain font-medium' 
          : 'text-textMuted hover:text-textMain hover:bg-surfaceHighlight/50'
      }`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </NavLink>
  );
};

const SidebarItem = ({ to, icon: Icon, label, collapsed }: { to: string, icon: any, label: string, collapsed: boolean }) => {
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => 
        `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group mb-1 ${
          isActive 
            ? 'bg-primary/10 text-primary font-medium' 
            : 'text-textMuted hover:bg-surfaceHighlight hover:text-textMain'
        } ${collapsed ? 'justify-center px-2' : ''}`
      }
    >
      <Icon size={20} className="group-hover:scale-110 transition-transform flex-shrink-0" />
      {!collapsed && <span className="whitespace-nowrap overflow-hidden transition-all text-sm">{label}</span>}
    </NavLink>
  );
};

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });

  const toggleTheme = () => {
    const newMode = !isDark;
    setIsDark(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const handleLogout = () => {
    navigate('/');
  };

  // Determine page title based on path
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/dashboard')) return '工作台 / Dashboard';
    if (path.includes('/projects')) return '漫剧项目 / Projects';
    if (path.includes('/scripts')) return '剧本管理 / Script Management';
    if (path.includes('/extraction')) return '资产提取 / Asset Extraction';
    if (path.includes('/storyboard')) return '内容创作 / Content Creation';
    if (path.includes('/assets')) return '资产管理 / Asset Management';
    if (path.includes('/studio')) return 'AI 创作工坊 / Studio';
    if (path.includes('/settings')) return '系统设置 / Settings';
    return '言之有理';
  };

  // Pages that need full width (no padding)
  const isFullWidthPage = ['/storyboard', '/studio'].includes(location.pathname);

  return (
    <div className="flex h-screen bg-background text-textMain overflow-hidden font-sans transition-colors duration-300">
      {/* Sidebar */}
      <aside 
        className={`${collapsed ? 'w-20' : 'w-64'} flex-shrink-0 bg-surface border-r border-border flex flex-col justify-between transition-all duration-300 relative z-20`}
      >
        {/* Toggle Button */}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 bg-surface border border-border text-textMuted hover:text-primary rounded-full p-1 z-30 shadow-sm"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="p-4 flex flex-col h-full overflow-hidden">
          <div className={`flex items-center gap-3 mb-8 ${collapsed ? 'justify-center' : 'px-2'}`}>
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
            <SidebarItem to="/dashboard" icon={LayoutDashboard} label="工作台" collapsed={collapsed} />
            
            <div className="pt-4 pb-2">
              {!collapsed && <p className="px-4 text-[10px] font-bold text-textMuted/50 uppercase tracking-wider mb-2 animate-fade-in">Production Pipeline</p>}
              
              <SidebarGroup 
                icon={FileText} 
                label="剧本管理" 
                collapsed={collapsed}
                active={location.pathname.includes('/scripts')}
              >
                <SubItem to="/scripts?mode=list" icon={List} label="剧本清单" />
                <SubItem to="/scripts?mode=write" icon={PlusCircle} label="剧本创作" />
              </SidebarGroup>

              <SidebarGroup 
                icon={Library} 
                label="资产管理" 
                collapsed={collapsed}
                active={location.pathname.includes('/assets')}
              >
                <SubItem to="/assets?mode=list" icon={List} label="资产清单" />
                <SubItem to="/assets?mode=create" icon={ImagePlus} label="资产创作" />
              </SidebarGroup>

              <SidebarItem to="/storyboard" icon={Workflow} label="内容创作" collapsed={collapsed} />
            </div>
            
            <div className="pb-2 mt-2">
               {!collapsed && <p className="px-4 text-[10px] font-bold text-textMuted/50 uppercase tracking-wider mb-2 animate-fade-in">System</p>}
               <SidebarItem to="/projects" icon={Clapperboard} label="项目归档" collapsed={collapsed} />
               
               <SidebarGroup 
                icon={Settings} 
                label="系统设置" 
                collapsed={collapsed}
                active={location.pathname.includes('/settings')}
               >
                <SubItem to="/settings?tab=models" icon={Cpu} label="模型引擎" />
                <SubItem to="/settings?tab=users" icon={Users} label="用户管理" />
                <SubItem to="/settings?tab=roles" icon={Shield} label="角色管理" />
                <SubItem to="/settings?tab=permissions" icon={Lock} label="权限管理" />
                <SubItem to="/settings?tab=audit" icon={FileClock} label="系统审计" />
               </SidebarGroup>
            </div>
          </nav>
        </div>

        <div className={`p-4 m-2 bg-surfaceHighlight/50 rounded-xl border border-border/50 ${collapsed ? 'flex flex-col items-center gap-2 p-2' : ''}`}>
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : ''}`}>
            <img src={MOCK_USER.avatar} alt="User" className="w-8 h-8 rounded-full border border-border" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{MOCK_USER.name}</p>
                <p className="text-[10px] text-textMuted truncate">{MOCK_USER.role}</p>
              </div>
            )}
          </div>
          
          <div className={`flex items-center ${collapsed ? 'flex-col gap-2 mt-2' : 'justify-between mt-3 pt-3 border-t border-border/50'}`}>
             <button
                onClick={toggleTheme}
                className="p-1.5 hover:bg-surface rounded-lg transition-colors text-textMuted hover:text-primary"
                title={isDark ? "切换亮色模式" : "切换深色模式"}
             >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
             </button>
             <button 
                onClick={handleLogout}
                className="p-1.5 hover:bg-surface rounded-lg transition-colors text-textMuted hover:text-red-400"
                title="退出登录"
             >
                <LogOut size={14} />
             </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background/50 h-screen transition-colors duration-300">
        {/* Topbar */}
        <header className="h-16 px-6 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between z-10 sticky top-0 flex-shrink-0">
          <div className="flex items-center gap-2 text-textMuted">
            <span className="text-sm uppercase tracking-wider font-semibold opacity-60 hidden md:inline">Workspace</span>
            <ChevronRight size={14} className="hidden md:block"/>
            <span className="text-textMain font-medium">{getPageTitle()}</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative group hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted group-focus-within:text-primary transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="搜索项目、资产..." 
                className="bg-surfaceHighlight border-none rounded-full py-1.5 pl-9 pr-4 text-sm w-48 focus:w-64 focus:ring-1 focus:ring-primary focus:bg-surface transition-all placeholder-textMuted/50 text-textMain outline-none"
              />
            </div>
            <button className="relative text-textMuted hover:text-textMain transition-colors">
              <Bell size={18} />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className={`flex-1 relative ${isFullWidthPage ? 'overflow-hidden p-0' : 'overflow-auto p-8'}`}>
          {children}
        </div>
      </main>
    </div>
  );
};
