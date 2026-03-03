'use client';

/**
 * useAIModelList — fetches available AI model configs by category (text/image/video)
 * from the backend admin API.
 *
 * Only returns models that are both **enabled** and **have an API key configured**.
 * Persists the user's last selected model per category in localStorage.
 * If the node has no modelConfigId set, auto-selects the cached choice or the first model.
 */

import { useEffect, useState, useCallback } from 'react';
import type { AICategory, AIModelConfig, AIModelBinding } from '@/components/actions/ai-model-actions';
import type { ModelCapabilities, ManufacturerWithModels } from '@/lib/aistudio/types';

export interface ModelOption {
  configId: string;
  displayName: string;
  manufacturer: string;
  model: string;
  capabilities?: ModelCapabilities;
}

export interface UseAIModelListResult {
  models: ModelOption[];
  loading: boolean;
  /** The currently bound model config id for this binding key */
  currentConfigId: string | null;
  /** The effective selected model config id (from node data, localStorage, or first available) */
  selectedConfigId: string | null;
  /** Call this when user picks a model — persists choice to localStorage */
  selectModel: (configId: string) => void;
}

// ===== localStorage helpers =====

const LS_PREFIX = 'canvas_model_';

function getCachedModelId(category: string): string | null {
  try { return localStorage.getItem(`${LS_PREFIX}${category}`) ?? null; } catch { return null; }
}

function setCachedModelId(category: string, configId: string): void {
  try { localStorage.setItem(`${LS_PREFIX}${category}`, configId); } catch { /* ignore */ }
}

// ===== In-memory fetch cache =====

const fetchCache = new Map<string, { models: ModelOption[]; bindings: AIModelBinding[] }>();
const capsCache = new Map<string, Map<string, ModelCapabilities>>();

export function useAIModelList(
  category: AICategory,
  bindingKey?: string,
  nodeModelConfigId?: string,
): UseAIModelListResult {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [bindings, setBindings] = useState<AIModelBinding[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = fetchCache.get(category);
    if (cached) {
      setModels(cached.models);
      setBindings(cached.bindings);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/ai/admin/model-configs?category=${category}`).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/ai/admin/bindings?category=${category}`).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/ai/catalog/models?category=${category}`).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([configsJson, bindingsJson, catalogJson]) => {
      if (cancelled) return;

      // Build capabilities lookup from catalog: "manufacturer/model" → caps
      const capsMap = new Map<string, ModelCapabilities>();
      const mfrs = (catalogJson?.data ?? []) as ManufacturerWithModels[];
      for (const mfr of mfrs) {
        for (const m of mfr.models ?? []) {
          if (m.model_capabilities) capsMap.set(`${mfr.code}/${m.code}`, m.model_capabilities);
        }
      }
      capsCache.set(category, capsMap);

      // Only keep models that are enabled AND have an API key
      // Deduplicate by manufacturer+model, keeping the first (highest sort_order) entry
      const configs = ((configsJson?.data ?? []) as AIModelConfig[])
        .filter((c) => c.enabled && c.has_api_key)
        .sort((a, b) => a.sort_order - b.sort_order);
      const seen = new Set<string>();
      const opts: ModelOption[] = [];
      for (const c of configs) {
        const key = `${c.manufacturer}/${c.model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        opts.push({
          configId: c.id,
          displayName: key,
          manufacturer: c.manufacturer,
          model: c.model,
          capabilities: capsMap.get(key) ?? undefined,
        });
      }

      const b = (bindingsJson?.data ?? []) as AIModelBinding[];

      fetchCache.set(category, { models: opts, bindings: b });
      setTimeout(() => { fetchCache.delete(category); capsCache.delete(category); }, 60_000);

      setModels(opts);
      setBindings(b);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [category]);

  // Resolve current binding → config id
  const binding = bindingKey ? bindings.find((b) => b.key === bindingKey) : undefined;
  const currentConfigId = binding?.ai_model_config_id ?? null;

  // Determine effective selected model:
  // 1. Node's explicit modelConfigId (user already picked)
  // 2. localStorage cached choice for this category
  // 3. First available model
  const resolveSelected = (): string | null => {
    // If node already has a selection and it exists in the list, use it
    if (nodeModelConfigId && models.some((m) => m.configId === nodeModelConfigId)) {
      return nodeModelConfigId;
    }
    // Try localStorage
    const lsCached = getCachedModelId(category);
    if (lsCached && models.some((m) => m.configId === lsCached)) {
      return lsCached;
    }
    // Default to first
    return models.length > 0 ? models[0].configId : null;
  };

  const selectedConfigId = resolveSelected();

  const selectModel = useCallback((configId: string) => {
    setCachedModelId(category, configId);
  }, [category]);

  return { models, loading, currentConfigId, selectedConfigId, selectModel };
}
