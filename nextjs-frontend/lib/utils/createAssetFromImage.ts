type AssetVariantLite = {
  id: string;
  is_default?: boolean;
};

type AssetLite = {
  id: string;
  variants?: AssetVariantLite[];
};

export type CreateAssetFromImageInput = {
  scriptId: string;
  episodeId?: string | null;
  fileNodeId: string;
  name: string;
  type: "character" | "scene" | "prop" | "vfx";
  category?: string;
  contentMd?: string;
};

export type CreateAssetFromImageDeps = {
  createAsset: (payload: {
    project_id: string;
    script_id: string;
    name: string;
    type: "character" | "scene" | "prop" | "vfx";
    category?: string;
    source: string;
    content_md?: string;
  }) => Promise<AssetLite>;
  createAssetResource: (assetId: string, payload: {
    file_node_ids: string[];
    res_type: string;
    variant_id?: string;
    cover_file_node_id?: string;
  }) => Promise<unknown>;
  bindEpisodeAsset: (episodeId: string, payload: {
    asset_entity_id: string;
    asset_variant_id?: string;
  }) => Promise<unknown>;
};

export function resolveDefaultVariantId(asset: AssetLite): string | null {
  const variants = Array.isArray(asset.variants) ? asset.variants : [];
  const explicitDefault = variants.find((variant) => variant.is_default);
  if (explicitDefault?.id) return explicitDefault.id;
  return variants[0]?.id || null;
}

export async function createAssetFromImage(
  input: CreateAssetFromImageInput,
  deps: CreateAssetFromImageDeps,
): Promise<{ assetId: string; variantId: string | null }> {
  const asset = await deps.createAsset({
    project_id: input.scriptId,
    script_id: input.scriptId,
    name: input.name,
    type: input.type,
    category: input.category,
    source: "ai_generated",
    content_md: input.contentMd,
  });

  const variantId = resolveDefaultVariantId(asset);

  await deps.createAssetResource(asset.id, {
    file_node_ids: [input.fileNodeId],
    res_type: "image",
    variant_id: variantId || undefined,
    cover_file_node_id: input.fileNodeId,
  });

  if (input.episodeId) {
    await deps.bindEpisodeAsset(input.episodeId, {
      asset_entity_id: asset.id,
      asset_variant_id: variantId || undefined,
    });
  }

  return { assetId: asset.id, variantId };
}
