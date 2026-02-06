"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CropResult = { dataBase64: string; contentType: string };

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string") return reject(new Error("转换失败"));
      const idx = r.indexOf(",");
      if (idx < 0) return reject(new Error("转换失败"));
      resolve(r.slice(idx + 1));
    };
    reader.onerror = () => reject(new Error("转换失败"));
    reader.readAsDataURL(blob);
  });
}

async function loadImageFromFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("图片加载失败"));
      i.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToCompressedJpegBase64(canvas: HTMLCanvasElement, maxBytes: number): Promise<CropResult> {
  const contentType = "image/jpeg";
  let quality = 0.92;
  let blob: Blob | null = null;

  while (quality >= 0.4) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, contentType, quality));
    if (!blob) break;
    if (blob.size <= maxBytes) return { dataBase64: await blobToBase64(blob), contentType };
    quality -= 0.06;
  }

  const sizes = [224, 192, 160, 128];
  for (const s of sizes) {
    const c = document.createElement("canvas");
    c.width = s;
    c.height = s;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("压缩失败");
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, s, s);
    quality = 0.9;
    while (quality >= 0.35) {
      blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, contentType, quality));
      if (!blob) break;
      if (blob.size <= maxBytes) return { dataBase64: await blobToBase64(blob), contentType };
      quality -= 0.08;
    }
  }

  throw new Error("图片过大，压缩后仍超过 100KB");
}

export function AvatarCropDialog({
  open,
  file,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean;
  file: File | null;
  title?: string;
  onClose: () => void;
  onConfirm: (result: CropResult) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxSize = 320;

  useEffect(() => {
    if (!open) return;
    if (!file) return;
    setError(null);
    setLoading(true);
    setImg(null);
    void (async () => {
      try {
        const loaded = await loadImageFromFile(file);
        setImg(loaded);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "图片加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, file]);

  const draw = useMemo(() => {
    return () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0b0f1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!img) return;

      const scale = zoom * Math.max(boxSize / img.width, boxSize / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const cx = boxSize / 2 + offsetX;
      const cy = boxSize / 2 + offsetY;
      const dx = cx - dw / 2;
      const dy = cy - dh / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    };
  }, [img, zoom, offsetX, offsetY]);

  useEffect(() => {
    if (!open) return;
    draw();
  }, [open, draw]);

  const confirm = async () => {
    if (!img) return;
    setLoading(true);
    setError(null);
    try {
      const out = document.createElement("canvas");
      out.width = 256;
      out.height = 256;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("裁剪失败");

      const scale = zoom * Math.max(boxSize / img.width, boxSize / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const cx = boxSize / 2 + offsetX;
      const cy = boxSize / 2 + offsetY;
      const dx = cx - dw / 2;
      const dy = cy - dh / 2;

      const sx = (0 - dx) / scale;
      const sy = (0 - dy) / scale;
      const sw = boxSize / scale;
      const sh = boxSize / scale;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);

      const result = await canvasToCompressedJpegBase64(out, 100 * 1024);
      onConfirm(result);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onMouseMove={(e) => {
        if (!dragging || !dragRef.current) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        setOffsetX(dragRef.current.ox + dx);
        setOffsetY(dragRef.current.oy + dy);
      }}
      onMouseUp={() => {
        setDragging(false);
        dragRef.current = null;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-surface border border-border shadow-2xl p-6">
        <div className="text-lg font-bold text-textMain">{title || "裁剪头像"}</div>
        <div className="text-xs text-textMuted mt-1">拖动调整位置，使用缩放控制大小。将自动压缩至 100KB 内。</div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-center">
          <div
            className="relative"
            style={{ width: boxSize, height: boxSize }}
            onMouseDown={(e) => {
              if (!img) return;
              setDragging(true);
              dragRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
            }}
          >
            <canvas ref={canvasRef} width={boxSize} height={boxSize} className="rounded-xl border border-border" />
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-black/50" />
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40"
                style={{
                  width: boxSize * 0.72,
                  height: boxSize * 0.72,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-textMain">缩放</div>
            <div className="text-xs text-textMuted">{Math.round(zoom * 100)}%</div>
          </div>
          <input
            type="range"
            min={0.9}
            max={2.6}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(clamp(Number(e.target.value), 0.9, 2.6))}
            className="w-full"
            disabled={loading || !img}
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 bg-surfaceHighlight border border-border hover:border-textMuted rounded-lg text-sm font-medium transition-all text-textMain disabled:opacity-50"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
            onClick={() => void confirm()}
            disabled={loading || !img}
          >
            {loading ? "处理中..." : "使用该头像"}
          </button>
        </div>
      </div>
    </div>
  );
}

