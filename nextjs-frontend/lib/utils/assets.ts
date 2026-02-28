import type { Asset, AssetType, AssetResource } from "@/lib/aistudio/types";

export function deriveAssetIdFromNodeName(nodeName: string, assets: Asset[]): string | null {
  if (!nodeName) return null;
  const normalizeName = (value: string) => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    return trimmed
      .replace(/\\/g, "_")
      .replace(/\//g, "_")
      .replace(/\s+/g, "_")
      .replace(/[<>:"|?*]+/g, "_")
      .replace(/[._-]+$/g, "")
      .replace(/^[._-]+/g, "");
  };
  const base = nodeName.replace(/\.md$/i, "");
  const parts = base.split("_");
  if (parts.length > 1) {
    const prefix = parts[0];
    const shouldUseAssetIdPrefix =
      parts.length > 2 && /^[A-Za-z]+$/.test(parts[0]) && /^\d+$/.test(parts[1]);
    const assetIdCandidate = shouldUseAssetIdPrefix ? `${parts[0]}_${parts[1]}` : parts[0];
    const restName = shouldUseAssetIdPrefix ? parts.slice(2).join("_") : parts.slice(1).join("_");
    const assetIdMatch = assets.find((a) => a.assetId && a.assetId === assetIdCandidate);
    if (assetIdMatch) return assetIdMatch.id;
    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prefix);
    if (uuidLike) return prefix;
    const prefixMap: Record<string, string> = {
      character: "CHARACTER",
      prop: "PROP",
      location: "SCENE",
      scene: "SCENE",
      vfx: "EFFECT",
      effect: "EFFECT",
    };
    const mappedType = prefixMap[prefix.toLowerCase()];
    if (mappedType) {
      const matched = assets.find((a) => a.type === mappedType && normalizeName(a.name) === restName);
      if (matched) return matched.id;
    }
  }
  const normalizedBase = normalizeName(base);
  const directMatch = assets.find((a) => normalizeName(a.name) === normalizedBase);
  return directMatch ? directMatch.id : null;
}

export function resolveTargetAssetId({
  selectedDraftId,
  targetAssetId,
  assets,
}: {
  selectedDraftId: string | null;
  targetAssetId: string | null;
  assets: Asset[];
}): string | null {
  if (selectedDraftId) return selectedDraftId;
  if (targetAssetId) return targetAssetId;
  return null;
}

export function mapAssetsFromApi(items: any[]): Asset[] {
  const typeMap: Record<string, AssetType> = {
    character: "CHARACTER",
    scene: "SCENE",
    prop: "PROP",
    vfx: "EFFECT",
    location: "SCENE",
    effect: "EFFECT"
  };
  return items.map((item: any) => {
    const resources: AssetResource[] = (item.resources || []).map((r: any) => {
      const fileNodeId = r.meta_data?.file_node_id;
      return {
        id: r.id,
        // Use thumbnail endpoint for list view, original for zoom
        thumbnail: fileNodeId ? `/api/vfs/nodes/${fileNodeId}/thumbnail` : "",
        originalUrl: fileNodeId ? `/api/vfs/nodes/${fileNodeId}/download` : "",
        is_cover: r.is_cover || r.meta_data?.is_cover,
        res_type: r.res_type,
        minio_bucket: r.minio_bucket,
        minio_key: r.minio_key
      };
    });
    
    const variants = (item.variants || []).map((v: any) => ({
      id: v.id,
      variant_code: v.variant_code,
      resources: (v.resources || []).map((r: any) => {
        const fileNodeId = r.meta_data?.file_node_id;
        return {
          id: r.id,
          thumbnail: fileNodeId ? `/api/vfs/nodes/${fileNodeId}/thumbnail` : "",
          originalUrl: fileNodeId ? `/api/vfs/nodes/${fileNodeId}/download` : "",
          is_cover: r.is_cover || r.meta_data?.is_cover,
          res_type: r.res_type
        };
      })
    }));

    let thumb = "";
    const coverRes = resources.find(r => r.is_cover);
    if (coverRes) thumb = coverRes.thumbnail;
    else if (resources.length > 0) thumb = resources[0].thumbnail;

    return {
      id: item.id,
      project_id: item.project_id,
      assetId: item.asset_id,
      name: item.name,
      type: typeMap[item.type?.toLowerCase()] || "CHARACTER",
      thumbnail: thumb,
      tags: item.tags || [],
      createdAt: item.created_at,
      source: item.source,
      variants: variants,
      resources: resources,
      doc_content: item.doc_content,
      doc_node_id: item.doc_node_id
    };
  });
}
