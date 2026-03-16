/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { 
  Upload, 
  Scissors, 
  Play, 
  CheckCircle2, 
  Settings2, 
  Trash2, 
  Grid3X3, 
  LayoutGrid,
  ChevronRight,
  Loader2,
  Plus,
  Image as ImageIcon,
  Key,
  X,
  Maximize2,
  GripVertical,
  Wand2,
  RefreshCw,
  ArrowRight,
  FolderOpen,
  Save,
  LayoutDashboard,
  Paintbrush,
  Square,
  Crop,
  Layers,
  History,
  Clock,
  Sparkles,
  Type,
  Zap,
  PlusCircle,
  Download,
  FileSpreadsheet,
  Database
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import { GridMode, SplitImage, UploadedFile, MODELS, AppSettings, CustomPrefix, VideoHistory, StoryboardItem } from './types';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface RefImage {
  id: string;
  dataUrl: string;
  originalUrl: string;
}

interface PolishingHistory {
  timestamp: string;
  prompt: string;
}

interface PolishingMode {
  id: string;
  name: string;
  systemPrompt: string;
  history: PolishingHistory[];
}

const PrefixDropdown = ({ 
  prefixes, 
  selectedId, 
  onSelect 
}: { 
  prefixes: CustomPrefix[], 
  selectedId: string, 
  onSelect: (id: string) => void 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const grouped = prefixes.reduce((acc, prefix) => {
    if (!acc[prefix.category]) acc[prefix.category] = {};
    if (!acc[prefix.category][prefix.subcategory]) acc[prefix.category][prefix.subcategory] = [];
    acc[prefix.category][prefix.subcategory].push(prefix);
    return acc;
  }, {} as Record<string, Record<string, CustomPrefix[]>>);

  const selectedPrefix = prefixes.find(p => p.id === selectedId);

  return (
    <div className="relative flex-1" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-1 ring-[#141414]/20 text-left flex justify-between items-center"
      >
        <span className="truncate">{selectedPrefix ? `${selectedPrefix.category} > ${selectedPrefix.subcategory} > ${selectedPrefix.name}` : '选择预设前缀...'}</span>
        <ChevronRight size={14} className={`transform transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 w-full mt-3 bg-white rounded-2xl shadow-2xl z-[100] overflow-visible"
            onMouseLeave={() => {
              setActiveCategory(null);
              setActiveSubcategory(null);
            }}
          >
            {/* Bubble Arrow */}
            <div className="absolute -top-2 left-6 w-4 h-4 bg-white transform rotate-45 z-[-1] shadow-[-2px_-2px_5px_rgba(0,0,0,0.05)]" />
            
            <div className="p-2 overflow-visible">
              {Object.keys(grouped).length === 0 && (
                <div className="p-4 text-center text-[10px] opacity-40 italic">暂无预设</div>
              )}
              {Object.keys(grouped).map(category => (
                <div 
                  key={category}
                  className="relative"
                  onMouseEnter={() => setActiveCategory(category)}
                >
                  <div className={`flex items-center justify-between px-4 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-[#141414] hover:text-white transition-all ${activeCategory === category ? 'bg-[#141414] text-white' : ''}`}>
                    {category}
                    <ChevronRight size={12} />
                  </div>

                  {activeCategory === category && (
                    <motion.div 
                      initial={{ opacity: 0, x: 10, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      className="absolute top-0 left-full ml-3 w-48 bg-white rounded-2xl shadow-2xl z-[101] overflow-visible"
                      onMouseLeave={() => setActiveSubcategory(null)}
                    >
                      {/* Sub-menu Arrow */}
                      <div className="absolute top-3 -left-2 w-4 h-4 bg-white transform rotate-45 z-[-1] shadow-[-2px_2px_5px_rgba(0,0,0,0.05)]" />
                      
                      <div className="p-2 overflow-visible">
                        {Object.keys(grouped[category]).map(subcategory => (
                          <div 
                            key={subcategory}
                            className="relative"
                            onMouseEnter={() => setActiveSubcategory(subcategory)}
                          >
                            <div className={`flex items-center justify-between px-4 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-[#141414] hover:text-white transition-all ${activeSubcategory === subcategory ? 'bg-[#141414] text-white' : ''}`}>
                              {subcategory}
                              <ChevronRight size={12} />
                            </div>

                            {activeSubcategory === subcategory && (
                              <motion.div 
                                initial={{ opacity: 0, x: 10, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                className="absolute top-0 left-full ml-3 w-48 bg-white rounded-2xl shadow-2xl z-[102] overflow-visible"
                              >
                                {/* Sub-menu Arrow */}
                                <div className="absolute top-3 -left-2 w-4 h-4 bg-white transform rotate-45 z-[-1] shadow-[-2px_2px_5px_rgba(0,0,0,0.05)]" />
                                
                                <div className="p-2 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                  {grouped[category][subcategory].map(prefix => (
                                    <div 
                                      key={prefix.id}
                                      onClick={() => {
                                        onSelect(prefix.id);
                                        setIsOpen(false);
                                      }}
                                      className="px-4 py-2.5 text-xs font-medium rounded-xl cursor-pointer hover:bg-[#141414] hover:text-white transition-all"
                                    >
                                      {prefix.name}
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>({
    imageApiKeys: [''],
    videoApiKeys: [''],
    storagePath: '',
    paths: {
      main: '',
      storyboard: '',
      videoPreview: ''
    }
  });
  const [settingsSubTab, setSettingsSubTab] = useState<'image' | 'video' | 'storage' | 'data'>('image');
  const [activeTab, setActiveTab] = useState<'main' | 'storyboard' | 'storyboard-editor' | 'video-preview' | 'settings'>('main');
  const [videoHistory, setVideoHistory] = useState<VideoHistory[]>([]);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [selectedVariant, setSelectedVariant] = useState(MODELS[0].variants[0].id);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [library, setLibrary] = useState<SplitImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHDProcessing, setIsHDProcessing] = useState(false);
  const [enableHD, setEnableHD] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [viewingImage, setViewingImage] = useState<SplitImage | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [genDuration, setGenDuration] = useState(3);
  const [genResolution, setGenResolution] = useState('720p');
  const [offPeak, setOffPeak] = useState(false);
  const [isRec, setIsRec] = useState(false);
  const [bgm, setBgm] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [wmPosition, setWmPosition] = useState(3);
  const [audio, setAudio] = useState(true);

  // API Key Helpers
  const getImageKey = useCallback((index: number = 0) => {
    const keys = settings.imageApiKeys.filter(k => k.trim() !== '');
    if (keys.length === 0) return null;
    return keys[index % keys.length];
  }, [settings.imageApiKeys]);

  const getVideoKey = useCallback((index: number = 0) => {
    const keys = settings.videoApiKeys.filter(k => k.trim() !== '');
    if (keys.length === 0) return null;
    const keyIndex = Math.floor(index / 5) % keys.length;
    return keys[keyIndex];
  }, [settings.videoApiKeys]);
  
  // 编辑状态
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [croppingImage, setCroppingImage] = useState<RefImage | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const [selectionMode, setSelectionMode] = useState<'brush' | 'box' | 'none'>('none');
  const [isSelectionConfirmed, setIsSelectionConfirmed] = useState(false);
  const [maskData, setMaskData] = useState<string | null>(null);
  const [boxData, setBoxData] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const [markerPos, setMarkerPos] = useState<{ x: number, y: number } | null>(null);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 绘图状态
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number, y: number } | null>(null);
  const [boxStart, setBoxStart] = useState<{ x: number, y: number } | null>(null);

  // 高级润色状态
  const [polishingModes, setPolishingModes] = useState<PolishingMode[]>([
    {
      id: 'conflict',
      name: '冲突加强版',
      systemPrompt: '你是一个专业的剧本润色专家。请将以下视频描述进行润色，重点加强冲突感、戏剧性和视觉张力。输出润色后的提示词。',
      history: []
    },
    {
      id: 'fight',
      name: '打斗润色版',
      systemPrompt: '你是一个动作片导演。请将以下视频描述进行润色，重点加强动作的连贯性、打击感和镜头动感。输出润色后的提示词。',
      history: []
    },
    {
      id: 'dialogue',
      name: '对话镜头润色模式',
      systemPrompt: '你是一个专业的摄影指导。请将以下视频描述进行润色，重点加强对话时的特写镜头、光影氛围和情感表达。输出润色后的提示词。',
      history: []
    }
  ]);
  const [selectedPolishingModeId, setSelectedPolishingModeId] = useState(polishingModes[0].id);
  const [showPolishingConfigModal, setShowPolishingConfigModal] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [editingPolishingModeId, setEditingPolishingModeId] = useState<string | null>(polishingModes[0].id);

  // 故事板生成状态
  const [storyboardPrompt, setStoryboardPrompt] = useState('');
  const [storyboardCount, setStoryboardCount] = useState(1);
  const [storyboardRefImages, setStoryboardRefImages] = useState<RefImage[]>([]);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [storyboardResults, setStoryboardResults] = useState<{id: string, url: string, prompt: string}[]>([]);
  const [editRefImages, setEditRefImages] = useState<RefImage[]>([]);
  const editRefInputRef = useRef<HTMLInputElement>(null);
  const storyboardRefInputRef = useRef<HTMLInputElement>(null);

  // 自定义前缀状态
  const [customPrefixes, setCustomPrefixes] = useState<CustomPrefix[]>([
    // 运镜 - 推拉
    { id: 'zoom-in', name: '推镜头 (Zoom In)', content: 'Zoom in slowly, ', category: '运镜', subcategory: '推拉' },
    { id: 'zoom-out', name: '拉镜头 (Zoom Out)', content: 'Zoom out slowly, ', category: '运镜', subcategory: '推拉' },
    { id: 'push-in', name: '推进 (Push In)', content: 'Camera pushes forward towards the subject, ', category: '运镜', subcategory: '推拉' },
    { id: 'pull-out', name: '拉远 (Pull Out)', content: 'Camera pulls back away from the subject, ', category: '运镜', subcategory: '推拉' },
    
    // 运镜 - 摇移
    { id: 'pan-left', name: '左平移 (Pan Left)', content: 'Pan left slowly, ', category: '运镜', subcategory: '摇移' },
    { id: 'pan-right', name: '右平移 (Pan Right)', content: 'Pan right slowly, ', category: '运镜', subcategory: '摇移' },
    { id: 'tilt-up', name: '上仰 (Tilt Up)', content: 'Tilt up slowly, ', category: '运镜', subcategory: '摇移' },
    { id: 'tilt-down', name: '下俯 (Tilt Down)', content: 'Tilt down slowly, ', category: '运镜', subcategory: '摇移' },
    { id: 'tracking-shot', name: '跟随拍摄', content: 'Tracking shot following the subject, ', category: '运镜', subcategory: '摇移' },
    
    // 运镜 - 特殊
    { id: 'pov-shot', name: '第一人称 (POV)', content: 'First person point of view shot, POV, ', category: '运镜', subcategory: '特殊' },
    { id: 'drone-shot', name: '航拍 (Drone)', content: 'Cinematic drone shot, aerial view, ', category: '运镜', subcategory: '特殊' },
    { id: 'handheld', name: '手持感', content: 'Handheld camera shake, realistic movement, ', category: '运镜', subcategory: '特殊' },
    
    // 风格
    { id: 'cinematic', name: '电影感', content: 'Cinematic lighting, 8k resolution, highly detailed, ', category: '风格', subcategory: '画质' },
    { id: 'cyberpunk', name: '赛博朋克', content: 'Cyberpunk style, neon lights, futuristic, ', category: '风格', subcategory: '艺术' },
  ]);
  const [selectedPrefixId, setSelectedPrefixId] = useState<string>('');
  const [prefixMode, setPrefixMode] = useState<'direct' | 'polish'>('direct');
  const [newPrefixName, setNewPrefixName] = useState('');
  const [newPrefixContent, setNewPrefixContent] = useState('');
  const [newPrefixCategory, setNewPrefixCategory] = useState('运镜');
  const [newPrefixSubcategory, setNewPrefixSubcategory] = useState('基础运镜');
  const [isApplyingPrefix, setIsApplyingPrefix] = useState(false);
  const [prefixCombineSystemPrompt, setPrefixCombineSystemPrompt] = useState('你是一个视频提示词专家。请将以下运镜指令与原有的视频描述完美结合，生成一段流畅、具有电影感的视频提示词。\n\n请直接输出结合后的提示词，不要包含任何解释。');
  const [showPrefixPromptModal, setShowPrefixPromptModal] = useState(false);
  
  // 分镜脚本编辑器状态
  const [storyboardData, setStoryboardData] = useState<any[]>([]);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [promptColumn, setPromptColumn] = useState<string>('');
  const [indexColumn, setIndexColumn] = useState<string>('');
  const excelInputRef = useRef<HTMLInputElement>(null);

  // 初始化获取设置和历史
  React.useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(err => console.error("获取设置失败:", err));

    fetch('/api/video-history')
      .then(res => res.json())
      .then(data => setVideoHistory(data))
      .catch(err => console.error("获取视频历史失败:", err));
  }, []);

  // 当打开详情页时，默认当前图为参考图
  React.useEffect(() => {
    if (viewingImage) {
      setRefImages([{
        id: Math.random().toString(36).substr(2, 9),
        dataUrl: viewingImage.dataUrl,
        originalUrl: viewingImage.dataUrl
      }]);
      setMarkerPos(null);
      setMaskData(null);
      setBoxData(null);
      setSelectionMode('none');
      setIsSelectionConfirmed(false);
    }
  }, [viewingImage]);

  const handleMaskMouseDown = (e: React.MouseEvent) => {
    if (selectionMode === 'none') return;
    const rect = maskCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setIsSelectionConfirmed(false);
    if (selectionMode === 'brush') {
      setLastPos({ x, y });
    } else if (selectionMode === 'box') {
      setBoxStart({ x, y });
      setBoxData({ x, y, w: 0, h: 0 });
    }
  };

  const handleMaskMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !maskCanvasRef.current) return;
    const rect = maskCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    if (selectionMode === 'brush' && lastPos) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      setLastPos({ x, y });
    } else if (selectionMode === 'box' && boxStart) {
      setBoxData({
        x: Math.min(x, boxStart.x),
        y: Math.min(y, boxStart.y),
        w: Math.abs(x - boxStart.x),
        h: Math.abs(y - boxStart.y)
      });
    }
  };

  const handleMaskMouseUp = () => {
    setIsDrawing(false);
    if (maskCanvasRef.current) {
      setMaskData(maskCanvasRef.current.toDataURL());
    }
  };

  const clearMask = () => {
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx && maskCanvasRef.current) {
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setMaskData(null);
      setBoxData(null);
      setIsSelectionConfirmed(false);
    }
  };

  const confirmSelectionToReference = async () => {
    if (!viewingImage || !imageRef.current) return;
    
    let cropArea = { x: 0, y: 0, w: 0, h: 0 };
    
    if (selectionMode === 'box' && boxData) {
      cropArea = { 
        x: (boxData.x / maskCanvasRef.current!.width) * imageRef.current.naturalWidth,
        y: (boxData.y / maskCanvasRef.current!.height) * imageRef.current.naturalHeight,
        w: (boxData.w / maskCanvasRef.current!.width) * imageRef.current.naturalWidth,
        h: (boxData.h / maskCanvasRef.current!.height) * imageRef.current.naturalHeight
      };
    } else if (selectionMode === 'brush' && maskCanvasRef.current) {
      // Find bounding box of white pixels in mask
      const ctx = maskCanvasRef.current.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      const data = imageData.data;
      let minX = maskCanvasRef.current.width, minY = maskCanvasRef.current.height, maxX = 0, maxY = 0;
      let found = false;
      
      for (let y = 0; y < maskCanvasRef.current.height; y++) {
        for (let x = 0; x < maskCanvasRef.current.width; x++) {
          const alpha = data[(y * maskCanvasRef.current.width + x) * 4 + 3];
          if (alpha > 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            found = true;
          }
        }
      }
      
      if (!found) return;
      
      const w = maxX - minX;
      const h = maxY - minY;
      
      cropArea = {
        x: (minX / maskCanvasRef.current.width) * imageRef.current.naturalWidth,
        y: (minY / maskCanvasRef.current.height) * imageRef.current.naturalHeight,
        w: (w / maskCanvasRef.current.width) * imageRef.current.naturalWidth,
        h: (h / maskCanvasRef.current.height) * imageRef.current.naturalHeight
      };
    } else {
      return;
    }

    const croppedUrl = await getCroppedImg(viewingImage.dataUrl, {
      x: cropArea.x,
      y: cropArea.y,
      width: cropArea.w,
      height: cropArea.h
    });

    setRefImages(prev => [...prev, {
      id: `sel_${Math.random().toString(36).substr(2, 5)}`,
      dataUrl: croppedUrl,
      originalUrl: croppedUrl
    }]);
    
    clearMask();
    setSelectionMode('none');
  };

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        setRefImages(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          dataUrl: url,
          originalUrl: url
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise(r => image.onload = r);
    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );
    return canvas.toDataURL('image/jpeg');
  };

  const applyCrop = async () => {
    if (croppingImage && croppedAreaPixels) {
      let croppedUrl = await getCroppedImg(croppingImage.originalUrl, croppedAreaPixels);
      
      if (enableHD) {
        setIsHDProcessing(true);
        try {
          const hdUrl = await handleHDRedraw(croppedUrl);
          if (hdUrl) croppedUrl = hdUrl;
        } catch (err) {
          console.error("HD重绘失败:", err);
        }
        setIsHDProcessing(false);
      }

      setRefImages(prev => prev.map(img => 
        img.id === croppingImage.id ? { ...img, dataUrl: croppedUrl } : img
      ));
      setCroppingImage(null);
    }
  };

  const handleHDRedraw = async (dataUrl: string): Promise<string | null> => {
    try {
      const apiKey = getImageKey(0);
      if (!apiKey) throw new Error("未配置 Gemini API Key");
      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: dataUrl.split(',')[1],
                mimeType: 'image/jpeg'
              }
            },
            {
              text: "Please redraw this image in high definition 4K resolution. Maintain exact consistency with the original content, colors, and composition. Enhance details, sharpness, and clarity while keeping the original style perfectly intact."
            }
          ]
        },
        config: {
          imageConfig: {
            imageSize: "4K",
            aspectRatio: "1:1" // Will be overridden if needed, but 1:1 is safe for single assets
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (err) {
      console.error("HD Redraw Error:", err);
      throw err;
    }
  };

  const handleBatchPolish = async () => {
    const selectedItems = library.filter(i => i.selected);
    if (selectedItems.length === 0) return;

    setIsPolishing(true);
    const mode = polishingModes.find(m => m.id === selectedPolishingModeId);
    if (!mode) {
      setIsPolishing(false);
      return;
    }

    try {
      const apiKey = getImageKey(0);
      if (!apiKey) {
        alert("请先在设置中配置 Gemini API Key");
        setIsPolishing(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      
      for (const item of selectedItems) {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `系统指令: ${mode.systemPrompt}\n\n待润色提示词: ${item.prompt || '默认高清视频'}\n\n请直接输出润色后的提示词，不要包含任何解释。`,
        });
        
        const polishedText = response.text;
        if (polishedText) {
          setLibrary(prev => prev.map(i => i.id === item.id ? { ...i, prompt: polishedText.trim() } : i));
        }
      }
    } catch (error) {
      console.error('Polishing error:', error);
    } finally {
      setIsPolishing(false);
    }
  };

  const exportAppData = () => {
    const data = {
      settings,
      videoHistory,
      uploadedFiles: uploadedFiles.map(f => ({
        id: f.id,
        preview: f.preview,
        mode: f.mode
      })),
      library,
      polishingModes,
      customPrefixes,
      storyboardData,
      storyboardResults,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vidu-app-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearAllData = () => {
    if (window.confirm("确定要清空所有数据吗？此操作不可逆，建议先导出备份。")) {
      setUploadedFiles([]);
      setLibrary([]);
      setVideoHistory([]);
      setStoryboardData([]);
      setStoryboardResults([]);
      // Reset settings to default if needed, or keep them? 
      // Usually better to keep API keys but clear content.
      alert("所有内容数据已清空。");
    }
  };

  const importAppData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        
        if (data.settings) setSettings(data.settings);
        if (data.videoHistory) setVideoHistory(data.videoHistory);
        if (data.uploadedFiles) {
          setUploadedFiles(data.uploadedFiles.map((f: any) => ({
            ...f,
            file: new File([], "imported-file")
          })));
        }
        if (data.library) setLibrary(data.library);
        if (data.polishingModes) setPolishingModes(data.polishingModes);
        if (data.customPrefixes) setCustomPrefixes(data.customPrefixes);
        if (data.storyboardData) setStoryboardData(data.storyboardData);
        if (data.storyboardResults) setStoryboardResults(data.storyboardResults);
        
        alert("数据导入成功！");
      } catch (err) {
        console.error("导入数据失败:", err);
        alert("导入失败，请检查文件格式。");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 轮询视频状态
  React.useEffect(() => {
    const processingVideos = videoHistory.filter(v => v.status === 'processing');
    const viduToken = getVideoKey(0);
    if (processingVideos.length === 0 || !viduToken) return;

    const interval = setInterval(async () => {
      for (const video of processingVideos) {
        try {
          const response = await fetch(`https://api.vidu.cn/ent/v2/tasks/${video.id}`, {
            headers: {
              'Authorization': `Token ${viduToken}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'completed' || data.status === 'failed') {
              const updatedRecord: VideoHistory = {
                ...video,
                status: data.status,
                videoUrl: data.video_url || '',
                progress: data.status === 'completed' ? 100 : 0
              };
              
              await fetch('/api/video-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedRecord)
              });

              setVideoHistory(prev => prev.map(v => v.id === video.id ? updatedRecord : v));
            } else if (data.progress !== undefined) {
              setVideoHistory(prev => prev.map(v => v.id === video.id ? { ...v, progress: data.progress } : v));
            }
          }
        } catch (err) {
          console.error(`查询任务状态失败 (${video.id}):`, err);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [videoHistory, getVideoKey]);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      
      // Get raw rows to strictly follow "Row 1 = Title, Row 2+ = Data"
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      if (rawData.length < 2) {
        alert('Excel 文件格式不正确，请确保至少包含标题行和一行数据。');
        return;
      }

      // Treat first row as headers
      const headers = rawData[0].map((h, i) => String(h || `列 ${i + 1}`));
      
      // Process data rows starting from index 1 (second row)
      const rows = rawData.slice(1).map((row, rowIndex) => {
        const obj: any = { '系统序号': rowIndex + 1 };
        headers.forEach((h, i) => {
          obj[h] = row[i] !== undefined ? row[i] : '';
        });
        return obj;
      });

      setStoryboardData(rows);
      const allColumns = ['系统序号', ...headers];
      setExcelColumns(allColumns);
      
      // Default mapping
      setIndexColumn('系统序号');
      setPromptColumn(headers.find(h => h.includes('提示词') || h.includes('Prompt')) || headers[0]);
    };
    reader.readAsBinaryString(file);
  };

  const applyStoryboardData = () => {
    if (!promptColumn || !indexColumn || storyboardData.length === 0) return;

    setLibrary(prev => {
      return prev.map(item => {
        const row = storyboardData.find(r => {
          const idx = parseInt(String(r[indexColumn]));
          return idx === item.index + 1;
        });
        
        if (row) {
          return {
            ...item,
            prompt: String(row[promptColumn])
          };
        }
        return item;
      });
    });

    setActiveTab('main');
    alert('分镜脚本已成功同步到图库提示词！');
  };

  const StoryboardEditor = () => {
    return (
      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-serif italic">分镜脚本编辑器</h2>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">导入 Excel 脚本并关联图库</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => excelInputRef.current?.click()}
              className="px-6 py-3 bg-[#141414] text-[#E4E3E0] rounded-xl font-bold text-sm flex items-center gap-2 hover:scale-105 transition-transform"
            >
              <FileSpreadsheet size={18} />
              导入 Excel 脚本
            </button>
            <input 
              type="file" 
              ref={excelInputRef} 
              accept=".xlsx, .xls" 
              className="hidden" 
              onChange={handleExcelUpload} 
            />
          </div>
        </div>

        {storyboardData.length > 0 ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white border border-[#141414] p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider border-b border-[#141414]/10 pb-2">列映射设置</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">序号/索引列</label>
                    <select 
                      value={indexColumn}
                      onChange={(e) => setIndexColumn(e.target.value)}
                      className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-3 text-sm font-bold outline-none"
                    >
                      {excelColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">生图提示词列</label>
                    <select 
                      value={promptColumn}
                      onChange={(e) => setPromptColumn(e.target.value)}
                      className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-3 text-sm font-bold outline-none"
                    >
                      {excelColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] opacity-40 italic">提示：系统将根据“序号”列的值匹配图库中的图片位置（从1开始计算）。</p>
              </div>

              <div className="bg-white border border-[#141414] p-6 rounded-2xl flex flex-col justify-center items-center gap-4">
                <div className="text-center">
                  <p className="text-sm font-bold">已加载 {storyboardData.length} 条数据</p>
                  <p className="text-[10px] opacity-50">点击下方按钮将提示词同步至视频生成页面的图库</p>
                </div>
                <button 
                  onClick={applyStoryboardData}
                  className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle2 size={18} />
                  确认并同步至图库
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#141414] rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#141414] text-[#E4E3E0]">
                      {excelColumns.map(col => (
                        <th key={col} className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest border-r border-white/10 last:border-0">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {storyboardData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="border-b border-[#141414]/10 hover:bg-[#141414]/5 transition-colors">
                        {excelColumns.map(col => (
                          <td key={col} className="px-6 py-4 text-xs font-medium border-r border-[#141414]/10 last:border-0 max-w-xs truncate">
                            {String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {storyboardData.length > 50 && (
                <div className="p-4 text-center bg-[#141414]/5 text-[10px] font-mono opacity-40">
                  仅显示前 50 条数据...
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#141414] p-20 rounded-3xl text-center space-y-6">
            <div className="w-20 h-20 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto">
              <FileSpreadsheet size={40} className="opacity-20" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-lg font-bold">尚未导入脚本</h3>
              <p className="text-sm opacity-40">请上传包含分镜描述和序号的 Excel 文件，以便快速为图库中的图片分配提示词。</p>
            </div>
            <button 
              onClick={() => excelInputRef.current?.click()}
              className="px-10 py-4 bg-[#141414] text-[#E4E3E0] rounded-2xl font-bold text-sm hover:scale-105 transition-transform"
            >
              立即导入 Excel
            </button>
          </div>
        )}
      </main>
    );
  };

  const VideoPreview = () => {
    const groupedHistory = videoHistory.reduce<Record<string, VideoHistory[]>>((acc, video) => {
      if (!acc[video.assetId]) acc[video.assetId] = [];
      acc[video.assetId].push(video);
      return acc;
    }, {});

    return (
      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-serif italic">视频预览 & 历史</h2>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">查看生成进度与历史记录</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => {
                fetch('/api/video-history')
                  .then(res => res.json())
                  .then(data => setVideoHistory(data));
              }}
              className="p-3 bg-white border border-[#141414] rounded-xl hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {Object.keys(groupedHistory).length === 0 ? (
            <div className="bg-white border border-[#141414] p-20 rounded-3xl text-center space-y-4">
              <div className="w-16 h-16 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto">
                <Play size={32} className="opacity-20" />
              </div>
              <p className="text-sm opacity-40">暂无视频生成记录</p>
            </div>
          ) : (
            Object.entries(groupedHistory).map(([assetId, videos]) => {
              const vList = videos as VideoHistory[];
              const asset = library.find(l => l.id === assetId);
              return (
                <div key={assetId} className="bg-white border border-[#141414] rounded-3xl overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-[#141414]/10 flex items-center justify-between bg-[#141414]/5">
                    <div className="flex items-center gap-4">
                      {asset && (
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#141414]/10">
                          <img src={asset.dataUrl} className="w-full h-full object-cover" alt="" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-sm">资产 ID: {assetId}</h4>
                        <p className="text-[10px] font-mono opacity-50 uppercase">共有 {vList.length} 条生成记录</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {vList.map(video => (
                      <div key={video.id} className="space-y-3 p-4 bg-[#E4E3E0]/20 rounded-2xl border border-[#141414]/5">
                        <div className="aspect-video bg-black rounded-xl overflow-hidden relative group">
                          {video.status === 'completed' ? (
                            <video 
                              src={video.videoUrl} 
                              controls 
                              className="w-full h-full object-contain"
                            />
                          ) : video.status === 'processing' ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                              <Loader2 size={24} className="animate-spin opacity-50" />
                              <div className="w-32 h-1 bg-white/20 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${video.progress}%` }}
                                  className="h-full bg-white"
                                />
                              </div>
                              <span className="text-[10px] font-mono uppercase tracking-widest">{video.progress}%</span>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-500">
                              <X size={24} />
                              <span className="text-[10px] font-bold uppercase">生成失败</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono opacity-40">{video.timestamp}</span>
                            <div className="flex items-center gap-2">
                              {video.status === 'completed' && (
                                <button 
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(video.videoUrl);
                                      const blob = await response.blob();
                                      const url = window.URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = `video_${video.id}.mp4`;
                                      document.body.appendChild(a);
                                      a.click();
                                      window.URL.revokeObjectURL(url);
                                      document.body.removeChild(a);
                                    } catch (err) {
                                      console.error("下载失败:", err);
                                    }
                                  }}
                                  className="p-1 hover:bg-[#141414]/10 rounded-md text-[#141414]/60 transition-all"
                                  title="导出视频"
                                >
                                  <Download size={14} />
                                </button>
                              )}
                              <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                video.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                video.status === 'failed' ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {video.status}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] font-mono line-clamp-2 opacity-70" title={video.prompt}>
                            {video.prompt}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    );
  };

  const addCustomPolishingMode = () => {
    const newMode: PolishingMode = {
      id: `custom-${Date.now()}`,
      name: '自定义模式',
      systemPrompt: '请润色以下提示词。',
      history: []
    };
    setPolishingModes(prev => [...prev, newMode]);
    setEditingPolishingModeId(newMode.id);
  };

  const savePolishingMode = (id: string, newPrompt: string) => {
    setPolishingModes(prev => prev.map(m => {
      if (m.id === id) {
        const historyItem = {
          timestamp: new Date().toLocaleString(),
          prompt: m.systemPrompt
        };
        return {
          ...m,
          systemPrompt: newPrompt,
          history: [historyItem, ...m.history].slice(0, 10)
        };
      }
      return m;
    }));
  };

  const moveItem = (id: string, direction: 'up' | 'down' | 'left' | 'right') => {
    setLibrary(prev => {
      const idx = prev.findIndex(i => i.id === id);
      const cols = 3; // 假设大屏幕 3 列
      let targetIdx = -1;
      
      if (direction === 'left' && idx > 0) targetIdx = idx - 1;
      if (direction === 'right' && idx < prev.length - 1) targetIdx = idx + 1;
      if (direction === 'up' && idx >= cols) targetIdx = idx - cols;
      if (direction === 'down' && idx + cols < prev.length) targetIdx = idx + cols;
      
      if (targetIdx !== -1) {
        const next = [...prev];
        [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
        // 重新分配所有索引以保持连续性
        return next.map((item, i) => ({ ...item, index: i }));
      }
      return prev;
    });
  };

  const handleDragEnd = (id: string, info: any) => {
    const threshold = 50;
    if (Math.abs(info.offset.x) > threshold || Math.abs(info.offset.y) > threshold) {
      if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
        moveItem(id, info.offset.x > 0 ? 'right' : 'left');
      } else {
        moveItem(id, info.offset.y > 0 ? 'down' : 'up');
      }
    }
  };

  const handleImageEdit = async () => {
    if (!viewingImage || !editPrompt) return;
    
    setIsEditing(true);
    try {
      const apiKey = getImageKey(0);
      if (!apiKey) throw new Error("未配置 Gemini API Key");
      const genAI = new GoogleGenAI({ apiKey });

      const parts: any[] = [];
      
      // 基础图片
      const base64Data = viewingImage.dataUrl.split(',')[1];
      const mimeType = viewingImage.dataUrl.split(';')[0].split(':')[1];

      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });

      // 如果有蒙版
      if (maskData && selectionMode === 'brush') {
        parts.push({ text: "Selection mask for the area to modify:" });
        parts.push({
          inlineData: {
            data: maskData.split(',')[1],
            mimeType: 'image/png'
          }
        });
      }

      // 参考图
      if (refImages.length > 0) {
        parts.push({ text: "Reference images for style and content:" });
        refImages.forEach((ref, idx) => {
          parts.push({
            inlineData: {
              data: ref.dataUrl.split(',')[1],
              mimeType: 'image/jpeg'
            }
          });
        });
      }

      // 处理 @ 提到的参考图
      const mentions = editPrompt.match(/@([a-z0-9_]+)/g);
      if (mentions) {
        for (const m of mentions) {
          const id = m.slice(1);
          const mentionedRef = refImages.find(r => r.id === id);
          if (mentionedRef) {
            parts.push({
              text: `Focus specifically on this reference detail (${id}):`
            });
            parts.push({
              inlineData: {
                data: mentionedRef.dataUrl.split(',')[1],
                mimeType: 'image/jpeg'
              }
            });
          }
        }
      }

      let finalPrompt = editPrompt;
      if (markerPos) {
        finalPrompt += ` \nFocus on the area at coordinates (x: ${markerPos.x.toFixed(1)}%, y: ${markerPos.y.toFixed(1)}%).`;
      }
      if (boxData && selectionMode === 'box') {
        finalPrompt += ` \nModify the rectangular area defined by (x: ${boxData.x}, y: ${boxData.y}, width: ${boxData.w}, height: ${boxData.h}).`;
      }

      parts.push({ text: finalPrompt });

      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ parts }]
      });

      const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

      if (imagePart?.inlineData) {
        const newImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        
        // 更新图库
        setLibrary(prev => prev.map(item => 
          item.id === viewingImage.id ? { ...item, dataUrl: newImageUrl } : item
        ));
        
        // 更新当前查看
        setViewingImage(prev => prev ? { ...prev, dataUrl: newImageUrl } : null);
        setEditPrompt('');
        setMarkerPos(null);
        setMaskData(null);
        setBoxData(null);
      }
    } catch (error) {
      console.error("图片修改错误:", error);
      alert("修改失败，请检查 API Key 和网络。");
    } finally {
      setIsEditing(false);
    }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setSettings(newSettings);
        alert("设置已保存");
      }
    } catch (err) {
      alert("保存设置失败");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const newFiles = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      mode: '16:9' as GridMode
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeUploadedFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateFileMode = (id: string, mode: GridMode) => {
    setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, mode } : f));
  };

  const splitImage = async (uploadedFile: UploadedFile): Promise<SplitImage[]> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve([]);

        const cols = uploadedFile.mode === '16:9' ? 3 : 2;
        const rows = uploadedFile.mode === '16:9' ? 3 : 2;
        const cellWidth = img.width / cols;
        const cellHeight = img.height / rows;

        canvas.width = cellWidth;
        canvas.height = cellHeight;

        const splits: SplitImage[] = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.clearRect(0, 0, cellWidth, cellHeight);
            ctx.drawImage(
              img,
              c * cellWidth, r * cellHeight, cellWidth, cellHeight,
              0, 0, cellWidth, cellHeight
            );
            splits.push({
              id: Math.random().toString(36).substr(2, 9),
              originalId: uploadedFile.id,
              dataUrl: canvas.toDataURL('image/jpeg', 0.9),
              prompt: '',
              selected: false,
              index: r * cols + c,
              gridMode: uploadedFile.mode,
              duration: 3,
              history: []
            });
          }
        }
        resolve(splits);
      };
      img.src = uploadedFile.preview;
    });
  };

  const handleBatchApplyPrefix = async () => {
    const selectedItems = library.filter(i => i.selected);
    if (selectedItems.length === 0 || !selectedPrefixId) return;

    const prefix = customPrefixes.find(p => p.id === selectedPrefixId);
    if (!prefix) return;

    setIsApplyingPrefix(true);
    try {
      if (prefixMode === 'direct') {
        setLibrary(prev => prev.map(item => {
          if (item.selected) {
            return { ...item, prompt: prefix.content + (item.prompt || '') };
          }
          return item;
        }));
      } else {
        // AI 润色模式
        const apiKey = getImageKey(0);
        if (!apiKey) {
          alert("请先在设置中配置 Gemini API Key");
          setIsApplyingPrefix(false);
          return;
        }
        const ai = new GoogleGenAI({ apiKey });
        for (const item of selectedItems) {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `${prefixCombineSystemPrompt}\n\n运镜指令: ${prefix.content}\n原有描述: ${item.prompt || '默认高清视频'}`,
          });
          
          const polishedText = response.text;
          if (polishedText) {
            setLibrary(prev => prev.map(i => i.id === item.id ? { ...i, prompt: polishedText.trim() } : i));
          }
        }
      }
    } catch (error) {
      console.error('Apply prefix error:', error);
      alert('应用前缀失败，请检查 API Key');
    } finally {
      setIsApplyingPrefix(false);
    }
  };

  const addCustomPrefix = () => {
    if (!newPrefixName || !newPrefixContent) return;
    const newPrefix: CustomPrefix = {
      id: `prefix-${Date.now()}`,
      name: newPrefixName,
      content: newPrefixContent,
      category: newPrefixCategory || '其他',
      subcategory: newPrefixSubcategory || '默认'
    };
    setCustomPrefixes(prev => [...prev, newPrefix]);
    setNewPrefixName('');
    setNewPrefixContent('');
  };

  const deleteCustomPrefix = (id: string) => {
    setCustomPrefixes(prev => prev.filter(p => p.id !== id));
    if (selectedPrefixId === id) setSelectedPrefixId('');
  };

  const updateItemIndex = (id: string, newIndex: number) => {
    setLibrary(prev => {
      const targetIndex = Math.max(0, Math.min(prev.length - 1, newIndex - 1));
      const currentIndex = prev.findIndex(item => item.id === id);
      if (currentIndex === -1 || currentIndex === targetIndex) return prev;
      
      const next = [...prev];
      const [movedItem] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      
      // 重新分配所有索引以保持连续性
      return next.map((item, i) => ({ ...item, index: i }));
    });
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  const handleImportDirectly = async () => {
    setIsProcessing(true);
    const allItems: SplitImage[] = [];
    for (const file of uploadedFiles) {
      let dataUrl = await fileToDataUrl(file.file);
      
      if (enableHD) {
        try {
          const hdUrl = await handleHDRedraw(dataUrl);
          if (hdUrl) dataUrl = hdUrl;
        } catch (err) {
          console.error("HD重绘失败:", err);
        }
      }

      const item: SplitImage = {
        id: Math.random().toString(36).substr(2, 9),
        originalId: file.id,
        dataUrl: dataUrl,
        prompt: '',
        selected: false,
        index: library.length + allItems.length,
        gridMode: file.mode,
        duration: 3
      };

      // Save asset
      try {
        await fetch('/api/save-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl: item.dataUrl,
            filename: `asset_${item.id}.jpg`,
            subDir: 'assets'
          })
        });
      } catch (err) {
        console.error("保存资产失败:", err);
      }
      
      allItems.push(item);
    }
    setLibrary(prev => {
      const next = [...prev, ...allItems];
      return next.map((item, i) => ({ ...item, index: i }));
    });
    setUploadedFiles([]);
    setIsProcessing(false);
  };

  const handleProcessAll = async () => {
    setIsProcessing(true);
    const allSplits: SplitImage[] = [];
    let currentMaxIndex = library.length > 0 ? Math.max(...library.map(i => i.index)) + 1 : 0;
    for (const file of uploadedFiles) {
      let splits = await splitImage(file);
      
      // 重新分配索引以确保在图库中是连续的
      splits = splits.map((s, i) => ({ ...s, index: currentMaxIndex + i }));
      currentMaxIndex += splits.length;

      if (enableHD) {
        const hdSplits = [];
        for (const split of splits) {
          try {
            const hdUrl = await handleHDRedraw(split.dataUrl);
            if (hdUrl) {
              hdSplits.push({ ...split, dataUrl: hdUrl });
            } else {
              hdSplits.push(split);
            }
          } catch (err) {
            hdSplits.push(split);
          }
        }
        splits = hdSplits;
      }

      // Save each split image to local storage
      for (const split of splits) {
        try {
          await fetch('/api/save-asset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataUrl: split.dataUrl,
              filename: `asset_${split.id}.jpg`,
              subDir: 'assets'
            })
          });
        } catch (err) {
          console.error("保存资产失败:", err);
        }
      }
      
      allSplits.push(...splits);
    }
    setLibrary(prev => {
      const next = [...prev, ...allSplits];
      return next.map((item, i) => ({ ...item, index: i }));
    });
    setUploadedFiles([]);
    setIsProcessing(false);
  };

  const toggleSelect = (id: string) => {
    setLibrary(prev => prev.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const updatePrompt = (id: string, prompt: string) => {
    setLibrary(prev => prev.map(item => 
      item.id === id ? { ...item, prompt } : item
    ));
  };

  const updateDuration = (id: string, duration: number) => {
    setLibrary(prev => prev.map(item => 
      item.id === id ? { ...item, duration } : item
    ));
  };

  const deleteItem = (id: string) => {
    setLibrary(prev => prev.filter(item => item.id !== id).map((item, i) => ({ ...item, index: i })));
  };

  const handlePromptChange = (id: string, value: string) => {
    updatePrompt(id, value);
    if (viewingImage && viewingImage.id === id) {
      setViewingImage({ ...viewingImage, prompt: value });
    }
    
    const lastAtPos = value.lastIndexOf('@');
    if (lastAtPos !== -1 && lastAtPos >= value.length - 10) {
      const query = value.slice(lastAtPos + 1);
      if (!query.includes(' ')) {
        setMentionSearch(query);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (id: string, refId: string) => {
    const currentPrompt = (viewingImage && viewingImage.id === id) ? viewingImage.prompt : (library.find(i => i.id === id)?.prompt || '');
    
    const lastAtPos = currentPrompt.lastIndexOf('@');
    const newValue = currentPrompt.slice(0, lastAtPos) + '@' + refId + ' ';
    
    updatePrompt(id, newValue);
    if (viewingImage && viewingImage.id === id) {
      setViewingImage({ ...viewingImage, prompt: newValue });
    }
    setShowMentions(false);
  };

  const handleGenerate = () => {
    const selectedItems = library.filter(i => i.selected);
    if (selectedItems.length === 0) return;
    
    setShowConfigModal(true);
  };

  const handleStoryboardPromptChange = (value: string) => {
    setStoryboardPrompt(value);
    const lastAtPos = value.lastIndexOf('@');
    if (lastAtPos !== -1 && lastAtPos >= value.length - 10) {
      const query = value.slice(lastAtPos + 1);
      if (!query.includes(' ')) {
        setMentionSearch(query);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertStoryboardMention = (refId: string) => {
    const lastAtPos = storyboardPrompt.lastIndexOf('@');
    const newValue = storyboardPrompt.slice(0, lastAtPos) + '@' + refId + ' ';
    setStoryboardPrompt(newValue);
    setShowMentions(false);
  };

  const handleStoryboardRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files as FileList)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newRef: RefImage = {
          id: Math.random().toString(36).substr(2, 9),
          dataUrl: dataUrl,
          originalUrl: dataUrl
        };
        setStoryboardRefImages(prev => [...prev, newRef]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files as FileList).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newRef: RefImage = {
          id: 'UP' + Math.random().toString(36).substr(2, 4).toUpperCase(),
          dataUrl: dataUrl,
          originalUrl: dataUrl
        };
        setEditRefImages(prev => [...prev, newRef]);
      };
      reader.readAsDataURL(file);
    });
  };

  const getFinalMask = () => {
    if (!maskCanvasRef.current) return null;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = maskCanvasRef.current.width;
    tempCanvas.height = maskCanvasRef.current.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    tempCtx.fillStyle = 'black';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    if (selectionMode === 'brush') {
      tempCtx.drawImage(maskCanvasRef.current, 0, 0);
    } else if (selectionMode === 'box' && boxData) {
      tempCtx.fillStyle = 'white';
      tempCtx.fillRect(boxData.x, boxData.y, boxData.w, boxData.h);
    } else {
      return null;
    }

    return tempCanvas.toDataURL('image/png');
  };

  const modifyImage = async (isPartial: boolean = false) => {
    if (!viewingImage) return;
    if (!settings.imageApiKey) {
      alert("请先在设置中配置 Gemini API Key");
      setActiveTab('settings');
      return;
    }

    setIsEditing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: settings.imageApiKey });
      
      const parts: any[] = [
        {
          inlineData: {
            data: viewingImage.dataUrl.split(',')[1],
            mimeType: "image/png"
          }
        }
      ];

      let promptText = `Please modify this image based on the following prompt: ${viewingImage.prompt}. Maintain the original style and composition but apply the requested changes.`;

      if (isPartial) {
        const maskDataUrl = getFinalMask();
        if (maskDataUrl) {
          parts.push({
            inlineData: {
              data: maskDataUrl.split(',')[1],
              mimeType: "image/png"
            }
          });
          promptText = `The second image is a black and white mask where white represents the area to be modified in the first image. Please redraw ONLY the area covered by the white mask based on this prompt: ${viewingImage.prompt}. Keep the rest of the image exactly as it is.`;
        }
      }

      parts.push({ text: promptText });

      if (editRefImages.length > 0) {
        editRefImages.forEach((img) => {
          parts.push({
            inlineData: {
              data: img.dataUrl.split(',')[1],
              mimeType: "image/png"
            }
          });
        });
        parts[parts.length - 1 - editRefImages.length].text += " Also use the provided reference images as a guide for the modification.";
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ parts }],
      });

      let newImageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          newImageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (newImageUrl) {
        setLibrary(prev => prev.map(item => 
          item.id === viewingImage.id ? { 
            ...item, 
            dataUrl: newImageUrl,
            history: [...(item.history || []), item.dataUrl]
          } : item
        ));
        setViewingImage(prev => prev ? { 
          ...prev, 
          dataUrl: newImageUrl,
          history: [...(prev.history || []), prev.dataUrl]
        } : null);
        setEditRefImages([]);
        setMaskData(null);
        setBoxData(null);
        setSelectionMode('none');
        setIsSelectionConfirmed(false);
        const ctx = maskCanvasRef.current?.getContext('2d');
        if (ctx && maskCanvasRef.current) {
          ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
        }
      } else {
        throw new Error("AI 未返回生成的图片");
      }
    } catch (error) {
      console.error("修改图片失败:", error);
      alert(`修改失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsEditing(false);
    }
  };

  const generateStoryboard = async () => {
    if (!storyboardPrompt.trim()) {
      alert("请输入提示词");
      return;
    }

    const apiKey = getImageKey(0);
    if (!apiKey) {
      alert("请先在设置中配置 Gemini API Key");
      setActiveTab('settings');
      return;
    }

    setIsGeneratingStoryboard(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // 处理提示词中的 @ 引用
      let finalPrompt = storyboardPrompt;
      const parts: any[] = [];
      
      // 提取所有引用的图片
      const mentionRegex = /@([a-z0-9]+)/g;
      let match;
      const usedRefIds = new Set<string>();
      
      while ((match = mentionRegex.exec(storyboardPrompt)) !== null) {
        const refId = match[1];
        const refImg = storyboardRefImages.find(img => img.id === refId);
        if (refImg) {
          usedRefIds.add(refId);
          parts.push({
            inlineData: {
              data: refImg.dataUrl.split(',')[1],
              mimeType: 'image/png'
            }
          });
        }
      }
      
      parts.push({ text: finalPrompt });

      const results = [];
      for (let i = 0; i < storyboardCount; i++) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: "16:9",
            }
          }
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64Data = part.inlineData.data;
            results.push({
              id: Math.random().toString(36).substr(2, 9),
              url: `data:image/png;base64,${base64Data}`,
              prompt: storyboardPrompt
            });
          }
        }
      }
      
      setStoryboardResults(prev => [...results, ...prev]);
    } catch (error) {
      console.error("生成故事板失败:", error);
      alert("生成失败: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  const addToLibrary = (result: {id: string, url: string, prompt: string}) => {
    const newItem: SplitImage = {
      id: Math.random().toString(36).substr(2, 9),
      originalId: result.id,
      dataUrl: result.url,
      prompt: result.prompt,
      selected: false,
      index: library.length,
      gridMode: '16:9',
      duration: 3,
      history: []
    };
    setLibrary(prev => [...prev, newItem]);
    alert("已添加到图库");
  };

  const startGeneration = async () => {
    const selectedItems = library.filter(i => i.selected);
    if (selectedItems.length === 0) return;

    if (settings.videoApiKeys.filter(k => k.trim() !== '').length === 0) {
      alert("请先在设置中配置 Vidu API Token");
      setShowConfigModal(false);
      setActiveTab('settings');
      return;
    }

    setShowConfigModal(false);
    setIsGenerating(true);
    setGenerationProgress(0);

    const total = selectedItems.length;
    let completed = 0;

    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const prompt = item.prompt || "High quality cinematic video";
      const viduToken = getVideoKey(i);
      
      try {
        const response = await fetch('https://api.vidu.cn/ent/v2/img2video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${viduToken}`
          },
          body: JSON.stringify({
            model: selectedVariant,
            images: [item.dataUrl],
            prompt: prompt,
            audio: audio,
            duration: genDuration,
            resolution: genResolution,
            off_peak: offPeak,
            is_rec: isRec,
            bgm: bgm,
            watermark: watermark,
            wm_position: wmPosition
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Vidu API Error: ${response.status}`);
        }

        const taskData = await response.json();
        console.log(`Vidu Task Created: ${taskData.task_id}`);

        // 保存到历史
        const historyRecord: VideoHistory = {
          id: taskData.task_id,
          assetId: item.id,
          videoUrl: '',
          prompt: prompt,
          timestamp: new Date().toLocaleString(),
          status: 'processing',
          progress: 0
        };

        await fetch('/api/video-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(historyRecord)
        });

        setVideoHistory(prev => [historyRecord, ...prev]);

        completed++;
        setGenerationProgress(Math.round((completed / total) * 100));
      } catch (error) {
        console.error(`生成视频失败 (${item.id}):`, error);
        alert(`生成失败 (${item.id}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    setIsGenerating(false);
    alert(`批量生成任务已提交！成功创建 ${completed}/${total} 个 Vidu 任务。请在“视频预览”页查看进度。`);
  };

  const selectAll = () => {
    setLibrary(prev => prev.map(item => ({ ...item, selected: true })));
  };

  const deselectAll = () => {
    setLibrary(prev => prev.map(item => ({ ...item, selected: false })));
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] rounded-full flex items-center justify-center text-[#E4E3E0]">
            <Play size={20} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">批量视频生成器</h1>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">工作流 v2.4.0</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <nav className="flex items-center bg-[#141414]/5 p-1 rounded-full border border-[#141414]/10">
            <button 
              onClick={() => setActiveTab('main')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'main' ? 'bg-[#141414] text-[#E4E3E0]' : 'opacity-50 hover:opacity-100'}`}
            >
              视频生成
            </button>
            <button 
              onClick={() => setActiveTab('storyboard')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'storyboard' ? 'bg-[#141414] text-[#E4E3E0]' : 'opacity-50 hover:opacity-100'}`}
            >
              故事板生成
            </button>
            <button 
              onClick={() => setActiveTab('storyboard-editor')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'storyboard-editor' ? 'bg-[#141414] text-[#E4E3E0]' : 'opacity-50 hover:opacity-100'}`}
            >
              分镜脚本编辑器
            </button>
            <button 
              onClick={() => setActiveTab('video-preview')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'video-preview' ? 'bg-[#141414] text-[#E4E3E0]' : 'opacity-50 hover:opacity-100'}`}
            >
              视频预览
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'settings' ? 'bg-[#141414] text-[#E4E3E0]' : 'opacity-50 hover:opacity-100'}`}
            >
              后台设置
            </button>
          </nav>

          {activeTab === 'main' && (
            <div className="flex items-center gap-3 bg-[#141414]/5 p-1.5 rounded-full border border-[#141414]/10">
              <div className="flex items-center gap-2 px-3">
                <Sparkles size={14} className="text-[#141414]/60" />
                <select 
                  value={selectedPolishingModeId}
                  onChange={(e) => setSelectedPolishingModeId(e.target.value)}
                  className="bg-transparent text-xs font-bold outline-none cursor-pointer"
                >
                  {polishingModes.map(mode => (
                    <option key={mode.id} value={mode.id}>{mode.name}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => setShowPolishingConfigModal(true)}
                className="p-2 hover:bg-[#141414]/10 rounded-full transition-colors"
                title="编辑润色模式"
              >
                <Paintbrush size={14} />
              </button>
              <button 
                onClick={handleBatchPolish}
                disabled={isPolishing || library.filter(i => i.selected).length === 0}
                className="bg-[#141414] text-[#E4E3E0] px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 hover:bg-[#141414]/90 disabled:opacity-30"
              >
                {isPolishing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                批量润色
              </button>
            </div>
          )}

          {activeTab === 'main' && (
            <button 
              onClick={handleGenerate}
              disabled={isGenerating || library.filter(i => i.selected).length === 0}
              className="bg-[#141414] text-[#E4E3E0] px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 hover:scale-105 transition-transform disabled:opacity-30 disabled:scale-100"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
              开始批量生成
            </button>
          )}
        </div>
      </header>

      {activeTab === 'settings' ? (
        <main className="max-w-4xl mx-auto p-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-[#141414] rounded-3xl shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[600px]"
          >
            {/* Sidebar */}
            <div className="w-full md:w-64 bg-[#F5F5F4] border-r border-[#141414]/10 p-6 space-y-2">
              <div className="flex items-center gap-3 mb-8 px-2">
                <Settings2 size={20} />
                <h2 className="text-lg font-serif italic">后台管理</h2>
              </div>
              
              <button 
                onClick={() => setSettingsSubTab('image')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${settingsSubTab === 'image' ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 opacity-60'}`}
              >
                <ImageIcon size={16} />
                生图 API 设置
              </button>
              
              <button 
                onClick={() => setSettingsSubTab('video')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${settingsSubTab === 'video' ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 opacity-60'}`}
              >
                <Play size={16} />
                视频 API 设置
              </button>
              
              <button 
                onClick={() => setSettingsSubTab('storage')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${settingsSubTab === 'storage' ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 opacity-60'}`}
              >
                <FolderOpen size={16} />
                存储路径设置
              </button>

              <button 
                onClick={() => setSettingsSubTab('data')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${settingsSubTab === 'data' ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 opacity-60'}`}
              >
                <Database size={16} />
                数据备份与恢复
              </button>

              <div className="pt-8 mt-8 border-t border-[#141414]/5">
                <button 
                  onClick={() => saveSettings(settings)}
                  className="w-full bg-[#141414] text-[#E4E3E0] py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-xl"
                >
                  <Save size={18} />
                  保存配置
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-8 overflow-y-auto">
              <AnimatePresence mode="wait">
                {settingsSubTab === 'image' && (
                  <motion.div 
                    key="image"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-1">
                      <h3 className="text-xl font-serif italic">生图 API 设置</h3>
                      <p className="text-xs opacity-40">配置用于生成图片的 API Key，支持多 Key 轮询。</p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 flex items-center gap-2">
                        <Key size={12} /> Gemini API Keys
                      </label>
                      {settings.imageApiKeys.map((key, index) => (
                        <div key={index} className="flex gap-2 group">
                          <input 
                            type="password"
                            value={key}
                            onChange={(e) => {
                              const newKeys = [...settings.imageApiKeys];
                              newKeys[index] = e.target.value;
                              setSettings({...settings, imageApiKeys: newKeys});
                            }}
                            className="flex-1 bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-4 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20 transition-all focus:bg-white"
                            placeholder={`API Key ${index + 1}`}
                          />
                          {settings.imageApiKeys.length > 1 && (
                            <button 
                              onClick={() => {
                                const newKeys = settings.imageApiKeys.filter((_, i) => i !== index);
                                setSettings({...settings, imageApiKeys: newKeys});
                              }}
                              className="p-4 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button 
                        onClick={() => setSettings({...settings, imageApiKeys: [...settings.imageApiKeys, '']})}
                        className="w-full py-4 border border-dashed border-[#141414]/20 rounded-xl text-xs font-bold uppercase opacity-40 hover:opacity-100 hover:bg-[#141414]/5 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        添加 API Key
                      </button>
                    </div>
                  </motion.div>
                )}

                {settingsSubTab === 'video' && (
                  <motion.div 
                    key="video"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-1">
                      <h3 className="text-xl font-serif italic">视频 API 设置</h3>
                      <p className="text-xs opacity-40">配置用于生成视频的 API Token，支持多 Token 轮询以应对并发限制。</p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 flex items-center gap-2">
                        <Key size={12} /> Vidu API Tokens
                      </label>
                      {settings.videoApiKeys.map((key, index) => (
                        <div key={index} className="flex gap-2 group">
                          <input 
                            type="password"
                            value={key}
                            onChange={(e) => {
                              const newKeys = [...settings.videoApiKeys];
                              newKeys[index] = e.target.value;
                              setSettings({...settings, videoApiKeys: newKeys});
                            }}
                            className="flex-1 bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-4 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20 transition-all focus:bg-white"
                            placeholder={`API Token ${index + 1}`}
                          />
                          {settings.videoApiKeys.length > 1 && (
                            <button 
                              onClick={() => {
                                const newKeys = settings.videoApiKeys.filter((_, i) => i !== index);
                                setSettings({...settings, videoApiKeys: newKeys});
                              }}
                              className="p-4 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button 
                        onClick={() => setSettings({...settings, videoApiKeys: [...settings.videoApiKeys, '']})}
                        className="w-full py-4 border border-dashed border-[#141414]/20 rounded-xl text-xs font-bold uppercase opacity-40 hover:opacity-100 hover:bg-[#141414]/5 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        添加 API Token
                      </button>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <p className="text-[10px] text-blue-700 leading-relaxed">
                        <strong>并发提示：</strong> Vidu API 单个 Key 最大支持 5 个并发任务。批量生成时，系统将根据任务数量自动切换 API Key。
                      </p>
                    </div>
                  </motion.div>
                )}

                {settingsSubTab === 'storage' && (
                  <motion.div 
                    key="storage"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-1">
                      <h3 className="text-xl font-serif italic">存储路径设置</h3>
                      <p className="text-xs opacity-40">配置生成的资源在本地服务器上的存放位置。</p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 flex items-center gap-2">
                          <FolderOpen size={12} /> 主存储根目录
                        </label>
                        <input 
                          type="text"
                          value={settings.storagePath}
                          onChange={(e) => setSettings({...settings, storagePath: e.target.value})}
                          className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-4 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20 transition-all focus:bg-white"
                          placeholder="例如: C:\ViduProjects"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 pt-4 border-t border-[#141414]/5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase opacity-40">视频生成页子路径</label>
                          <input 
                            type="text"
                            value={settings.paths.main}
                            onChange={(e) => setSettings({...settings, paths: { ...settings.paths, main: e.target.value }})}
                            className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-4 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20"
                            placeholder="默认: exports/main"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase opacity-40">故事板页子路径</label>
                          <input 
                            type="text"
                            value={settings.paths.storyboard}
                            onChange={(e) => setSettings({...settings, paths: { ...settings.paths, storyboard: e.target.value }})}
                            className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-4 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20"
                            placeholder="默认: exports/storyboard"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase opacity-40">视频预览页子路径</label>
                          <input 
                            type="text"
                            value={settings.paths.videoPreview}
                            onChange={(e) => setSettings({...settings, paths: { ...settings.paths, videoPreview: e.target.value }})}
                            className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-4 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20"
                            placeholder="默认: exports/video-preview"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {settingsSubTab === 'data' && (
                  <motion.div 
                    key="data"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    <div className="space-y-1">
                      <h3 className="text-xl font-serif italic">数据备份与恢复</h3>
                      <p className="text-xs opacity-40">导出或导入完整的应用数据，包括设置、历史记录、图库和分镜脚本。</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 bg-[#141414]/5 rounded-3xl border border-[#141414]/10 space-y-4">
                        <div className="w-12 h-12 bg-[#141414] rounded-2xl flex items-center justify-center text-[#E4E3E0] shadow-lg">
                          <Download size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">导出完整数据</h4>
                          <p className="text-[10px] opacity-50 mt-1">将所有配置、图库内容和历史记录打包为 JSON 文件下载。</p>
                        </div>
                        <button 
                          onClick={exportAppData}
                          className="w-full py-3 bg-[#141414] text-[#E4E3E0] rounded-xl text-xs font-bold hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                        >
                          <Download size={14} />
                          立即导出备份
                        </button>
                      </div>

                      <div className="p-6 bg-[#141414]/5 rounded-3xl border border-[#141414]/10 space-y-4">
                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                          <RefreshCw size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">导入备份数据</h4>
                          <p className="text-[10px] opacity-50 mt-1">从 JSON 备份文件中恢复应用状态。注意：这将覆盖当前所有数据。</p>
                        </div>
                        <div className="relative">
                          <input 
                            type="file"
                            accept=".json"
                            onChange={importAppData}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                          />
                          <button 
                            className="w-full py-3 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                          >
                            <RefreshCw size={14} />
                            选择文件并导入
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex items-center justify-between">
                      <p className="text-[10px] text-orange-700 leading-relaxed max-w-[70%]">
                        <strong>安全提示：</strong> 导出的 JSON 文件包含您的 API Keys 等敏感信息，请妥善保管。导入操作不可逆，建议在导入前先导出当前数据作为备份。
                      </p>
                      <button 
                        onClick={clearAllData}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                      >
                        <Trash2 size={12} />
                        清空所有数据
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </main>
      ) : activeTab === 'storyboard' ? (
        <main className="max-w-7xl mx-auto p-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Input & Config */}
            <div className="lg:col-span-5 space-y-6">
              <section className="bg-white border border-[#141414] p-8 rounded-3xl shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-serif italic">故事板生成</h2>
                  <div className="flex bg-[#141414]/5 p-1 rounded-xl border border-[#141414]/10">
                    {[1, 2, 3, 4].map(num => (
                      <button 
                        key={num}
                        onClick={() => setStoryboardCount(num)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${storyboardCount === num ? 'bg-[#141414] text-[#E4E3E0]' : 'opacity-40 hover:opacity-100'}`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <textarea 
                      value={storyboardPrompt}
                      onChange={(e) => handleStoryboardPromptChange(e.target.value)}
                      placeholder="输入故事场景描述，使用 @ 引用参考图..."
                      className="w-full h-48 bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-2xl p-6 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20 resize-none"
                    />
                    
                    {/* Mentions Dropdown */}
                    <AnimatePresence>
                      {showMentions && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-[#141414] rounded-2xl shadow-2xl z-[100] overflow-hidden"
                        >
                          <div className="p-2 max-h-48 overflow-y-auto">
                            {storyboardRefImages.length === 0 ? (
                              <p className="p-4 text-[10px] font-mono opacity-40 text-center uppercase">暂无参考图</p>
                            ) : (
                              storyboardRefImages
                                .filter(img => img.id.includes(mentionSearch))
                                .map(img => (
                                  <div 
                                    key={img.id}
                                    onClick={() => insertStoryboardMention(img.id)}
                                    className="flex items-center gap-3 p-2 hover:bg-[#141414]/5 rounded-xl cursor-pointer transition-colors"
                                  >
                                    <img src={img.dataUrl} className="w-10 h-10 rounded-lg object-cover border border-[#141414]/10" />
                                    <span className="text-[10px] font-mono font-bold">@{img.id}</span>
                                  </div>
                                ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">参考图上传</label>
                      <button 
                        onClick={() => storyboardRefInputRef.current?.click()}
                        className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:underline"
                      >
                        添加图片
                      </button>
                    </div>
                    <input 
                      type="file" 
                      ref={storyboardRefInputRef} 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleStoryboardRefUpload} 
                    />
                    
                    <div className="grid grid-cols-4 gap-3">
                      {storyboardRefImages.map(img => (
                        <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border border-[#141414]/10">
                          <img src={img.dataUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => setStoryboardRefImages(prev => prev.filter(i => i.id !== img.id))}
                              className="p-1.5 bg-white rounded-full text-red-500 shadow-lg"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="absolute bottom-1 left-1 bg-white/90 backdrop-blur px-1 rounded text-[8px] font-mono border border-[#141414]/10">
                            @{img.id}
                          </div>
                        </div>
                      ))}
                      {storyboardRefImages.length < 8 && (
                        <button 
                          onClick={() => storyboardRefInputRef.current?.click()}
                          className="aspect-square rounded-xl border-2 border-dashed border-[#141414]/10 flex items-center justify-center opacity-20 hover:opacity-40 transition-opacity"
                        >
                          <Plus size={24} />
                        </button>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={generateStoryboard}
                    disabled={isGeneratingStoryboard}
                    className="w-full bg-[#141414] text-[#E4E3E0] py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100"
                  >
                    {isGeneratingStoryboard ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        正在生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        开始生成故事板
                      </>
                    )}
                  </button>
                </div>
              </section>
            </div>

            {/* Right: Results */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-serif italic">生成结果</h2>
                <button 
                  onClick={() => setStoryboardResults([])}
                  className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                >
                  清空结果
                </button>
              </div>

              {storyboardResults.length === 0 ? (
                <div className="h-[600px] border-2 border-dashed border-[#141414]/10 rounded-3xl flex flex-col items-center justify-center gap-4 opacity-20">
                  <ImageIcon size={48} />
                  <p className="text-sm font-mono uppercase">暂无生成结果</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <AnimatePresence>
                    {storyboardResults.map(result => (
                      <motion.div 
                        key={result.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white border border-[#141414] rounded-2xl overflow-hidden shadow-sm group"
                      >
                        <div className="aspect-video relative overflow-hidden">
                          <img src={result.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                            <button 
                              onClick={() => addToLibrary(result)}
                              className="bg-white text-[#141414] px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                            >
                              <PlusCircle size={14} />
                              加入图库
                            </button>
                            <a 
                              href={result.url} 
                              download={`storyboard_${result.id}.png`}
                              className="bg-white/20 backdrop-blur text-white p-2 rounded-full hover:bg-white/40 transition-colors"
                            >
                              <Save size={16} />
                            </a>
                          </div>
                        </div>
                        <div className="p-4">
                          <p className="text-[10px] font-mono opacity-60 line-clamp-2">{result.prompt}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </main>
      ) : activeTab === 'video-preview' ? (
        <VideoPreview />
      ) : activeTab === 'storyboard-editor' ? (
        <StoryboardEditor />
      ) : activeTab === 'main' ? (
        <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Upload & Config */}
          <div className="lg:col-span-4 space-y-8">
            <section className="bg-white border border-[#141414] p-6 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif italic text-lg">1. 资产上传</h2>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                multiple 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileUpload} 
              />

              {uploadedFiles.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#141414]/20 rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[#141414]/40 transition-colors"
                >
                  <Upload size={32} className="opacity-20" />
                  <p className="text-xs font-mono opacity-40 uppercase">将资产拖到此处或点击上传</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {uploadedFiles.map(file => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={file.id} 
                      className="flex gap-4 p-3 border border-[#141414]/10 rounded-xl group"
                    >
                      <div className="w-20 h-20 rounded-lg overflow-hidden border border-[#141414]/10 flex-shrink-0">
                        <img src={file.preview} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-1">
                        <div className="flex justify-between items-start">
                          <p className="text-[10px] font-mono truncate w-32 opacity-60 uppercase">{file.file.name}</p>
                          <button onClick={() => removeUploadedFile(file.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => updateFileMode(file.id, '16:9')}
                            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${file.mode === '16:9' ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414]/20 opacity-50'}`}
                          >
                            16:9 (九宫格)
                          </button>
                          <button 
                            onClick={() => updateFileMode(file.id, '9:16')}
                            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${file.mode === '9:16' ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414]/20 opacity-50'}`}
                          >
                            9:16 (四宫格)
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  <div className="flex items-center justify-between mt-4">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-8 h-4 rounded-full transition-colors relative ${enableHD ? 'bg-emerald-500' : 'bg-[#141414]/20'}`}>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={enableHD}
                          onChange={(e) => setEnableHD(e.target.checked)}
                        />
                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${enableHD ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">
                        4K 高清重绘
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleImportDirectly}
                        disabled={isProcessing}
                        className="bg-white text-[#141414] border border-[#141414] px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#141414]/5 transition-colors"
                      >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
                        直接导入
                      </button>
                      <button 
                        onClick={handleProcessAll}
                        disabled={isProcessing}
                        className="bg-[#141414] text-[#E4E3E0] px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                      >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
                        开始切割并导入
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Custom Prefix Section */}
            <section className="bg-white border border-[#141414] p-6 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif italic text-lg">2. 自定义前缀</h2>
                  <button 
                    onClick={() => setShowPrefixPromptModal(true)}
                    className="p-1 hover:bg-[#141414]/5 rounded-full transition-colors opacity-40 hover:opacity-100"
                    title="设置结合系统提示词"
                  >
                    <Settings2 size={14} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPrefixMode('direct')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full border transition-all ${prefixMode === 'direct' ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414]/10 opacity-50'}`}
                  >
                    直接加入
                  </button>
                  <button 
                    onClick={() => setPrefixMode('polish')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full border transition-all ${prefixMode === 'polish' ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414]/10 opacity-50'}`}
                  >
                    智能结合
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <PrefixDropdown 
                    prefixes={customPrefixes}
                    selectedId={selectedPrefixId}
                    onSelect={setSelectedPrefixId}
                  />
                  <button 
                    onClick={handleBatchApplyPrefix}
                    disabled={isApplyingPrefix || !selectedPrefixId || library.filter(i => i.selected).length === 0}
                    className="bg-[#141414] text-[#E4E3E0] px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-[#141414]/90 disabled:opacity-30 transition-colors"
                  >
                    {isApplyingPrefix ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    批量应用
                  </button>
                </div>

                {selectedPrefixId && (
                  <div className="p-3 bg-[#E4E3E0]/20 rounded-xl border border-[#141414]/5">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono opacity-40 uppercase">预览内容:</span>
                        <span className="text-[8px] font-mono opacity-30 italic">
                          {customPrefixes.find(p => p.id === selectedPrefixId)?.category} &gt; {customPrefixes.find(p => p.id === selectedPrefixId)?.subcategory}
                        </span>
                      </div>
                      <button 
                        onClick={() => deleteCustomPrefix(selectedPrefixId)}
                        className="text-red-500 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-[11px] font-mono italic opacity-70">
                      {customPrefixes.find(p => p.id === selectedPrefixId)?.content}
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-[#141414]/5 space-y-3">
                  <p className="text-[10px] font-mono uppercase opacity-40">新增自定义前缀</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      placeholder="一级标题 (如: 运镜)"
                      value={newPrefixCategory}
                      onChange={(e) => setNewPrefixCategory(e.target.value)}
                      className="bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-lg px-3 py-2 text-[11px] outline-none focus:ring-1 ring-[#141414]/20"
                    />
                    <input 
                      type="text" 
                      placeholder="二级标题 (如: 基础运镜)"
                      value={newPrefixSubcategory}
                      onChange={(e) => setNewPrefixSubcategory(e.target.value)}
                      className="bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-lg px-3 py-2 text-[11px] outline-none focus:ring-1 ring-[#141414]/20"
                    />
                    <input 
                      type="text" 
                      placeholder="名称 (如: 航拍)"
                      value={newPrefixName}
                      onChange={(e) => setNewPrefixName(e.target.value)}
                      className="bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-lg px-3 py-2 text-[11px] outline-none focus:ring-1 ring-[#141414]/20"
                    />
                    <input 
                      type="text" 
                      placeholder="内容 (英文)"
                      value={newPrefixContent}
                      onChange={(e) => setNewPrefixContent(e.target.value)}
                      className="bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-lg px-3 py-2 text-[11px] outline-none focus:ring-1 ring-[#141414]/20"
                    />
                  </div>
                  <button 
                    onClick={addCustomPrefix}
                    disabled={!newPrefixName || !newPrefixContent || !newPrefixCategory || !newPrefixSubcategory}
                    className="w-full py-2 border border-[#141414]/10 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#141414]/5 transition-colors disabled:opacity-30"
                  >
                    添加至列表
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Library & Prompts */}
          <div className="lg:col-span-8 space-y-8">
            <section className="bg-white border border-[#141414] p-6 rounded-2xl shadow-sm min-h-[600px] flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="font-serif italic text-lg">3. 切割图库</h2>
                  <span className="bg-[#141414] text-[#E4E3E0] px-2 py-0.5 rounded text-[10px] font-mono">{library.length} 个项目</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-[10px] font-mono uppercase opacity-50 hover:opacity-100 transition-opacity">全选</button>
                  <span className="opacity-20">/</span>
                  <button onClick={deselectAll} className="text-[10px] font-mono uppercase opacity-50 hover:opacity-100 transition-opacity">取消选择</button>
                </div>
              </div>

              {library.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-20 gap-4">
                  <ImageIcon size={48} />
                  <p className="text-sm font-mono uppercase">图库为空</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  <AnimatePresence mode="popLayout">
                    {library.map((item) => (
                      <motion.div 
                        layout
                        drag
                        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                        dragElastic={0.1}
                        onDragEnd={(_, info) => handleDragEnd(item.id, info)}
                        key={item.id} 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileDrag={{ scale: 1.05, zIndex: 50, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}
                        className={`group relative border rounded-2xl overflow-hidden transition-all duration-300 bg-white cursor-grab active:cursor-grabbing ${item.selected ? 'border-[#141414] ring-2 ring-[#141414] ring-offset-2' : 'border-[#141414]/10 shadow-sm'}`}
                      >
                        <div 
                          onClick={() => toggleSelect(item.id)}
                          onDoubleClick={() => setViewingImage(item)}
                          className="aspect-video relative overflow-hidden"
                        >
                          <img src={item.dataUrl} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 pointer-events-none" />
                          <div className={`absolute inset-0 bg-[#141414]/40 flex items-center justify-center transition-opacity ${item.selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                            <CheckCircle2 className="text-[#E4E3E0]" size={32} />
                          </div>
                          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-1.5 py-0.5 rounded text-[8px] font-mono border border-[#141414]/10 flex items-center gap-1">
                            <GripVertical size={8} />
                            #
                            <input 
                              type="number"
                              value={item.index + 1}
                              onChange={(e) => updateItemIndex(item.id, parseInt(e.target.value) || 1)}
                              className="w-8 bg-transparent border-none outline-none font-bold text-center p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-white/90 backdrop-blur p-1 rounded-full border border-[#141414]/10">
                              <Maximize2 size={10} />
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-white">
                          <div className="relative">
                            <textarea 
                              placeholder="输入生成提示词..."
                              value={item.prompt}
                              onChange={(e) => handlePromptChange(item.id, e.target.value)}
                              className="w-full h-20 bg-[#E4E3E0]/20 border-none outline-none p-3 text-[11px] font-mono resize-none rounded-xl placeholder:opacity-30 focus:ring-1 ring-[#141414]/10"
                            />
                            
                            <AnimatePresence>
                              {showMentions && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 10 }}
                                  className="absolute bottom-full left-0 w-full bg-white border border-[#141414] rounded-xl shadow-xl mb-2 overflow-hidden z-50 max-h-48 overflow-y-auto"
                                >
                                  <div className="p-2 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono uppercase tracking-widest">
                                    引用参考图
                                  </div>
                                  {storyboardRefImages.length === 0 ? (
                                    <div className="p-4 text-center text-[10px] opacity-40">
                                      暂无参考图，请在故事板页面上传
                                    </div>
                                  ) : (
                                    storyboardRefImages
                                      .filter(r => r.id.includes(mentionSearch))
                                      .map(ref => (
                                        <div 
                                          key={ref.id}
                                          onClick={() => insertMention(item.id, ref.id)}
                                          className="flex items-center gap-3 p-2 hover:bg-[#141414]/5 cursor-pointer border-b border-[#141414]/5 last:border-none"
                                        >
                                          <img src={ref.dataUrl} className="w-8 h-8 rounded object-cover border border-[#141414]/10" />
                                          <span className="text-[10px] font-mono font-bold">@{ref.id}</span>
                                        </div>
                                      ))
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <div className="mt-2 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono opacity-30">ID: {item.id}</span>
                              <div className="flex items-center gap-1 bg-[#E4E3E0]/30 px-2 py-0.5 rounded-lg border border-[#141414]/5">
                                <Clock size={8} className="opacity-40" />
                                <input 
                                  type="number"
                                  value={item.duration || 3}
                                  onChange={(e) => updateDuration(item.id, parseFloat(e.target.value) || 0)}
                                  className="w-8 bg-transparent border-none outline-none text-[10px] font-mono font-bold p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-[8px] font-mono opacity-40">S</span>
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="p-1 hover:bg-red-50 text-red-400 rounded transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </div>
        </main>
      ) : null}

      {/* Detail Modal */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 md:p-8"
            onClick={() => setViewingImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border border-[#141414] rounded-3xl overflow-hidden max-w-5xl w-full shadow-2xl flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 bg-[#141414] flex flex-col items-center justify-center p-4 min-h-[300px] relative">
                <div 
                  className={`relative group ${selectionMode !== 'none' ? 'cursor-crosshair' : 'cursor-default'}`}
                  onMouseDown={handleMaskMouseDown}
                  onMouseMove={handleMaskMouseMove}
                  onMouseUp={handleMaskMouseUp}
                  onMouseLeave={handleMaskMouseUp}
                >
                  <AnimatePresence mode="wait">
                    <motion.img 
                      ref={imageRef}
                      key={viewingImage.dataUrl}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      src={viewingImage.dataUrl} 
                      alt="" 
                      className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded-lg" 
                      onLoad={(e) => {
                        if (maskCanvasRef.current) {
                          maskCanvasRef.current.width = (e.target as HTMLImageElement).width;
                          maskCanvasRef.current.height = (e.target as HTMLImageElement).height;
                        }
                      }}
                    />
                  </AnimatePresence>

                  {/* 蒙版画布 */}
                  <canvas 
                    ref={maskCanvasRef}
                    className={`absolute inset-0 pointer-events-none ${selectionMode === 'brush' ? 'opacity-50' : 'opacity-0'}`}
                    style={{ mixBlendMode: 'screen' }}
                  />

                  {/* 框选框 */}
                  {boxData && selectionMode === 'box' && (
                    <div 
                      className="absolute border-2 border-white border-dashed shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] z-10"
                      style={{
                        left: boxData.x,
                        top: boxData.y,
                        width: boxData.w,
                        height: boxData.h
                      }}
                    />
                  )}
                  
                  {markerPos && selectionMode === 'none' && (
                    <motion.div 
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute w-6 h-6 border-2 border-white rounded-full flex items-center justify-center shadow-lg pointer-events-none"
                      style={{ 
                        left: `${markerPos.x}%`, 
                        top: `${markerPos.y}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      <div className="w-1 h-1 bg-white rounded-full" />
                    </motion.div>
                  )}
                </div>

                <div className="absolute top-4 left-4 flex gap-2">
                  <button 
                    onClick={() => {
                      setSelectionMode(selectionMode === 'brush' ? 'none' : 'brush');
                      setIsSelectionConfirmed(false);
                    }}
                    className={`p-2 rounded-full border transition-all ${selectionMode === 'brush' ? 'bg-white text-[#141414]' : 'bg-black/50 text-white border-white/20'}`}
                    title="画笔涂抹"
                  >
                    <Paintbrush size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      setSelectionMode(selectionMode === 'box' ? 'none' : 'box');
                      setIsSelectionConfirmed(false);
                    }}
                    className={`p-2 rounded-full border transition-all ${selectionMode === 'box' ? 'bg-white text-[#141414]' : 'bg-black/50 text-white border-white/20'}`}
                    title="框选区域"
                  >
                    <Square size={16} />
                  </button>
                  {(maskData || boxData) && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsSelectionConfirmed(true)}
                        className={`p-2 rounded-full transition-all flex items-center gap-2 px-4 border ${isSelectionConfirmed ? 'bg-white text-emerald-600 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-emerald-500 text-white border-emerald-400'}`}
                        title="确认当前选择区域"
                      >
                        <CheckCircle2 size={16} />
                        <span className="text-[10px] font-bold uppercase">确认选择</span>
                      </button>
                      <button 
                        onClick={clearMask}
                        className="p-2 rounded-full bg-red-500 text-white border border-red-400"
                        title="清除选择"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
                
                {isEditing && (
                  <div className="absolute inset-0 bg-[#141414]/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-[#E4E3E0] z-20">
                    <Loader2 size={40} className="animate-spin" />
                    <p className="font-mono text-xs uppercase tracking-widest">AI 正在修改资产...</p>
                  </div>
                )}

                {/* 历史预览 */}
                {viewingImage && (
                  <div className="absolute bottom-4 left-4 right-4 bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/10 z-30">
                    <div className="flex items-center gap-2 mb-2">
                      <History size={14} className="text-white/50" />
                      <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest">版本历史</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                      {viewingImage.history?.map((url, idx) => (
                        <motion.div 
                          key={idx}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setLibrary(prev => prev.map(item => 
                              item.id === viewingImage.id ? { ...item, dataUrl: url } : item
                            ));
                            setViewingImage(prev => prev ? { ...prev, dataUrl: url } : null);
                          }}
                          className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-white/20 cursor-pointer hover:border-white transition-all group"
                        >
                          <img src={url} className="w-full h-full object-cover" alt="" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <RefreshCw size={16} className="text-white" />
                          </div>
                          <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] px-1 rounded font-mono">V{idx + 1}</div>
                        </motion.div>
                      ))}
                      {/* 当前版本预览 */}
                      <div className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                        {isEditing ? (
                          <div className="w-full h-full bg-black/40 flex items-center justify-center">
                            <Loader2 size={20} className="animate-spin text-emerald-500" />
                          </div>
                        ) : (
                          <img src={viewingImage.dataUrl} className="w-full h-full object-cover" alt="" />
                        )}
                        <div className="absolute top-1 right-1 bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold shadow-lg">当前</div>
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] px-1 rounded font-mono">V{(viewingImage.history?.length || 0) + 1}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="w-full md:w-96 p-8 flex flex-col gap-6 bg-white overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-serif italic text-2xl">资产控制</h3>
                    <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">ID: {viewingImage.id}</p>
                  </div>
                  <button 
                    onClick={() => setViewingImage(null)}
                    className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">网格位置</label>
                      <p className="text-xs font-bold">索引 #{viewingImage.index + 1}</p>
                    </div>
                    <div className="relative">
                      <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">生成提示词</label>
                      <textarea 
                        placeholder="输入生成提示词 (使用 @ 引用参考图)..."
                        value={viewingImage.prompt}
                        onChange={(e) => handlePromptChange(viewingImage.id, e.target.value)}
                        className="w-full h-32 bg-[#E4E3E0]/20 border-none outline-none p-3 text-[11px] font-mono resize-none rounded-xl placeholder:opacity-30 focus:ring-1 ring-[#141414]/10"
                      />
                      
                      <AnimatePresence>
                        {showMentions && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-0 w-full bg-white border border-[#141414] rounded-xl shadow-xl mb-2 overflow-hidden z-50 max-h-48 overflow-y-auto"
                          >
                            <div className="p-2 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono uppercase tracking-widest">
                              引用参考图
                            </div>
                            {[...refImages, ...editRefImages]
                              .filter(r => r.id.includes(mentionSearch))
                              .map(ref => (
                                <button 
                                  key={ref.id}
                                  onClick={() => insertMention(viewingImage.id, ref.id)}
                                  className="w-full flex items-center gap-3 p-2 hover:bg-[#141414]/5 text-left transition-colors border-b border-[#141414]/5 last:border-0"
                                >
                                  <img src={ref.dataUrl} className="w-8 h-8 rounded object-cover" alt="" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold truncate">@{ref.id}</p>
                                    <p className="text-[8px] opacity-40 truncate">参考图 ID: {ref.id}</p>
                                  </div>
                                </button>
                              ))}
                            {refImages.length === 0 && editRefImages.length === 0 && (
                              <div className="p-4 text-center text-[10px] opacity-40 italic">
                                暂无参考图，请先从主图选取
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono uppercase opacity-50">修改参考图</label>
                        <button 
                          onClick={() => editRefInputRef.current?.click()}
                          className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:underline"
                        >
                          上传图片
                        </button>
                      </div>
                      <input 
                        type="file" 
                        ref={editRefInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        multiple
                        onChange={handleEditRefUpload} 
                      />
                      
                      {editRefImages.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {editRefImages.map((img, idx) => (
                            <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-[#141414]/10 group">
                              <img src={img.dataUrl} className="w-full h-full object-cover" alt={`Ref ${idx}`} />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 font-mono truncate">
                                @{img.id}
                              </div>
                              <button 
                                onClick={() => setEditRefImages(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1 right-1 p-1 bg-white/90 backdrop-blur rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          ))}
                          <button 
                            onClick={() => editRefInputRef.current?.click()}
                            className="aspect-square rounded-lg border-2 border-dashed border-[#141414]/10 flex items-center justify-center opacity-40 hover:opacity-60 transition-opacity"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ) : (
                        <div 
                          onClick={() => editRefInputRef.current?.click()}
                          className="aspect-video rounded-xl border-2 border-dashed border-[#141414]/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#141414]/20 transition-colors opacity-40"
                        >
                          <Upload size={20} />
                          <span className="text-[10px] font-mono uppercase">点击上传参考图 (可多选)</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => modifyImage(false)}
                        disabled={isEditing}
                        className="flex-1 bg-[#141414] text-[#E4E3E0] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
                      >
                        {isEditing && selectionMode === 'none' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                        AI 修改全图
                      </button>
                      
                      {isSelectionConfirmed && (
                        <button 
                          onClick={() => modifyImage(true)}
                          disabled={isEditing}
                          className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
                        >
                          {isEditing && selectionMode !== 'none' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                          局部重绘
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-[#141414]/10">
                  <button 
                    onClick={() => {
                      toggleSelect(viewingImage.id);
                      setViewingImage(null);
                    }}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${viewingImage.selected ? 'bg-red-500 text-white' : 'bg-[#141414] text-[#E4E3E0]'}`}
                  >
                    {viewingImage.selected ? '取消选择资产' : '选择用于批量生成'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generation Progress Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#141414]/95 backdrop-blur-xl z-[100] flex items-center justify-center p-8"
          >
            <div className="max-w-md w-full text-center space-y-8">
              <div className="relative w-32 h-32 mx-auto">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="60"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    className="text-white/10"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="60"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    strokeDasharray={377}
                    strokeDashoffset={377 - (377 * generationProgress) / 100}
                    className="text-[#E4E3E0] transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#E4E3E0]">{generationProgress}%</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-serif italic text-[#E4E3E0]">正在批量生成...</h3>
                <p className="text-[10px] font-mono text-[#E4E3E0]/50 uppercase tracking-[0.2em]">正在处理 {library.filter(i => i.selected).length} 个资产</p>
              </div>

              <div className="flex justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <motion.div 
                    key={i}
                    animate={{ scaleY: [1, 2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
                    className="w-1 h-4 bg-[#E4E3E0]/30 rounded-full"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prefix Prompt Modal */}
      <AnimatePresence>
        {showPrefixPromptModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-[#141414] rounded-3xl max-w-2xl w-full shadow-2xl p-8 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-[#141414]/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#141414] rounded-full flex items-center justify-center text-[#E4E3E0]">
                    <Settings2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif italic">智能结合系统提示词</h2>
                    <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">配置 AI 结合逻辑</p>
                  </div>
                </div>
                <button onClick={() => setShowPrefixPromptModal(false)} className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-xs opacity-60 leading-relaxed">
                  此提示词将作为系统指令，指导 AI 如何将“运镜指令”与“原有描述”结合。
                </p>
                <textarea 
                  value={prefixCombineSystemPrompt}
                  onChange={(e) => setPrefixCombineSystemPrompt(e.target.value)}
                  className="w-full h-64 bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-4 text-sm font-mono outline-none focus:ring-1 ring-[#141414]/20 resize-none"
                  placeholder="输入系统提示词..."
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowPrefixPromptModal(false)}
                  className="flex-1 bg-[#141414] text-[#E4E3E0] py-3 rounded-xl font-bold text-sm hover:scale-[1.02] transition-transform"
                >
                  保存并关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model Configuration Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-[#141414] rounded-3xl max-w-4xl w-full shadow-2xl p-8 space-y-8 relative"
            >
              <div className="flex items-center justify-between border-b border-[#141414]/10 pb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#141414] rounded-full flex items-center justify-center text-[#E4E3E0]">
                    <Settings2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif italic">批量生成配置</h2>
                    <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">确认参数并开始生成</p>
                  </div>
                </div>
                <button onClick={() => setShowConfigModal(false)} className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Selected Items Summary */}
                <div className="space-y-3">
                  <label className="text-[10px] font-mono uppercase opacity-50 block">已选中项目 ({library.filter(i => i.selected).length})</label>
                  <div className="flex gap-3 flex-wrap p-1">
                    {library.filter(i => i.selected).map(item => (
                      <div key={item.id} className="relative group hover:z-50">
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-[#141414]/10 shadow-sm transition-transform group-hover:scale-105">
                          <img src={item.dataUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute -top-1 -right-1 bg-[#141414] text-[#E4E3E0] text-[8px] font-mono w-4 h-4 rounded-full flex items-center justify-center shadow-lg z-10">
                          {item.index + 1}
                        </div>
                        
                        {/* Prompt Preview Tooltip - Enhanced visibility and positioning */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 p-3 bg-[#141414] text-[#E4E3E0] text-[11px] rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-[100] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10 backdrop-blur-xl">
                          <div className="flex items-center gap-2 mb-2 border-b border-white/20 pb-1.5">
                            <Wand2 size={12} className="text-emerald-400" />
                            <p className="font-bold uppercase tracking-widest text-[9px]">视频提示词预览</p>
                          </div>
                          <p className="italic opacity-90 leading-relaxed font-medium">
                            {item.prompt || "默认高清电影感提示词"}
                          </p>
                          {/* Triangle Arrow */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-b-[#141414]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Model Selection */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">视频模型</label>
                      <select 
                        value={selectedVariant}
                        onChange={(e) => setSelectedVariant(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-3 text-sm font-bold outline-none focus:ring-1 ring-[#141414]/20"
                      >
                        {MODELS.find(m => m.id === 'vidu')?.variants.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">生成时长 ({genDuration}s)</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="range" 
                          min="1" 
                          max="16" 
                          step="1"
                          value={genDuration}
                          onChange={(e) => setGenDuration(parseInt(e.target.value))}
                          className="flex-1 accent-[#141414]"
                        />
                        <span className="text-sm font-mono font-bold w-8 text-right">{genDuration}s</span>
                      </div>
                      <p className="text-[9px] opacity-40 mt-1 italic">范围: 1s - 16s (默认 3s)</p>
                    </div>
                  </div>

                  {/* Resolution & Other */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">输出分辨率</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['540p', '720p', '1080p'].map(res => (
                          <button 
                            key={res}
                            onClick={() => setGenResolution(res)}
                            className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${genResolution === res ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414]/10 hover:border-[#141414]/30'}`}
                          >
                            {res}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Vidu Specific Options */}
                    <div className="pt-4 border-t border-[#141414]/5 space-y-3">
                      <label className="text-[10px] font-mono uppercase opacity-50 mb-1 block">Vidu 高级选项</label>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {selectedVariant.includes('q3') && (
                          <button 
                            onClick={() => setOffPeak(!offPeak)}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${offPeak ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-[#141414]/10 opacity-60'}`}
                          >
                            <div className="flex items-center gap-2">
                              <Zap size={14} className={offPeak ? 'text-emerald-500' : ''} />
                              <span className="text-[10px] font-bold uppercase">错峰模式</span>
                            </div>
                            <div className={`w-6 h-3 rounded-full relative transition-colors ${offPeak ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                              <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${offPeak ? 'right-0.5' : 'left-0.5'}`} />
                            </div>
                          </button>
                        )}

                        <button 
                          onClick={() => setIsRec(!isRec)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${isRec ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-[#141414]/10 opacity-60'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className={isRec ? 'text-blue-500' : ''} />
                            <span className="text-[10px] font-bold uppercase">推荐提示词</span>
                          </div>
                          <div className={`w-6 h-3 rounded-full relative transition-colors ${isRec ? 'bg-blue-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${isRec ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        </button>

                        <button 
                          onClick={() => setBgm(!bgm)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${bgm ? 'bg-purple-50 border-purple-200 text-purple-700' : 'border-[#141414]/10 opacity-60'}`}
                        >
                          <div className="flex items-center gap-2">
                            <PlusCircle size={14} className={bgm ? 'text-purple-500' : ''} />
                            <span className="text-[10px] font-bold uppercase">背景音乐</span>
                          </div>
                          <div className={`w-6 h-3 rounded-full relative transition-colors ${bgm ? 'bg-purple-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${bgm ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        </button>

                        <button 
                          onClick={() => setAudio(!audio)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${audio ? 'bg-orange-50 border-orange-200 text-orange-700' : 'border-[#141414]/10 opacity-60'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Play size={14} className={audio ? 'text-orange-500' : ''} />
                            <span className="text-[10px] font-bold uppercase">音视频直出</span>
                          </div>
                          <div className={`w-6 h-3 rounded-full relative transition-colors ${audio ? 'bg-orange-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${audio ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        </button>
                      </div>

                      <div className="flex items-center gap-4 pt-2">
                        <button 
                          onClick={() => setWatermark(!watermark)}
                          className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${watermark ? 'bg-gray-100 border-gray-300 text-gray-800' : 'border-[#141414]/10 opacity-60'}`}
                        >
                          <div className="flex items-center gap-2">
                            <ImageIcon size={14} className={watermark ? 'text-gray-600' : ''} />
                            <span className="text-[10px] font-bold uppercase">添加水印</span>
                          </div>
                          <div className={`w-6 h-3 rounded-full relative transition-colors ${watermark ? 'bg-gray-600' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${watermark ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        </button>

                        {watermark && (
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-[9px] font-mono uppercase opacity-50">位置:</span>
                            <select 
                              value={wmPosition}
                              onChange={(e) => setWmPosition(parseInt(e.target.value))}
                              className="flex-1 bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-lg p-1.5 text-[10px] font-bold outline-none"
                            >
                              <option value={1}>左上</option>
                              <option value={2}>右上</option>
                              <option value={3}>右下</option>
                              <option value={4}>左下</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-[#141414]/10 flex gap-4">
                <button 
                  onClick={() => setShowConfigModal(false)}
                  className="flex-1 py-4 rounded-2xl border border-[#141414]/10 font-bold text-sm hover:bg-[#141414]/5 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={startGeneration}
                  className="flex-[2] bg-[#141414] text-[#E4E3E0] py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                >
                  <Play size={18} fill="currentColor" />
                  确认并开始批量生成
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cropping Modal */}
      <AnimatePresence>
        {croppingImage && (
          <div className="fixed inset-0 bg-black/90 z-[200] flex flex-col items-center justify-center p-8">
            <div className="relative w-full max-w-4xl aspect-video bg-[#141414] rounded-2xl overflow-hidden">
              <Cropper
                image={croppingImage.originalUrl}
                crop={crop}
                zoom={zoom}
                aspect={(viewingImage?.gridMode || '16:9') === '16:9' ? 16 / 9 : 9 / 16}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="mt-8 flex items-center gap-6">
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-64 accent-white"
              />
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-10 h-5 rounded-full transition-colors relative ${enableHD ? 'bg-emerald-500' : 'bg-white/20'}`}>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={enableHD}
                      onChange={(e) => setEnableHD(e.target.checked)}
                    />
                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${enableHD ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">
                    4K 高清重绘
                  </span>
                </label>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setCroppingImage(null)}
                    className="px-8 py-3 rounded-xl border border-white/20 text-white font-bold text-sm hover:bg-white/5"
                  >
                    取消
                  </button>
                  <button 
                    onClick={applyCrop}
                    disabled={isHDProcessing}
                    className="px-8 py-3 rounded-xl bg-white text-[#141414] font-bold text-sm hover:scale-105 transition-transform flex items-center gap-2"
                  >
                    {isHDProcessing ? <Loader2 size={14} className="animate-spin" /> : null}
                    确认裁切 {isHDProcessing ? '(正在重绘...)' : ''}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Polishing Config Modal */}
      <AnimatePresence>
        {showPolishingConfigModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-[#141414] rounded-3xl max-w-5xl w-full shadow-2xl flex flex-col h-[80vh] overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-[#141414]/10 p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#141414] rounded-full flex items-center justify-center text-[#E4E3E0]">
                    <Paintbrush size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif italic">高级润色模式配置</h2>
                    <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">自定义系统提示词与历史记录</p>
                  </div>
                </div>
                <button onClick={() => setShowPolishingConfigModal(false)} className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Left Side: Modes & Editor */}
                <div className="w-2/3 border-r border-[#141414]/10 flex flex-col">
                  <div className="p-4 border-b border-[#141414]/10 flex gap-2 overflow-x-auto scrollbar-hide">
                    {polishingModes.map(mode => (
                      <button 
                        key={mode.id}
                        onClick={() => setEditingPolishingModeId(mode.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${editingPolishingModeId === mode.id ? 'bg-[#141414] text-[#E4E3E0]' : 'bg-[#141414]/5 hover:bg-[#141414]/10'}`}
                      >
                        {mode.name}
                      </button>
                    ))}
                    <button 
                      onClick={addCustomPolishingMode}
                      className="px-4 py-2 rounded-xl text-xs font-bold border border-dashed border-[#141414]/20 hover:bg-[#141414]/5 flex items-center gap-2"
                    >
                      <Plus size={14} />
                      增加选项
                    </button>
                  </div>

                  <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                    {editingPolishingModeId && (
                      <>
                        <div>
                          <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">模式名称</label>
                          <input 
                            type="text"
                            value={polishingModes.find(m => m.id === editingPolishingModeId)?.name || ''}
                            onChange={(e) => {
                              const newName = e.target.value;
                              setPolishingModes(prev => prev.map(m => m.id === editingPolishingModeId ? { ...m, name: newName } : m));
                            }}
                            className="w-full bg-[#E4E3E0]/30 border border-[#141414]/10 rounded-xl p-3 text-sm font-bold outline-none focus:ring-1 ring-[#141414]/20"
                          />
                        </div>
                        <div className="flex-1 flex flex-col">
                          <label className="text-[10px] font-mono uppercase opacity-50 mb-2 block">系统提示词 (System Prompt)</label>
                          <textarea 
                            value={polishingModes.find(m => m.id === editingPolishingModeId)?.systemPrompt || ''}
                            onChange={(e) => {
                              const newPrompt = e.target.value;
                              setPolishingModes(prev => prev.map(m => m.id === editingPolishingModeId ? { ...m, systemPrompt: newPrompt } : m));
                            }}
                            className="flex-1 w-full bg-[#E4E3E0]/10 border border-[#141414]/10 rounded-2xl p-4 text-sm font-mono resize-none outline-none focus:ring-1 ring-[#141414]/20 min-h-[300px]"
                            placeholder="输入润色专用的系统指令..."
                          />
                        </div>
                        <div className="flex justify-end">
                          <button 
                            onClick={() => {
                              const mode = polishingModes.find(m => m.id === editingPolishingModeId);
                              if (mode) savePolishingMode(mode.id, mode.systemPrompt);
                            }}
                            className="bg-[#141414] text-[#E4E3E0] px-8 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:scale-105 transition-transform"
                          >
                            <Save size={18} />
                            保存配置
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Side: History */}
                <div className="w-1/3 bg-[#F8F7F4] flex flex-col">
                  <div className="p-6 border-b border-[#141414]/10 flex items-center gap-2">
                    <History size={18} className="opacity-50" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">历史版本</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {polishingModes.find(m => m.id === editingPolishingModeId)?.history.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 gap-2">
                        <Clock size={32} />
                        <p className="text-[10px] font-mono uppercase">暂无历史记录</p>
                      </div>
                    ) : (
                      polishingModes.find(m => m.id === editingPolishingModeId)?.history.map((h, idx) => (
                        <div key={idx} className="bg-white border border-[#141414]/5 p-4 rounded-xl space-y-2 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono opacity-40">{h.timestamp}</span>
                            <button 
                              onClick={() => {
                                setPolishingModes(prev => prev.map(m => m.id === editingPolishingModeId ? { ...m, systemPrompt: h.prompt } : m));
                              }}
                              className="text-[10px] font-bold text-[#141414] hover:underline"
                            >
                              恢复此版本
                            </button>
                          </div>
                          <p className="text-[11px] font-mono line-clamp-3 opacity-60 italic">"{h.prompt}"</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto p-8 border-t border-[#141414]/10 flex justify-between items-center opacity-40">
        <p className="text-[10px] font-mono uppercase">© 2026 批量视频生成系统</p>
        <div className="flex gap-6">
          <span className="text-[10px] font-mono uppercase">状态: 在线</span>
          <span className="text-[10px] font-mono uppercase">延迟: 24ms</span>
        </div>
      </footer>
    </div>
  );
}
