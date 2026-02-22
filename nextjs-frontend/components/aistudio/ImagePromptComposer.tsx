"use client";

import { useRef } from "react";
import { ArrowUp, Check, Plus, X } from "lucide-react";

import { MentionPopup, type MentionPopupTab } from "@/components/settings/MentionPopup";

type ImageAttachment = {
  id: string;
  url: string;
  index: number;
  isSelected: boolean;
};

type ImagePromptComposerProps = {
  prompt: string;
  onPromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onPromptKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  promptRef?: React.RefObject<HTMLTextAreaElement | null>;
  images: ImageAttachment[];
  mentionTabs?: MentionPopupTab[];
  mentionPopupOpen: boolean;
  mentionPosition: { top: number; left: number } | null;
  onMentionSelect: (index: number) => void;
  onCloseMention: () => void;
  onUpload: (files: FileList | null) => void;
  onPreview: (url: string, title: string) => void;
  onInsertMention: (index: number) => void;
  onRemoveAttachment: (id: string) => void;
  disabled?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  placeholder: string;
  generationLabel: string;
  modelLabel: string;
  attachmentCountLabel: string;
  leftControls?: React.ReactNode;
};

export function ImagePromptComposer({
  prompt,
  onPromptChange,
  onPromptKeyDown,
  promptRef,
  images,
  mentionTabs,
  mentionPopupOpen,
  mentionPosition,
  onMentionSelect,
  onCloseMention,
  onUpload,
  onPreview,
  onInsertMention,
  onRemoveAttachment,
  disabled,
  submitDisabled,
  onSubmit,
  placeholder,
  generationLabel,
  modelLabel,
  attachmentCountLabel,
  leftControls,
}: ImagePromptComposerProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-border bg-background/40 p-0 overflow-hidden relative">
      <div className="flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {images.map((img) => (
              <div
                key={img.id}
                className={`relative group h-14 w-14 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                  img.isSelected ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700 hover:border-blue-300"
                }`}
                onClick={() => onPreview(img.url, `参考图 @${img.index}`)}
                title="点击放大预览"
              >
                <img src={img.url} alt="ref" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] py-0.5 text-center font-mono hover:bg-black/80 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertMention(img.index);
                  }}
                  disabled={disabled}
                  aria-label={`插入 @${img.index}`}
                >
                  @{img.index}
                </button>
                {img.isSelected && (
                  <div className="absolute top-1 left-1 bg-blue-500 text-white rounded-full p-0.5 shadow-lg">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors" />
                <button
                  type="button"
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveAttachment(img.id);
                  }}
                  disabled={disabled}
                  title="移除"
                >
                  <X size={10} />
                </button>
              </div>
            ))}

            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                const files = e.target.files;
                onUpload(files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="h-14 w-14 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 flex items-center justify-center cursor-pointer transition-colors group shrink-0"
              onClick={() => uploadInputRef.current?.click()}
              disabled={disabled}
              aria-label="上传参考图"
            >
              <Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
            </button>
          </div>
          <div className="text-[11px] text-textMuted">参考图最多 14 张，点击缩略图可插入对应的 @ 序号；也可在输入框中键入 @ 选择。</div>
        </div>

        <div className="p-4 relative">
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={onPromptChange}
            onKeyDown={onPromptKeyDown}
            className="w-full bg-transparent outline-none text-sm text-textMain placeholder:text-textMuted resize-none min-h-[80px]"
            placeholder={placeholder}
            disabled={disabled}
          />

          <MentionPopup
            isOpen={mentionPopupOpen}
            position={mentionPosition || { top: 0, left: 0 }}
            images={images}
            onSelect={onMentionSelect}
            onClose={onCloseMention}
            onUpload={onUpload}
            tabs={mentionTabs}
          />
        </div>

        <div className="px-4 pb-4 flex items-center justify-end gap-3 border-t border-border pt-3 mt-2">
          <button
            type="button"
            className="h-10 w-10 rounded-full bg-surfaceHighlight hover:bg-surface border border-border text-textMain flex items-center justify-center transition-colors disabled:opacity-60"
            onClick={() => uploadInputRef.current?.click()}
            disabled={disabled}
            aria-label="上传参考图"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="h-10 w-10 rounded-full bg-primary hover:bg-blue-600 disabled:opacity-60 text-white flex items-center justify-center transition-colors"
            disabled={submitDisabled}
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
