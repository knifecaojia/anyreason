
import { useState, useMemo } from "react";
import { X, Search, Check, Cpu, Image as ImageIcon, Video, Type } from "lucide-react";
import type { AIModelConfig, AICategory } from "@/components/actions/ai-model-actions";

interface ModelConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  configs: AIModelConfig[];
  selectedId: string;
  onSelect: (configId: string) => void;
  category?: AICategory; // Optional filter
}

export function ModelConfigDrawer({
  open,
  onClose,
  configs,
  selectedId,
  onSelect,
  category = "image"
}: ModelConfigDrawerProps) {
  const [search, setSearch] = useState("");

  // Filter models based on category and search term
  const filteredConfigs = useMemo(() => {
    return configs.filter(c => {
      // 1. Filter by category (if provided)
      if (category && c.category !== category) return false;
      
      // 2. Filter by enabled status
      if (!c.enabled) return false;

      // 3. Filter by search term
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.manufacturer.toLowerCase().includes(q) || 
        c.model.toLowerCase().includes(q)
      );
    });
  }, [configs, category, search]);

  // Group by Manufacturer for better organization
  const groupedConfigs = useMemo(() => {
    const groups: Record<string, AIModelConfig[]> = {};
    filteredConfigs.forEach(c => {
      if (!groups[c.manufacturer]) groups[c.manufacturer] = [];
      groups[c.manufacturer].push(c);
    });
    return groups;
  }, [filteredConfigs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer Content */}
      <div className="relative w-full max-w-md bg-surface border-l border-border shadow-2xl h-full flex flex-col animate-slide-in-right">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-border flex items-center justify-between bg-surface/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-textMain">选择模型</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-surfaceHighlight rounded-lg text-textMuted hover:text-textMain transition-colors"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-border bg-surfaceHighlight/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input 
              type="text" 
              placeholder="搜索模型名称或厂商..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surfaceHighlight border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-textMain placeholder:text-textMuted"
              autoFocus
            />
          </div>
        </div>

        {/* Model List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.entries(groupedConfigs).map(([manufacturer, items]) => (
            <div key={manufacturer} className="space-y-3">
              <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider px-2">
                {manufacturer}
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {items.map(config => {
                  const isSelected = selectedId === config.id;
                  return (
                    <button
                      key={config.id}
                      onClick={() => {
                        onSelect(config.id);
                        onClose();
                      }}
                      className={`relative group flex items-center p-3 rounded-xl border text-left transition-all duration-200 ${
                        isSelected 
                          ? "bg-primary/10 border-primary shadow-sm" 
                          : "bg-surfaceHighlight/30 border-transparent hover:bg-surfaceHighlight hover:border-border"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-4 ${
                         isSelected ? "bg-primary text-white" : "bg-surface border border-border text-textMuted"
                      }`}>
                        {config.category === 'image' ? <ImageIcon size={20}/> : 
                         config.category === 'video' ? <Video size={20}/> : <Type size={20}/>}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm truncate ${isSelected ? "text-primary" : "text-textMain"}`}>
                          {config.model}
                        </div>
                        <div className="text-xs text-textMuted truncate mt-0.5">
                          {config.base_url ? 'Custom Endpoint' : 'Default Endpoint'}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-primary">
                          <Check size={18} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredConfigs.length === 0 && (
            <div className="text-center py-10 text-textMuted">
              <p>未找到匹配的模型配置</p>
              <p className="text-xs mt-2 opacity-60">请尝试更换关键词或前往设置页添加模型</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
