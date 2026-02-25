import {
  deriveAssetIdFromNodeName,
  resolveTargetAssetId,
  mapAssetsFromApi,
} from "@/lib/utils/assets";
import { stripMarkdownMetadata } from "@/lib/utils/markdown";
import type { Asset } from "@/lib/aistudio/types";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

describe("stripMarkdownMetadata (assets page)", () => {
  it("removes yaml frontmatter and keeps markdown body", () => {
    const raw = "---\nkey: value\n---\n\n# 标题\n内容";
    expect(stripMarkdownMetadata(raw)).toBe("# 标题\n内容");
  });

  it("removes leading kv metadata and keeps markdown body", () => {
    const raw = "doc_type: asset\nasset_type: character\nname: 古荒\n\n## 小节\n内容";
    expect(stripMarkdownMetadata(raw)).toBe("## 小节\n内容");
  });
});

describe("deriveAssetIdFromNodeName", () => {
  const assets: Asset[] = [
    { id: "a1", assetId: "a1_code", name: "萧炎", type: "CHARACTER", thumbnail: "", tags: [], createdAt: "2024-01-01" },
    { id: "a2", assetId: "a2_code", name: "云岚宗广场", type: "SCENE", thumbnail: "", tags: [], createdAt: "2024-01-01" },
  ];

  it("returns uuid prefix asset id when present", () => {
    const name = "6b3b0c5d-9f29-4c20-8c7f-123456789abc_萧炎.md";
    expect(deriveAssetIdFromNodeName(name, assets)).toBe("6b3b0c5d-9f29-4c20-8c7f-123456789abc");
  });

  it("matches asset by type prefix and name", () => {
    const name = "character_萧炎.md";
    expect(deriveAssetIdFromNodeName(name, assets)).toBe("a1");
  });

  it("matches asset by normalized name", () => {
    const list: Asset[] = [
      { id: "a3", assetId: "a3_code", name: "云岚 宗", type: "SCENE", thumbnail: "", tags: [], createdAt: "2024-01-01" },
    ];
    const name = "scene_云岚_宗.md";
    expect(deriveAssetIdFromNodeName(name, list)).toBe("a3");
  });

  it("matches asset by assetId prefix", () => {
    const list = [
      { id: "a10", name: "萧炎", type: "CHARACTER", thumbnail: "", tags: [], createdAt: "2024-01-01", assetId: "C_001" },
    ] as unknown as Asset[];
    const name = "C_001_萧炎.md";
    expect(deriveAssetIdFromNodeName(name, list)).toBe("a10");
  });

  it("returns null when no match found", () => {
    expect(deriveAssetIdFromNodeName("unknown_路人甲.md", assets)).toBeNull();
  });
});

describe("mapAssetsFromApi", () => {
  it("maps raw API assets into Asset objects", () => {
    const rawData = [
      {
        id: "uuid-1",
        asset_id: "C_001",
        name: "萧炎",
        type: "character",
        resources: [{ id: "res-1", meta_data: { file_node_id: "node-1" } }],
      },
    ];
    const mapped = mapAssetsFromApi(rawData);
    expect(mapped[0]).toEqual(
      expect.objectContaining({
        id: "uuid-1",
        assetId: "C_001",
        name: "萧炎",
        type: "CHARACTER",
      })
    );
    expect(mapped[0]?.resources?.[0]?.thumbnail).toBe("/api/vfs/nodes/node-1/thumbnail");
    expect(mapped[0]?.resources?.[0]?.originalUrl).toBe("/api/vfs/nodes/node-1/download");
  });
});

describe("resolveTargetAssetId", () => {
  const list: Asset[] = [
    { id: "a1", assetId: "a1_code", name: "萧炎", type: "CHARACTER", thumbnail: "", tags: [], createdAt: "2024-01-01" },
    { id: "a2", assetId: "a2_code", name: "云岚宗广场", type: "SCENE", thumbnail: "", tags: [], createdAt: "2024-01-01" },
  ];

  it("prefers selectedDraftId when present", () => {
    expect(resolveTargetAssetId({ selectedDraftId: "a2", targetAssetId: null, assets: list })).toBe("a2");
  });

  it("falls back to targetAssetId when no draft selected", () => {
    expect(resolveTargetAssetId({ selectedDraftId: null, targetAssetId: "a1", assets: list })).toBe("a1");
  });

  it("auto selects when only one asset exists", () => {
    expect(resolveTargetAssetId({ selectedDraftId: null, targetAssetId: null, assets: [list[0]] })).toBe("a1");
  });
});
