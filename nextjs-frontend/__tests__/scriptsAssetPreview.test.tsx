import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

import { AssetDocumentViewer } from "@/components/scripts/AssetDocumentViewer";
import { stripMarkdownMetadata, buildAssetCreateHref } from "@/lib/utils/markdown";

describe("stripMarkdownMetadata", () => {
  it("removes leading kv metadata and keeps markdown body", () => {
    const raw = "doc_type: asset\nasset_type: character\nname: 古荒\nkeywords: []\n\n# 标题\n内容段落";
    expect(stripMarkdownMetadata(raw)).toBe("# 标题\n内容段落");
  });

  it("removes yaml frontmatter", () => {
    const raw = "---\nkey: value\n---\n\n## 小节\n内容";
    expect(stripMarkdownMetadata(raw)).toBe("## 小节\n内容");
  });
});

describe("buildAssetCreateHref", () => {
  it("builds create url with source node and series id", () => {
    expect(buildAssetCreateHref("node-1", "series-2")).toBe("/assets?mode=create&sourceNodeId=node-1&seriesId=series-2");
  });
});

describe("AssetDocumentViewer", () => {
  it("does not render prompt area and exposes generate link", () => {
    render(
      <AssetDocumentViewer
        open
        title="测试文档"
        content="# 标题"
        loading={false}
        generateHref="/assets?mode=create&sourceNodeId=node-1&seriesId=series-2"
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("生成提示词")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "生成图片" })).toHaveAttribute(
      "href",
      "/assets?mode=create&sourceNodeId=node-1&seriesId=series-2",
    );
  });
});
