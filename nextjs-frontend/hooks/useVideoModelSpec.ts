"use client";

import { useEffect, useState } from "react";
import type { ModelCapabilities } from "@/lib/aistudio/types";

export type VideoMode = "text2video" | "image2video" | "start_end" | "reference" | "multi_frame";

export interface VideoModelSpec {
  manufacturer: string;
  code: string;
  display_name: string;
  modes: VideoMode[];
  durations: number[];
  aspect_ratios: string[];
  resolutions?: string[] | null;
  max_ref_images: number;
  max_frames: number;
  supports_enhance: boolean;
  style_options?: string[] | null;
  model_capabilities: ModelCapabilities;
}

let _cache: VideoModelSpec[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchVideoModelSpecs(): Promise<VideoModelSpec[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  const resp = await fetch("/api/ai/video-models");
  if (!resp.ok) throw new Error(`Failed to fetch video models: ${resp.status}`);
  const json = await resp.json();
  const data = (json?.data ?? json) as VideoModelSpec[];
  _cache = data;
  _cacheTime = now;
  return data;
}

/**
 * Hook to fetch and cache video model specs from the hardcoded registry.
 * Returns the full list and a lookup helper.
 */
export function useVideoModelSpecs() {
  const [specs, setSpecs] = useState<VideoModelSpec[]>(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVideoModelSpecs()
      .then((data) => {
        if (!cancelled) {
          setSpecs(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const getSpec = (manufacturer: string, code: string): VideoModelSpec | undefined =>
    specs.find((s) => s.manufacturer === manufacturer && s.code === code);

  const getSpecByCode = (code: string): VideoModelSpec | undefined =>
    specs.find((s) => s.code === code);

  return { specs, loading, error, getSpec, getSpecByCode };
}
