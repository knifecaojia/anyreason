"use client";

import { useState, useEffect } from "react";
import { 
  Key, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  Copy, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { apiKeyService, type APIKeyRead } from "@/app/apiKeyService";
import { toast } from "sonner";
import { X } from "lucide-react";

export function ApiKeysSection() {
  const [keys, setKeys] = useState<APIKeyRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeyId, setShowKeyId] = useState<string | null>(null);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiKeyService.listApiKeys();
      if (res.code === 200) {
        setKeys(res.data);
      } else {
        setError(res.msg);
      }
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleOpenModal = () => {
    setNewKeyName("");
    setIsModalOpen(true);
  };

  const handleGenerate = async () => {
    if (!newKeyName.trim()) {
      toast.error("请输入密钥名称");
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await apiKeyService.createApiKey({ name: newKeyName.trim() });
      if (res.code === 200) {
        toast.success("API 密钥已生成");
        setIsModalOpen(false);
        fetchKeys();
      } else {
        toast.error(res.msg);
      }
    } catch (err: any) {
      toast.error(err.message || "生成失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除此密钥吗？删除后，使用此密钥的外部应用将无法访问 API。")) return;
    
    try {
      const res = await apiKeyService.deleteApiKey(id);
      if (res.code === 200) {
        toast.success("密钥已删除");
        fetchKeys();
      } else {
        toast.error(res.msg);
      }
    } catch (err: any) {
      toast.error(err.message || "删除失败");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("密钥已复制到剪贴板");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 pb-10">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-textMain mb-2">API 密钥管理</h2>
          <p className="text-textMuted text-sm">
            使用 API 密钥，外部应用程序可以安全地访问您的剧本、剧集与资源。
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-surfaceHighlight hover:bg-surface border border-border text-textMain px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          >
            <ExternalLink size={16} /> Swagger 文档
          </a>
          <button
            onClick={handleOpenModal}
            className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          >
            <Plus size={16} /> 生成新密钥
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-surfaceHighlight/50 border-b border-border text-textMuted font-medium">
            <tr>
              <th className="px-6 py-4">名称</th>
              <th className="px-6 py-4">密钥内容</th>
              <th className="px-6 py-4">创建时间</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-textMuted">
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="animate-spin" size={20} />
                    <span>加载中...</span>
                  </div>
                </td>
              </tr>
            )}
            {!loading && keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-textMuted text-base">
                  暂无 API 密钥
                </td>
              </tr>
            )}
            {keys.map((key) => {
              const isVisible = showKeyId === key.id;
              return (
                <tr key={key.id} className="hover:bg-surfaceHighlight/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-textMain">
                    {key.name || "未命名密钥"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <div className="bg-surfaceHighlight px-2 py-1 rounded border border-border flex items-center gap-2 overflow-hidden max-w-[12rem]">
                        <span className="truncate">
                          {isVisible ? key.key : "••••••••••••••••••••••••••••••••"}
                        </span>
                        <button
                          onClick={() => setShowKeyId(isVisible ? null : key.id)}
                          className="text-textMuted hover:text-textMain transition-colors flex-shrink-0"
                        >
                          {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={() => copyToClipboard(key.key)}
                        className="text-textMuted hover:text-textMain p-1 rounded hover:bg-surface transition-colors"
                        title="复制密钥"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-textMuted">
                    {new Date(key.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                        key.is_active 
                          ? "bg-green-500/10 text-green-400 border-green-500/20" 
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${key.is_active ? "bg-green-400" : "bg-red-400"}`} />
                      {key.is_active ? "激活" : "停用"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="p-2 text-textMuted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
        <div className="text-blue-400 flex-shrink-0">
          <AlertCircle size={20} />
        </div>
        <div className="text-sm">
          <h4 className="font-bold text-textMain mb-1">安全建议</h4>
          <p className="text-textMuted leading-relaxed">
            API 密钥拥有与您相同的账户访问权限，请务必妥善保管。切勿在客户端浏览器代码、移动端代码或公开的代码仓库（如 GitHub）中硬编码您的密钥。
          </p>
        </div>
      </div>

      {/* Generation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-textMain">生成新 API 密钥</h3>
                <p className="text-xs text-textMuted mt-1">为您的密钥设置一个易于识别的名称。</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-textMuted hover:text-textMain transition-colors"
                disabled={isGenerating}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-textMain">密钥名称</label>
                <input
                  type="text"
                  autoFocus
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="例如：External-Worker-01"
                  className="w-full bg-surfaceHighlight border border-border rounded-lg py-2.5 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-textMain"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGenerate();
                  }}
                  disabled={isGenerating}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain"
                  disabled={isGenerating}
                >
                  取消
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !newKeyName.trim()}
                  className="px-6 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      生成中...
                    </>
                  ) : (
                    "确认生成"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

