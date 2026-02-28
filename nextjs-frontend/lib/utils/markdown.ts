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
  
  // Only strip implicit metadata if it looks very much like system metadata (e.g. starts with "type:", "id:")
  // Otherwise, treat it as content.
  // Actually, for safety, let's just return the rest.
  return lines.join("\n").trim();
}

export function buildAssetCreateHref(sourceNodeId: string, seriesId: string, assetId?: string): string {
  let href = `/assets?mode=create&sourceNodeId=${encodeURIComponent(sourceNodeId)}&seriesId=${encodeURIComponent(seriesId)}`;
  if (assetId) href += `&assetId=${encodeURIComponent(assetId)}`;
  return href;
}
