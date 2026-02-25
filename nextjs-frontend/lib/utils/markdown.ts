export function stripMarkdownMetadata(raw: string): string {
  const text = String(raw || "");
  if (!text.trim()) return "";
  let lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] && lines[0].charCodeAt(0) === 0xfeff) {
    lines[0] = lines[0].slice(1);
  }
  const firstNonEmpty = lines.findIndex((line) => line.trim() !== "");
  if (firstNonEmpty !== -1 && lines[firstNonEmpty].trim() === "---") {
    const endIndex = lines.slice(firstNonEmpty + 1).findIndex((line) => line.trim() === "---");
    lines = endIndex === -1 ? lines.slice(firstNonEmpty + 1) : lines.slice(firstNonEmpty + endIndex + 2);
  }
  const isMarkdownLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return /^(#{1,6}\s|[-*+]\s+|\d+\.\s+|>\s+|```|`{3}|!\[|\[.+\]\(.+\))/.test(trimmed);
  };
  const isMetadataLine = (line: string) => /^[a-z_][a-z0-9_]*\s*:\s*/.test(line.trim());
  let start = 0;
  for (; start < lines.length; start += 1) {
    const line = lines[start];
    if (isMarkdownLine(line)) break;
    if (!line.trim()) continue;
    if (isMetadataLine(line)) continue;
    break;
  }
  return lines.slice(start).join("\n").trim();
}

export function buildAssetCreateHref(sourceNodeId: string, seriesId: string, assetId?: string): string {
  let href = `/assets?mode=create&sourceNodeId=${encodeURIComponent(sourceNodeId)}&seriesId=${encodeURIComponent(seriesId)}`;
  if (assetId) href += `&assetId=${encodeURIComponent(assetId)}`;
  return href;
}
