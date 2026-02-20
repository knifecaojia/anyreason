'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Upload, Check } from 'lucide-react';

interface ImageAttachment {
  id: string;
  url: string;
  index: number;
  isSelected: boolean;
}

interface MentionPopupProps {
  isOpen: boolean;
  position: { top: number; left: number } | null;
  images: ImageAttachment[];
  onSelect: (index: number) => void;
  onClose: () => void;
  onUpload: (files: FileList | null) => void;
}

export const MentionPopup = ({
  isOpen,
  position,
  images,
  onSelect,
  onClose,
  onUpload,
}: MentionPopupProps) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  if (!isOpen || !position) return null;

  const selectedCount = images.filter((img) => img.isSelected).length;

  return (
    <>
      {/* 半透明遮罩 */}
      <div className="fixed inset-0 bg-black/10 z-40" onClick={onClose} />
      
      {/* 悬浮框主体 */}
      <div
        ref={popupRef}
        className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{
          top: position.top + 8,
          left: position.left,
          minWidth: '360px',
          maxWidth: '480px',
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            选择参考图
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 图片网格 */}
        <div className="p-4">
          <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => onSelect(img.index)}
                className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                  img.isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
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
                  @{img.index}
                </div>

                {/* Hover 遮罩 */}
                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors" />
              </button>
            ))}

            {/* 上传按钮 */}
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
                  onUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </button>
          </div>
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>已引用 {selectedCount} 张</span>
            <span>共 {images.length} 张</span>
          </div>
        </div>
      </div>
    </>
  );
};
