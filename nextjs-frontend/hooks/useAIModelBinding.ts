'use client';

/**
 * useAIModelBinding — resolves a binding key (e.g. 'text-default') to
 * the actual AI model display name (e.g. 'deepseek/deepseek-chat').
 *
 * Fetches AIModelBinding + AIModelConfig from the admin API and caches
 * the result per category to avoid redundant requests.
 */

import { useEffect, useState } from 'react';
import type { AIModelBinding, AIModelConfig, AICategory } from '@/components/actions/ai-model-actions';

// Simple in-memory cache shared across all hook instances
const bindingCache = new Map<string, { bindings: AIModelBinding[]; configs: AIModelConfig[] }>();

async function fetchBindingsAndConfigs(category: AICategory): Promise<{
  bindings: AIModelBinding[];
  configs: AIModelConfig[];
}> {
  const cached = bindingCache.get(category);
  if (cached) return cached;

  try {
    const [bindingsRes, configsRes] = await Promise.all([
      fetch(`/api/ai/admin/bindings?category=${category}`),
      fetch(`/api/ai/admin/model-configs?category=${category}`),
    ]);

    const bindingsJson = await bindingsRes.json().catch(() => ({ data: [] }));
    const configsJson = await configsRes.json().catch(() => ({ data: [] }));

    const result = {
      bindings: (bindingsJson?.data ?? []) as AIModelBinding[],
      configs: (configsJson?.data ?? []) as AIModelConfig[],
    };

    bindingCache.set(category, result);
    // Invalidate cache after 60s
    setTimeout(() => bindingCache.delete(category), 60_000);

    return result;
  } catch {
    return { bindings: [], configs: [] };
  }
}

export interface ResolvedModel {
  displayName: string;
  manufacturer: string;
  model: string;
  configId?: string;
}

/**
 * Resolve a binding key to a human-readable model display name.
 *
 * @param bindingKey - e.g. 'text-default', 'image-default'
 * @param category - 'text' | 'image' | 'video'
 */
export function useAIModelBinding(
  bindingKey: string | undefined,
  category: AICategory,
): ResolvedModel | null {
  const [resolved, setResolved] = useState<ResolvedModel | null>(null);

  useEffect(() => {
    if (!bindingKey) {
      setResolved(null);
      return;
    }

    let cancelled = false;

    fetchBindingsAndConfigs(category).then(({ bindings, configs }) => {
      if (cancelled) return;

      const binding = bindings.find((b) => b.key === bindingKey);
      if (!binding?.ai_model_config_id) {
        setResolved({ displayName: bindingKey, manufacturer: '', model: bindingKey });
        return;
      }

      const config = configs.find((c) => c.id === binding.ai_model_config_id);
      if (!config) {
        setResolved({ displayName: bindingKey, manufacturer: '', model: bindingKey });
        return;
      }

      setResolved({
        displayName: `${config.manufacturer}/${config.model}`,
        manufacturer: config.manufacturer,
        model: config.model,
        configId: config.id,
      });
    });

    return () => { cancelled = true; };
  }, [bindingKey, category]);

  return resolved;
}
