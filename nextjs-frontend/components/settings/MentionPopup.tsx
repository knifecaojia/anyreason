'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Upload, Check } from 'lucide-react';

interface ImageAttachment {
  id: string;
  url: string;
  index: number;
  isSelected: boolean;
  title?: string;
}

export type MentionPopupTab = {
  id: string;
  label: string;
  images: ImageAttachment[];
  onSelect?: (index: number, image: ImageAttachment) => void;
  onUpload?: (files: FileList | null) => void;
  allowUpload?: boolean;
  badgeLabel?: string;
  emptyText?: string;
  loading?: boolean;
};

interface MentionPopupProps {
  isOpen: boolean;
  position: { top: number; left: number } | null;
  images: ImageAttachment[];
  onSelect: (index: number) => void;
  onClose: () => void;
  onUpload: (files: FileList | null) => void;
  tabs?: MentionPopupTab[];
}

export const MentionPopup = ({
  isOpen,
  position,
  images,
  onSelect,
  onClose,
  onUpload,
  tabs,
}: MentionPopupProps) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedTabs = tabs && tabs.length > 0 ? tabs : [
    { id: 'session', label: '参考图', images, onSelect: (index: number) => onSelect(index), onUpload, allowUpload: true },
  ];
  const tabsKey = resolvedTabs.map((tab) => tab.id).join('|');
  const [activeTabId, setActiveTabId] = useState<string>(resolvedTabs[0]?.id || 'session');
  const [searchTerm, setSearchTerm] = useState('');

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTabId(resolvedTabs[0]?.id || 'session');
    setSearchTerm('');
  }, [isOpen, tabsKey]);

  if (!isOpen || !position) return null;

  const activeTab = resolvedTabs.find((tab) => tab.id === activeTabId) || resolvedTabs[0];
  const filteredImages = activeTab.images.filter((img) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    const hay = `${img.title || ''} ${img.id}`.toLowerCase();
    return hay.includes(query);
  });
  const selectedCount = activeTab.images.filter((img) => img.isSelected).length;
  const handleSelect = (img: ImageAttachment) => {
    if (activeTab.onSelect) {
      activeTab.onSelect(img.index, img);
      return;
    }
    onSelect(img.index);
  };
  const handleUpload = (files: FileList | null) => {
    if (activeTab.onUpload) {
      activeTab.onUpload(files);
      return;
    }
    onUpload(files);
  };

  return (
    <>
      {/* 半透明遮罩 */}
      <div className="fixed inset-0 bg-black/10 z-40" onClick={onClose} />
      
      {/* 悬浮框主体 */}
      <div
        ref={popupRef}
        className="fixed z-50 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-gray-200 dark:border-zinc-700 overflow-hidden"
        style={{
          top: position.top + 8,
          left: position.left,
          minWidth: '360px',
          maxWidth: '480px',
        }}
      >
        {/* 头部 */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-100">选择参考图</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
          </div>
          {resolvedTabs.length > 1 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {resolvedTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                    tab.id === activeTabId
                      ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索"
              className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 outline-none focus:border-blue-400 dark:focus:border-blue-600"
            />
          </div>
        </div>

        {/* 图片网格 */}
        <div className="p-4 bg-white dark:bg-zinc-900">
          <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto">
            {activeTab.loading && (
              <div className="col-span-4 text-center text-xs text-gray-400 py-6">加载中...</div>
            )}
            {!activeTab.loading && filteredImages.length === 0 && (
              <div className="col-span-4 text-center text-xs text-gray-400 py-6">
                {activeTab.emptyText || '暂无内容'}
              </div>
            )}
            {!activeTab.loading && filteredImages.map((img) => (
              <button
                key={img.id}
                onClick={() => handleSelect(img)}
                className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                  img.isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600'
                }`}
              >
                {/* 图片 */}
                <img
                  src={img.url}
                  alt={`@${img.index}`}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />

                {/* 已选中标记 */}
                {img.isSelected && (
                  <div className="absolute top-1 left-1 bg-blue-500 text-white rounded-full p-0.5 shadow-lg">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}

                {/* 序号标签 */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs py-1 text-center font-mono">
                  {activeTab.badgeLabel ? activeTab.badgeLabel : `@${img.index}`}
                </div>

                {/* Hover 遮罩 */}
                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors" />
              </button>
            ))}

            {(activeTab.allowUpload ?? false) && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 flex flex-col items-center justify-center gap-1 transition-colors group"
              >
                <Upload
                  size={20}
                  className="text-gray-400 group-hover:text-blue-500 transition-colors"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-blue-500">
                  上传
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleUpload(e.target.files);
                    e.target.value = '';
                  }}
                />
              </button>
            )}
          </div>
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>已引用 {selectedCount} 张</span>
            <span>共 {activeTab.images.length} 张</span>
          </div>
        </div>
      </div>
    </>
  );
};
