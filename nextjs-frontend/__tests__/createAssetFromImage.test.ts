import { createAssetFromImage, resolveDefaultVariantId } from "@/lib/utils/createAssetFromImage";

describe("resolveDefaultVariantId", () => {
  it("prefers explicit default variant", () => {
    expect(
      resolveDefaultVariantId({
        id: "asset-1",
        variants: [
          { id: "v2" },
          { id: "v1", is_default: true },
        ],
      }),
    ).toBe("v1");
  });

  it("falls back to first variant", () => {
    expect(
      resolveDefaultVariantId({
        id: "asset-1",
        variants: [{ id: "v1" }, { id: "v2" }],
      }),
    ).toBe("v1");
  });

  it("returns null when no variants exist", () => {
    expect(resolveDefaultVariantId({ id: "asset-1", variants: [] })).toBeNull();
  });
});

describe("createAssetFromImage", () => {
  it("creates asset, binds image resource, then optionally binds episode", async () => {
    const calls: string[] = [];
    const deps = {
      createAsset: jest.fn(async () => {
        calls.push("createAsset");
        return { id: "asset-1", variants: [{ id: "variant-1", is_default: true }] };
      }),
      createAssetResource: jest.fn(async () => {
        calls.push("createAssetResource");
      }),
      bindEpisodeAsset: jest.fn(async () => {
        calls.push("bindEpisodeAsset");
      }),
    };

    const result = await createAssetFromImage(
      {
        scriptId: "script-1",
        episodeId: "episode-1",
        fileNodeId: "node-1",
        name: "韩立",
        type: "character",
        category: "主角",
        contentMd: "人物描述",
      },
      deps,
    );

    expect(result).toEqual({ assetId: "asset-1", variantId: "variant-1" });
    expect(calls).toEqual(["createAsset", "createAssetResource", "bindEpisodeAsset"]);
    expect(deps.createAsset).toHaveBeenCalledWith({
      project_id: "script-1",
      script_id: "script-1",
      name: "韩立",
      type: "character",
      category: "主角",
      source: "ai_generated",
      content_md: "人物描述",
    });
    expect(deps.createAssetResource).toHaveBeenCalledWith("asset-1", {
      file_node_ids: ["node-1"],
      res_type: "image",
      variant_id: "variant-1",
      cover_file_node_id: "node-1",
    });
    expect(deps.bindEpisodeAsset).toHaveBeenCalledWith("episode-1", {
      asset_entity_id: "asset-1",
      asset_variant_id: "variant-1",
    });
  });

  it("skips episode binding when episode is not selected", async () => {
    const deps = {
      createAsset: jest.fn(async () => ({ id: "asset-1", variants: [{ id: "variant-1" }] })),
      createAssetResource: jest.fn(async () => undefined),
      bindEpisodeAsset: jest.fn(async () => undefined),
    };

    await createAssetFromImage(
      {
        scriptId: "script-1",
        episodeId: null,
        fileNodeId: "node-1",
        name: "场景一",
        type: "scene",
      },
      deps,
    );

    expect(deps.bindEpisodeAsset).not.toHaveBeenCalled();
  });
});
