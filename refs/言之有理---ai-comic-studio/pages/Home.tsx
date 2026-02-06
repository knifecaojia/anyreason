import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Layers, Users, Zap, ChevronRight, Sparkles, Paintbrush, Film, Palette, Loader2, PlayCircle, ArrowRight } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Scroll Animation Component ---
const ScrollReveal: React.FC<{ children: React.ReactNode, delay?: number, className?: string }> = ({ children, delay = 0, className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (ref.current) observer.unobserve(ref.current);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );

    if (ref.current) observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-1000 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] transform ${
        isVisible
          ? "opacity-100 translate-y-0 filter-none"
          : "opacity-0 translate-y-12 blur-sm"
      } ${className}`}
    >
      {children}
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
  <div className="p-8 rounded-3xl bg-surface/40 backdrop-blur-xl border border-white/5 hover:border-primary/30 transition-all hover:bg-surface/60 group relative overflow-hidden h-full">
    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <div className="relative z-10 flex flex-col h-full">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-black/20">
        <Icon className="text-primary/90" size={26} />
      </div>
      <h3 className="text-xl font-bold text-gray-100 mb-3">{title}</h3>
      <p className="text-gray-400 leading-relaxed text-sm font-light flex-1">
        {description}
      </p>
    </div>
  </div>
);

const CaseCard = ({ image, title, category, description }: { image: string, title: string, category: string, description: string }) => (
  <div className="group relative h-[520px] w-full rounded-[32px] overflow-hidden cursor-pointer shadow-2xl shadow-black/50 border border-white/5">
    {/* Image Layer */}
    <img 
      src={image} 
      alt={title} 
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-110"
    />
    
    {/* Gradient Overlay */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
    
    {/* Glassmorphism Content Area */}
    <div className="absolute inset-x-0 bottom-0 p-8 flex flex-col justify-end">
       {/* Floating Background Blur for Text */}
       <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 backdrop-blur-sm mask-image-gradient" />

       <div className="relative z-10 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 ease-out">
         <div className="flex items-center gap-3 mb-3">
           <span className="px-3 py-1 text-[10px] font-bold tracking-widest uppercase bg-white/10 backdrop-blur-md rounded-full text-white/90 border border-white/10 shadow-sm">
             {category}
           </span>
         </div>
         
         <h3 className="text-3xl font-bold text-white mb-3 leading-tight tracking-tight">{title}</h3>
         
         <div className="overflow-hidden max-h-0 group-hover:max-h-24 transition-all duration-500 ease-in-out">
           <p className="text-gray-300 text-sm font-light leading-relaxed mb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
             {description}
           </p>
           <div className="flex items-center gap-2 text-white/90 font-medium hover:text-primary transition-colors cursor-pointer group/btn">
              <PlayCircle size={20} className="group-hover/btn:scale-110 transition-transform" />
              <span>观看样片</span>
           </div>
         </div>
       </div>
    </div>
  </div>
);

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [bgImage, setBgImage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateArtisticBackground = async () => {
    // API Key Selection for Pro Models
    const win = window as any;
    if (win.aistudio) {
      const hasKey = await win.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await win.aistudio.openSelectKey();
      }
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ 
            text: "A wide cinematic masterpiece background art for a high-end comic drama platform. Abstract artistic interpretation of 'creativity flow'. Ethereal smoke, flowing ink, golden dust particles, deep void background, elegant curves. Minimalist, high contrast, 8k resolution, mysterious and inspiring." 
          }],
        },
        config: { imageConfig: { imageSize: "2K", aspectRatio: "16:9" } },
      });

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            setBgImage(`data:image/png;base64,${part.inlineData.data}`);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Failed to generate background:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    // Fixed: Added h-screen and overflow-y-auto to fix scrolling on body:hidden layout
    <div className="h-screen w-full bg-[#000] text-textMain font-sans selection:bg-primary/30 overflow-y-auto overflow-x-hidden scroll-smooth">
      
      {/* --- Dynamic Background System --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {bgImage ? (
          <div 
            className="absolute inset-0 animate-fade-in transition-all duration-[2s]"
            style={{
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.3
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[#020617]">
             {/* Main Artistic Blurred Background */}
             <div 
               className="absolute inset-0 z-0 opacity-40 animate-fade-in"
               style={{
                 backgroundImage: 'url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop")',
                 backgroundSize: 'cover',
                 backgroundPosition: 'center',
                 filter: 'blur(100px) saturate(150%)',
                 transform: 'scale(1.2)'
               }}
             />
             
             {/* Secondary ambient lights to add depth */}
             <div className="absolute top-[-10%] left-[10%] w-[800px] h-[800px] bg-blue-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{animationDuration: '10s'}} />
             <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen" />
          </div>
        )}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay pointer-events-none"></div>
      </div>

      <div className="relative z-10">
        {/* --- Navigation --- */}
        <nav className="fixed top-0 w-full z-50 transition-all duration-300 bg-black/5 border-b border-white/5 backdrop-blur-sm supports-[backdrop-filter]:bg-black/20">
          <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/30 group-hover:scale-105 transition-transform">
                <Wand2 className="text-white" size={18} />
              </div>
              <span className="text-xl font-bold tracking-tight text-white font-sans">言之有理</span>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={generateArtisticBackground}
                disabled={isGenerating}
                className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />}
                <span>{isGenerating ? 'AI 渲染中...' : '灵感重绘'}</span>
              </button>
              <div className="h-4 w-px bg-white/10"></div>
              
              <button 
                onClick={() => navigate('/login')}
                className="px-6 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-gray-100 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] active:scale-95 text-sm flex items-center gap-2"
              >
                <span>开始创作</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </nav>

        {/* --- Hero Section --- */}
        <section className="relative pt-48 pb-32 px-6 overflow-hidden min-h-[90vh] flex flex-col justify-center">
          <ScrollReveal>
            <div className="max-w-5xl mx-auto text-center relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-10 backdrop-blur-md">
                <Sparkles size={14} className="text-blue-400" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">AI Comic Studio Pro</span>
              </div>
              
              <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-10 leading-[1.1] text-white drop-shadow-2xl">
                让故事 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">言之有理</span><br />
                让灵感 <span className="font-serif italic text-white/80">触手可及</span>
              </h1>
              
              <p className="text-xl md:text-2xl text-gray-400 mb-14 max-w-3xl mx-auto leading-relaxed font-light">
                专为漫剧创作者打造的智能生产管线。<br className="hidden md:block"/>
                从剧本构思到成片渲染，以艺术之名，重塑创作流。
              </p>
              
              <div className="flex items-center justify-center gap-6">
                <button 
                  onClick={() => navigate('/login')}
                  className="group px-10 py-5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg shadow-2xl shadow-blue-900/40 transition-all hover:-translate-y-1 flex items-center gap-3"
                >
                  <span>免费试用</span>
                  <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
                <button className="px-10 py-5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 text-white font-medium text-lg transition-all hover:-translate-y-1">
                  观看演示
                </button>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* --- Case Showcase Section --- */}
        <section className="py-32 relative">
           {/* Section Background Decor */}
           <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
              <div className="absolute top-[20%] right-[-5%] w-[600px] h-[600px] bg-blue-600/10 blur-[120px] rounded-full" />
              <div className="absolute bottom-[10%] left-[-10%] w-[800px] h-[800px] bg-indigo-600/10 blur-[120px] rounded-full" />
           </div>

           <div className="max-w-[1400px] mx-auto px-6 relative z-10">
              <ScrollReveal>
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
                  <div>
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">精选案例</h2>
                    <p className="text-gray-400 text-lg font-light max-w-lg">
                      探索由言之有理平台生成的优质漫剧作品，感受 AI 赋能下的视觉盛宴。
                    </p>
                  </div>
                  <button className="text-white/80 hover:text-white flex items-center gap-2 group transition-colors">
                    查看更多作品 <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>
                  </button>
                </div>
              </ScrollReveal>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <ScrollReveal delay={100}>
                  <CaseCard 
                    title="星渊传说"
                    category="Sci-Fi / 玄幻"
                    description="利用 Gemini 3.0 生成的宏大世界观，结合 SDXL 渲染的细腻星空场景，展现人类在深空中的孤独与探索。"
                    image="https://picsum.photos/id/1033/800/1000"
                  />
                </ScrollReveal>
                <ScrollReveal delay={200}>
                  <CaseCard 
                    title="霓虹侦探"
                    category="Cyberpunk"
                    description="全流程 AI 制作的赛博朋克悬疑剧，极致的光影控制能力，每一帧都是壁纸级的视觉享受。"
                    image="https://picsum.photos/id/1041/800/1000"
                  />
                </ScrollReveal>
                <ScrollReveal delay={300}>
                  <CaseCard 
                    title="浮生绘卷"
                    category="Ancient Style"
                    description="水墨风格的动态漫剧，通过 TTS 情感语音赋予角色灵魂，重现千年前的爱恨情仇。"
                    image="https://picsum.photos/id/1029/800/1000"
                  />
                </ScrollReveal>
              </div>
           </div>
        </section>

        {/* --- Features Grid --- */}
        <section className="py-32 border-t border-white/5 bg-black/40 backdrop-blur-sm">
          <div className="max-w-[1400px] mx-auto px-6">
            <ScrollReveal>
              <div className="text-center mb-20">
                <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white tracking-tight">全链路 AI 赋能</h2>
                <p className="text-gray-400 max-w-2xl mx-auto font-light text-lg">
                  不仅仅是工具，更是你创意的延伸。重塑漫剧生产力，让想象力自由生长。
                </p>
              </div>
            </ScrollReveal>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Layers, title: "无限画布工作流", desc: "借鉴 Dify 的节点式编排，支持拖拽式创作。自由组合 LLM 剧本、SD 绘图、TTS 配音与视频生成模块。" },
                { icon: Users, title: "企业级团队协作", desc: "基于 RBAC 的权限管理，支持策划、美术、导演多角色实时协同，项目生命周期全掌控。" },
                { icon: Paintbrush, title: "智能资产管理", desc: "集中管理角色 LoRA、场景库与道具素材。保持画风统一，提升 IP 资产复用率。" },
                { icon: Zap, title: "极速渲染引擎", desc: "深度优化的生成管线，支持实时预览与批量导出。将制作周期从周缩短至小时级。" },
                { icon: Film, title: "所见即所得", desc: "可视化分镜编辑器，一键生成动态样片。精准控制镜头语言与画面氛围。" },
                { icon: Wand2, title: "多模态融合", desc: "不仅是图文，更融合音频与视频生成。打造沉浸式视听体验，激发无限灵感。" }
              ].map((feature, index) => (
                <ScrollReveal key={index} delay={index * 100}>
                  <FeatureCard 
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.desc}
                  />
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* --- Footer --- */}
        <footer className="py-16 border-t border-white/10 bg-[#050505]">
          <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Wand2 className="text-white" size={16} />
              </div>
              <span className="font-bold text-gray-200 text-lg tracking-tight">言之有理</span>
            </div>
            <div className="flex gap-8 text-sm text-gray-500 font-medium">
              <a href="#" className="hover:text-white transition-colors">关于我们</a>
              <a href="#" className="hover:text-white transition-colors">服务条款</a>
              <a href="#" className="hover:text-white transition-colors">隐私政策</a>
              <a href="#" className="hover:text-white transition-colors">联系合作</a>
            </div>
            <div className="text-sm text-gray-600 font-light">
              © 2024 AI Comic Studio. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};