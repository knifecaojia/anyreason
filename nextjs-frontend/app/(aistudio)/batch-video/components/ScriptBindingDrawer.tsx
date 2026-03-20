"use client";

import Image from "next/image";
import { UploadedSource, ExcelCellMapping } from "../types";

interface ScriptBindingDrawerProps {
  open: boolean;
  source: UploadedSource | null;
  selectedExcelColumn: string;
  excelMappings: ExcelCellMapping[];
  editingCellId: string | null;
  onClose: () => void;
  onToggleEdit: (cellId: string) => void;
  onEditCell: (cellId: string, rawText: string) => void;
  onSelectCell: (cell: ExcelCellMapping) => void;
}

export function ScriptBindingDrawer({
  open,
  source,
  selectedExcelColumn,
  excelMappings,
  editingCellId,
  onClose,
  onToggleEdit,
  onEditCell,
  onSelectCell,
}: ScriptBindingDrawerProps) {
  if (!open || !source) {
    return null;
  }

  const hasColumn = selectedExcelColumn.length > 0;
  const hasMappings = excelMappings.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-label="关闭绑定面板"
      />

      {/* Drawer */}
      <div className="w-[420px] max-w-[90vw] h-full bg-background border-l border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">绑定剧本</h3>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full border border-border text-textMuted hover:text-textMain hover:border-primary"
              aria-label="关闭"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {/* Source context */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/10 p-3">
            <div className="relative w-20 h-14 rounded-md overflow-hidden bg-secondary/30 shrink-0">
              <Image
                src={source.preview}
                alt={source.originalFilename ?? "待处理图片"}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="text-xs text-textMain truncate">
                {source.file?.name ?? source.originalFilename ?? "未命名图片"}
              </div>
              <div className="text-[11px] text-textMuted">
                模式：{source.mode === "16:9" ? "16:9 九宫格" : "9:16 四宫格"}
              </div>
              <div className="text-[11px] text-textMuted">
                已绑定：{source.linkedCellLabel ?? "未绑定"}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!hasColumn ? (
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-xs text-textMuted">
              请先在「剧本数据」页上传 Excel 并选择目标列，然后回到这里绑定剧本。
            </div>
          ) : !hasMappings ? (
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-xs text-textMuted">
              当前目标列「{selectedExcelColumn}」暂无可用内容。
            </div>
          ) : (
            <>
              <div className="text-xs text-textMuted">
                目标列：{selectedExcelColumn}（共 {excelMappings.length} 条）
              </div>

              <div className="space-y-2">
                {excelMappings.map((cell) => (
                  <div
                    key={cell.id}
                    className="w-full text-left rounded-lg border border-border bg-background p-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-textMuted">第 {cell.rowIndex} 行</span>
                      <div className="flex items-center gap-2">
                        {cell.edited && <span className="text-[11px] text-amber-600">已编辑</span>}
                        <span className={`text-xs ${cell.lines.length === 9 ? "text-green-600" : "text-red-500"}`}>
                          {cell.lines.length} / 9 行
                        </span>
                      </div>
                    </div>

                    {editingCellId === cell.id ? (
                      <textarea
                        value={cell.rawText}
                        onChange={(e) => onEditCell(cell.id, e.target.value)}
                        className="mt-2 w-full min-h-[140px] rounded-md border border-border bg-background px-3 py-2 text-xs text-textMain whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-textMain">{cell.rawText}</pre>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectCell(cell)}
                        disabled={cell.lines.length !== 9}
                        className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        绑定到当前图片
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleEdit(cell.id)}
                        className="px-3 py-1.5 text-xs rounded-md bg-secondary hover:bg-secondary/80 text-textMain"
                      >
                        {editingCellId === cell.id ? "完成编辑" : "编辑内容"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border text-xs text-textMuted">
          如需批量整理 Excel 内容，请前往「剧本数据」页。
        </div>
      </div>
    </div>
  );
}
