export const supportedAssetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
]);

export function extensionOf(path: string) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index).toLowerCase();
}

export function isMarkdownPath(path: string) {
  return extensionOf(path) === ".md";
}

export function isSupportedAssetPath(path: string) {
  return supportedAssetExtensions.has(extensionOf(path));
}

export function fileKind(path: string) {
  if (isMarkdownPath(path)) {
    return "note" as const;
  }

  if (isSupportedAssetPath(path)) {
    return "asset" as const;
  }

  return "other" as const;
}

export function contentTypeForPath(path: string) {
  switch (extensionOf(path)) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".md":
      return "text/markdown; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
