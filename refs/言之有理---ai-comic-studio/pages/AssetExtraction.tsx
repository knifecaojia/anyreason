
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { SplitSquareHorizontal, Play, Check, AlertCircle, Loader2, ArrowRightLeft, Database, Box, User, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface ExtractionResult {
  model: string;
  assets: any[]; // JSON array of assets
  time: number;
  error?: string;
}

const DEFAULT_PROMPT = `Analyze the script provided and extract a list of assets required for production.
Return strictly a JSON array with objects containing:
- name: string
- type: 'CHARACTER' | 'SCENE' | 'PROP' | 'EFFECT'
- description: string (visual details)
- tags: string[]
Do not include markdown formatting.`;

export const AssetExtraction: React.FC = () => {
  const location = useLocation();
  const [scriptContent, setScriptContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Initialize with passed state
  useEffect(() => {
    if (location.state && location.state.scriptContent) {
      setScriptContent(location.state.scriptContent);
    }
  }, [location.state]);
  
  // Configuration State for A/B Testing
  const [configA, setConfigA] = useState({ model: 'gemini-3-flash-preview', prompt: DEFAULT_PROMPT });
  const [configB, setConfigB] = useState({ model: 'gemini-2.5-flash-latest', prompt: DEFAULT_PROMPT });

  // Results State
  const [resultA, setResultA] = useState<ExtractionResult | null>(null);
  const [resultB, setResultB] = useState<ExtractionResult | null>(null);

  const runExtraction = async () => {
    if (!scriptContent.trim()) return;
    setIsProcessing(true);
    setResultA(null);
    setResultB(null);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Helper to run single extraction
    const processConfig = async (config: typeof configA): Promise<ExtractionResult> => {
      const startTime = performance.now();
      try {
        const response = await ai.models.generateContent({
          model: config.model,
          contents: `SCRIPT:\n${scriptContent}\n\nINSTRUCTION:\n${config.prompt}`,
          config: { responseMimeType: 'application/json' } // Request JSON mode if supported or prompt driven
        });
        
        const endTime = performance.now();
        const text = response.text || "[]";
        // Attempt to parse JSON
        const cleanJson = text.replace(/```json|```/g, '').trim();
        const assets = JSON.parse(cleanJson);

        return { model: config.model, assets, time: Math.round(endTime - startTime) };
      } catch (e: any) {
        return { model: config.model, assets: [], time: 0, error: e.message };
      }
    };

    try {
      // Run in parallel
      const [resA, resB] = await Promise.all([processConfig(configA), processConfig(configB)]);
      setResultA(resA);
      setResultB(resB);
    } catch (e) {
      console.error("Extraction error", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const AssetCard: React.FC<{ asset: any }> = ({ asset }) => {
    const getIcon = () => {
      switch (asset.type?.toUpperCase()) {
        case 'CHARACTER': return <User size={14} className="text-blue-400" />;
        case 'SCENE': return <ImageIcon size={14} className="text-purple-400" />;
        case 'PROP': return <Box size={14} className="text-orange-400" />;
        case 'EFFECT': return <Sparkles size={14} className="text-cyan-400" />;
        default: return <Database size={14} className="text-gray-400" />;
      }
    };

    return (
      <div className="bg-surface border border-border/50 rounded-lg p-3 hover:border-primary/30 transition-colors">
        <div className="flex items-center gap-2 mb-2">
          {getIcon()}
          <span className="font-semibold text-sm text-textMain">{asset.name}</span>
          <span className="ml-auto text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-textMuted uppercase">{asset.type}</span>
        </div>
        <p className="text-xs text-textMuted line-clamp-2 leading-relaxed">{asset.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
           {asset.tags?.map((t: string, i: number) => (
             <span key={i} className="text-[10px] text-accent/80 bg-accent/10 px-1 rounded">{t}</span>
           ))}
        </div>
      </div>
    );
  };

  const ResultColumn = ({ result, label }: { result: ExtractionResult | null, label: string }) => {
    if (!result && isProcessing) {
      return (
        <div className="h-full flex items-center justify-center flex-col gap-3 text-textMuted animate-pulse">
          <Loader2 size={32} className="animate-spin text-primary" />
          <span className="text-sm">AI 正在分析剧本...</span>
        </div>
      );
    }

    if (!result) return <div className="h-full flex items-center justify-center text-textMuted/30 text-sm">等待运行...</div>;

    if (result.error) {
       return (
         <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-3">
           <AlertCircle size={20} />
           <span>Error: {result.error}</span>
         </div>
       );
    }

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between px-2">
           <div className="flex items-center gap-2">
             <span className="text-sm font-bold text-textMain">{label}</span>
             <span className="text-xs text-textMuted bg-surface px-2 py-0.5 rounded border border-border">{result.model}</span>
           </div>
           <span className="text-xs text-green-400">{result.time}ms</span>
        </div>
        
        <div className="bg-surfaceHighlight/30 rounded-xl p-4 h-[500px] overflow-y-auto border border-border/50 scrollbar-thin space-y-3">
          {Array.isArray(result.assets) && result.assets.length > 0 ? (
             result.assets.map((asset, idx) => <AssetCard key={idx} asset={asset} />)
          ) : (
             <div className="text-center text-textMuted text-sm py-10">未提取到有效资产</div>
          )}
        </div>
        
        <div className="flex justify-between items-center px-2">
           <span className="text-xs text-textMuted">共 {Array.isArray(result.assets) ? result.assets.length : 0} 个资产</span>
           <button className="text-xs text-primary hover:text-blue-400 font-medium">存入资产库</button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
            <SplitSquareHorizontal size={24} className="text-primary"/>
            资产提取实验室
          </h2>
          <p className="text-sm text-textMuted mt-1">对比不同模型或提示词的提取效果，精准拆解剧本资产。</p>
        </div>
        <button 
          onClick={runExtraction}
          disabled={isProcessing || !scriptContent}
          className="bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
          开始提取对比
        </button>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
         {/* Left: Input & Config */}
         <div className="col-span-4 flex flex-col gap-4 overflow-y-auto pr-2">
            
            {/* Script Input */}
            <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-2 flex-shrink-0">
               <label className="text-xs font-bold text-textMuted uppercase tracking-wider">原始剧本</label>
               <textarea 
                 value={scriptContent}
                 onChange={(e) => setScriptContent(e.target.value)}
                 className="w-full h-48 bg-surfaceHighlight/50 border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:ring-1 focus:ring-primary/50 resize-none placeholder-textMuted/50"
                 placeholder="粘贴剧本内容到此处..."
               />
            </div>

            {/* Config A */}
            <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">A</div>
                   <span className="font-medium text-sm text-textMain">实验组 A</span>
                 </div>
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] text-textMuted">模型</label>
                 <select 
                   value={configA.model}
                   onChange={(e) => setConfigA({...configA, model: e.target.value})}
                   className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-xs text-textMain outline-none"
                 >
                   <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                   <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                   <option value="gemini-2.5-flash-latest">Gemini 2.5 Flash</option>
                 </select>
                 <label className="text-[10px] text-textMuted">提示词 (System Prompt)</label>
                 <textarea 
                    value={configA.prompt}
                    onChange={(e) => setConfigA({...configA, prompt: e.target.value})}
                    className="w-full h-24 bg-surfaceHighlight/50 border border-border rounded-lg p-2 text-xs text-textMuted font-mono outline-none resize-none"
                 />
               </div>
            </div>

            {/* Config B */}
            <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">B</div>
                   <span className="font-medium text-sm text-textMain">实验组 B</span>
                 </div>
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] text-textMuted">模型</label>
                 <select 
                   value={configB.model}
                   onChange={(e) => setConfigB({...configB, model: e.target.value})}
                   className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-xs text-textMain outline-none"
                 >
                   <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                   <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                   <option value="gemini-2.5-flash-latest">Gemini 2.5 Flash</option>
                 </select>
                 <label className="text-[10px] text-textMuted">提示词 (System Prompt)</label>
                 <textarea 
                    value={configB.prompt}
                    onChange={(e) => setConfigB({...configB, prompt: e.target.value})}
                    className="w-full h-24 bg-surfaceHighlight/50 border border-border rounded-lg p-2 text-xs text-textMuted font-mono outline-none resize-none"
                 />
               </div>
            </div>

         </div>

         {/* Right: Results Comparison */}
         <div className="col-span-8 bg-background border border-border rounded-2xl p-6 relative overflow-hidden">
             <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
             <div className="relative z-10 grid grid-cols-2 gap-8 h-full">
                <ResultColumn result={resultA} label="结果 A" />
                <div className="absolute left-1/2 top-10 bottom-10 w-px bg-border/50 hidden md:block" />
                <ResultColumn result={resultB} label="结果 B" />
             </div>
         </div>
      </div>
    </div>
  );
};
